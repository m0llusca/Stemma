/**
 * Competitive P1 #11 — derive coaching focus themes from recent finalized
 * reviews (Finding category / rootCause + failed CriterionScore labels).
 * No new tables: aggregate in memory and deep-link into the existing queue.
 */

export const COACHING_THEME_REVIEW_WINDOW = 20;
export const COACHING_THEME_SUGGESTION_LIMIT = 5;

export type CoachingThemeSource = "finding_category" | "root_cause" | "failed_criterion";

export type CoachingThemeReviewInput = {
  assigneeName: string | null;
  findings: ReadonlyArray<{
    category: string;
    rootCause: string;
    riskLevel: string;
  }>;
  scores: ReadonlyArray<{
    passed: boolean | null;
    value: number | null;
    isNotApplicable: boolean;
    criterion: { label: string; kind: string };
  }>;
};

export type CoachingThemeSuggestion = {
  label: string;
  count: number;
  source: CoachingThemeSource;
  /** When HIGH/CRITICAL findings contributed, expose a queue risk filter. */
  riskLevel?: "HIGH" | "CRITICAL" | "HIGH_OR_CRITICAL";
};

type ThemeBucket = {
  label: string;
  count: number;
  source: CoachingThemeSource;
  highRisk: number;
  criticalRisk: number;
};

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isUsableRootCause(value: string) {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return false;
  }
  const lower = normalized.toLowerCase();
  return lower !== "none" && lower !== "n/a" && lower !== "-" && normalized.length <= 80;
}

/** Mirrors agent-criterion-feedback `isCriterionDeduction` without full score DTO. */
function isFailedCriterionScore(score: CoachingThemeReviewInput["scores"][number]) {
  if (score.isNotApplicable) {
    return false;
  }

  if (score.criterion.kind === "PASS_FAIL") {
    return score.passed === false;
  }

  return score.value != null && score.value < 3;
}

function bump(
  buckets: Map<string, ThemeBucket>,
  label: string,
  source: CoachingThemeSource,
  riskLevel?: string
) {
  const normalized = normalizeLabel(label);
  if (!normalized) {
    return;
  }
  const key = `${source}::${normalized.toLowerCase()}`;
  const current = buckets.get(key) ?? {
    label: normalized,
    count: 0,
    source,
    highRisk: 0,
    criticalRisk: 0
  };
  current.count += 1;
  if (riskLevel === "CRITICAL") {
    current.criticalRisk += 1;
  } else if (riskLevel === "HIGH") {
    current.highRisk += 1;
  }
  buckets.set(key, current);
}

function riskFilterFor(bucket: ThemeBucket): CoachingThemeSuggestion["riskLevel"] | undefined {
  const elevated = bucket.highRisk + bucket.criticalRisk;
  if (elevated === 0) {
    return undefined;
  }
  if (bucket.criticalRisk === bucket.count) {
    return "CRITICAL";
  }
  if (elevated >= Math.ceil(bucket.count / 2)) {
    return "HIGH_OR_CRITICAL";
  }
  return undefined;
}

function sourceRank(source: CoachingThemeSource) {
  if (source === "finding_category") {
    return 0;
  }
  if (source === "failed_criterion") {
    return 1;
  }
  return 2;
}

/**
 * Aggregates theme suggestions from a list of finalized reviews for one agent
 * (or a pre-filtered list).
 */
export function aggregateCoachingThemes(
  reviews: ReadonlyArray<CoachingThemeReviewInput>,
  options?: { limit?: number }
): CoachingThemeSuggestion[] {
  const limit = options?.limit ?? COACHING_THEME_SUGGESTION_LIMIT;
  const buckets = new Map<string, ThemeBucket>();

  for (const review of reviews) {
    for (const finding of review.findings) {
      bump(buckets, finding.category, "finding_category", finding.riskLevel);
      if (isUsableRootCause(finding.rootCause)) {
        bump(buckets, finding.rootCause, "root_cause", finding.riskLevel);
      }
    }

    for (const score of review.scores) {
      if (!isFailedCriterionScore(score)) {
        continue;
      }
      bump(buckets, score.criterion.label, "failed_criterion");
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      label: bucket.label,
      count: bucket.count,
      source: bucket.source,
      riskLevel: riskFilterFor(bucket)
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      const rankDiff = sourceRank(left.source) - sourceRank(right.source);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.label.localeCompare(right.label, "ru");
    })
    .slice(0, limit);
}

/**
 * Groups the newest reviews per agent (up to `perAgentLimit`) and aggregates
 * theme suggestions for each. Callers should pass reviews ordered newest-first.
 */
export function groupCoachingThemesByAgent(
  reviews: ReadonlyArray<CoachingThemeReviewInput>,
  options?: { perAgentLimit?: number; themeLimit?: number }
): Record<string, CoachingThemeSuggestion[]> {
  const perAgentLimit = options?.perAgentLimit ?? COACHING_THEME_REVIEW_WINDOW;
  const themeLimit = options?.themeLimit ?? COACHING_THEME_SUGGESTION_LIMIT;
  const byAgent = new Map<string, CoachingThemeReviewInput[]>();

  for (const review of reviews) {
    const agentName = review.assigneeName?.trim();
    if (!agentName) {
      continue;
    }
    const bucket = byAgent.get(agentName) ?? [];
    if (bucket.length >= perAgentLimit) {
      continue;
    }
    bucket.push(review);
    byAgent.set(agentName, bucket);
  }

  const result: Record<string, CoachingThemeSuggestion[]> = {};
  for (const [agentName, agentReviews] of byAgent) {
    result[agentName] = aggregateCoachingThemes(agentReviews, { limit: themeLimit });
  }
  return result;
}

/**
 * Queue drill-through for a theme. Uses `assignee` (support agent) plus
 * findingCategory / riskLevel when the theme maps to those filters.
 */
export function coachingThemeCasesHref(params: {
  agentName: string;
  theme: Pick<CoachingThemeSuggestion, "label" | "source" | "riskLevel">;
}): string {
  const search = new URLSearchParams();
  search.set("assignee", params.agentName);

  if (params.theme.source === "finding_category") {
    search.set("findingCategory", params.theme.label);
  }

  if (params.theme.riskLevel) {
    search.set("riskLevel", params.theme.riskLevel);
  }

  return `/reviews?${search.toString()}`;
}

export function coachingThemeSourceLabel(source: CoachingThemeSource) {
  if (source === "finding_category") {
    return "категория";
  }
  if (source === "failed_criterion") {
    return "критерий";
  }
  return "причина";
}
