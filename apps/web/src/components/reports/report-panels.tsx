import Link from "next/link";
import { CalendarDays, RotateCcw, Scale } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type { ReportPeriod } from "@/lib/report-period";
import type { ImprovementHighlight } from "@/lib/report-improvements";
import { RankedDriverChart } from "@/components/charts/ranked-driver-chart.client";
import { ChartFrame } from "@/components/charts/chart-frame";
import type { ChartView } from "@/components/charts/chart-view-links";
import { buildChartModel } from "@/lib/charts/builders";
import type { ChartModel } from "@/lib/charts/contracts";
import { formatQualityScore } from "@/lib/score-display";
import type { BreakdownRow } from "@/lib/reports/report-aggregation";
import {
  formatReviewCount,
  reportHref,
  reportReviewHref,
  sampleInsight
} from "@/lib/reports/report-format";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
import { cn } from "@/lib/utils";

export type DetailsIndexItem = {
  label: string;
  value: string;
  detail: string;
  href: string;
};

export type FocusItem = {
  label: string;
  value: string;
  detail: string;
  href?: string;
  actionLabel?: string;
};

export type ReportFocusItem = {
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
};

export type DriverChainItem = {
  label: string;
  value: string;
  evidence: string;
  action: string;
  href?: string;
};

const focusToneClass: Record<NonNullable<ReportFocusItem["tone"]>, string> = {
  neutral: "border-border bg-card",
  ok: "border-emerald-500/20 bg-emerald-500/5",
  warn: "border-amber-500/25 bg-amber-500/5",
  danger: "border-destructive/25 bg-destructive/5"
};

const processToneClass = {
  danger: "text-destructive",
  warn: "text-amber-700 dark:text-amber-300",
  neutral: "text-foreground"
} as const;

export function ProcessSummary({
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
    { label: "Критические ошибки", value: criticalCount, detail: "Обнуляют оценку", icon: Scale, tone: "danger" as const, href: reportReviewHref(period, { process: "critical" }) },
    { label: "Переответы", value: reanswerCount, detail: "Нужен новый ответ", icon: RotateCcw, tone: "warn" as const, href: reportReviewHref(period, { process: "reanswer" }) },
    { label: "Апелляции", value: appealCount, detail: "Споры по оценке", icon: CalendarDays, tone: "neutral" as const, href: reportReviewHref(period, { process: "appeal" }) }
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] md:items-stretch">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Процесс</p>
          <h2 className="text-base font-medium text-foreground">Контроль процесса</h2>
          <p className="text-sm text-muted-foreground">Эскалации, которые требуют управленческого внимания.</p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="relative flex min-w-0 items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/60"
              >
                <span
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-background ring-1 ring-border",
                    processToneClass[item.tone]
                  )}
                >
                  <Icon size={17} aria-hidden="true" />
                </span>
                <dl className="min-w-0 flex flex-col gap-0.5">
                  <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                  <dd className={cn("text-xl font-semibold tabular-nums", processToneClass[item.tone])}>
                    {item.value}
                  </dd>
                  <dd className="text-xs text-muted-foreground">{item.detail}</dd>
                </dl>
                <Link
                  href={item.href}
                  aria-label={`${item.label}: ${item.value}. ${item.detail}`}
                  className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function DetailsIndexPanel({
  items,
  titleId
}: {
  items: DetailsIndexItem[];
  titleId?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Навигация по разрезам</CardDescription>
        <CardTitle id={titleId}>Быстрый переход</CardTitle>
        <p className="text-sm text-muted-foreground">
          Таблицы ниже сгруппированы по задачам разбора: критерии, норма, источники, люди и статусы.
        </p>
      </CardHeader>
      <CardContent>
        <nav aria-label="Разрезы аналитики" className="grid gap-2">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </span>
              <strong className="text-sm font-semibold text-foreground">{item.value}</strong>
              <small className="text-xs text-muted-foreground">{item.detail}</small>
            </a>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}

export function ReportFocusPanel({
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
    <Card>
      <CardHeader className="border-b">
        <div className="min-w-0">
          <CardDescription>{kicker}</CardDescription>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <CardAction>
          <Button
            render={
              <Link
                href={actionHref}
                {...reportPageLocalLinkProps(actionHref)}
              />
            }
            nativeButton={false}
            variant="outline"
            size="sm"
          >
            {actionLabel}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2 pt-(--card-spacing) sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const content = (
            <>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </span>
              <strong className="text-sm font-semibold text-foreground">{item.value}</strong>
              <small className="text-xs text-muted-foreground">{item.detail}</small>
            </>
          );
          const className = cn(
            "flex min-w-0 flex-col gap-1 rounded-lg border p-3 transition-colors",
            focusToneClass[item.tone ?? "neutral"],
            item.href && "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          );

          return item.href ? (
            <Link
              key={item.label}
              href={item.href}
              {...reportPageLocalLinkProps(item.href)}
              className={className}
            >
              {content}
            </Link>
          ) : (
            <article key={item.label} className={className}>
              {content}
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function PeriodMovementPanel({
  negativeItems,
  positiveItems,
  driverItems,
  view,
  currentHref,
  periodLabel
}: {
  negativeItems: ImprovementHighlight[];
  positiveItems: ImprovementHighlight[];
  driverItems: DriverChainItem[];
  view: ChartView;
  currentHref: string;
  periodLabel: string;
}) {
  const movementItems = [...negativeItems, ...positiveItems];
  const driverModel = buildChartModel({
    id: "quality-drivers",
    title: "Факторы изменения",
    description:
      "Наиболее заметные просадки и улучшения к сопоставимому прошлому периоду.",
    xLabel: "Фактор",
    yLabel: "Изменение, баллы",
    series: [
      {
        key: "down",
        label: "Просадка",
        unit: "quality-score",
        tone: "danger"
      },
      {
        key: "up",
        label: "Улучшение",
        unit: "quality-score",
        tone: "success"
      }
    ],
    points: movementItems.map((item, index) => ({
      id: `driver-${index + 1}`,
      label: item.label,
      sortKey: String(index + 1).padStart(3, "0"),
      values: {
        down: item.delta < 0 ? Math.abs(item.delta) : null,
        up: item.delta > 0 ? item.delta : null
      },
      detail: `${item.scope} · ${formatQualityScore(item.currentScore)}`,
      sampleSize: item.count,
      ...(item.href ? { href: item.href } : {})
    })),
    emptyTitle: "Нет сопоставимых факторов",
    emptyDescription:
      "Для сравнения нужны завершённые проверки в текущем и прошлом периодах."
  } satisfies ChartModel<"down" | "up">);

  const sampleSize = movementItems.reduce((total, item) => total + item.count, 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ChartFrame
        model={driverModel}
        view={view}
        currentHref={currentHref}
        periodLabel={periodLabel}
        sample={{ size: sampleSize }}
        state={movementItems.length > 0 ? { kind: "ready" } : { kind: "empty" }}
        graph={
          view === "graph" ? <RankedDriverChart model={driverModel} /> : undefined
        }
      />
      {driverItems.length > 0 ? (
        <Card aria-labelledby="analytics-movement-title">
          <CardHeader className="border-b">
            <CardDescription>Цепочка драйверов</CardDescription>
            <CardTitle id="analytics-movement-title">Где искать причину</CardTitle>
            <p className="text-sm text-muted-foreground">
              Слабейшие срезы и следующее проверяемое действие.
            </p>
          </CardHeader>
          <CardContent className="pt-(--card-spacing)">
            <section className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Слабейшие срезы и следующее действие</span>
            </div>
            <div className="grid gap-2">
              {driverItems.map((item) => {
                const content = (
                  <>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </span>
                    <strong className="text-sm font-semibold text-foreground">{item.value}</strong>
                    <small className="text-xs text-muted-foreground">{item.evidence}</small>
                    <em className="text-xs not-italic text-primary">{item.action}</em>
                  </>
                );

                return item.href ? (
                  <Link
                    key={`${item.label}:${item.value}`}
                    href={item.href}
                    {...reportPageLocalLinkProps(item.href)}
                    className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={`${item.label}:${item.value}`}
                    className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </section>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function InsightSummary({
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
    <Card>
      <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <div className="min-w-0 flex-1">
          <CardDescription>Сводка периода</CardDescription>
          <CardTitle>{insightTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {sourceText} {sampleInsight(finalizedCount, previousCount)}
          </p>
        </div>
        <CardAction className="col-start-1 row-span-1 row-start-2 flex flex-wrap items-center justify-self-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
          <Link
            href={reportReviewHref(period)}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Открыть проверки
          </Link>
          <Link
            href={reportHref(period, { view: "performance" })}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Сравнить разрезы
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent
        className="grid gap-2 pt-(--card-spacing) sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Где смотреть сейчас"
      >
        {focusItems.map((row) => {
          const content = (
            <>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </span>
              <strong className="text-sm font-semibold text-foreground">{row.value}</strong>
              <small className="text-xs text-muted-foreground">{row.detail}</small>
            </>
          );

          return row.href ? (
            <Link
              key={row.label}
              href={row.href}
              {...reportPageLocalLinkProps(row.href)}
              className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {content}
            </Link>
          ) : (
            <div
              key={row.label}
              className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3"
            >
              {content}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
