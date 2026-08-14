import type { RiskLevel } from "@prisma/client";
import {
  resolvePreviousReportPeriod,
  type ReportPeriod
} from "@/lib/report-period";
import {
  reportFilterValue,
  type ReportAnalysisState,
  type ReportFilterCatalog,
  type ReportRisk
} from "@/lib/reports/report-analysis-state";

type FilterableReportReview = {
  conversation: {
    teamName: string | null;
    externalSource: string;
  };
  scores: readonly {
    criterion: {
      block: string;
    };
  }[];
  findings: readonly {
    riskLevel: RiskLevel | string;
  }[];
};

type FilterableReportScore = {
  value: number | null;
  passed: boolean | null;
  isNotApplicable: boolean;
  criterion: {
    block: string;
    kind: string;
    weight: number;
  };
};

type ScoreScopedReportReview = {
  totalScore: number;
  scores: readonly FilterableReportScore[];
};

function riskLevels(risk: ReportRisk | undefined): RiskLevel[] | undefined {
  if (!risk) return undefined;
  if (risk === "high_plus") return ["HIGH", "CRITICAL"];
  return [risk.toUpperCase() as RiskLevel];
}

export function reportFindingMatchesAnalysis(
  finding: FilterableReportReview["findings"][number],
  state: ReportAnalysisState
) {
  const selectedRiskLevels = riskLevels(state.risk);
  return (
    !selectedRiskLevels ||
    selectedRiskLevels.includes(finding.riskLevel as RiskLevel)
  );
}

export function reportScoreMatchesAnalysis(
  score: { criterion: { block: string } },
  state: ReportAnalysisState,
  catalog: ReportFilterCatalog
) {
  const blockName = reportFilterValue(state.block, catalog.blocks);
  return !blockName || score.criterion.block === blockName;
}

function criterionPercent(score: FilterableReportScore) {
  if (score.isNotApplicable) return undefined;
  if (score.criterion.kind === "PASS_FAIL") {
    return score.passed == null ? undefined : score.passed ? 100 : 0;
  }
  return score.value == null ? undefined : (score.value / 3) * 100;
}

export function reportAnalysisScoreForReview(
  review: ScoreScopedReportReview,
  state: ReportAnalysisState,
  catalog: ReportFilterCatalog
) {
  const blockName = reportFilterValue(state.block, catalog.blocks);
  if (!blockName) return review.totalScore;

  let weightedTotal = 0;
  let totalWeight = 0;
  for (const score of review.scores) {
    if (!reportScoreMatchesAnalysis(score, state, catalog)) continue;
    const percent = criterionPercent(score);
    if (percent == null) continue;
    const weight = Math.max(0, score.criterion.weight);
    weightedTotal += percent * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedTotal / totalWeight : null;
}

export function buildReportAnalysisReviewWhere(
  state: ReportAnalysisState,
  catalog: ReportFilterCatalog
) {
  const teamName = reportFilterValue(state.team, catalog.teams);
  const blockName = reportFilterValue(state.block, catalog.blocks);
  const selectedRiskLevels = riskLevels(state.risk);
  const conversation = {
    ...(teamName ? { teamName } : {}),
    ...(state.source ? { externalSource: state.source } : {})
  };

  return {
    ...(Object.keys(conversation).length > 0
      ? { conversation: { is: conversation } }
      : {}),
    ...(blockName
      ? {
          scores: {
            some: {
              criterion: {
                block: blockName
              }
            }
          }
        }
      : {}),
    ...(selectedRiskLevels
      ? {
          findings: {
            some: {
              riskLevel: {
                in: selectedRiskLevels
              }
            }
          }
        }
      : {})
  };
}

export function reportReviewMatchesAnalysis(
  review: FilterableReportReview,
  state: ReportAnalysisState,
  catalog: ReportFilterCatalog
) {
  const teamName = reportFilterValue(state.team, catalog.teams);
  const blockName = reportFilterValue(state.block, catalog.blocks);
  const selectedRiskLevels = riskLevels(state.risk);

  return (
    (!teamName || review.conversation.teamName === teamName) &&
    (!state.source ||
      review.conversation.externalSource === state.source) &&
    (!blockName ||
      review.scores.some((score) => score.criterion.block === blockName)) &&
    (!selectedRiskLevels ||
      review.findings.some((finding) =>
        reportFindingMatchesAnalysis(finding, state)
      ))
  );
}

function shiftUtcYear(value: Date) {
  const year = value.getUTCFullYear() - 1;
  const month = value.getUTCMonth();
  const day = Math.min(
    value.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  );
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    )
  );
}

export function resolveReportComparisonPeriod(
  period: ReportPeriod,
  compare: ReportAnalysisState["compare"]
): ReportPeriod | null {
  if (compare === "none") return null;
  if (compare === "previous") return resolvePreviousReportPeriod(period);
  return {
    preset: "year",
    start: shiftUtcYear(period.start),
    end: shiftUtcYear(period.end),
    label: "Сопоставимый период год назад"
  };
}
