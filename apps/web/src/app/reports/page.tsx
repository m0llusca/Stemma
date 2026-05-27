import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  Database,
  RotateCcw,
  Scale
} from "lucide-react";
import { MetricCard } from "@/components/reports/metric-card";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import {
  ChartPanel,
  HorizontalBarChart,
  QuotaProgressBars,
  RankedList,
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
import { formatQualityScore, formatQualityScoreDelta } from "@/lib/score-display";

export const dynamic = "force-dynamic";

type BreakdownRow = {
  label: string;
  count: number;
  averageScore?: number | null;
  href?: string;
  delta?: number | null;
  meta?: string;
};

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ReviewForReport = Awaited<ReturnType<typeof loadFinalizedReviews>>[number];
type ReportView = "overview" | "performance" | "process" | "details";

const reportViews = [
  { id: "overview", label: "Обзор", description: "Главные метрики и тренд" },
  { id: "performance", label: "Исполнение", description: "Операторы, источники и нормы" },
  { id: "process", label: "Процесс", description: "Переответы, апелляции и риски" },
  { id: "details", label: "Разрезы", description: "Все таблицы для разбора" }
] satisfies Array<{ id: ReportView; label: string; description: string }>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveReportView(params: Record<string, string | string[] | undefined>): ReportView {
  const view = firstParam(params.view);

  return reportViews.some((item) => item.id === view) ? (view as ReportView) : "overview";
}

function formatAverageScore(value: number | null | undefined) {
  return formatQualityScore(value, "Нет данных");
}

function formatReviewCount(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} проверок`;
  }

  if (last === 1) {
    return `${count} проверка`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} проверки`;
  }

  return `${count} проверок`;
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

function reportHref(period: ReportPeriod, extras: Record<string, string> = {}) {
  const params = new URLSearchParams({
    period: period.preset,
    start: reportDateInputValue(period.start),
    end: reportDateInputValue(period.end),
    ...extras
  });

  return `/reports?${params.toString()}`;
}

function reportViewHref(period: ReportPeriod, view: ReportView) {
  const params = new URLSearchParams({
    period: period.preset,
    start: reportDateInputValue(period.start),
    end: reportDateInputValue(period.end),
    view
  });

  return `/reports?${params.toString()}`;
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

function reportDeltaLabel(delta: number | null | undefined) {
  if (delta == null) {
    return "нет базы сравнения";
  }

  if (delta === 0) {
    return "без изменений к прошлому периоду";
  }

  return `${delta > 0 ? "+" : "-"}${Math.abs(delta)} п. к прошлому периоду`;
}

function sampleInsight(currentCount: number, previousCount: number) {
  if (currentCount === 0) {
    return "За выбранный период нет завершенных проверок. Сначала откройте очередь и завершите оценки.";
  }

  if (currentCount < 5 || previousCount < 5) {
    return "Выборка мала. Проценты и дельты показывают направление, но не устойчивый тренд.";
  }

  return "Выборка достаточна для сравнения с прошлым периодом.";
}

function scoreDelta(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null) {
    return null;
  }

  return Math.round(current - previous);
}

type TrendTone = "up" | "down" | "flat" | "none";

function trendTone(delta: number | null | undefined): TrendTone {
  if (delta == null) {
    return "none";
  }

  if (delta > 0) {
    return "up";
  }

  if (delta < 0) {
    return "down";
  }

  return "flat";
}

function trendVerdictTitle(delta: number | null, current: number | null) {
  if (current == null) {
    return "Оценка пока не рассчитана";
  }

  if (delta == null) {
    return "Нет базы сравнения";
  }

  if (delta > 0) {
    return "Качество улучшилось";
  }

  if (delta < 0) {
    return "Качество снизилось";
  }

  return "Качество без изменений";
}

function trendPointDeltaLabel(delta: number | null | undefined) {
  if (delta == null) {
    return "первая точка периода";
  }

  if (delta === 0) {
    return "без изменений к предыдущей точке";
  }

  return `${formatQualityScoreDelta(delta)} к предыдущей точке`;
}

function targetDistanceLabel(value: number, target: number) {
  const delta = Math.round(value - target);

  if (delta >= 0) {
    return "в целевом коридоре";
  }

  return `ниже цели на ${Math.abs(delta)} п.`;
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
      detail: formatReviewCount(row.count)
    }));
}

function rankedScoreRows(rows: BreakdownRow[], previousRows: BreakdownRow[], limit = 6): BreakdownRow[] {
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
        detail: formatReviewCount(scores.length)
      };
    });
}

function scoreDistributionRows(reviews: ReviewForReport[]): ChartDatum[] {
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

function riskSegments(riskGroups: Map<string, number>, period: ReportPeriod): StackedSegment[] {
  return [
    { label: "Низкий", value: riskGroups.get("Низкий") ?? 0, color: "bg-[#3157d5]", href: reportReviewHref(period, { riskLevel: "LOW" }) },
    { label: "Средний", value: riskGroups.get("Средний") ?? 0, color: "bg-[#0f766e]", href: reportReviewHref(period, { riskLevel: "MEDIUM" }) },
    { label: "Высокий", value: riskGroups.get("Высокий") ?? 0, color: "bg-[#d97706]", href: reportReviewHref(period, { riskLevel: "HIGH" }) },
    { label: "Критический", value: riskGroups.get("Критический") ?? 0, color: "bg-[#dc2626]", href: reportReviewHref(period, { riskLevel: "CRITICAL" }) }
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
  id,
  title,
  rows,
  countLabel,
  showAverage = false,
  actionLabel = "Открыть проверки"
}: {
  id?: string;
  title: string;
  rows: BreakdownRow[];
  countLabel: string;
  showAverage?: boolean;
  actionLabel?: string;
}) {
  return (
    <section id={id} className="panel overflow-hidden breakdown-panel">
      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          {rows.length > 0 ? `${rows.length} строк в разрезе` : "Нет данных для выбранного периода"}
        </p>
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
              {row.href ? (
                <Link href={row.href} className="record-card__action">
                  {actionLabel}
                </Link>
              ) : null}
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

function ReportCommandBar({
  period,
  previousPeriod,
  view
}: {
  period: ReportPeriod;
  previousPeriod: ReportPeriod;
  view: ReportView;
}) {
  return (
    <section className="report-command-bar" aria-label="Настройки аналитики">
      <div className="report-command-bar__title">
        <p className="page-kicker">Контроль качества</p>
        <h1 className="page-title">Аналитика качества</h1>
      </div>

      <AutoSubmitFilterForm action="/reports" className="report-command-bar__form">
        <input type="hidden" name="view" value={view} />
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
      </AutoSubmitFilterForm>

      <div className="report-command-bar__meta">
        <span>{period.label}: {formatPeriod(period)}</span>
        <span>Сравнение: {formatPeriod(previousPeriod)}</span>
      </div>

      <details className="report-export-menu">
        <summary className="action-button">Экспорт</summary>
        <div className="report-export-menu__panel">
          <Link href={reportExportHref(period)}>CSV</Link>
          <Link href={reportExportFormatHref(period, "xlsx")}>XLSX</Link>
          <Link href={reportExportFormatHref(period, "pdf")}>PDF</Link>
        </div>
      </details>
    </section>
  );
}

function ReportViewSelector({
  period,
  view,
  counts
}: {
  period: ReportPeriod;
  view: ReportView;
  counts: Record<ReportView, number>;
}) {
  const activeView = reportViews.find((item) => item.id === view) ?? reportViews[0];

  return (
    <div className="report-view-selector-wrap">
      <nav className="report-view-selector" aria-label="Режим аналитики">
        {reportViews.map((item) => {
          const isActive = item.id === view;

          return (
            <Link
              key={item.id}
              href={reportViewHref(period, item.id)}
              className={`report-view-selector__item ${isActive ? "report-view-selector__item--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span>{item.label}</span>
              <strong>{counts[item.id]}</strong>
            </Link>
          );
        })}
      </nav>
      <p className="report-view-selector__description">{activeView.description}</p>
    </div>
  );
}

function QuotaTable({
  id,
  quotas,
  reviews,
  period
}: {
  id?: string;
  quotas: Array<{
    assigneeName: string;
    supportLine: string | null;
    plannedCount: number;
    dsatTargetPercent: number;
    absenceDays: number;
    note: string | null;
  }>;
  reviews: ReviewForReport[];
  period: ReportPeriod;
}) {
  return (
    <section id={id} className="panel overflow-hidden breakdown-panel quota-table-panel">
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
            const href = reportReviewHref(period, {
              assignee: quota.assigneeName,
              ...(quota.supportLine ? { supportLine: quota.supportLine } : {})
            });

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
                  План: {quota.plannedCount}, факт: {actualReviews.length}, осталось: {remaining}, DSAT: {dsatCount} ({dsatPercent}%) / цель {quota.dsatTargetPercent}%
                </p>
                {quota.absenceDays > 0 || quota.note ? (
                  <p className="record-meta compact-text">
                    {quota.absenceDays > 0 ? `Отсутствий: ${quota.absenceDays}. ` : ""}
                    {quota.note ?? ""}
                  </p>
                ) : null}
                <Link href={href} className="record-card__action">
                  Открыть проверки оператора
                </Link>
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
  appealCount,
  period
}: {
  criticalCount: number;
  reanswerCount: number;
  appealCount: number;
  period: ReportPeriod;
}) {
  const items = [
    { label: "Критические ошибки", value: criticalCount, detail: "Обнуляют оценку", icon: Scale, tone: "danger", href: reportReviewHref(period, { process: "critical" }) },
    { label: "Переответы", value: reanswerCount, detail: "Нужен новый ответ", icon: RotateCcw, tone: "warn", href: reportReviewHref(period, { process: "reanswer" }) },
    { label: "Апелляции", value: appealCount, detail: "Споры по оценке", icon: CalendarDays, tone: "neutral", href: reportReviewHref(period, { process: "appeal" }) }
  ];

  return (
    <section className="panel process-summary overflow-hidden">
      <div className="process-summary__layout">
        <div className="process-summary__lead">
          <p className="page-kicker">Процесс</p>
          <h2>Контроль процесса</h2>
          <p>Эскалации, которые требуют управленческого внимания.</p>
        </div>
        <dl className="process-summary__list">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <Link key={item.label} href={item.href} className={`process-summary__item process-summary__item--${item.tone}`}>
                <span className="process-summary__icon">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                  <p>{item.detail}</p>
                </div>
              </Link>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

type DetailsIndexItem = {
  label: string;
  value: string;
  detail: string;
  href: string;
};

function DetailsIndexPanel({ items }: { items: DetailsIndexItem[] }) {
  return (
    <aside className="panel details-index-panel">
      <div>
        <p className="page-kicker">Навигация по разрезам</p>
        <h2>Быстрый переход</h2>
        <p>Таблицы ниже сгруппированы по задачам разбора: критерии, норма, источники, люди и статусы.</p>
      </div>
      <nav aria-label="Разрезы аналитики" className="details-index-panel__nav">
        {items.map((item) => (
          <a key={item.href} href={item.href} className="details-index-panel__item">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </a>
        ))}
      </nav>
    </aside>
  );
}

type FocusItem = {
  label: string;
  value: string;
  detail: string;
  href?: string;
  actionLabel?: string;
};

type ReportFocusItem = {
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
};

function ReportFocusPanel({
  kicker,
  title,
  description,
  actionHref,
  actionLabel,
  items
}: {
  kicker: string;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
  items: ReportFocusItem[];
}) {
  return (
    <section className="panel report-focus-panel">
      <div className="report-focus-panel__header">
        <div>
          <p className="page-kicker">{kicker}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Link href={actionHref} className="chart-panel__action">
          {actionLabel}
        </Link>
      </div>
      <div className="report-focus-panel__grid">
        {items.map((item) => {
          const content = (
            <>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </>
          );
          const className = `report-focus-panel__item report-focus-panel__item--${item.tone ?? "neutral"}`;

          return item.href ? (
            <Link key={item.label} href={item.href} className={className}>
              {content}
            </Link>
          ) : (
            <article key={item.label} className={className}>
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function InsightSummary({
  averageScore,
  finalizedCount,
  previousCount,
  topSource,
  period,
  focusItems
}: {
  averageScore: number | null;
  finalizedCount: number;
  previousCount: number;
  topSource?: BreakdownRow;
  period: ReportPeriod;
  focusItems: FocusItem[];
}) {
  const sourceText = topSource
    ? `Основной вклад в выборку: ${formatReviewCount(topSource.count)} из источника ${topSource.label}.`
    : "Источники появятся после первых завершенных проверок.";
  const insightTitle = averageScore == null
    ? "Данные появятся после первых проверок"
    : "Где смотреть сейчас";

  return (
    <section className="panel insight-summary">
      <div className="insight-summary__body">
        <p className="page-kicker">Сводка периода</p>
        <h2>{insightTitle}</h2>
        <p>{sourceText} {sampleInsight(finalizedCount, previousCount)}</p>
      </div>
      <div className="insight-summary__actions">
        <Link href={reportReviewHref(period)} className="action-button action-button--primary">
          Открыть проверки
        </Link>
        <Link href={reportHref(period, { view: "performance" })} className="action-button">
          Сравнить разрезы
        </Link>
      </div>
      <div className="insight-summary__focus" aria-label="Где смотреть сейчас">
        {focusItems.map((row) => {
          const content = (
            <>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <small>{row.detail}</small>
            </>
          );

          return row.href ? (
            <Link key={row.label} href={row.href} className="insight-focus-card">
              {content}
            </Link>
          ) : (
            <div key={row.label} className="insight-focus-card insight-focus-card--static">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TrendVerdict({
  averageScore,
  previousAverageScore,
  finalizedCount,
  previousCount
}: {
  averageScore: number | null;
  previousAverageScore: number | null;
  finalizedCount: number;
  previousCount: number;
}) {
  const delta = scoreDelta(averageScore, previousAverageScore);
  const tone = trendTone(delta);
  const TrendIcon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : ArrowRight;
  const comparisonText = delta == null
    ? "Прошлый период не дает базы сравнения"
    : `${formatQualityScoreDelta(delta)} к прошлому периоду`;
  const sampleText = finalizedCount >= 5 && previousCount >= 5
    ? "выборка достаточна"
    : "малая база сравнения";

  return (
    <div className={`trend-verdict trend-verdict--${tone}`}>
      <span className="trend-verdict__icon" aria-hidden="true">
        <TrendIcon size={18} />
      </span>
      <div>
        <strong>{trendVerdictTitle(delta, averageScore)}</strong>
        <span>{comparisonText}, {sampleText}</span>
      </div>
    </div>
  );
}

function TrendSignals({ points, target = 90 }: { points: ChartDatum[]; target?: number }) {
  if (points.length === 0) {
    return <p className="text-sm text-[#64748b]">Нет завершенных проверок за выбранный период.</p>;
  }

  const pointsWithDeltas = points.map((point, index) => ({
    ...point,
    delta: index === 0 ? null : point.value - points[index - 1].value
  }));
  const last = pointsWithDeltas[pointsWithDeltas.length - 1];
  const lowest = pointsWithDeltas.reduce((candidate, point) => (point.value < candidate.value ? point : candidate), pointsWithDeltas[0]);
  const strongestMove = pointsWithDeltas
    .slice(1)
    .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0))[0];
  const targetDistance = targetDistanceLabel(last.value, target);
  const rows = [
    {
      label: "Последняя точка",
      value: formatAverageScore(last.value),
      detail: [last.label, last.detail, trendPointDeltaLabel(last.delta)].filter(Boolean).join(", "),
      tone: trendTone(last.delta)
    },
    {
      label: "Минимум периода",
      value: formatAverageScore(lowest.value),
      detail: [lowest.label, lowest.detail, targetDistanceLabel(lowest.value, target)].filter(Boolean).join(", "),
      tone: "down" as TrendTone
    },
    {
      label: "Цель 90 баллов",
      value: targetDistance,
      detail: last.value >= target ? "Последняя точка держится в рабочем коридоре." : "Нужен разбор причин просадки.",
      tone: last.value >= target ? "up" as TrendTone : "down" as TrendTone
    }
  ];

  if (strongestMove) {
    rows.splice(2, 0, {
      label: "Самое сильное движение",
      value: formatQualityScoreDelta(strongestMove.delta),
      detail: [strongestMove.label, trendPointDeltaLabel(strongestMove.delta), formatAverageScore(strongestMove.value)].join(", "),
      tone: trendTone(strongestMove.delta)
    });
  }

  return (
    <div className="trend-signal-list">
      {rows.map((row) => (
        <article key={row.label} className={`trend-signal trend-signal--${row.tone}`}>
          <div>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
          <p>{row.detail}</p>
        </article>
      ))}
    </div>
  );
}

function PrimaryScoreValue({ value }: { value: number | null }) {
  if (value == null) {
    return <p className="primary-score-panel__value">Нет данных</p>;
  }

  const [score, ...unitParts] = formatAverageScore(value).split(" ");

  return (
    <p className="primary-score-panel__value">
      <span>{score}</span>
      <small>{unitParts.join(" ")}</small>
    </p>
  );
}

function PrimaryScorePanel({
  averageScore,
  previousAverageScore,
  finalizedCount,
  previousCount,
  trendRows,
  period
}: {
  averageScore: number | null;
  previousAverageScore: number | null;
  finalizedCount: number;
  previousCount: number;
  trendRows: ChartDatum[];
  period: ReportPeriod;
}) {
  const stable = finalizedCount >= 5 && previousCount >= 5;

  return (
    <section className="panel primary-score-panel">
      <div className="primary-score-panel__summary">
        <div>
          <div className="flex items-center gap-2">
            <p className="metric-card__label">Средняя оценка</p>
            <HelpTooltip
              label="Как считать оценку в баллах?"
              content="Итоговая оценка хранится как нормализованное значение от 0 до 100 и показывается как баллы."
              placement="top-start"
            />
          </div>
          <PrimaryScoreValue value={averageScore} />
        </div>
        <TrendVerdict
          averageScore={averageScore}
          previousAverageScore={previousAverageScore}
          finalizedCount={finalizedCount}
          previousCount={previousCount}
        />
        <div className="primary-score-panel__facts">
          <span>{formatReviewCount(finalizedCount)}</span>
          <span>прошлый период: {previousAverageScore == null ? "нет данных" : formatAverageScore(previousAverageScore)}</span>
          <span>{stable ? "тренд устойчив" : "малая база сравнения"}</span>
        </div>
        <Link href={reportReviewHref(period)} className="chart-panel__action">
          Открыть проверки
        </Link>
      </div>
      <div className="primary-score-panel__chart">
        <SparklineChart
          points={trendRows}
          target={90}
          annotation={stable ? "Пунктир показывает целевой коридор 90 баллов." : "Для устойчивого тренда нужно не меньше 5 проверок в каждом периоде."}
        />
      </div>
    </section>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const user = await requireCurrentUserPermission("reports:read");
  const period = resolveReportPeriod(params);
  const previousPeriod = resolvePreviousReportPeriod(period);
  const reportView = resolveReportView(params);

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
  const previousSourceGroups = new Map<string, number[]>();
  const previousAssigneeGroups = new Map<string, number[]>();

  for (const review of finalizedReviews) {
    addScoreGroup(sourceGroups, review.conversation.externalSource, review.totalScore);
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

  for (const review of previousReviews) {
    addScoreGroup(previousSourceGroups, review.conversation.externalSource, review.totalScore);
    addScoreGroup(previousAssigneeGroups, review.conversation.assigneeName ?? "Не назначен", review.totalScore);
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
  const sourceRows = scoreGroupRows(sourceGroups).map((row) => ({
    ...row,
    label: externalSourceLabel(row.label),
    href: reportReviewHref(period, { source: row.label })
  }));
  const assigneeRows = scoreGroupRows(assigneeGroups).map((row) => ({
    ...row,
    href: row.label === "Не назначен" ? reportReviewHref(period) : reportReviewHref(period, { assignee: row.label })
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
  const feedbackRows = countGroupRows(feedbackGroups).map((row) => {
    const feedbackStatus = feedbackStatusByLabel.get(row.label);

    return {
      ...row,
      href: feedbackStatus ? reportReviewHref(period, { feedbackStatus }) : undefined
    };
  });
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
  const finalizedCount = finalizedReviews.length;
  const previousAverageScore = averageScoreFor(previousReviews);
  const averageScore = averageScoreFor(finalizedReviews);
  const weakestBlock = blockScoreRows
    .filter((row) => row.averageScore != null)
    .sort((left, right) => (left.averageScore ?? 0) - (right.averageScore ?? 0))[0];
  const criticalCount = finalizedReviews.filter((review) => review.criticalError).length;
  const reanswerCount = finalizedReviews.filter((review) => review.needsReanswer).length;
  const appealCount = finalizedReviews.filter((review) => review.appealStatus !== "none").length;
  const trendRows = scoreTrendRows(finalizedReviews);
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
  const weakestAssigneeFocus = operatorRankRows[0];
  const weakestSourceFocus = sourceRankRows[0];
  const blockScoreChartRows = averageScoreChartRows(blockScoreRows, 8);
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
  const processRiskCount = criticalCount + reanswerCount + appealCount;
  const viewCounts: Record<ReportView, number> = {
    overview: finalizedCount,
    performance: operatorRankRows.length + sourceRankRows.length,
    process: processRiskCount,
    details: 8
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
      detail: assigneeRows.length > 1 ? "Есть база для ранжирования операторов." : "Пока недостаточно срезов по операторам.",
      href: reportHref(period, { view: "performance" }),
      tone: assigneeRows.length > 1 ? "ok" : "neutral"
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
      value: String(assigneeRows.length + reviewerRows.length),
      detail: "Операторы и проверяющие",
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
      <ReportCommandBar period={period} previousPeriod={previousPeriod} view={reportView} />

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

      <ReportViewSelector period={period} view={reportView} counts={viewCounts} />

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
          <div className="report-secondary-metrics">
            <MetricCard
              label="Замечания с высоким риском"
              value={String(highRiskFindings)}
              helper={highRiskFindings > 0 ? "Откройте риск и разберите причины до следующего цикла." : "Высокий риск не найден в выбранном периоде."}
              icon={<AlertTriangle size={18} aria-hidden="true" />}
              actionHref={reportReviewHref(period, { riskLevel: "HIGH_OR_CRITICAL" })}
              actionLabel="Открыть риск"
            />
            <MetricCard
              label="Разборы с операторами"
              value={String(coachingBacklog)}
              helper={coachingBacklog > 0 ? "Есть открытые действия по разбору замечаний." : "Открытых действий по разбору нет."}
              icon={<ClipboardList size={18} aria-hidden="true" />}
              actionHref={reportReviewHref(period, { coachingStatus: "open" })}
              actionLabel="Открыть разборы"
            />
            <MetricCard
              label="Проверенные источники"
              value={String(sourceRows.length)}
              helper={sourceRows.length > 1 ? "Сравните источники по средней оценке и объему." : "Источник считается проверенным после финальной оценки."}
              icon={<Database size={18} aria-hidden="true" />}
              actionHref={reportHref(period, { view: "performance" })}
              actionLabel="Сравнить источники"
            />
          </div>
        </div>
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
              title="Сигналы тренда"
              description="Ключевые точки, которые объясняют движение оценки."
              actionHref={reportReviewHref(period)}
              actionLabel="Проверки"
            >
              <TrendSignals points={trendRows} />
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
        </>
      ) : null}

      {reportView === "performance" ? (
        <div className="reports-panel-grid reports-panel-grid--four">
          <ChartPanel title="По операторам" description="Нижние средние оценки первыми." actionHref={reportReviewHref(period)} actionLabel="Разобрать">
            <RankedList rows={operatorRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
          </ChartPanel>
          <ChartPanel title="По источникам" description="Средняя оценка по системам-источникам." actionHref={reportReviewHref(period)} actionLabel="Открыть">
            <RankedList rows={sourceRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
          </ChartPanel>
          <ChartPanel
            title="Блоки критериев"
            description="Где чаще всего проседает оценка."
            actionHref={reportReviewHref(period)}
            actionLabel="Критерии"
          >
            <HorizontalBarChart rows={blockScoreChartRows} valueFormatter={formatQualityScore} maxValue={100} />
          </ChartPanel>
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
            <BreakdownTable id="details-blocks" title="Блоки критериев" rows={blockScoreRows} countLabel="Оценок" showAverage />
            <QuotaTable id="details-quotas" quotas={quotas} reviews={finalizedReviews} period={period} />
            <BreakdownTable id="details-sources" title="Источники" rows={sourceRows} countLabel="Проверок" showAverage />
            <BreakdownTable id="details-people" title="Операторы" rows={assigneeRows} countLabel="Проверок" showAverage />
            <BreakdownTable title="Проверяющие" rows={reviewerRows} countLabel="Проверок" showAverage />
            <BreakdownTable id="details-statuses" title="Типы выборки" rows={samplingRows} countLabel="Проверок" />
            <BreakdownTable title="CSAT" rows={csatRows} countLabel="Проверок" />
            <BreakdownTable title="Риски" rows={riskRows} countLabel="Замечаний" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
