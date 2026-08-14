import {
  AiAgreementPanel,
  AiDriftPanel,
  CriterionHeatmapPanel,
  type CriterionHeatmapRow,
  type MetricInsightItem
} from "@/components/reports/analytics-intelligence";
import {
  CriterionMatrix,
  type CriterionMatrixColumn,
  type CriterionMatrixRow
} from "@/components/reports/criterion-matrix";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowRight, BarChart3, CircleCheck } from "lucide-react";
import { PageSkeleton } from "@/components/loading-states";
import {
  ChartPanel,
  QuotaProgressBars,
  RankedList,
  ScoreDistributionPanel,
  StackedBar
} from "@/components/reports/report-charts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { PageShell, type PageShellTab } from "@/components/ui/page-shell";
import { TriageStrip, type TriageStripTone } from "@/components/ui/triage-strip";
import { ReportExportMenu } from "@/components/reports/report-command-bar";
import { ReportEvidenceSheet } from "@/components/reports/report-evidence-sheet";
import { ReportParameterLens } from "@/components/reports/report-parameter-lens";
import { ReportKpiRow } from "@/components/reports/report-kpi-row";
import {
  DetailsIndexPanel,
  InsightSummary,
  PeriodMovementPanel,
  ProcessSummary,
  ReportFocusPanel,
  type DetailsIndexItem,
  type DriverChainItem,
  type FocusItem,
  type ReportFocusItem
} from "@/components/reports/report-panels";
import { PrimaryScorePanel } from "@/components/reports/report-score-panel";
import { BreakdownTable, QuotaTable } from "@/components/reports/report-tables";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  appealStatusLabels,
  csatBucketLabels,
  externalSourceLabel,
  feedbackStatusLabels,
  reanswerStatusLabels,
  riskLevelLabels,
  samplingTypeLabels
} from "@/lib/labels";
import {
  resolveReportPeriod
} from "@/lib/report-period";
import { buildScoreTrendRows } from "@/lib/report-trends";
import { buildDeteriorationHighlights, buildImprovementHighlights } from "@/lib/report-improvements";
import { formatQualityScore, formatQualityScoreDelta } from "@/lib/score-display";
import {
  addCountGroup,
  addScoreGroup,
  average,
  averageScoreFor,
  blockRows,
  computeReasonTrends,
  computeSentimentCorrelation,
  countGroupRows,
  criterionEarnedPercent,
  rankedScoreRows,
  withScoreDeltas,
  riskSegments,
  scoreDistributionRows,
  scoreGroupRows
} from "@/lib/reports/report-aggregation";
import { ReasonTrendPanel, SentimentCorrelationPanel } from "@/components/reports/insight-correlation-panels";
import { listSavedReportViews } from "@/lib/saved-report-view";
import { loadAiHumanAgreementReport } from "@/lib/ai-quality/agreement-report";
import { loadAiScoreDriftReport } from "@/lib/ai-quality/drift-report";
import { StatCard } from "@/components/ui/stat-card";
import type { ChartView } from "@/components/charts/chart-view-links";
import type { QualityTrendSeries } from "@/components/charts/quality-trend-chart.client";
import {
  buildAgreementBreakdownChart,
  buildAiDriftChart,
  buildQualityTrendModel,
  buildReasonTimelineChart,
  buildScoreDistributionChart
} from "@/lib/reports/report-chart-models";
import {
  formatAverageScore,
  formatCriterionCount,
  formatPeriod,
  formatReviewCount,
  reportDeltaLabel,
  reportHref,
  reportReviewHref,
  reportReviewRangeHref,
  reportViews,
  type ReportView
} from "@/lib/reports/report-format";
import {
  buildReportAnalysisHref,
  parseReportAnalysisState,
  reportNavigationLinkProps,
  serializeReportAnalysisState
} from "@/lib/reports/report-analysis-state";
import { loadReportFilterCatalog } from "@/lib/reports/report-filter-catalog";
import {
  buildReportAnalysisReviewWhere,
  reportAnalysisScoreForReview,
  reportFindingMatchesAnalysis,
  reportReviewMatchesAnalysis,
  reportScoreMatchesAnalysis,
  resolveReportComparisonPeriod
} from "@/lib/reports/report-analysis-filtering";
import {
  findReportEvidenceDescriptor,
  resolveReportEvidence,
  type ReportEvidenceDescriptorSelection
} from "@/lib/reports/report-evidence";
import {
  buildTrustedReportEvidenceHref,
  relinkReportChartModel,
  relinkReportRows
} from "@/lib/reports/report-evidence-links";
import {
  loadFinalizedReviews,
  reviewWhere
} from "@/lib/reports/report-page-data";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const qualityTrendSeriesOrder = [
  "score",
  "previous",
  "target",
  "volume"
] as const satisfies readonly QualityTrendSeries[];

export default function ReportsPage({ searchParams }: ReportsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="reports" label="Загрузка аналитики качества" />}>
      <ReportsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportsPageContent({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const user = await requireCurrentUserPermission("reports:read");
  const filterCatalog = await loadReportFilterCatalog(user.workspaceId);
  const analysisState = parseReportAnalysisState(params, filterCatalog);
  const canonicalReportHref = serializeReportAnalysisState(analysisState);
  const currentReportHref = buildReportAnalysisHref(
    canonicalReportHref,
    { evidenceType: null, evidenceKey: null },
    filterCatalog
  );
  const evidenceLinkFor = (
    selection: ReportEvidenceDescriptorSelection,
    context: {
      reasons?: readonly string[];
      operators?: readonly string[];
      criteria?: readonly string[];
    } = {}
  ) => {
    const descriptor = findReportEvidenceDescriptor({
      workspaceId: user.workspaceId,
      state: analysisState,
      catalog: filterCatalog,
      reasons: context.reasons,
      operators: context.operators,
      criteria: context.criteria,
      selection
    });
    return descriptor
      ? {
          descriptor,
          href: buildTrustedReportEvidenceHref(
            currentReportHref,
            descriptor,
            filterCatalog
          )
        }
      : undefined;
  };
  const period = resolveReportPeriod({
    period: analysisState.period,
    start: analysisState.start,
    end: analysisState.end
  });
  const comparisonPeriod = resolveReportComparisonPeriod(
    period,
    analysisState.compare
  );
  const previousPeriod = comparisonPeriod ?? period;
  const reportView = analysisState.view;
  const trendGranularity = analysisState.grain;
  const chartView: ChartView = analysisState.chartView;
  const visibleTrendSeries: readonly QualityTrendSeries[] =
    qualityTrendSeriesOrder.filter((key) => analysisState.series.includes(key));

  const analysisReviewWhere = buildReportAnalysisReviewWhere(
    analysisState,
    filterCatalog
  );
  const hasEntityFilters = Boolean(
    analysisState.team ||
      analysisState.source ||
      analysisState.risk ||
      analysisState.block
  );
  const [
    allFinalizedReviews,
    allPreviousReviews,
    savedReportViews,
    coachingBacklog,
    quotas,
    aiAgreement,
    aiDrift
  ] = await Promise.all([
    loadFinalizedReviews(user.workspaceId, period),
    comparisonPeriod
      ? loadFinalizedReviews(user.workspaceId, comparisonPeriod)
      : Promise.resolve([]),
    listSavedReportViews(user.workspaceId, user.id),
    prisma.coachingAction.count({
      where: {
        status: "open",
        finding: {
          review: {
            ...reviewWhere(user.workspaceId, period),
            ...analysisReviewWhere
          }
        }
      }
    }),
    prisma.reviewQuota.findMany({
      where: {
        workspaceId: user.workspaceId,
        periodStart: { lte: period.end },
        periodEnd: { gte: period.start }
      },
      orderBy: [{ supportLine: "asc" }, { assigneeName: "asc" }]
    }),
    hasEntityFilters
      ? Promise.resolve(null)
      : loadAiHumanAgreementReport(user.workspaceId, {
          since: period.start,
          until: period.end
        }),
    hasEntityFilters
      ? Promise.resolve(null)
      : loadAiScoreDriftReport(user.workspaceId, {
          since: period.start,
          until: period.end,
          bucket: "week"
        })
  ]);
  const finalizedReviews = allFinalizedReviews
    .filter((review) =>
      reportReviewMatchesAnalysis(review, analysisState, filterCatalog)
    )
    .map((review) => ({
      ...review,
      scores: review.scores.filter((score) =>
        reportScoreMatchesAnalysis(score, analysisState, filterCatalog)
      )
    }));
  const previousReviews = allPreviousReviews
    .filter((review) =>
      reportReviewMatchesAnalysis(review, analysisState, filterCatalog)
    )
    .map((review) => ({
      ...review,
      scores: review.scores.filter((score) =>
        reportScoreMatchesAnalysis(score, analysisState, filterCatalog)
      )
    }));
  const analysisScoreByReviewId = new Map(
    finalizedReviews.map((review) => [
      review.id,
      reportAnalysisScoreForReview(review, analysisState, filterCatalog)
    ])
  );
  const previousAnalysisScoreByReviewId = new Map(
    previousReviews.map((review) => [
      review.id,
      reportAnalysisScoreForReview(review, analysisState, filterCatalog)
    ])
  );
  const scoredFinalizedReviews = finalizedReviews.flatMap((review) => {
    const score = analysisScoreByReviewId.get(review.id);
    return score == null ? [] : [{ ...review, totalScore: score }];
  });
  const scoredPreviousReviews = previousReviews.flatMap((review) => {
    const score = previousAnalysisScoreByReviewId.get(review.id);
    return score == null ? [] : [{ ...review, totalScore: score }];
  });
  const periodFindings = finalizedReviews.flatMap((review) =>
    review.findings
      .filter((finding) =>
        reportFindingMatchesAnalysis(finding, analysisState)
      )
      .map((finding) => ({
        ...finding,
        review: { finalizedAt: review.finalizedAt }
      }))
  );
  const previousPeriodFindings = previousReviews.flatMap((review) =>
    review.findings
      .filter((finding) =>
        reportFindingMatchesAnalysis(finding, analysisState)
      )
      .map((finding) => ({
        ...finding,
        review: { finalizedAt: review.finalizedAt }
      }))
  );
  const highRiskFindings = periodFindings.filter(
    (finding) =>
      finding.riskLevel === "HIGH" || finding.riskLevel === "CRITICAL"
  ).length;
  const sourceGroups = new Map<string, number[]>();
  const assigneeGroups = new Map<string, number[]>();
  const teamGroups = new Map<string, number[]>();
  const reviewerGroups = new Map<string, number[]>();
  const categoryGroups = new Map<string, number>();
  const riskGroups = new Map<string, number>();
  const samplingGroups = new Map<string, number>();
  const csatGroups = new Map<string, number>();
  const csatScoreGroups = new Map<string, number[]>();
  const feedbackGroups = new Map<string, number>();
  const appealGroups = new Map<string, number>();
  const reanswerGroups = new Map<string, number>();
  const criticalCategoryGroups = new Map<string, number>();
  const previousSourceGroups = new Map<string, number[]>();
  const previousAssigneeGroups = new Map<string, number[]>();
  const previousTeamGroups = new Map<string, number[]>();

  for (const review of finalizedReviews) {
    const analysisScore = analysisScoreByReviewId.get(review.id);
    if (analysisScore != null) {
      addScoreGroup(sourceGroups, review.conversation.externalSource, analysisScore);
      addScoreGroup(assigneeGroups, review.conversation.assigneeName ?? "Не назначен", analysisScore);
      addScoreGroup(teamGroups, review.conversation.teamName ?? "Команда не указана", analysisScore);
      addScoreGroup(reviewerGroups, review.reviewer.name, analysisScore);
    }
    addCountGroup(samplingGroups, samplingTypeLabels[review.conversation.samplingType] ?? review.conversation.samplingType);
    addCountGroup(csatGroups, csatBucketLabels[review.conversation.csatBucket] ?? review.conversation.csatBucket);
    if (review.conversation.csatBucket !== "NO_SCORE" && analysisScore != null) {
      addScoreGroup(csatScoreGroups, csatBucketLabels[review.conversation.csatBucket] ?? review.conversation.csatBucket, analysisScore);
    }
    addCountGroup(feedbackGroups, feedbackStatusLabels[review.feedbackStatus] ?? review.feedbackStatus);
    addCountGroup(appealGroups, appealStatusLabels[review.appealStatus] ?? review.appealStatus);
    addCountGroup(reanswerGroups, reanswerStatusLabels[review.reanswerStatus] ?? review.reanswerStatus);

    if (review.criticalError) {
      addCountGroup(criticalCategoryGroups, review.criticalCategory ?? "Критическая ошибка");
    }

    for (const finding of review.findings.filter((item) =>
      reportFindingMatchesAnalysis(item, analysisState)
    )) {
      addCountGroup(categoryGroups, finding.category);
      addCountGroup(riskGroups, riskLevelLabels[finding.riskLevel]);
    }
  }

  for (const review of previousReviews) {
    const analysisScore = previousAnalysisScoreByReviewId.get(review.id);
    if (analysisScore != null) {
      addScoreGroup(previousSourceGroups, review.conversation.externalSource, analysisScore);
      addScoreGroup(previousAssigneeGroups, review.conversation.assigneeName ?? "Не назначен", analysisScore);
      addScoreGroup(previousTeamGroups, review.conversation.teamName ?? "Команда не указана", analysisScore);
    }
  }

  const riskLevelByLabel = new Map(Object.entries(riskLevelLabels).map(([value, label]) => [label, value]));
  const samplingTypeByLabel = new Map(Object.entries(samplingTypeLabels).map(([value, label]) => [label, value]));
  const csatBucketByLabel = new Map(Object.entries(csatBucketLabels).map(([value, label]) => [label, value]));
  const feedbackStatusByLabel = new Map(Object.entries(feedbackStatusLabels).map(([value, label]) => [label, value]));
  const appealStatusByLabel = new Map(Object.entries(appealStatusLabels).map(([value, label]) => [label, value]));
  const reanswerStatusByLabel = new Map(Object.entries(reanswerStatusLabels).map(([value, label]) => [label, value]));
  const previousSourceRows = scoreGroupRows(previousSourceGroups).map((row) => ({
    ...row,
    label: externalSourceLabel(row.label)
  }));
  const previousAssigneeRows = scoreGroupRows(previousAssigneeGroups);
  const previousTeamRows = scoreGroupRows(previousTeamGroups);
  const sourceRows = scoreGroupRows(sourceGroups).map((row) => ({
    ...row,
    label: externalSourceLabel(row.label),
    href: reportReviewHref(period, { source: row.label })
  }));
  const assigneeRows = scoreGroupRows(assigneeGroups).map((row) => ({
    ...row,
    href: row.label === "Не назначен" ? reportReviewHref(period) : reportReviewHref(period, { assignee: row.label })
  }));
  const teamRows = scoreGroupRows(teamGroups).map((row) => ({
    ...row,
    href: row.label === "Команда не указана" ? reportReviewHref(period) : reportReviewHref(period, { teamName: row.label })
  }));
  const reviewerRows = scoreGroupRows(reviewerGroups).map((row) => ({
    ...row,
    href: reportReviewHref(period, { qaAssignee: row.label })
  }));
  const categoryRows = countGroupRows(categoryGroups).map((row) => ({
    ...row,
    href: reportReviewHref(period, { findingCategory: row.label })
  }));
  const riskRows = countGroupRows(riskGroups).map((row) => {
    const riskLevel = riskLevelByLabel.get(row.label);

    return {
      ...row,
      href: riskLevel ? reportReviewHref(period, { riskLevel }) : undefined
    };
  });
  const samplingRows = countGroupRows(samplingGroups).map((row) => {
    const samplingType = samplingTypeByLabel.get(row.label);

    return {
      ...row,
      href: samplingType ? reportReviewHref(period, { samplingType }) : undefined
    };
  });
  const csatRows = countGroupRows(csatGroups).map((row) => {
    const csatBucket = csatBucketByLabel.get(row.label);

    return {
      ...row,
      href: csatBucket ? reportReviewHref(period, { csatBucket }) : undefined
    };
  });
  const csatScoreRows = scoreGroupRows(csatScoreGroups).map((row) => {
    const csatBucket = csatBucketByLabel.get(row.label);

    return {
      ...row,
      href: csatBucket ? reportReviewHref(period, { csatBucket }) : undefined
    };
  });
  const feedbackRows = countGroupRows(feedbackGroups).map((row) => {
    const feedbackStatus = feedbackStatusByLabel.get(row.label);

    return {
      ...row,
      href: feedbackStatus ? reportReviewHref(period, { feedbackStatus }) : undefined
    };
  });
  // Feedback-loop speed: how fast agents acknowledge finalized reviews.
  const ackDelaysHours = finalizedReviews
    .flatMap((review) =>
      review.feedbackAckAt && review.finalizedAt
        ? [(review.feedbackAckAt.getTime() - review.finalizedAt.getTime()) / 3_600_000]
        : []
    )
    .filter((hours) => hours >= 0)
    .sort((a, b) => a - b);
  const medianAckHours = ackDelaysHours.length > 0 ? ackDelaysHours[Math.floor(ackDelaysHours.length / 2)] : null;
  const ackWithin48Percent =
    ackDelaysHours.length > 0
      ? Math.round((ackDelaysHours.filter((hours) => hours <= 48).length / ackDelaysHours.length) * 100)
      : null;
  const pendingFeedbackCount = finalizedReviews.filter(
    (review) => review.feedbackStatus !== "acknowledged" && review.feedbackStatus !== "corrected"
  ).length;
  const formatAckDuration = (hours: number) =>
    hours < 48
      ? `${Math.max(1, Math.round(hours))} ч`
      : `${(hours / 24).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн`;
  const appealRows = countGroupRows(appealGroups).map((row) => {
    const appealStatus = appealStatusByLabel.get(row.label);

    return {
      ...row,
      href: appealStatus ? reportReviewHref(period, { appealStatus }) : undefined
    };
  });
  const reanswerRows = countGroupRows(reanswerGroups).map((row) => {
    const reanswerStatus = reanswerStatusByLabel.get(row.label);

    return {
      ...row,
      href: reanswerStatus ? reportReviewHref(period, { reanswerStatus }) : undefined
    };
  });
  const criticalCategoryRows = countGroupRows(criticalCategoryGroups).map((row) => ({
    ...row,
    href: reportReviewHref(period, { criticalCategory: row.label })
  }));
  // Reason/root-cause trend: rank recurring finding categories by current volume
  // with a period-over-period count delta, then attach the queue drill-through
  // (findingCategory) so leads jump straight to the affected reviews.
  const reasonTrendItems = computeReasonTrends(periodFindings, previousPeriodFindings).map((row) => ({
    ...row,
    href: reportReviewHref(period, { findingCategory: row.category })
  }));
  // Sentiment × QA-score correlation. sentiment is nullable until AI scoring
  // backfills it, so the aggregation tracks scored vs unscored for a partial state.
  const sentimentCorrelation = computeSentimentCorrelation(
    scoredFinalizedReviews.map((review) => ({
      sentiment: review.conversation.sentiment,
      totalScore: review.totalScore
    }))
  );
  const blockScoreRows = blockRows(scoredFinalizedReviews);
  const previousBlockScoreRows = blockRows(scoredPreviousReviews);
  const finalizedCount = finalizedReviews.length;
  const previousAverageScore = averageScoreFor(scoredPreviousReviews);
  const averageScore = averageScoreFor(scoredFinalizedReviews);
  const weakestBlock = blockScoreRows
    .filter((row) => row.averageScore != null)
    .sort((left, right) => (left.averageScore ?? 0) - (right.averageScore ?? 0))[0];
  const criticalCount = finalizedReviews.filter((review) => review.criticalError).length;
  const reanswerCount = finalizedReviews.filter((review) => review.needsReanswer).length;
  const appealCount = finalizedReviews.filter((review) => review.appealStatus !== "none").length;
  const trendRows = buildScoreTrendRows(
    scoredFinalizedReviews,
    period,
    trendGranularity,
    (start, end) => reportReviewRangeHref(start, end)
  );
  const baseQualityTrendModel = buildQualityTrendModel({
    // Gap days (count 0) render as null points and must not keep the queue
    // drill-through href either: Enter on them has no data to show.
    rows: trendRows.map((row) =>
      row.count > 0 ? row : { ...row, href: undefined }
    ),
    previousAverageScore
  });
  // Empty day buckets carry no evidence href: resolving one would find zero
  // rows and surface the "unavailable" safe state as a dead end, so Enter /
  // «Показать данные» stay inactive on gap days (matching the null-gap visual).
  const qualityTrendEvidenceLinks = trendRows.map((row) =>
    row.count > 0
      ? evidenceLinkFor({
          evidenceType: "trend",
          metric: "quality-score",
          bucketStart: row.start.toISOString().slice(0, 10)
        })
      : undefined
  );
  const qualityTrendModel = relinkReportChartModel(
    baseQualityTrendModel,
    Object.fromEntries(
      baseQualityTrendModel.points.flatMap((point, index) => {
        const href = qualityTrendEvidenceLinks[index]?.href;
        return href ? [[point.id, href]] : [];
      })
    )
  );
  let defaultTrendEvidenceLink = qualityTrendEvidenceLinks[0];
  for (let index = trendRows.length - 1; index >= 0; index -= 1) {
    if (trendRows[index]?.count && qualityTrendEvidenceLinks[index]) {
      defaultTrendEvidenceLink = qualityTrendEvidenceLinks[index];
      break;
    }
  }
  const evidenceResult = await resolveReportEvidence({
    user,
    state: analysisState
  });
  const distributionRows = scoreDistributionRows(scoredFinalizedReviews);
  const scoreDistributionBundle = buildScoreDistributionChart({
    rows: distributionRows,
    href: reportReviewHref(period)
  });
  const baseAiAgreementBundle = buildAgreementBreakdownChart({
    report: aiAgreement,
    period
  });
  const agreementCriterionIds =
    aiAgreement?.criteria.map((criterion) => criterion.criterionId) ?? [];
  const agreementEvidenceLinks: Map<
    string,
    NonNullable<ReturnType<typeof evidenceLinkFor>>
  > = new Map(
    hasEntityFilters
      ? []
      : agreementCriterionIds.flatMap((criterion) => {
          const link = evidenceLinkFor(
            {
              evidenceType: "driver",
              metric: "agreement",
              facet: { criterion }
            },
            { criteria: agreementCriterionIds }
          );
          return link ? [[`agreement-${criterion}`, link] as const] : [];
        })
  );
  const agreementEvidenceLink = agreementEvidenceLinks.values().next().value;
  const aiAgreementBundle = {
    ...baseAiAgreementBundle,
    model: relinkReportChartModel(
      baseAiAgreementBundle.model,
      Object.fromEntries(
        baseAiAgreementBundle.model.points.flatMap((point) => {
          const link = agreementEvidenceLinks.get(point.id);
          return link ? [[point.id, link.href]] : [];
        })
      )
    )
  };
  const baseAiDriftBundle = buildAiDriftChart({
    drift: aiDrift,
    period
  });
  const aiDriftBundle = {
    ...baseAiDriftBundle,
    model: relinkReportChartModel(
      baseAiDriftBundle.model,
      Object.fromEntries(
        baseAiDriftBundle.model.points.flatMap((point) => {
          const evidenceLink = evidenceLinkFor({
            evidenceType: "trend",
            metric: "ai-confidence",
            bucketStart: point.sortKey.slice(0, 10)
          });
          return evidenceLink ? [[point.id, evidenceLink.href]] : [];
        })
      )
    )
  };
  const baseReasonTimelineBundle = buildReasonTimelineChart({
    category: reasonTrendItems[0]?.category ?? "Нет причины",
    period,
    previousPeriod,
    currentReviews: finalizedReviews,
    previousReviews,
    currentFindings: periodFindings,
    previousFindings: previousPeriodFindings
  });
  const reasonEvidenceReasons = reasonTrendItems.map((item) => item.category);
  const reasonTimelineBundle = {
    ...baseReasonTimelineBundle,
    model: relinkReportChartModel(
      baseReasonTimelineBundle.model,
      Object.fromEntries(
        baseReasonTimelineBundle.model.points.flatMap((point) => {
          const evidenceLink = evidenceLinkFor(
            {
              evidenceType: "trend",
              metric: "reason-trend",
              facet: { reason: reasonTrendItems[0]?.category },
              bucketStart: point.sortKey.slice(0, 10)
            },
            { reasons: reasonEvidenceReasons }
          );
          return evidenceLink ? [[point.id, evidenceLink.href]] : [];
        })
      )
    )
  };
  const workspaceOperators = [
    ...new Set(
      finalizedReviews
        .map((review) => review.conversation.assigneeName?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ].sort((left, right) => left.localeCompare(right, "ru-RU"));
  const baseOperatorRankRows = rankedScoreRows(assigneeRows, previousAssigneeRows).map((row) => ({
    ...row,
    key: row.label,
    value: Math.round(row.averageScore ?? 0),
    href: row.href,
    detail: formatReviewCount(row.count),
    meta: row.delta == null ? "нет базы сравнения" : undefined
  }));
  const operatorRankRows = relinkReportRows(
    baseOperatorRankRows,
    Object.fromEntries(
      baseOperatorRankRows.flatMap((row) => {
        if (row.label === "Не назначен") return [];
        const evidenceLink = evidenceLinkFor(
          {
            evidenceType: "driver",
            metric: "operator-score",
            facet: { operator: row.label }
          },
          { operators: workspaceOperators }
        );
        return evidenceLink ? [[row.key, evidenceLink.href]] : [];
      })
    )
  );
  const baseSourceRankRows = rankedScoreRows(sourceRows, previousSourceRows).map((row) => ({
    ...row,
    key: row.label,
    value: Math.round(row.averageScore ?? 0),
    detail: formatReviewCount(row.count),
    meta: row.delta == null ? "нет базы сравнения" : undefined
  }));
  const sourceRankRows = relinkReportRows(
    baseSourceRankRows,
    Object.fromEntries(
      baseSourceRankRows.flatMap((row) => {
        const source = filterCatalog.sources.find(
          (candidate) => externalSourceLabel(candidate) === row.label
        );
        const evidenceLink = source
          ? evidenceLinkFor({
              evidenceType: "driver",
              metric: "source-score",
              facet: { source }
            })
          : undefined;
        return evidenceLink ? [[row.key, evidenceLink.href]] : [];
      })
    )
  );
  const baseTeamRankRows = rankedScoreRows(teamRows, previousTeamRows).map((row) => ({
    ...row,
    key: row.label,
    value: Math.round(row.averageScore ?? 0),
    detail: formatReviewCount(row.count),
    meta: row.delta == null ? "нет базы сравнения" : undefined
  }));
  const teamRankRows = relinkReportRows(
    baseTeamRankRows,
    Object.fromEntries(
      baseTeamRankRows.flatMap((row) => {
        const team = filterCatalog.teams.find(
          (candidate) => candidate.value === row.label
        );
        const evidenceLink = team
          ? evidenceLinkFor({
              evidenceType: "driver",
              metric: "team-score",
              facet: { team: team.slug }
            })
          : undefined;
        return evidenceLink ? [[row.key, evidenceLink.href]] : [];
      })
    )
  );
  const weakestAssigneeFocus = operatorRankRows[0];
  const weakestSourceFocus = sourceRankRows[0];
  const weakestTeamFocus = teamRankRows[0];
  const movementSources = [
    { label: "Команды", rows: teamRows, previousRows: previousTeamRows },
    { label: "Операторы", rows: assigneeRows, previousRows: previousAssigneeRows },
    { label: "Источники", rows: sourceRows, previousRows: previousSourceRows },
    {
      label: "Блоки критериев",
      rows: blockScoreRows.map((row) => ({ ...row, href: reportHref(period, { view: "details" }) })),
      previousRows: previousBlockScoreRows
    }
  ];
  const deteriorationItems = buildDeteriorationHighlights(movementSources);
  const improvementItems = buildImprovementHighlights(movementSources);
  const highRiskEvidenceLink = evidenceLinkFor({
    evidenceType: "kpi",
    metric: "high-risk"
  });
  const baseRiskStackSegments = riskSegments(riskGroups, period).map(
    (segment) => ({
      ...segment,
      key: segment.label
    })
  );
  // Each stack segment keeps its exact risk-specific queue href. The combined
  // HIGH+ evidence descriptor belongs only to the aggregate KPI.
  const riskStackSegments = baseRiskStackSegments;
  const quotaProgressRows = quotas.map((quota) => {
    const actualReviews = finalizedReviews.filter(
      (review) =>
        review.conversation.assigneeName === quota.assigneeName &&
        (quota.supportLine ? review.conversation.supportLine === quota.supportLine : true)
    );

    return {
      label: quota.supportLine ? `${quota.assigneeName}, ${quota.supportLine}` : quota.assigneeName,
      planned: quota.plannedCount,
      actual: actualReviews.length,
      href: reportReviewHref(period, {
        assignee: quota.assigneeName,
        ...(quota.supportLine ? { supportLine: quota.supportLine } : {})
      })
    };
  });
  const plannedQuotaTotal = quotaProgressRows.reduce((sum, row) => sum + row.planned, 0);
  const actualQuotaTotal = quotaProgressRows.reduce((sum, row) => sum + row.actual, 0);
  const quotaCompletionPercent = !hasEntityFilters && plannedQuotaTotal > 0
    ? Math.round((actualQuotaTotal / plannedQuotaTotal) * 100)
    : null;
  const totalFindings = categoryRows.reduce((sum, row) => sum + row.count, 0);
  const highRiskShare = totalFindings > 0 ? Math.round((highRiskFindings / totalFindings) * 100) : 0;
  const coachingBacklogShare = finalizedCount > 0 ? Math.round((coachingBacklog / finalizedCount) * 100) : null;
  const topSource = sourceRows[0];
  const topSourceShare = topSource && finalizedCount > 0 ? Math.round((topSource.count / finalizedCount) * 100) : null;
  const baseMetricInsightItems = [
    {
      label: "Риск HIGH+",
      value: String(highRiskFindings),
      detail: totalFindings > 0 ? `${highRiskShare}% всех замечаний` : "Высоких рисков в замечаниях нет.",
      progress: highRiskShare,
      progressLabel: "доля риска",
      explanation:
        "Считает замечания с уровнем HIGH и CRITICAL внутри текущего периода. Высокая доля означает, что сначала стоит открыть проверки с высоким риском и разобрать повторяющиеся причины.",
      tone: highRiskFindings > 0 ? "danger" : "ok",
      href: reportReviewHref(period, { riskLevel: "HIGH_OR_CRITICAL" })
    },
    {
      label: "Открытые разборы",
      value: String(coachingBacklog),
      detail: finalizedCount > 0 ? `${coachingBacklogShare ?? 0}% к объему проверок` : "Нет завершенной выборки.",
      progress: coachingBacklogShare,
      progressLabel: "нагрузка разбора",
      explanation:
        "Показывает, сколько проверок уже требуют разбора, обучения или follow-up. Процент считается от завершенных проверок периода, поэтому помогает понять нагрузку на лидов, а не качество само по себе.",
      tone: coachingBacklog > 0 ? "warn" : "ok",
      href: reportReviewHref(period, { coachingStatus: "open" })
    },
    {
      label: "Источники",
      value: String(sourceRows.length),
      detail: topSource ? `Топ: ${topSource.label}, ${topSourceShare ?? 0}% выборки` : "Источники появятся после финализации.",
      progress: topSourceShare,
      progressLabel: "концентрация",
      explanation:
        "Показывает, насколько выборка сосредоточена в одном источнике. Если концентрация высокая, общий тренд может отражать специфику HubSpot, OTRS или другого канала, а не всей поддержки.",
      tone: sourceRows.length > 1 ? "neutral" : finalizedCount > 0 ? "warn" : "neutral",
      href: reportHref(period, { view: "performance" })
    },
    {
      label: "Норма",
      value: hasEntityFilters
        ? "Недоступно"
        : quotaCompletionPercent == null
          ? "Нет плана"
          : `${quotaCompletionPercent}%`,
      detail: hasEntityFilters
        ? "Нормы рассчитаны только для полной выборки."
        : quotaCompletionPercent == null
          ? "Нормы на период не заданы."
          : `${actualQuotaTotal} из ${plannedQuotaTotal} проверок`,
      progress: quotaCompletionPercent,
      progressLabel: "выполнение",
      explanation: hasEntityFilters
        ? "Сбросьте фильтры команды, источника, риска и блока, чтобы сопоставить факт с планом полной выборки."
        : "Сравнивает фактически завершенные проверки с планом периода. Низкий процент означает риск непредставительной выборки: выводы по качеству лучше читать осторожнее.",
      tone: quotaCompletionPercent == null ? "neutral" : quotaCompletionPercent >= 100 ? "ok" : "warn",
      href: reportHref(period, { view: "details" })
    }
  ] satisfies MetricInsightItem[];
  const metricInsightItems: MetricInsightItem[] = relinkReportRows(
    baseMetricInsightItems.map((item) => ({ ...item, key: item.label })),
    highRiskEvidenceLink
      ? { "Риск HIGH+": highRiskEvidenceLink.href }
      : {}
  );
  const criterionHeatmapRows: CriterionHeatmapRow[] = blockScoreRows.map((row) => ({
    label: row.label,
    score: row.averageScore ?? null,
    count: row.count,
    detail: formatCriterionCount(row.count)
  }));
  // Agent × criterion-block matrix: per-agent normalized pass-rate for each
  // criteria block, plus a pinned team-average row. Columns follow the same
  // block ordering as the criteria breakdown (weakest blocks already first).
  const matrixColumns: CriterionMatrixColumn[] = blockScoreRows.map((row) => ({
    key: row.label,
    label: row.label
  }));
  const agentBlockScores = new Map<string, Map<string, number[]>>();
  const teamBlockScores = new Map<string, number[]>();
  const agentReviewCounts = new Map<string, number>();
  for (const review of finalizedReviews) {
    const agent = review.conversation.assigneeName ?? "Не назначен";
    const perBlock = agentBlockScores.get(agent) ?? new Map<string, number[]>();
    let hasApplicableScore = false;

    for (const score of review.scores) {
      const percent = criterionEarnedPercent(score);
      if (percent == null) {
        continue;
      }
      hasApplicableScore = true;
      addScoreGroup(perBlock, score.criterion.block, percent);
      addScoreGroup(teamBlockScores, score.criterion.block, percent);
    }

    if (hasApplicableScore) {
      agentReviewCounts.set(agent, (agentReviewCounts.get(agent) ?? 0) + 1);
      agentBlockScores.set(agent, perBlock);
    }
  }
  const matrixEvidenceLinks = [] as Array<
    NonNullable<ReturnType<typeof evidenceLinkFor>>
  >;
  const matrixRows: CriterionMatrixRow[] = Array.from(agentBlockScores.entries())
    .map(([agent, perBlock]) => {
      const cells: CriterionMatrixRow["cells"] = {};

      for (const column of matrixColumns) {
        const scores = perBlock.get(column.key) ?? [];
        const value = average(scores);
        const block = filterCatalog.blocks.find(
          (candidate) => candidate.value === column.key
        );
        const evidenceLink =
          agent !== "Не назначен" && block
            ? evidenceLinkFor(
                {
                  evidenceType: "matrix",
                  metric: "operator-block",
                  facet: {
                    operator: agent,
                    block: block.slug
                  }
                },
                { operators: workspaceOperators }
              )
            : undefined;
        if (evidenceLink) {
          matrixEvidenceLinks.push(evidenceLink);
        }
        cells[column.key] = {
          value,
          count: scores.length,
          href:
            evidenceLink?.href ??
            (agent === "Не назначен"
              ? undefined
              : reportReviewHref(period, { assignee: agent }))
        };
      }

      const reviewCount = agentReviewCounts.get(agent) ?? 0;

      return {
        key: agent,
        label: agent,
        meta: formatReviewCount(reviewCount),
        href: agent === "Не назначен" ? undefined : reportReviewHref(period, { assignee: agent }),
        cells
      };
    })
    .sort((left, right) => {
      const leftScore = average(Object.values(left.cells).flatMap((cell) => (cell.value == null ? [] : [cell.value])));
      const rightScore = average(Object.values(right.cells).flatMap((cell) => (cell.value == null ? [] : [cell.value])));
      return (leftScore ?? 101) - (rightScore ?? 101) || left.label.localeCompare(right.label, "ru");
    });
  const matrixTeamAverage = {
    label: "Среднее по команде",
    meta: formatReviewCount(finalizedCount),
    cells: Object.fromEntries(
      matrixColumns.map((column) => [
        column.key,
        { value: average(teamBlockScores.get(column.key) ?? []) }
      ])
    ) as CriterionMatrixRow["cells"]
  };
  const processRiskCount = criticalCount + reanswerCount + appealCount;
  const viewCounts: Record<ReportView, number> = {
    overview: finalizedCount,
    performance: operatorRankRows.length + sourceRankRows.length + teamRankRows.length,
    process: processRiskCount,
    details: 9
  };
  // Overview "где смотреть" cards. Источник/Блок/Команда live in the merged
  // period-movement driver chain below, so this grid carries only the slices
  // that chain does not cover: the weakest operator and the process-risk count.
  const focusItems: FocusItem[] = [
    {
      label: "Оператор для разбора",
      value: weakestAssigneeFocus ? `${weakestAssigneeFocus.label}: ${formatAverageScore(weakestAssigneeFocus.averageScore)}` : "Нет данных",
      detail: weakestAssigneeFocus ? `${formatReviewCount(weakestAssigneeFocus.count)}, ${reportDeltaLabel(weakestAssigneeFocus.delta)}` : "Операторы появятся после завершенных проверок.",
      href: weakestAssigneeFocus?.href,
      actionLabel: "Открыть очередь"
    },
    {
      label: "Процессный риск",
      value: processRiskCount > 0 ? `${processRiskCount} событий` : "Нет событий",
      detail: "Критические ошибки, переответы и апелляции.",
      href: processRiskCount > 0 ? reportHref(period, { view: "process" }) : undefined,
      actionLabel: "Разобрать процесс"
    }
  ];
  const performanceFocusItems: ReportFocusItem[] = [
    {
      label: "Оператор для разбора",
      value: weakestAssigneeFocus ? weakestAssigneeFocus.label : "Нет данных",
      detail: weakestAssigneeFocus
        ? `${formatAverageScore(weakestAssigneeFocus.averageScore)}, ${formatReviewCount(weakestAssigneeFocus.count)}, ${reportDeltaLabel(weakestAssigneeFocus.delta)}`
        : "Появится после завершенных проверок.",
      href: weakestAssigneeFocus?.href,
      tone: weakestAssigneeFocus && (weakestAssigneeFocus.averageScore ?? 100) < 85 ? "warn" : "neutral"
    },
    {
      label: "Источник с просадкой",
      value: weakestSourceFocus ? weakestSourceFocus.label : "Нет данных",
      detail: weakestSourceFocus
        ? `${formatAverageScore(weakestSourceFocus.averageScore)}, ${formatReviewCount(weakestSourceFocus.count)}, ${reportDeltaLabel(weakestSourceFocus.delta)}`
        : "Источники появятся после первых финальных оценок.",
      href: weakestSourceFocus?.href,
      tone: weakestSourceFocus && (weakestSourceFocus.averageScore ?? 100) < 85 ? "warn" : "neutral"
    },
    {
      label: "Команда с просадкой",
      value: weakestTeamFocus ? weakestTeamFocus.label : "Нет данных",
      detail: weakestTeamFocus
        ? `${formatAverageScore(weakestTeamFocus.averageScore)}, ${formatReviewCount(weakestTeamFocus.count)}, ${reportDeltaLabel(weakestTeamFocus.delta)}`
        : "Команды операторов появятся после первых финальных оценок.",
      href: weakestTeamFocus?.href,
      tone: weakestTeamFocus && (weakestTeamFocus.averageScore ?? 100) < 85 ? "warn" : "neutral"
    },
    {
      label: "Блок критериев",
      value: weakestBlock ? weakestBlock.label : "Нет данных",
      detail: weakestBlock
        ? `${formatAverageScore(weakestBlock.averageScore)}, ${formatReviewCount(weakestBlock.count)}`
        : "Нет оцененных критериев за период.",
      href: reportHref(period, { view: "details" }),
      tone: weakestBlock && (weakestBlock.averageScore ?? 100) < 85 ? "warn" : "neutral"
    },
    {
      label: "Норма проверок",
      value: hasEntityFilters
        ? "Недоступно"
        : plannedQuotaTotal > 0
          ? `${actualQuotaTotal}/${plannedQuotaTotal}`
          : "Нет плана",
      detail: hasEntityFilters
        ? "Нормы рассчитаны только для полной выборки."
        : quotaCompletionPercent == null
          ? "Нормы на период пока не заданы."
          : `${quotaCompletionPercent}% выполнения по плану периода.`,
      href: reportHref(period, { view: "details" }),
      tone: quotaCompletionPercent == null ? "neutral" : quotaCompletionPercent >= 100 ? "ok" : "warn"
    }
  ];
  const detailsIndexItems: DetailsIndexItem[] = [
    {
      label: "Критерии",
      value: String(blockScoreRows.length),
      detail: "Блоки и средние оценки",
      href: "#details-blocks"
    },
    {
      label: "Норма",
      value: hasEntityFilters ? "—" : String(quotas.length),
      detail: hasEntityFilters
        ? "Недоступно для активного среза"
        : "План и факт проверок",
      href: "#details-quotas"
    },
    {
      label: "Источники",
      value: String(sourceRows.length),
      detail: "Каналы обращений",
      href: "#details-sources"
    },
    {
      label: "Люди",
      value: String(assigneeRows.length + teamRows.length + reviewerRows.length),
      detail: "Операторы, команды и проверяющие",
      href: "#details-people"
    },
    {
      label: "Статусы",
      value: String(samplingRows.length + csatRows.length + riskRows.length),
      detail: "Выборка, CSAT и риски",
      href: "#details-statuses"
    }
  ];
  const reportAction =
    highRiskFindings > 0
      ? {
          title: "Разобрать HIGH+ риск",
          description: `${highRiskFindings} замечаний высокого риска в периоде. Начните с проверок, где последствия для клиента максимальны.`,
          label: "Открыть риск",
          href: reportReviewHref(period, { riskLevel: "HIGH_OR_CRITICAL" }),
          tone: "negative" as const
        }
      : coachingBacklog > 0
        ? {
            title: "Закрыть открытые разборы",
            description: `${coachingBacklog} coaching follow-up еще открыты. Переведите аналитику в действия по обучению.`,
            label: "Открыть разборы",
            href: reportReviewHref(period, { coachingStatus: "open" }),
            tone: "warning" as const
          }
        : quotaCompletionPercent != null && quotaCompletionPercent < 100
          ? {
              title: "Добрать норму проверок",
              description: `План периода выполнен на ${quotaCompletionPercent}%. Выводы лучше читать осторожно, пока выборка неполная.`,
              label: "Открыть норму",
              href: reportHref(period, { view: "details" }),
              tone: "warning" as const
            }
          : weakestSourceFocus?.href
            ? {
                title: "Проверить слабый источник",
                description: `${weakestSourceFocus.label}: ${formatAverageScore(weakestSourceFocus.averageScore)}. Сверьте выборку и причины просадки.`,
                label: "Открыть источник",
                href: weakestSourceFocus.href,
                tone: "info" as const
              }
            : {
                title: "Открыть выборку проверок",
                description: "Критичных сигналов нет. Перейдите к списку финализированных проверок для ручного разбора.",
                label: "К выборке",
                href: reportReviewHref(period),
                tone: "positive" as const
              };
  const averageDelta = averageScore == null || previousAverageScore == null ? null : averageScore - previousAverageScore;
  const driverStackItems = [
    weakestBlock
      ? {
          label: "Критерий",
          value: weakestBlock.label,
          evidence: `${formatAverageScore(weakestBlock.averageScore)} · ${formatReviewCount(weakestBlock.count)}`,
          action: "Открыть проверки по слабому блоку",
          href: reportHref(period, { view: "details" })
        }
      : null,
    weakestSourceFocus
      ? {
          label: "Источник",
          value: weakestSourceFocus.label,
          evidence: `${formatAverageScore(weakestSourceFocus.averageScore)} · ${formatReviewCount(weakestSourceFocus.count)}`,
          action: "Сравнить канал с общей выборкой",
          href: weakestSourceFocus.href
        }
      : null,
    weakestTeamFocus
      ? {
          label: "Команда",
          value: weakestTeamFocus.label,
          evidence: `${formatAverageScore(weakestTeamFocus.averageScore)} · ${formatReviewCount(weakestTeamFocus.count)}`,
          action: "Проверить повторяющиеся причины",
          href: weakestTeamFocus.href
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => item != null);

  // Map the resolved priority action (semantic tone) onto the TriageStrip's
  // tone + icon. Indigo accent is the calm default; semantic tones are rationed
  // to true risk states.
  const triageToneByActionTone: Record<typeof reportAction.tone, TriageStripTone> = {
    negative: "danger",
    warning: "warning",
    info: "accent",
    positive: "success"
  };
  const triageTone = triageToneByActionTone[reportAction.tone];
  const TriageIcon =
    triageTone === "danger" || triageTone === "warning"
      ? AlertTriangle
      : triageTone === "success"
        ? CircleCheck
        : BarChart3;

  // Hero KPI: average score + signed delta to the comparable previous period.
  const scoreDeltaChip =
    averageDelta == null
      ? undefined
      : {
          // Drop the leading sign — the StatKpi delta renders its own direction glyph.
          value: formatQualityScoreDelta(averageDelta).replace(/^\+/, ""),
          direction: averageDelta > 0 ? ("up" as const) : averageDelta < 0 ? ("down" as const) : ("flat" as const),
          tone: averageDelta > 0 ? ("success" as const) : averageDelta < 0 ? ("danger" as const) : ("neutral" as const)
        };
  const [scoreHero, ...scoreUnitParts] = formatAverageScore(averageScore).split(" ");
  const scoreUnit = scoreUnitParts.join(" ") || undefined;
  // PageShell tabs replace the old standalone view selector. Counts ride along
  // as pills; hrefs preserve the period + trend granularity.
  const currentChartHref = canonicalReportHref;
  const defaultEvidenceLink =
    reportView === "overview"
      ? defaultTrendEvidenceLink
      : reportView === "performance"
        ? matrixEvidenceLinks[0] ?? agreementEvidenceLink
        : reportView === "process"
          ? highRiskEvidenceLink
          : matrixEvidenceLinks[0] ?? agreementEvidenceLink;
  const resolvedEvidenceIdentity =
    analysisState.evidenceType && analysisState.evidenceKey
      ? `${analysisState.evidenceType}:${analysisState.evidenceKey}`
      : null;
  const defaultEvidenceIdentity = defaultEvidenceLink
    ? `${defaultEvidenceLink.descriptor.evidenceType}:${defaultEvidenceLink.descriptor.key}`
    : null;
  const defaultEvidence =
    defaultEvidenceLink && defaultEvidenceIdentity
      ? {
          identity: defaultEvidenceIdentity,
          result:
            resolvedEvidenceIdentity === defaultEvidenceIdentity
              ? evidenceResult
              : await resolveReportEvidence({
                  user,
                  state: {
                    ...analysisState,
                    evidenceType:
                      defaultEvidenceLink.descriptor.evidenceType,
                    evidenceKey: defaultEvidenceLink.descriptor.key
                  }
                })
        }
      : undefined;
  const evidenceFocusHeadingId =
    reportView === "overview"
      ? "chart-quality-overview-title"
      : reportView === "performance"
        ? hasEntityFilters || analysisState.evidenceType === "matrix"
          ? "criterion-matrix-title"
          : analysisState.evidenceType === "trend"
            ? "chart-ai-drift-title"
            : "chart-ai-human-agreement-title"
        : reportView === "process"
          ? reasonTrendItems.length > 0
            ? "chart-reason-timeline-title"
            : "reason-trend-title"
          : "details-analysis-title";
  const shellTabs: PageShellTab[] = reportViews.map((item) => ({
    label: item.label,
    href: reportNavigationLinkProps(
      currentReportHref,
      { view: item.id },
      filterCatalog
    ).href,
    active: item.id === reportView,
    count: viewCounts[item.id],
    prefetch: false
  }));
  const activeView = reportViews.find((item) => item.id === reportView) ?? reportViews[0];

  return (
    <PageShell
      title="Аналитика качества"
      description={`${activeView.description}. ${period.label}: ${formatPeriod(period)}.`}
      actions={<ReportExportMenu period={period} />}
      tabs={shellTabs}
      className="[&_[id]]:scroll-mt-[calc(var(--app-topbar-height)+4rem)]"
    >
      <ReportParameterLens
        currentHref={currentReportHref}
        state={analysisState}
        catalog={filterCatalog}
        savedViews={savedReportViews}
      />

      <ReportEvidenceSheet
        evidence={evidenceResult}
        open={Boolean(
          analysisState.evidenceType && analysisState.evidenceKey
        )}
        resolvedEvidenceIdentity={
          resolvedEvidenceIdentity
        }
        defaultEvidence={defaultEvidence}
        openHref={defaultEvidenceLink?.href ?? currentReportHref}
        closeHref={currentReportHref}
        chartHeadingId={evidenceFocusHeadingId}
      >
        {defaultEvidenceLink ? (
          <Button variant="outline" size="sm" className="self-start">
            Показать данные выбранного среза
          </Button>
        ) : undefined}
      </ReportEvidenceSheet>

      <TriageStrip
        tone={triageTone}
        icon={<TriageIcon size={18} aria-hidden="true" />}
        title={reportAction.title}
        description={reportAction.description}
        action={
          <Button
            render={<Link href={reportAction.href} prefetch={false} />}
            nativeButton={false}
            size="sm"
          >
            <span>{reportAction.label}</span>
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        }
      />

      {reportView === "overview" ? (
        <>
          <ReportKpiRow
            scoreLabel="Средняя оценка"
            scoreValue={scoreHero}
            scoreUnit={scoreUnit}
            scoreDelta={scoreDeltaChip}
            scoreHint={
              previousAverageScore == null
                ? `${formatReviewCount(finalizedCount)} · нет базы сравнения`
                : `${formatReviewCount(finalizedCount)} · было ${formatAverageScore(previousAverageScore)}`
            }
            scoreHref={reportReviewHref(period)}
            items={metricInsightItems}
          />

          <InsightSummary
            averageScore={averageScore}
            finalizedCount={finalizedCount}
            previousCount={previousReviews.length}
            topSource={sourceRows[0]}
            period={period}
            focusItems={focusItems}
          />
        </>
      ) : null}

      {reportView === "overview" ? (
        <section
          aria-label="Динамика качества и факторы"
          className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        >
          <PrimaryScorePanel
            finalizedCount={finalizedCount}
            previousCount={previousReviews.length}
            model={qualityTrendModel}
            visibleSeries={visibleTrendSeries}
            view={chartView}
            currentHref={currentChartHref}
            periodLabel={formatPeriod(period)}
          />
          <PeriodMovementPanel
            negativeItems={deteriorationItems}
            positiveItems={improvementItems}
            driverItems={driverStackItems}
            view={chartView}
            currentHref={currentChartHref}
            periodLabel={formatPeriod(period)}
          />
        </section>
      ) : null}

      {reportView === "overview" ? (
        <section
          aria-label="Распределение оценок и связь с CSAT"
          className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        >
          <ScoreDistributionPanel
            bundle={scoreDistributionBundle}
            view={chartView}
            currentHref={currentChartHref}
            periodLabel={formatPeriod(period)}
          />
          <SentimentCorrelationPanel correlation={sentimentCorrelation} actionHref={reportReviewHref(period)} />
        </section>
      ) : null}

      {reportView === "performance" ? (
        <ReportFocusPanel
          kicker="Исполнение"
          title="Что тянет оценку вниз"
          description="Операторы, источники, блоки критериев и план проверок в одном рабочем срезе."
          actionHref={reportReviewHref(period)}
          actionLabel="Открыть очередь"
          items={performanceFocusItems}
        />
      ) : null}

      {reportView === "process" ? (
        <ProcessSummary criticalCount={criticalCount} reanswerCount={reanswerCount} appealCount={appealCount} period={period} />
      ) : null}

      {reportView === "performance" ? (
        <Card className="overflow-hidden" aria-labelledby="criterion-matrix-title">
          <CardHeader className="border-b">
            <div className="min-w-0 flex flex-col gap-1">
              <CardDescription>Матрица</CardDescription>
              <CardTitle id="criterion-matrix-title">Операторы × критерии</CardTitle>
              <p className="text-sm text-muted-foreground">
                Pass-rate по блокам критериев для каждого оператора. Закрепленная строка — среднее по команде; слабые операторы и блоки подняты выше.
              </p>
            </div>
            <CardAction>
              <Button
                render={<Link href={reportHref(period, { view: "details" })} />}
                nativeButton={false}
                variant="outline"
                size="sm"
              >
                Таблицы
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-(--card-spacing)">
            <CriterionMatrix
              columns={matrixColumns}
              rows={matrixRows}
              teamAverage={matrixTeamAverage}
              scrollRegionLabelledBy="criterion-matrix-title"
            />
          </CardContent>
        </Card>
      ) : null}

      {reportView === "performance" && hasEntityFilters ? (
        <Card>
          <CardHeader>
            <CardDescription>AI-аналитика</CardDescription>
            <CardTitle>Недоступна для активного среза</CardTitle>
            <p className="text-sm text-muted-foreground">
              Согласие и дрейф AI рассчитываются только для выборки всего
              пространства. Сбросьте фильтры команды, источника, риска и блока.
            </p>
          </CardHeader>
        </Card>
      ) : null}

      {reportView === "performance" && !hasEntityFilters ? (
        <AiAgreementPanel
          report={aiAgreement}
          bundle={aiAgreementBundle}
          view={chartView}
          currentHref={currentChartHref}
          periodLabel={formatPeriod(period)}
        />
      ) : null}

      {reportView === "performance" && !hasEntityFilters ? (
        <AiDriftPanel
          report={aiDrift}
          bundle={aiDriftBundle}
          view={chartView}
          currentHref={currentChartHref}
          periodLabel={formatPeriod(period)}
        />
      ) : null}

      {reportView === "performance" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ChartPanel title="По операторам" description="Нижние средние оценки первыми." actionHref={reportReviewHref(period)} actionLabel="Разобрать">
            <RankedList rows={operatorRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
          </ChartPanel>
          <ChartPanel title="По источникам" description="Средняя оценка по системам-источникам." actionHref={reportReviewHref(period)} actionLabel="Открыть">
            <RankedList rows={sourceRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
          </ChartPanel>
          <ChartPanel title="По командам" description="Команды поддержки, где просадка заметна на уровне выборки." actionHref={reportReviewHref(period)} actionLabel="Открыть">
            <RankedList rows={teamRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
          </ChartPanel>
          <CriterionHeatmapPanel
            title="Блоки критериев"
            description="Тепловая карта нормализованных оценок: слабые блоки поднимаются первыми."
            rows={criterionHeatmapRows}
            actionHref={reportHref(period, { view: "details" })}
            actionLabel="Таблица"
          />
          <ChartPanel
            title="Выполнение норм"
            description={
              hasEntityFilters
                ? "Недоступно для активного среза: нормы заданы для полной выборки."
                : "Факт проверок против плана периода."
            }
            actionHref={reportReviewHref(period)}
            actionLabel="Факт"
          >
            <QuotaProgressBars rows={hasEntityFilters ? [] : quotaProgressRows} />
          </ChartPanel>
        </div>
      ) : null}

      {reportView === "process" ? (
        <>
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            <ChartPanel
              title="Профиль рисков"
              description="Доля замечаний по уровню риска."
              actionHref={reportReviewHref(period, { riskLevel: "CRITICAL" })}
              actionLabel="Критические"
            >
              <StackedBar segments={riskStackSegments} />
            </ChartPanel>
            <BreakdownTable title="Категории" rows={categoryRows} countLabel="Замечаний" />
            <BreakdownTable title="Критические ошибки" rows={criticalCategoryRows} countLabel="Ошибок" />
          </div>
          <ReasonTrendPanel
            rows={reasonTrendItems}
            bundle={reasonTimelineBundle}
            view={chartView}
            currentHref={currentChartHref}
            periodLabel={formatPeriod(period)}
          />
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Скорость обратной связи">
            <StatCard
              label="Медиана до ознакомления"
              value={medianAckHours != null ? formatAckDuration(medianAckHours) : "—"}
              hint="Время от финализации до подтверждения"
            />
            <StatCard
              label="Ознакомлены за 48 ч"
              value={ackWithin48Percent != null ? `${ackWithin48Percent}%` : "—"}
              hint="Доля операторов, ответивших за двое суток"
            />
            <StatCard
              label="Ожидают ответа оператора"
              value={pendingFeedbackCount}
              hint="Финализированные проверки без ответа"
            />
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            <BreakdownTable title="Обратная связь" rows={feedbackRows} countLabel="Проверок" />
            <BreakdownTable title="Апелляции" rows={appealRows} countLabel="Проверок" />
            <BreakdownTable title="Переответы" rows={reanswerRows} countLabel="Проверок" />
          </div>
        </>
      ) : null}

      {reportView === "details" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1fr)]">
          <DetailsIndexPanel
            items={detailsIndexItems}
            titleId="details-analysis-title"
          />
          <div className="grid min-w-0 gap-4 md:grid-cols-2 [&>*]:min-w-0">
            <BreakdownTable
              id="details-blocks"
              title="Блоки критериев"
              rows={withScoreDeltas(blockScoreRows, previousBlockScoreRows)}
              countLabel="Оценок"
              showAverage
            />
            {hasEntityFilters ? (
              <Card id="details-quotas" size="sm">
                <CardHeader>
                  <CardTitle>Нормы проверок недоступны</CardTitle>
                  <CardDescription>
                    Нормы рассчитаны для полной выборки. Сбросьте фильтры
                    команды, источника, риска и блока.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <QuotaTable
                id="details-quotas"
                quotas={quotas}
                reviews={finalizedReviews}
                period={period}
              />
            )}
            <BreakdownTable
              id="details-sources"
              title="Источники"
              rows={withScoreDeltas(sourceRows, previousSourceRows)}
              countLabel="Проверок"
              showAverage
            />
            <BreakdownTable
              id="details-people"
              title="Операторы"
              rows={withScoreDeltas(assigneeRows, previousAssigneeRows)}
              countLabel="Проверок"
              showAverage
            />
            <BreakdownTable
              title="Команды операторов"
              rows={withScoreDeltas(teamRows, previousTeamRows)}
              countLabel="Проверок"
              showAverage
            />
            <BreakdownTable title="Проверяющие" rows={reviewerRows} countLabel="Проверок" showAverage />
            <BreakdownTable id="details-statuses" title="Типы выборки" rows={samplingRows} countLabel="Проверок" />
            <BreakdownTable title="CSAT" rows={csatRows} countLabel="Проверок" />
            <BreakdownTable
              title="Средний балл по CSAT"
              rows={csatScoreRows}
              countLabel="Проверок"
              showAverage
            />
            <BreakdownTable title="Риски" rows={riskRows} countLabel="Замечаний" />
          </div>
        </div>
      ) : null}

    </PageShell>
  );
}
