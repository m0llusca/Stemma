import type { FindingOwnerType, RiskLevel } from "@prisma/client";
import type { ReportPeriod } from "@/lib/report-period";
import type { ChartDatum, StackedSegment } from "@/components/reports/report-charts";
import { reportDeltaLabel, reportReviewHref, scoreDelta } from "@/lib/reports/report-format";
import type { ReviewForReport } from "@/lib/reports/report-page-data";

export type { ReviewForReport };

export type BreakdownRow = {
  label: string;
  count: number;
  averageScore?: number | null;
  href?: string;
  delta?: number | null;
  meta?: string;
};

export function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Minimal review shape the dashboard agent leaderboard needs. Kept independent
// from ReviewForReport so the dashboard can pass a narrow select.
export type AgentLeaderboardReview = {
  totalScore: number;
  criticalError: boolean;
  appealStatus: string;
  conversation: { assigneeName: string | null };
  findings: Array<{ riskLevel: string }>;
};

export type AgentLeaderboardRow = {
  name: string;
  average: number;
  count: number;
  riskCount: number;
  appealCount: number;
};

const unassignedAgentLabel = "Без оператора";

// Pure leaderboard reduction extracted verbatim from the dashboard so the math
// is unit-tested and reused, not re-derived inline. A review counts toward
// riskCount when it is a critical error OR carries any HIGH/CRITICAL finding;
// appealCount counts reviews with an open appeal. Rows are ordered by action
// load (risk weighted 3, appeal weighted 2), then lowest average, then highest
// volume, and capped to `limit`.
export function computeAgentLeaderboard(
  reviews: readonly AgentLeaderboardReview[],
  limit = 5
): AgentLeaderboardRow[] {
  const accumulator = new Map<string, { name: string; total: number; count: number; riskCount: number; appealCount: number }>();

  for (const review of reviews) {
    const name = review.conversation.assigneeName ?? unassignedAgentLabel;
    const current = accumulator.get(name) ?? { name, total: 0, count: 0, riskCount: 0, appealCount: 0 };
    current.total += review.totalScore;
    current.count += 1;
    current.riskCount +=
      review.criticalError || review.findings.some((finding) => finding.riskLevel === "HIGH" || finding.riskLevel === "CRITICAL")
        ? 1
        : 0;
    current.appealCount += review.appealStatus === "open" ? 1 : 0;
    accumulator.set(name, current);
  }

  return Array.from(accumulator.values())
    .map<AgentLeaderboardRow>((row) => ({
      name: row.name,
      average: row.total / row.count,
      count: row.count,
      riskCount: row.riskCount,
      appealCount: row.appealCount
    }))
    .sort((left, right) => {
      const leftActionLoad = left.riskCount * 3 + left.appealCount * 2;
      const rightActionLoad = right.riskCount * 3 + right.appealCount * 2;

      return rightActionLoad - leftActionLoad || left.average - right.average || right.count - left.count;
    })
    .slice(0, limit);
}

export function addScoreGroup(groups: Map<string, number[]>, label: string, score: number) {
  const scores = groups.get(label) ?? [];
  scores.push(score);
  groups.set(label, scores);
}

export function addCountGroup(groups: Map<string, number>, label: string) {
  groups.set(label, (groups.get(label) ?? 0) + 1);
}

export function scoreGroupRows(groups: Map<string, number[]>): BreakdownRow[] {
  return Array.from(groups.entries())
    .map(([label, scores]) => ({
      label,
      count: scores.length,
      averageScore: average(scores)
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru"));
}

export function countGroupRows(groups: Map<string, number>): BreakdownRow[] {
  return Array.from(groups.entries())
    .map(([label, count]) => ({
      label,
      count
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru"));
}

// Attach period-over-period deltas: each row gets averageScore minus the
// matching label's averageScore from the previous period.
export function withScoreDeltas(rows: BreakdownRow[], previousRows: BreakdownRow[]): BreakdownRow[] {
  const previousAverageByLabel = new Map(previousRows.map((row) => [row.label, row.averageScore ?? null]));

  return rows.map((row) => ({
    ...row,
    delta: scoreDelta(row.averageScore, previousAverageByLabel.get(row.label))
  }));
}

export function rankedScoreRows(rows: BreakdownRow[], previousRows: BreakdownRow[], limit = 6): BreakdownRow[] {
  const previousAverageByLabel = new Map(previousRows.map((row) => [row.label, row.averageScore ?? null]));

  return rows
    .filter((row) => row.averageScore != null)
    .sort((left, right) => (left.averageScore ?? 0) - (right.averageScore ?? 0))
    .slice(0, limit)
    .map((row) => {
      const delta = scoreDelta(row.averageScore, previousAverageByLabel.get(row.label));

      return {
        ...row,
        delta,
        meta: reportDeltaLabel(delta)
      };
    });
}

export function scoreDistributionRows(reviews: ReviewForReport[]): ChartDatum[] {
  const ranges = [
    { label: "0-50", min: 0, max: 50 },
    { label: "51-70", min: 50, max: 70 },
    { label: "71-85", min: 70, max: 85 },
    { label: "86-100", min: 85, max: 100 }
  ];

  return ranges.map((range, index) => {
    const isFirst = index === 0;
    const matchesRange = (score: number) => isFirst
      ? score >= range.min && score <= range.max
      : score > range.min && score <= range.max;

    return {
      label: range.label,
      value: reviews.filter((review) => matchesRange(review.totalScore)).length
    };
  });
}

export function riskSegments(riskGroups: Map<string, number>, period: ReportPeriod): StackedSegment[] {
  return [
    { label: "Низкий", value: riskGroups.get("Низкий") ?? 0, severity: "t1", href: reportReviewHref(period, { riskLevel: "LOW" }) },
    { label: "Средний", value: riskGroups.get("Средний") ?? 0, severity: "t2", href: reportReviewHref(period, { riskLevel: "MEDIUM" }) },
    { label: "Высокий", value: riskGroups.get("Высокий") ?? 0, severity: "t3", href: reportReviewHref(period, { riskLevel: "HIGH" }) },
    { label: "Критический", value: riskGroups.get("Критический") ?? 0, severity: "t4", href: reportReviewHref(period, { riskLevel: "CRITICAL" }) }
  ];
}

// Minimal structural shapes for the score-math helpers below. Both the full
// ReviewForReport and the narrow previous-period select satisfy these, so the
// previous period can be loaded with fewer columns without changing any output.
export type ScoredCriterion = {
  isNotApplicable: boolean;
  passed: boolean | null;
  value: number | null;
  criterion: { block: string; kind: string };
};

export type ScoredReview = {
  totalScore: number;
  scores: ScoredCriterion[];
};

export function averageScoreFor(reviews: Array<{ totalScore: number }>) {
  return average(reviews.map((review) => review.totalScore));
}

export function criterionEarnedPercent(score: ScoredCriterion) {
  if (score.isNotApplicable) {
    return null;
  }

  if (score.criterion.kind === "PASS_FAIL") {
    return score.passed ? 100 : 0;
  }

  if (score.value == null) {
    return null;
  }

  return (score.value / 3) * 100;
}

export function blockRows(reviews: ScoredReview[]): BreakdownRow[] {
  const groups = new Map<string, number[]>();

  for (const review of reviews) {
    for (const score of review.scores) {
      const percent = criterionEarnedPercent(score);
      if (percent != null) {
        addScoreGroup(groups, score.criterion.block, percent);
      }
    }
  }

  return scoreGroupRows(groups);
}

// Minimal finding shape the reason/root-cause trend needs. Independent from the
// full review select so the previous period can pass a narrow projection.
export type ReasonFinding = {
  ownerType: FindingOwnerType;
  category: string;
  rootCause: string;
  riskLevel: RiskLevel;
};

export type ReasonTrendRow = {
  category: string;
  count: number;
  previousCount: number;
  // current minus previous count. Null is never produced (a missing previous
  // category contributes 0), so the panel can always render a signed trend.
  delta: number;
  highRiskCount: number;
  // The owner type that dominates this category in the current period. Drives
  // the "кто отвечает" hint and lets leads route the theme to the right team.
  topOwnerType: FindingOwnerType;
};

const reasonOwnerOrder: FindingOwnerType[] = ["AGENT", "PROCESS", "PRODUCT", "POLICY", "AI_SYSTEM"];

// Aggregates Findings into reason/theme rows ranked by current-period volume,
// each carrying a period-over-period count delta, the high-risk (HIGH+CRITICAL)
// share and the dominant owner type. Pure: the page maps the result onto
// drill-through hrefs (findingCategory). Ties on count break by category name in
// ru collation; ties on dominant owner break by the canonical owner order so the
// result is deterministic.
export function computeReasonTrends(
  current: readonly ReasonFinding[],
  previous: readonly ReasonFinding[],
  limit = 6
): ReasonTrendRow[] {
  const previousCounts = new Map<string, number>();
  for (const finding of previous) {
    previousCounts.set(finding.category, (previousCounts.get(finding.category) ?? 0) + 1);
  }

  const accumulator = new Map<
    string,
    { category: string; count: number; highRiskCount: number; ownerCounts: Map<FindingOwnerType, number> }
  >();

  for (const finding of current) {
    const entry =
      accumulator.get(finding.category) ??
      { category: finding.category, count: 0, highRiskCount: 0, ownerCounts: new Map<FindingOwnerType, number>() };
    entry.count += 1;
    if (finding.riskLevel === "HIGH" || finding.riskLevel === "CRITICAL") {
      entry.highRiskCount += 1;
    }
    entry.ownerCounts.set(finding.ownerType, (entry.ownerCounts.get(finding.ownerType) ?? 0) + 1);
    accumulator.set(finding.category, entry);
  }

  return Array.from(accumulator.values())
    .map<ReasonTrendRow>((entry) => {
      const previousCount = previousCounts.get(entry.category) ?? 0;
      const topOwnerType = reasonOwnerOrder.reduce((best, owner) =>
        (entry.ownerCounts.get(owner) ?? 0) > (entry.ownerCounts.get(best) ?? 0) ? owner : best
      , reasonOwnerOrder[0]);

      return {
        category: entry.category,
        count: entry.count,
        previousCount,
        delta: entry.count - previousCount,
        highRiskCount: entry.highRiskCount,
        topOwnerType
      };
    })
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category, "ru"))
    .slice(0, limit);
}

// Minimal review shape the sentiment correlation needs: the conversation
// sentiment string (nullable until scored) and the QA total score.
export type SentimentReview = {
  sentiment: string | null;
  totalScore: number;
};

export type SentimentCorrelationKey = "positive" | "neutral" | "negative";

export type SentimentCorrelationRow = {
  key: SentimentCorrelationKey;
  label: string;
  count: number;
  averageScore: number | null;
};

export type SentimentCorrelation = {
  rows: SentimentCorrelationRow[];
  // Reviews whose conversation has a recognized sentiment bucket.
  scoredCount: number;
  // Reviews whose sentiment is null/unknown (not yet scored). Surfaced so the
  // panel can show a clean partial/empty state instead of silently dropping rows.
  unscoredCount: number;
  totalCount: number;
};

const sentimentLabels: Record<SentimentCorrelationKey, string> = {
  positive: "Позитивная",
  neutral: "Нейтральная",
  negative: "Негативная"
};

const sentimentOrder: SentimentCorrelationKey[] = ["positive", "neutral", "negative"];

function resolveSentimentKey(value: string | null): SentimentCorrelationKey | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === "positive" || normalized === "neutral" || normalized === "negative" ? normalized : null;
}

// Correlates conversation sentiment against the QA total score. Buckets are
// returned in a stable positive→neutral→negative order with each bucket's
// average score, so the panel mirrors the CSAT correlation. Null/unknown
// sentiment is counted as unscored (not dropped) so the page can render a
// partial state while AI scoring backfills the period. Pure.
export function computeSentimentCorrelation(reviews: readonly SentimentReview[]): SentimentCorrelation {
  const scores = new Map<SentimentCorrelationKey, number[]>();
  for (const key of sentimentOrder) {
    scores.set(key, []);
  }

  let scoredCount = 0;
  let unscoredCount = 0;

  for (const review of reviews) {
    const key = resolveSentimentKey(review.sentiment);
    if (key == null) {
      unscoredCount += 1;
      continue;
    }
    scores.get(key)!.push(review.totalScore);
    scoredCount += 1;
  }

  const rows = sentimentOrder.map<SentimentCorrelationRow>((key) => {
    const values = scores.get(key)!;

    return {
      key,
      label: sentimentLabels[key],
      count: values.length,
      averageScore: average(values)
    };
  });

  return {
    rows,
    scoredCount,
    unscoredCount,
    totalCount: reviews.length
  };
}
