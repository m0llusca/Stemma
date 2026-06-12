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
    { label: "Низкий", value: riskGroups.get("Низкий") ?? 0, color: "bg-[#3157d5]", href: reportReviewHref(period, { riskLevel: "LOW" }) },
    { label: "Средний", value: riskGroups.get("Средний") ?? 0, color: "bg-[#0f766e]", href: reportReviewHref(period, { riskLevel: "MEDIUM" }) },
    { label: "Высокий", value: riskGroups.get("Высокий") ?? 0, color: "bg-[#d97706]", href: reportReviewHref(period, { riskLevel: "HIGH" }) },
    { label: "Критический", value: riskGroups.get("Критический") ?? 0, color: "bg-[#dc2626]", href: reportReviewHref(period, { riskLevel: "CRITICAL" }) }
  ];
}

export function averageScoreFor(reviews: ReviewForReport[]) {
  return average(reviews.map((review) => review.totalScore));
}

export function criterionEarnedPercent(score: ReviewForReport["scores"][number]) {
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

export function blockRows(reviews: ReviewForReport[]): BreakdownRow[] {
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
