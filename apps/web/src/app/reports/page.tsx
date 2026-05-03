import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Database, RotateCcw, Scale } from "lucide-react";
import { MetricCard } from "@/components/reports/metric-card";
import {
  ChartPanel,
  HorizontalBarChart,
  QuotaProgressBars,
  ScoreDistribution,
  SparklineChart,
  StackedBar,
  type ChartDatum,
  type StackedSegment
} from "@/components/reports/report-charts";
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
  reportDateInputValue,
  reportPeriodDateLabel,
  resolvePreviousReportPeriod,
  resolveReportPeriod,
  type ReportPeriod
} from "@/lib/report-period";

export const dynamic = "force-dynamic";

type BreakdownRow = {
  label: string;
  count: number;
  averageScore?: number | null;
};

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ReviewForReport = Awaited<ReturnType<typeof loadFinalizedReviews>>[number];

function formatAverageScore(value: number | null | undefined) {
  if (value == null) {
    return "Нет данных";
  }

  return `${Math.round(value)}%`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addScoreGroup(groups: Map<string, number[]>, label: string, score: number) {
  const scores = groups.get(label) ?? [];
  scores.push(score);
  groups.set(label, scores);
}

function addCountGroup(groups: Map<string, number>, label: string) {
  groups.set(label, (groups.get(label) ?? 0) + 1);
}

function formatDelta(current: number | null, previous: number | null, suffix = "") {
  if (current == null || previous == null) {
    return "Нет сравнения";
  }

  const delta = Math.round(current - previous);
  if (delta === 0) {
    return `Без изменений${suffix}`;
  }

  return `${delta > 0 ? "+" : ""}${delta}${suffix}`;
}

function formatPeriod(period: ReportPeriod) {
  return `${reportPeriodDateLabel(period.start)} - ${reportPeriodDateLabel(period.end)}`;
}

function reportExportHref(period: ReportPeriod) {
  const params = new URLSearchParams({
    period: period.preset,
    start: reportDateInputValue(period.start),
    end: reportDateInputValue(period.end)
  });

  return `/reports/export?${params.toString()}`;
}

function reportExportFormatHref(period: ReportPeriod, format: "xlsx" | "pdf") {
  const params = new URLSearchParams({
    period: period.preset,
    start: reportDateInputValue(period.start),
    end: reportDateInputValue(period.end)
  });

  return `/reports/export/${format}?${params.toString()}`;
}

function reportReviewHref(period: ReportPeriod, extras: Record<string, string> = {}) {
  const params = new URLSearchParams({
    status: "reviewed",
    finalizedFrom: reportDateInputValue(period.start),
    finalizedTo: reportDateInputValue(period.end),
    ...extras
  });

  return `/reviews?${params.toString()}`;
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function scoreGroupRows(groups: Map<string, number[]>): BreakdownRow[] {
  return Array.from(groups.entries())
    .map(([label, scores]) => ({
      label,
      count: scores.length,
      averageScore: average(scores)
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru"));
}

function countGroupRows(groups: Map<string, number>): BreakdownRow[] {
  return Array.from(groups.entries())
    .map(([label, count]) => ({
      label,
      count
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru"));
}

function averageScoreChartRows(rows: BreakdownRow[], limit = 6): ChartDatum[] {
  return rows
    .filter((row) => row.averageScore != null)
    .sort((left, right) => (left.averageScore ?? 0) - (right.averageScore ?? 0))
    .slice(0, limit)
    .map((row) => ({
      label: row.label,
      value: Math.round(row.averageScore ?? 0),
      detail: `${row.count} проверок`
    }));
}

function scoreTrendRows(reviews: ReviewForReport[]): ChartDatum[] {
  const groups = new Map<string, number[]>();

  for (const review of reviews) {
    if (!review.finalizedAt) {
      continue;
    }

    const key = review.finalizedAt.toISOString().slice(0, 10);
    const scores = groups.get(key) ?? [];
    scores.push(review.totalScore);
    groups.set(key, scores);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, scores]) => {
      const value = average(scores) ?? 0;

      return {
        label: formatShortDate(new Date(`${date}T00:00:00.000Z`)),
        value: Math.round(value),
        detail: `${scores.length} проверок`
      };
    });
}

function scoreDistributionRows(reviews: ReviewForReport[]): ChartDatum[] {
  const ranges = [
    { label: "0-50", min: 0, max: 50 },
    { label: "51-70", min: 51, max: 70 },
    { label: "71-85", min: 71, max: 85 },
    { label: "86-100", min: 86, max: 100 }
  ];

  return ranges.map((range) => ({
    label: range.label,
    value: reviews.filter((review) => review.totalScore >= range.min && review.totalScore <= range.max).length
  }));
}

function riskSegments(riskGroups: Map<string, number>): StackedSegment[] {
  return [
    { label: "Низкий", value: riskGroups.get("Низкий") ?? 0, color: "bg-[#3157d5]" },
    { label: "Средний", value: riskGroups.get("Средний") ?? 0, color: "bg-[#0f766e]" },
    { label: "Высокий", value: riskGroups.get("Высокий") ?? 0, color: "bg-[#d97706]" },
    { label: "Критический", value: riskGroups.get("Критический") ?? 0, color: "bg-[#dc2626]" }
  ];
}

function reviewWhere(workspaceId: string, period: ReportPeriod) {
  return {
    workspaceId,
    status: "FINALIZED" as const,
    finalizedAt: {
      gte: period.start,
      lte: period.end
    }
  };
}

async function loadFinalizedReviews(workspaceId: string, period: ReportPeriod) {
  return prisma.review.findMany({
    where: reviewWhere(workspaceId, period),
    select: {
      id: true,
      totalScore: true,
      finalizedAt: true,
      criticalError: true,
      criticalCategory: true,
      needsReanswer: true,
      reanswerStatus: true,
      appealStatus: true,
      feedbackStatus: true,
      reviewer: {
        select: {
          name: true
        }
      },
      conversation: {
        select: {
          externalSource: true,
          assigneeName: true,
          samplingType: true,
          csatBucket: true,
          csatScore: true,
          supportLine: true,
          teamName: true
        }
      },
      scores: {
        select: {
          value: true,
          passed: true,
          isNotApplicable: true,
          criterion: {
            select: {
              block: true,
              kind: true,
              weight: true
            }
          }
        }
      },
      findings: {
        select: {
          category: true,
          riskLevel: true
        }
      }
    }
  });
}

function averageScoreFor(reviews: ReviewForReport[]) {
  return average(reviews.map((review) => review.totalScore));
}

function criterionEarnedPercent(score: ReviewForReport["scores"][number]) {
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

function blockRows(reviews: ReviewForReport[]): BreakdownRow[] {
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

function BreakdownTable({
  title,
  rows,
  countLabel,
  showAverage = false
}: {
  title: string;
  rows: BreakdownRow[];
  countLabel: string;
  showAverage?: boolean;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="record-list px-5">
        {rows.length > 0 ? (
          rows.map((row) => (
            <article key={row.label} className="record-card">
              <div className="record-row">
                <h3 className="record-title">{row.label}</h3>
                <span className="pill pill--neutral">
                  {row.count} {countLabel.toLowerCase()}
                </span>
              </div>
              {showAverage ? <p className="record-meta">Средняя оценка: {formatAverageScore(row.averageScore)}</p> : null}
            </article>
          ))
        ) : (
          <div className="soft-callout text-sm text-[#64748b]">
            Нет завершенных проверок.
          </div>
        )}
      </div>
    </section>
  );
}

function PeriodFilter({ period }: { period: ReportPeriod }) {
  return (
    <form action="/reports" className="report-toolbar">
      <label className="grid gap-1 text-sm font-medium text-[#334155]">
        Период
        <select name="period" defaultValue={period.preset} className="form-control">
          <option value="vk-current">Текущий период 22-21</option>
          <option value="vk-previous">Прошлый период 22-21</option>
          <option value="calendar-current">Календарный месяц</option>
          <option value="calendar-previous">Прошлый месяц</option>
          <option value="quarter-current">Текущий квартал</option>
          <option value="custom">Произвольный</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-[#334155]">
        С даты
        <input
          name="start"
          type="date"
          defaultValue={reportDateInputValue(period.start)}
          className="form-control"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-[#334155]">
        По дату
        <input
          name="end"
          type="date"
          defaultValue={reportDateInputValue(period.end)}
          className="form-control"
        />
      </label>
      <button type="submit" className="action-button action-button--primary">
        Показать
      </button>
    </form>
  );
}

function QuotaTable({
  quotas,
  reviews
}: {
  quotas: Array<{
    assigneeName: string;
    supportLine: string | null;
    plannedCount: number;
    dsatTargetPercent: number;
    absenceDays: number;
    note: string | null;
  }>;
  reviews: ReviewForReport[];
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">Нормы проверок</h2>
        <p className="mt-1 text-sm text-[#64748b]">План, факт и доля негативного CSAT по операторам.</p>
      </div>
      <div className="record-list px-5">
        {quotas.length > 0 ? (
          quotas.map((quota) => {
            const actualReviews = reviews.filter(
              (review) =>
                review.conversation.assigneeName === quota.assigneeName &&
                (quota.supportLine ? review.conversation.supportLine === quota.supportLine : true)
            );
            const dsatCount = actualReviews.filter((review) => review.conversation.csatBucket === "NEGATIVE").length;
            const remaining = Math.max(0, quota.plannedCount - actualReviews.length);
            const dsatPercent = actualReviews.length > 0 ? Math.round((dsatCount / actualReviews.length) * 100) : 0;
            const quotaStatus =
              actualReviews.length < 10
                ? "Меньше 10 - оценка не считается"
                : remaining > 0
                  ? "Нужно добрать"
                  : "Норма выполнена";

            return (
              <article key={`${quota.assigneeName}:${quota.supportLine ?? ""}`} className="record-card">
                <div className="record-row">
                  <div className="min-w-0">
                    <h3 className="record-title">{quota.assigneeName}</h3>
                    <p className="record-meta mt-1">Линия: {quota.supportLine ?? "Не указана"}</p>
                  </div>
                  <span className={`pill ${remaining > 0 ? "pill--warn" : "pill--ok"}`}>{quotaStatus}</span>
                </div>
                <p className="record-meta">
                  План: {quota.plannedCount} · факт: {actualReviews.length} · осталось: {remaining} · DSAT: {dsatCount} ({dsatPercent}%) / цель {quota.dsatTargetPercent}%
                </p>
                {quota.absenceDays > 0 || quota.note ? (
                  <p className="record-meta compact-text">
                    {quota.absenceDays > 0 ? `Отсутствий: ${quota.absenceDays}. ` : ""}
                    {quota.note ?? ""}
                  </p>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="soft-callout text-sm text-[#64748b]">
            Нормы на выбранный период пока не заданы.
          </div>
        )}
      </div>
    </section>
  );
}

function ProcessSummary({
  criticalCount,
  reanswerCount,
  appealCount
}: {
  criticalCount: number;
  reanswerCount: number;
  appealCount: number;
}) {
  const items = [
    { label: "Критические ошибки", value: criticalCount, detail: "Обнуляют оценку", icon: Scale },
    { label: "Переответы", value: reanswerCount, detail: "Нужен новый ответ", icon: RotateCcw },
    { label: "Апелляции", value: appealCount, detail: "Споры по оценке", icon: CalendarDays }
  ];

  return (
    <section className="overflow-hidden bg-white">
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="border-b border-[#d9e0ea] bg-[#f8fafc] p-4 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase text-[#64748b]">Контроль процесса</p>
          <p className="mt-1 text-sm leading-5 text-[#64748b]">Эскалации, которые требуют управленческого внимания.</p>
        </div>
        <dl className="grid divide-y divide-[#d9e0ea] md:grid-cols-3 md:divide-x md:divide-y-0">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="flex items-center gap-3 p-4">
                <span className="icon-box h-9 w-9 shrink-0">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div>
                  <dt className="text-xs font-semibold uppercase text-[#64748b]">{item.label}</dt>
                  <dd className="mt-1 text-xl font-semibold text-[#111827]">{item.value}</dd>
                  <p className="text-sm text-[#64748b]">{item.detail}</p>
                </div>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

function FocusPanel({
  finalizedCount,
  topRiskRow,
  topCategoryRow,
  weakestAssignee
}: {
  finalizedCount: number;
  topRiskRow?: BreakdownRow;
  topCategoryRow?: BreakdownRow;
  weakestAssignee?: BreakdownRow;
}) {
  const rows = [
    {
      label: "Завершено проверок",
      value: String(finalizedCount),
      detail: "Объем данных за выбранный период."
    },
    {
      label: "Главный риск",
      value: topRiskRow ? `${topRiskRow.label}: ${topRiskRow.count}` : "Нет данных",
      detail: "Самый частый уровень риска."
    },
    {
      label: "Частая категория",
      value: topCategoryRow ? `${topCategoryRow.label}: ${topCategoryRow.count}` : "Нет данных",
      detail: "Что чаще всего встречается в замечаниях."
    },
    {
      label: "Оператор для разбора",
      value: weakestAssignee ? `${weakestAssignee.label}: ${formatAverageScore(weakestAssignee.averageScore)}` : "Нет данных",
      detail: "Самая низкая средняя оценка."
    }
  ];

  return (
    <section className="panel mt-6 overflow-hidden">
      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">Что требует внимания</h2>
        <p className="mt-1 text-sm text-[#64748b]">Короткая сводка для руководителя без лишних разрезов.</p>
      </div>
      <div className="grid divide-y divide-[#d9e0ea] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        {rows.map((row) => (
          <article key={row.label} className="p-4">
            <p className="text-xs font-semibold uppercase text-[#64748b]">{row.label}</p>
            <p className="mt-2 text-base font-semibold text-[#111827]">{row.value}</p>
            <p className="mt-1 text-sm leading-5 text-[#64748b]">{row.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const user = await requireCurrentUserPermission("reports:read");
  const period = resolveReportPeriod(params);
  const previousPeriod = resolvePreviousReportPeriod(period);

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
  const reviewerGroups = new Map<string, number[]>();
  const categoryGroups = new Map<string, number>();
  const riskGroups = new Map<string, number>();
  const samplingGroups = new Map<string, number>();
  const csatGroups = new Map<string, number>();
  const feedbackGroups = new Map<string, number>();
  const appealGroups = new Map<string, number>();
  const reanswerGroups = new Map<string, number>();
  const criticalCategoryGroups = new Map<string, number>();

  for (const review of finalizedReviews) {
    addScoreGroup(sourceGroups, externalSourceLabel(review.conversation.externalSource), review.totalScore);
    addScoreGroup(assigneeGroups, review.conversation.assigneeName ?? "Не назначен", review.totalScore);
    addScoreGroup(reviewerGroups, review.reviewer.name, review.totalScore);
    addCountGroup(samplingGroups, samplingTypeLabels[review.conversation.samplingType] ?? review.conversation.samplingType);
    addCountGroup(csatGroups, csatBucketLabels[review.conversation.csatBucket] ?? review.conversation.csatBucket);
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

  const sourceRows = scoreGroupRows(sourceGroups);
  const assigneeRows = scoreGroupRows(assigneeGroups);
  const reviewerRows = scoreGroupRows(reviewerGroups);
  const categoryRows = countGroupRows(categoryGroups);
  const riskRows = countGroupRows(riskGroups);
  const samplingRows = countGroupRows(samplingGroups);
  const csatRows = countGroupRows(csatGroups);
  const feedbackRows = countGroupRows(feedbackGroups);
  const appealRows = countGroupRows(appealGroups);
  const reanswerRows = countGroupRows(reanswerGroups);
  const criticalCategoryRows = countGroupRows(criticalCategoryGroups);
  const blockScoreRows = blockRows(finalizedReviews);
  const finalizedCount = finalizedReviews.length;
  const previousAverageScore = averageScoreFor(previousReviews);
  const averageScore = averageScoreFor(finalizedReviews);
  const topRiskRow = riskRows[0];
  const topCategoryRow = categoryRows[0];
  const weakestAssignee = assigneeRows
    .filter((row) => row.averageScore != null)
    .sort((left, right) => (left.averageScore ?? 0) - (right.averageScore ?? 0))[0];
  const criticalCount = finalizedReviews.filter((review) => review.criticalError).length;
  const reanswerCount = finalizedReviews.filter((review) => review.needsReanswer).length;
  const appealCount = finalizedReviews.filter((review) => review.appealStatus !== "none").length;
  const trendRows = scoreTrendRows(finalizedReviews);
  const distributionRows = scoreDistributionRows(finalizedReviews);
  const operatorScoreRows = averageScoreChartRows(assigneeRows);
  const sourceScoreRows = averageScoreChartRows(sourceRows);
  const riskStackSegments = riskSegments(riskGroups);
  const quotaProgressRows = quotas.map((quota) => {
    const actualReviews = finalizedReviews.filter(
      (review) =>
        review.conversation.assigneeName === quota.assigneeName &&
        (quota.supportLine ? review.conversation.supportLine === quota.supportLine : true)
    );

    return {
      label: quota.supportLine ? `${quota.assigneeName} · ${quota.supportLine}` : quota.assigneeName,
      planned: quota.plannedCount,
      actual: actualReviews.length
    };
  });

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center command-center--split">
        <div>
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Аналитика качества</h1>
          <p className="page-subtitle">
            {period.label}: {formatPeriod(period)}. Сравнение: {formatPeriod(previousPeriod)}.
          </p>
        </div>
        <div className="admin-actions xl:justify-end">
          <Link
            href={reportExportHref(period)}
            className="action-button"
          >
            CSV
          </Link>
          <Link
            href={reportExportFormatHref(period, "xlsx")}
            className="action-button"
          >
            XLSX
          </Link>
          <Link
            href={reportExportFormatHref(period, "pdf")}
            className="action-button action-button--primary"
          >
            PDF
          </Link>
        </div>
      </div>

      <PeriodFilter period={period} />

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Средняя оценка"
          value={formatAverageScore(averageScore)}
          helper={`К прошлому периоду: ${formatDelta(averageScore, previousAverageScore, " п.п.")}`}
          icon={<CheckCircle2 size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Замечания с высоким риском"
          value={String(highRiskFindings)}
          helper="Замечания с высоким или критическим риском."
          icon={<AlertTriangle size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Разборы с операторами"
          value={String(coachingBacklog)}
          helper="Открытые действия по разбору замечаний."
          icon={<ClipboardList size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Проверенные источники"
          value={String(sourceRows.length)}
          helper="Источник считается проверенным после финальной оценки."
          icon={<Database size={18} aria-hidden="true" />}
        />
      </div>

      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <ChartPanel
          title="Динамика оценки"
          description="Средняя итоговая оценка по дням завершения проверок."
          actionHref={reportReviewHref(period)}
          actionLabel="Проверки"
        >
          <SparklineChart points={trendRows} />
        </ChartPanel>
        <ChartPanel
          title="Распределение оценок"
          description="Сколько проверок попало в каждый диапазон."
          actionHref={reportReviewHref(period)}
          actionLabel="Список"
        >
          <ScoreDistribution rows={distributionRows} />
        </ChartPanel>
      </div>

      <FocusPanel
        finalizedCount={finalizedCount}
        topRiskRow={topRiskRow}
        topCategoryRow={topCategoryRow}
        weakestAssignee={weakestAssignee}
      />

      <details className="panel disclosure-panel overflow-hidden">
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Дополнительная аналитика</h2>
            <p className="mt-1 text-sm text-[#64748b]">Операторы, источники, риски, нормы и блоки критериев.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase text-[#64748b]">Показать</span>
        </summary>
        <div className="grid items-stretch gap-5 border-t border-[#d9e0ea] p-5 xl:grid-cols-4">
          <ChartPanel title="По операторам" description="Нижние средние оценки первыми." actionHref={reportReviewHref(period)} actionLabel="Разобрать">
            <HorizontalBarChart rows={operatorScoreRows} valueSuffix="%" maxValue={100} />
          </ChartPanel>
          <ChartPanel title="По источникам" description="Средняя оценка по системам-источникам." actionHref={reportReviewHref(period)} actionLabel="Открыть">
            <HorizontalBarChart rows={sourceScoreRows} valueSuffix="%" maxValue={100} />
          </ChartPanel>
          <ChartPanel
            title="Профиль рисков"
            description="Доля замечаний по уровню риска."
            actionHref={reportReviewHref(period, { riskLevel: "CRITICAL" })}
            actionLabel="Критические"
          >
            <StackedBar segments={riskStackSegments} />
          </ChartPanel>
          <ChartPanel title="Выполнение норм" description="Факт проверок против плана периода." actionHref={reportReviewHref(period)} actionLabel="Факт">
            <QuotaProgressBars rows={quotaProgressRows} />
          </ChartPanel>
        </div>
        <div className="border-t border-[#d9e0ea]">
          <ProcessSummary criticalCount={criticalCount} reanswerCount={reanswerCount} appealCount={appealCount} />
        </div>
        <div className="grid items-start gap-5 border-t border-[#d9e0ea] p-5 xl:grid-cols-2">
          <BreakdownTable title="Блоки критериев" rows={blockScoreRows} countLabel="Оценок" showAverage />
          <QuotaTable quotas={quotas} reviews={finalizedReviews} />
          <BreakdownTable title="Источники" rows={sourceRows} countLabel="Проверок" showAverage />
          <BreakdownTable title="Операторы" rows={assigneeRows} countLabel="Проверок" showAverage />
          <BreakdownTable title="Проверяющие" rows={reviewerRows} countLabel="Проверок" showAverage />
        </div>
      </details>

      <details className="disclosure-panel">
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-[#d9e0ea] bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Подробные разрезы</h2>
            <p className="mt-1 text-sm text-[#64748b]">Выборка, CSAT, обратная связь, апелляции, риски и категории.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase text-[#64748b]">Показать</span>
        </summary>
        <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
          <BreakdownTable title="Типы выборки" rows={samplingRows} countLabel="Проверок" />
          <BreakdownTable title="CSAT" rows={csatRows} countLabel="Проверок" />
          <BreakdownTable title="Обратная связь" rows={feedbackRows} countLabel="Проверок" />
          <BreakdownTable title="Апелляции" rows={appealRows} countLabel="Проверок" />
          <BreakdownTable title="Переответы" rows={reanswerRows} countLabel="Проверок" />
          <BreakdownTable title="Критические ошибки" rows={criticalCategoryRows} countLabel="Ошибок" />
          <BreakdownTable title="Риски" rows={riskRows} countLabel="Замечаний" />
          <BreakdownTable title="Категории" rows={categoryRows} countLabel="Замечаний" />
        </div>
      </details>
    </section>
  );
}
