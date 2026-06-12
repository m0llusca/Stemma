import type { ReactNode } from "react";
import Link from "next/link";
import { InteractiveSparklineChart } from "@/components/reports/interactive-sparkline-chart";
import { formatQualityScoreDelta } from "@/lib/score-display";

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
  color: string;
  href?: string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function PercentProgressBar({ value, label }: { value: number; label: string }) {
  const percent = clampPercent(value);
  const roundedPercent = Math.round(percent);

  return (
    <div className="quota-meter">
      <span>{formatPercent(percent)}</span>
      <div
        aria-label={`${label}: ${formatPercent(percent)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={roundedPercent}
        className="quota-meter__track"
        role="progressbar"
      >
        <div className="quota-meter__fill" style={{ width: `${percent}%` }} />
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
    <section className="panel chart-panel overflow-clip">
      <div className="chart-panel__header">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p> : null}
        </div>
        {actionHref ? (
          <Link href={actionHref} className="chart-panel__action">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
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
  emptyLabel = "Нет данных."
}: {
  rows: ChartDatum[];
  valueSuffix?: string;
  valueFormatter?: (value: number) => string;
  maxValue?: number;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }

  const computedMax = maxValue ?? Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const percent = clampPercent((row.value / computedMax) * 100);

        return (
          <div key={row.label} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">{row.label}</p>
              <p className="shrink-0 text-sm font-semibold text-[var(--text-body)]">
                {valueFormatter ? valueFormatter(row.value) : `${Math.round(row.value)}${valueSuffix}`}
              </p>
            </div>
            <div className="h-2 overflow-clip rounded-full bg-[#e2e8f0]">
              <div className="h-full rounded-full bg-[#3157d5]" style={{ width: `${percent}%` }} />
            </div>
            {row.detail ? <p className="text-xs text-[var(--text-muted)]">{row.detail}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function ScoreDistribution({ rows }: { rows: ChartDatum[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (total === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Нет завершенных проверок для распределения.</p>;
  }

  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="score-histogram" aria-label="Распределение оценок">
      {rows.map((row) => (
        <div key={row.label} className="score-histogram__item">
          <div className="score-histogram__bar-wrap">
            <div className="score-histogram__bar" style={{ height: row.value > 0 ? `${Math.max(10, (row.value / maxValue) * 100)}%` : "0%" }} />
          </div>
          <span className="score-histogram__label">{row.label}</span>
          <span className="score-histogram__value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RankedList({
  rows,
  valueFormatter,
  emptyLabel = "Нет данных.",
  actionLabel = "Открыть"
}: {
  rows: RankedDatum[];
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
  actionLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }

  return (
    <div className="ranked-list">
      {rows.map((row, index) => (
        <article
          key={`${row.label}:${index}`}
          className={`ranked-list__row ranked-list__row--${row.delta == null ? "neutral" : row.delta < 0 ? "down" : row.delta > 0 ? "up" : "flat"}`}
        >
          <div className="ranked-list__rank">{index + 1}</div>
          <div className="ranked-list__body">
            <div className="ranked-list__title-row">
              <h3>{row.label}</h3>
              <div className="ranked-list__score">
                <strong>{valueFormatter ? valueFormatter(row.value) : row.value}</strong>
                {row.delta != null ? (
                  <span className={`delta-chip delta-chip--${row.delta > 0 ? "up" : row.delta < 0 ? "down" : "flat"}`}>
                    {formatQualityScoreDelta(row.delta)}
                  </span>
                ) : null}
              </div>
            </div>
            {row.detail || row.meta ? (
              <p>
                {[row.detail, row.meta].filter(Boolean).join(", ")}
              </p>
            ) : null}
            <div className="ranked-list__quality-line" aria-hidden="true">
              <span style={{ width: `${clampPercent(row.value)}%` }} />
            </div>
          </div>
          {row.href ? (
            <Link href={row.href} className="ranked-list__action">
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
    return <p className="text-sm text-[var(--text-muted)]">Нет данных для распределения.</p>;
  }

  return (
    <div className="risk-stack">
      <div className="risk-stack__bar">
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            className={segment.color}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="risk-stack__legend">
        {segments.map((segment) => {
          const content = (
            <>
              <span>
                <span className={`risk-stack__dot ${segment.color}`} />
                <span>{segment.label}</span>
              </span>
              <strong>{segment.value}</strong>
            </>
          );

          return segment.href ? (
            <Link key={segment.label} href={segment.href} className="risk-stack__legend-item risk-stack__legend-item--link">
              {content}
            </Link>
          ) : (
            <div key={segment.label} className="risk-stack__legend-item">
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
    return <p className="text-sm text-[var(--text-muted)]">Нормы на выбранный период пока не заданы.</p>;
  }

  return (
    <div className="quota-list">
      {rows.map((row) => {
        const percent = row.planned > 0 ? clampPercent((row.actual / row.planned) * 100) : 0;
        const remaining = Math.max(0, row.planned - row.actual);

        const content = (
          <>
            <div>
              <p>{row.label}</p>
              <span>{remaining > 0 ? `Осталось ${remaining}` : "Норма закрыта"}</span>
            </div>
            <PercentProgressBar value={percent} label={row.label} />
            <strong>{row.actual} из {row.planned}</strong>
          </>
        );
        const className = `quota-list__row ${remaining > 0 ? "quota-list__row--behind" : "quota-list__row--done"} ${row.href ? "quota-list__row--link" : ""}`;

        return row.href ? (
          <Link key={row.label} href={row.href} className={className}>
            {content}
          </Link>
        ) : (
          <div key={row.label} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
