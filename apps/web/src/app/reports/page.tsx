import {
  CriterionHeatmapPanel,
  MetricInsightStrip,
  type CriterionHeatmapRow,
  type MetricInsightItem
} from "@/components/reports/analytics-intelligence";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import {
  ChartPanel,
  QuotaProgressBars,
  RankedList,
  ScoreDistribution,
  StackedBar
} from "@/components/reports/report-charts";
import { ReportCommandBar, ReportViewSelector } from "@/components/reports/report-command-bar";
import {
  DetailsIndexPanel,
  ImprovementPanel,
  InsightSummary,
  ProcessSummary,
  ReportFocusPanel,
  type DetailsIndexItem,
  type FocusItem,
  type ReportFocusItem
} from "@/components/reports/report-panels";
import { PrimaryScorePanel } from "@/components/reports/report-score-panel";
import { ReportAgentLeaderboard } from "@/components/reports/report-agent-leaderboard";
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
  resolvePreviousReportPeriod,
  resolveReportPeriod
} from "@/lib/report-period";
import { buildScoreTrendRows, resolveReportTrendGranularity } from "@/lib/report-trends";
import { buildDeteriorationHighlights, buildImprovementHighlights } from "@/lib/report-improvements";
import { formatQualityScore } from "@/lib/score-display";
import {
  addCountGroup,
  addScoreGroup,
  averageScoreFor,
  blockRows,
  countGroupRows,
  rankedScoreRows,
  withScoreDeltas,
  riskSegments,
  scoreDistributionRows,
  scoreGroupRows
} from "@/lib/reports/report-aggregation";
import {
  formatAverageScore,
  formatCriterionCount,
  formatReviewCount,
  reportDeltaLabel,
  reportHref,
  reportReviewHref,
  reportReviewRangeHref,
  resolveReportView,
  type ReportView
} from "@/lib/reports/report-format";
import { loadFinalizedReviews, reviewWhere } from "@/lib/reports/report-page-data";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  const period = resolveReportPeriod(params);
  const previousPeriod = resolvePreviousReportPeriod(period);
  const reportView = resolveReportView(params);
  const trendGranularity = resolveReportTrendGranularity(params);

  const [finalizedReviews, previousReviews, highRiskFindings, coachingBacklog, quotas] = await Promise.all([
    loadFinalizedReviews(user.workspaceId, period),
    loadFinalizedReviews(user.workspaceId, previousPeriod),
    prisma.finding.count({
      where: {
        riskLevel: {
          in: ["HIGH", "CRITICAL"]
        },
        review: {
          ...reviewWhere(user.workspaceId, period)
        }
      }
    }),
    prisma.coachingAction.count({
      where: {
        status: "open",
        finding: {
          review: {
            ...reviewWhere(user.workspaceId, period)
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
    })
  ]);
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
    addScoreGroup(sourceGroups, review.conversation.externalSource, review.totalScore);
    addScoreGroup(assigneeGroups, review.conversation.assigneeName ?? "Не назначен", review.totalScore);
    addScoreGroup(teamGroups, review.conversation.teamName ?? "Команда не указана", review.totalScore);
    addScoreGroup(reviewerGroups, review.reviewer.name, review.totalScore);
    addCountGroup(samplingGroups, samplingTypeLabels[review.conversation.samplingType] ?? review.conversation.samplingType);
    addCountGroup(csatGroups, csatBucketLabels[review.conversation.csatBucket] ?? review.conversation.csatBucket);
    if (review.conversation.csatBucket !== "NO_SCORE") {
      addScoreGroup(csatScoreGroups, csatBucketLabels[review.conversation.csatBucket] ?? review.conversation.csatBucket, review.totalScore);
    }
    addCountGroup(feedbackGroups, feedbackStatusLabels[review.feedbackStatus] ?? review.feedbackStatus);
    addCountGroup(appealGroups, appealStatusLabels[review.appealStatus] ?? review.appealStatus);
    addCountGroup(reanswerGroups, reanswerStatusLabels[review.reanswerStatus] ?? review.reanswerStatus);

    if (review.criticalError) {
      addCountGroup(criticalCategoryGroups, review.criticalCategory ?? "Критическая ошибка");
    }

    for (const finding of review.findings) {
      addCountGroup(categoryGroups, finding.category);
      addCountGroup(riskGroups, riskLevelLabels[finding.riskLevel]);
    }
  }

  for (const review of previousReviews) {
    addScoreGroup(previousSourceGroups, review.conversation.externalSource, review.totalScore);
    addScoreGroup(previousAssigneeGroups, review.conversation.assigneeName ?? "Не назначен", review.totalScore);
    addScoreGroup(previousTeamGroups, review.conversation.teamName ?? "Команда не указана", review.totalScore);
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
  const blockScoreRows = blockRows(finalizedReviews);
  const previousBlockScoreRows = blockRows(previousReviews);
  const finalizedCount = finalizedReviews.length;
  const previousAverageScore = averageScoreFor(previousReviews);
  const averageScore = averageScoreFor(finalizedReviews);
  const weakestBlock = blockScoreRows
    .filter((row) => row.averageScore != null)
    .sort((left, right) => (left.averageScore ?? 0) - (right.averageScore ?? 0))[0];
  const criticalCount = finalizedReviews.filter((review) => review.criticalError).length;
  const reanswerCount = finalizedReviews.filter((review) => review.needsReanswer).length;
  const appealCount = finalizedReviews.filter((review) => review.appealStatus !== "none").length;
  const trendRows = buildScoreTrendRows(
    finalizedReviews,
    period,
    trendGranularity,
    (start, end) => reportReviewRangeHref(start, end)
  );
  const distributionRows = scoreDistributionRows(finalizedReviews);
  const operatorRankRows = rankedScoreRows(assigneeRows, previousAssigneeRows).map((row) => ({
    ...row,
    value: Math.round(row.averageScore ?? 0),
    href: row.href,
    detail: formatReviewCount(row.count),
    meta: row.delta == null ? "нет базы сравнения" : undefined
  }));
  const sourceRankRows = rankedScoreRows(sourceRows, previousSourceRows).map((row) => ({
    ...row,
    value: Math.round(row.averageScore ?? 0),
    detail: formatReviewCount(row.count),
    meta: row.delta == null ? "нет базы сравнения" : undefined
  }));
  const teamRankRows = rankedScoreRows(teamRows, previousTeamRows).map((row) => ({
    ...row,
    value: Math.round(row.averageScore ?? 0),
    detail: formatReviewCount(row.count),
    meta: row.delta == null ? "нет базы сравнения" : undefined
  }));
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
  const riskStackSegments = riskSegments(riskGroups, period);
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
  const quotaCompletionPercent = plannedQuotaTotal > 0
    ? Math.round((actualQuotaTotal / plannedQuotaTotal) * 100)
    : null;
  const totalFindings = categoryRows.reduce((sum, row) => sum + row.count, 0);
  const highRiskShare = totalFindings > 0 ? Math.round((highRiskFindings / totalFindings) * 100) : 0;
  const coachingBacklogShare = finalizedCount > 0 ? Math.round((coachingBacklog / finalizedCount) * 100) : null;
  const topSource = sourceRows[0];
  const topSourceShare = topSource && finalizedCount > 0 ? Math.round((topSource.count / finalizedCount) * 100) : null;
  const metricInsightItems: MetricInsightItem[] = [
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
      value: quotaCompletionPercent == null ? "Нет плана" : `${quotaCompletionPercent}%`,
      detail: quotaCompletionPercent == null ? "Нормы на период не заданы." : `${actualQuotaTotal} из ${plannedQuotaTotal} проверок`,
      progress: quotaCompletionPercent,
      progressLabel: "выполнение",
      explanation:
        "Сравнивает фактически завершенные проверки с планом периода. Низкий процент означает риск непредставительной выборки: выводы по качеству лучше читать осторожнее.",
      tone: quotaCompletionPercent == null ? "neutral" : quotaCompletionPercent >= 100 ? "ok" : "warn",
      href: reportHref(period, { view: "details" })
    }
  ];
  const criterionHeatmapRows: CriterionHeatmapRow[] = blockScoreRows.map((row) => ({
    label: row.label,
    score: row.averageScore ?? null,
    count: row.count,
    detail: formatCriterionCount(row.count)
  }));
  const processRiskCount = criticalCount + reanswerCount + appealCount;
  const viewCounts: Record<ReportView, number> = {
    overview: finalizedCount,
    performance: operatorRankRows.length + sourceRankRows.length + teamRankRows.length,
    process: processRiskCount,
    details: 9
  };
  const focusItems: FocusItem[] = [
    {
      label: "Источник с худшей оценкой",
      value: weakestSourceFocus ? `${weakestSourceFocus.label}: ${formatAverageScore(weakestSourceFocus.averageScore)}` : "Нет данных",
      detail: weakestSourceFocus ? `${formatReviewCount(weakestSourceFocus.count)}, ${reportDeltaLabel(weakestSourceFocus.delta)}` : "Появится после первых завершенных проверок.",
      href: weakestSourceFocus?.href,
      actionLabel: "Открыть источник"
    },
    {
      label: "Блок критериев",
      value: weakestBlock ? `${weakestBlock.label}: ${formatAverageScore(weakestBlock.averageScore)}` : "Нет данных",
      detail: "Самая низкая средняя оценка по блоку.",
      href: reportHref(period, { view: "details" }),
      actionLabel: "Посмотреть блоки"
    },
    {
      label: "Оператор для разбора",
      value: weakestAssigneeFocus ? `${weakestAssigneeFocus.label}: ${formatAverageScore(weakestAssigneeFocus.averageScore)}` : "Нет данных",
      detail: weakestAssigneeFocus ? `${formatReviewCount(weakestAssigneeFocus.count)}, ${reportDeltaLabel(weakestAssigneeFocus.delta)}` : "Операторы появятся после завершенных проверок.",
      href: weakestAssigneeFocus?.href,
      actionLabel: "Открыть очередь"
    },
    {
      label: "Команда поддержки",
      value: weakestTeamFocus ? `${weakestTeamFocus.label}: ${formatAverageScore(weakestTeamFocus.averageScore)}` : "Нет данных",
      detail: weakestTeamFocus ? `${formatReviewCount(weakestTeamFocus.count)}, ${reportDeltaLabel(weakestTeamFocus.delta)}` : "Команды появятся после завершенных проверок.",
      href: weakestTeamFocus?.href,
      actionLabel: "Открыть команду"
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
      value: plannedQuotaTotal > 0 ? `${actualQuotaTotal}/${plannedQuotaTotal}` : "Нет плана",
      detail: quotaCompletionPercent == null ? "Нормы на период пока не заданы." : `${quotaCompletionPercent}% выполнения по плану периода.`,
      href: reportHref(period, { view: "details" }),
      tone: quotaCompletionPercent == null ? "neutral" : quotaCompletionPercent >= 100 ? "ok" : "warn"
    }
  ];
  const detailsFocusItems: ReportFocusItem[] = [
    {
      label: "Выборка",
      value: formatReviewCount(finalizedCount),
      detail: "Финализированные проверки в выбранном периоде.",
      href: reportReviewHref(period),
      tone: finalizedCount >= 10 ? "ok" : "warn"
    },
    {
      label: "Источники",
      value: String(sourceRows.length),
      detail: sourceRows.length > 1 ? "Можно сравнивать каналы по объему и оценке." : "Нужна выборка из нескольких источников.",
      href: reportReviewHref(period),
      tone: sourceRows.length > 1 ? "ok" : "neutral"
    },
    {
      label: "Операторы",
      value: String(assigneeRows.length),
      detail: teamRows.length > 1 ? `${teamRows.length} команд поддержки в выборке.` : "Пока недостаточно срезов по командам.",
      href: reportHref(period, { view: "performance" }),
      tone: assigneeRows.length > 1 && teamRows.length > 1 ? "ok" : "neutral"
    },
    {
      label: "Проверяющие",
      value: String(reviewerRows.length),
      detail: reviewerRows.length > 1 ? "Можно сверять нагрузку и стиль оценивания." : "Пока работает один проверяющий.",
      tone: reviewerRows.length > 1 ? "ok" : "neutral"
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
      value: String(quotas.length),
      detail: "План и факт проверок",
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

  return (
    <section className="page-shell workspace-shell">
      <ReportCommandBar period={period} previousPeriod={previousPeriod} view={reportView} trendGranularity={trendGranularity} />

      {reportView === "overview" ? (
        <InsightSummary
          averageScore={averageScore}
          finalizedCount={finalizedCount}
          previousCount={previousReviews.length}
          topSource={sourceRows[0]}
          period={period}
          focusItems={focusItems}
        />
      ) : null}

      <ReportViewSelector period={period} view={reportView} counts={viewCounts} trendGranularity={trendGranularity} />

      {reportView === "overview" ? (
        <div className="report-metrics-layout">
          <PrimaryScorePanel
            averageScore={averageScore}
            previousAverageScore={previousAverageScore}
            finalizedCount={finalizedCount}
            previousCount={previousReviews.length}
            trendRows={trendRows}
            period={period}
          />
          <MetricInsightStrip
            title="Операционные сигналы"
            description="Короткая проверка рисков, разборов, источников и выполнения нормы без перехода в таблицы."
            items={metricInsightItems}
          />
        </div>
      ) : null}

      {reportView === "overview" ? <ImprovementPanel negativeItems={deteriorationItems} items={improvementItems} /> : null}

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

      {reportView === "details" ? (
        <ReportFocusPanel
          kicker="Разрезы"
          title="Состав выборки для ручного разбора"
          description="Сколько данных доступно в таблицах по источникам, операторам, проверяющим и очереди проверок."
          actionHref={reportReviewHref(period)}
          actionLabel="Открыть проверки"
          items={detailsFocusItems}
        />
      ) : null}

      {reportView === "overview" ? (
        <>
          <div className="reports-main-grid">
            <ChartPanel
              title="Распределение оценок"
              description="Сколько проверок попало в каждый диапазон."
              actionHref={reportReviewHref(period)}
              actionLabel="Список"
            >
              <ScoreDistribution rows={distributionRows} />
            </ChartPanel>
          </div>
        </>
      ) : null}

      {reportView === "performance" ? (
        <div className="reports-panel-grid reports-panel-grid--four">
          <ChartPanel title="По операторам" description="Нижние средние оценки первыми." actionHref={reportReviewHref(period)} actionLabel="Разобрать">
            <RankedList rows={operatorRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
          </ChartPanel>
          <ReportAgentLeaderboard title="Баллы по агентам" rows={assigneeRows} />
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
          <ChartPanel title="Выполнение норм" description="Факт проверок против плана периода." actionHref={reportReviewHref(period)} actionLabel="Факт">
            <QuotaProgressBars rows={quotaProgressRows} />
          </ChartPanel>
        </div>
      ) : null}

      {reportView === "process" ? (
        <>
          <div className="reports-panel-grid reports-panel-grid--three">
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
          <div className="metric-strip" aria-label="Скорость обратной связи">
            <div className="metric-strip__item">
              <div className="metric-strip__label">Медиана до ознакомления</div>
              <div className="metric-strip__value">{medianAckHours != null ? formatAckDuration(medianAckHours) : "—"}</div>
            </div>
            <div className="metric-strip__item">
              <div className="metric-strip__label">Ознакомлены за 48 ч</div>
              <div className="metric-strip__value">{ackWithin48Percent != null ? `${ackWithin48Percent}%` : "—"}</div>
            </div>
            <div className="metric-strip__item">
              <div className="metric-strip__label">Ожидают ответа оператора</div>
              <div className="metric-strip__value">{pendingFeedbackCount}</div>
            </div>
          </div>
          <div className="reports-panel-grid reports-panel-grid--three">
            <BreakdownTable title="Обратная связь" rows={feedbackRows} countLabel="Проверок" />
            <BreakdownTable title="Апелляции" rows={appealRows} countLabel="Проверок" />
            <BreakdownTable title="Переответы" rows={reanswerRows} countLabel="Проверок" />
          </div>
        </>
      ) : null}

      {reportView === "details" ? (
        <div className="details-workbench">
          <DetailsIndexPanel items={detailsIndexItems} />
          <div className="reports-table-grid reports-table-grid--details">
            <BreakdownTable
              id="details-blocks"
              title="Блоки критериев"
              rows={withScoreDeltas(blockScoreRows, previousBlockScoreRows)}
              countLabel="Оценок"
              showAverage
            />
            <QuotaTable id="details-quotas" quotas={quotas} reviews={finalizedReviews} period={period} />
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
    </section>
  );
}
