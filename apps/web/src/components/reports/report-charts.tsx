import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { InteractiveSparklineChart } from "@/components/reports/interactive-sparkline-chart";
import { ChartFrame } from "@/components/charts/chart-frame";
import { ScoreDistributionChart } from "@/components/charts/score-distribution-chart.client";
import type { ChartView } from "@/components/charts/chart-view-links";
import type {
  ReportChartBundle,
  ScoreDistributionSeries
} from "@/lib/reports/report-chart-models";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
import { formatQualityScoreDelta } from "@/lib/score-display";
import { cn } from "@/lib/utils";

export type ChartDatum = {
  label: string;
  value: number;
  detail?: string;
  href?: string;
};

export type RankedDatum = ChartDatum & {
  href?: string;
  meta?: string;
  delta?: number | null;
};

export type StackedSegment = {
  label: string;
  value: number;
  /**
   * Stable severity rank (t1 = calmest -> t4 = densest). Drives the single-hue
   * density ramp below. No raw color lives on the data — the ramp is owned by
   * the chart so it restyles with the theme.
   */
  severity: "t1" | "t2" | "t3" | "t4";
  href?: string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

/**
 * Risk severity maps to a SINGLE-HUE density ramp (calm -> dense), not a
 * green-yellow-red traffic light. Each segment carries a stable `severity`
 * rank (t1..t4); the fill class is derived from that rank so the stacked bar
 * reads as one ordered scale in every theme — no raw color on the data.
 */
const riskStackToneBySeverity: Record<StackedSegment["severity"], string> = {
  t1: "bg-foreground/15",
  t2: "bg-foreground/30",
  t3: "bg-foreground/55",
  t4: "bg-foreground"
};

function deltaTone(delta: number) {
  return delta > 0 ? "success" : delta < 0 ? "danger" : "neutral";
}

function PercentProgressBar({ value, label }: { value: number; label: string }) {
  const percent = clampPercent(value);
  const roundedPercent = Math.round(percent);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{formatPercent(percent)}</span>
      <div
        aria-label={`${label}: ${formatPercent(percent)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={roundedPercent}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function ChartPanel({
  title,
  description,
  actionHref,
  actionLabel = "Открыть",
  children
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card size="sm" className="h-full gap-0 overflow-clip py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {actionHref ? (
          <CardAction>
            <Link
              href={actionHref}
              {...reportPageLocalLinkProps(actionHref)}
              className={buttonVariants({ variant: "outline", size: "xs" })}
            >
              {actionLabel}
            </Link>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="py-4">{children}</CardContent>
    </Card>
  );
}

export function SparklineChart(props: {
  points: ChartDatum[];
  target?: number;
  annotation?: string;
}) {
  return <InteractiveSparklineChart {...props} />;
}

export function HorizontalBarChart({
  rows,
  valueSuffix = "",
  valueFormatter,
  maxValue,
  emptyLabel = "Нет данных за период."
}: {
  rows: ChartDatum[];
  valueSuffix?: string;
  valueFormatter?: (value: number) => string;
  maxValue?: number;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={<BarChart3 size={22} aria-hidden="true" />} title={emptyLabel} size="inline" />
    );
  }

  const computedMax = maxValue ?? Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="grid gap-3.5">
      {rows.map((row) => {
        const percent = clampPercent((row.value / computedMax) * 100);

        return (
          <div key={row.label} className="grid gap-1.5">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium text-foreground">{row.label}</p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {valueFormatter ? valueFormatter(row.value) : `${Math.round(row.value)}${valueSuffix}`}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            {row.detail ? <p className="text-xs text-muted-foreground">{row.detail}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function ScoreDistributionPanel({
  bundle,
  view,
  currentHref,
  periodLabel
}: {
  bundle: ReportChartBundle<ScoreDistributionSeries>;
  view: ChartView;
  currentHref: string;
  periodLabel: string;
}) {
  return (
    <ChartFrame
      model={bundle.model}
      view={view}
      currentHref={currentHref}
      periodLabel={periodLabel}
      sample={bundle.sample}
      comparison={
        bundle.comparison.status === "stale"
          ? bundle.comparison
          : { status: "current" }
      }
      state={bundle.isEmpty ? { kind: "empty" } : { kind: "ready" }}
      graph={
        view === "graph" && !bundle.isEmpty ? (
          <ScoreDistributionChart model={bundle.model} />
        ) : undefined
      }
    />
  );
}

export function RankedList({
  rows,
  valueFormatter,
  emptyLabel = "Нет данных за период.",
  actionLabel = "Открыть"
}: {
  rows: RankedDatum[];
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
  actionLabel?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={<Inbox size={22} aria-hidden="true" />} title={emptyLabel} size="inline" />;
  }

  return (
    <div className="grid gap-0">
      {rows.map((row, index) => (
        <article
          key={`${row.label}:${index}`}
          className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
        >
          <div className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
            {index + 1}
          </div>
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <h3 className="truncate text-sm font-semibold text-foreground">{row.label}</h3>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <strong className="text-sm font-semibold tabular-nums text-foreground">
                  {valueFormatter ? valueFormatter(row.value) : row.value}
                </strong>
                {row.delta != null ? (
                  <Chip tone={deltaTone(row.delta)} size="xs" numeric>
                    {formatQualityScoreDelta(row.delta)}
                  </Chip>
                ) : null}
              </div>
            </div>
            {row.detail || row.meta ? (
              <p className="text-xs text-muted-foreground">{[row.detail, row.meta].filter(Boolean).join(", ")}</p>
            ) : null}
            <div className="h-0.5 overflow-clip rounded-full bg-border/60" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${clampPercent(row.value)}%` }} />
            </div>
          </div>
          {row.href ? (
            <Link
              href={row.href}
              {...reportPageLocalLinkProps(row.href)}
              className={buttonVariants({ variant: "outline", size: "xs" })}
            >
              {actionLabel}
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function StackedBar({ segments }: { segments: StackedSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={22} aria-hidden="true" />}
        title="Нет данных для распределения"
        size="inline"
      />
    );
  }

  return (
    <div className="grid gap-3.5">
      <div className="flex h-2.5 overflow-clip rounded-full bg-muted ring-1 ring-border">
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            className={cn("h-full min-w-0", riskStackToneBySeverity[segment.severity])}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {segments.map((segment) => {
          const toneClass = riskStackToneBySeverity[segment.severity];
          const content = (
            <>
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-sm", toneClass)} />
                <span className="truncate text-sm">{segment.label}</span>
              </span>
              <strong className="shrink-0 text-sm tabular-nums">{segment.value}</strong>
            </>
          );

          return segment.href ? (
            <Link
              key={segment.label}
              href={segment.href}
              {...reportPageLocalLinkProps(segment.href)}
              className="flex min-w-0 items-center justify-between gap-2.5 rounded-md border border-border bg-muted/50 px-2.5 py-2 text-inherit no-underline transition-colors hover:border-primary/40 hover:bg-muted"
            >
              {content}
            </Link>
          ) : (
            <div
              key={segment.label}
              className="flex min-w-0 items-center justify-between gap-2.5 rounded-md border border-border bg-muted/50 px-2.5 py-2"
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function QuotaProgressBars({
  rows
}: {
  rows: Array<{
    label: string;
    planned: number;
    actual: number;
    href?: string;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={22} aria-hidden="true" />}
        title="Нормы не заданы"
        description="Нормы проверок на выбранный период пока не настроены."
        size="inline"
      />
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((row, index) => {
        const percent = row.planned > 0 ? clampPercent((row.actual / row.planned) * 100) : 0;
        const remaining = Math.max(0, row.planned - row.actual);
        const behind = remaining > 0;

        const content = (
          <>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
              <span className="text-xs text-muted-foreground">
                {remaining > 0 ? `Осталось ${remaining}` : "Норма закрыта"}
              </span>
            </div>
            <PercentProgressBar value={percent} label={row.label} />
            <strong className="shrink-0 text-sm tabular-nums text-foreground">
              {row.actual} из {row.planned}
            </strong>
          </>
        );

        const className = cn(
          "grid min-w-0 items-center gap-3 rounded-lg border border-border px-3 py-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_auto]",
          behind ? "bg-card" : "bg-muted/40",
          row.href && "transition-colors hover:border-primary/40 hover:bg-muted/50"
        );

        return row.href ? (
          <Link
            key={`${row.label}:${index}`}
            href={row.href}
            {...reportPageLocalLinkProps(row.href)}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <div key={`${row.label}:${index}`} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
