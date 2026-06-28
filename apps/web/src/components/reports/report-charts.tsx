import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Inbox } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
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
  t1: "risk-stack__seg--t1",
  t2: "risk-stack__seg--t2",
  t3: "risk-stack__seg--t3",
  t4: "risk-stack__seg--t4"
};

function deltaTone(delta: number) {
  return delta > 0 ? "success" : delta < 0 ? "danger" : "neutral";
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
          <h2 className="chart-panel__title">{title}</h2>
          {description ? <p className="chart-panel__desc">{description}</p> : null}
        </div>
        {actionHref ? (
          <Link href={actionHref} className="chart-panel__action">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      <div className="chart-panel__body">{children}</div>
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
    <div className="hbar-chart">
      {rows.map((row) => {
        const percent = clampPercent((row.value / computedMax) * 100);

        return (
          <div key={row.label} className="hbar-chart__row">
            <div className="hbar-chart__head">
              <p className="hbar-chart__label">{row.label}</p>
              <p className="hbar-chart__value tabular-nums">
                {valueFormatter ? valueFormatter(row.value) : `${Math.round(row.value)}${valueSuffix}`}
              </p>
            </div>
            <div className="hbar-chart__track">
              <div className="hbar-chart__fill" style={{ width: `${percent}%` }} />
            </div>
            {row.detail ? <p className="hbar-chart__detail">{row.detail}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function ScoreDistribution({ rows }: { rows: ChartDatum[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={22} aria-hidden="true" />}
        title="Нет завершенных проверок"
        description="Распределение оценок появится после первых финализированных проверок."
        size="inline"
      />
    );
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
          <span className="score-histogram__value tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
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
    <div className="ranked-list">
      {rows.map((row, index) => (
        <article
          key={`${row.label}:${index}`}
          className={`ranked-list__row ranked-list__row--${row.delta == null ? "neutral" : row.delta < 0 ? "down" : row.delta > 0 ? "up" : "flat"}`}
        >
          <div className="ranked-list__rank tabular-nums">{index + 1}</div>
          <div className="ranked-list__body">
            <div className="ranked-list__title-row">
              <h3>{row.label}</h3>
              <div className="ranked-list__score">
                <strong className="tabular-nums">{valueFormatter ? valueFormatter(row.value) : row.value}</strong>
                {row.delta != null ? (
                  <Chip tone={deltaTone(row.delta)} size="xs" numeric>
                    {formatQualityScoreDelta(row.delta)}
                  </Chip>
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
    return (
      <EmptyState
        icon={<BarChart3 size={22} aria-hidden="true" />}
        title="Нет данных для распределения"
        size="inline"
      />
    );
  }

  return (
    <div className="risk-stack">
      <div className="risk-stack__bar">
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            className={`risk-stack__seg ${riskStackToneBySeverity[segment.severity]}`}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="risk-stack__legend">
        {segments.map((segment) => {
          const toneClass = riskStackToneBySeverity[segment.severity];
          const content = (
            <>
              <span>
                <span className={`risk-stack__dot risk-stack__seg ${toneClass}`} />
                <span>{segment.label}</span>
              </span>
              <strong className="tabular-nums">{segment.value}</strong>
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
            <strong className="tabular-nums">{row.actual} из {row.planned}</strong>
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
