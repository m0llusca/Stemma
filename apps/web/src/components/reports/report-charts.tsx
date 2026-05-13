import type { ReactNode } from "react";
import Link from "next/link";
import { formatQualityScore } from "@/lib/score-display";

export type ChartDatum = {
  label: string;
  value: number;
  detail?: string;
};

export type StackedSegment = {
  label: string;
  value: number;
  color: string;
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
    <div className="grid min-w-[104px] max-w-[154px] gap-1">
      <span className="text-sm font-semibold text-[#111827]">{formatPercent(percent)}</span>
      <div
        aria-label={`${label}: ${formatPercent(percent)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={roundedPercent}
        className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-[#3157d5]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function chartPath(points: ChartDatum[], width: number, height: number) {
  if (points.length === 0) {
    return "";
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const stepX = points.length > 1 ? width / (points.length - 1) : width;

  return points
    .map((point, index) => {
      const x = points.length > 1 ? index * stepX : width / 2;
      const y = height - ((point.value - min) / range) * height;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
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
    <section className="panel chart-panel overflow-hidden">
      <div className="chart-panel__header">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[#64748b]">{description}</p> : null}
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

export function SparklineChart({ points }: { points: ChartDatum[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-[#64748b]">Нет завершенных проверок за выбранный период.</p>;
  }

  const width = 360;
  const height = 112;
  const path = chartPath(points, width, height);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#64748b]">Начало периода</p>
          <p className="mt-1 text-lg font-semibold text-[#111827]">{formatQualityScore(firstPoint.value)}</p>
          <p className="text-xs text-[#64748b]">{firstPoint.label}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase text-[#64748b]">Последняя точка</p>
          <p className="mt-1 text-lg font-semibold text-[#111827]">{formatQualityScore(lastPoint.value)}</p>
          <p className="text-xs text-[#64748b]">{lastPoint.label}</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full overflow-visible" role="img" aria-label="Тренд средней оценки">
        <line x1="0" y1={height} x2={width} y2={height} stroke="#d9e0ea" strokeWidth="1" />
        <path d={path} fill="none" stroke="#3157d5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {points.map((point, index) => {
          const values = points.map((item) => item.value);
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = Math.max(1, max - min);
          const x = points.length > 1 ? (index * width) / (points.length - 1) : width / 2;
          const y = height - ((point.value - min) / range) * height;

          return <circle key={`${point.label}:${index}`} cx={x} cy={y} r="4" fill="#ffffff" stroke="#3157d5" strokeWidth="2" />;
        })}
      </svg>
    </div>
  );
}

export function HorizontalBarChart({
  rows,
  valueSuffix = "",
  maxValue,
  emptyLabel = "Нет данных."
}: {
  rows: ChartDatum[];
  valueSuffix?: string;
  maxValue?: number;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#64748b]">{emptyLabel}</p>;
  }

  const computedMax = maxValue ?? Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const percent = clampPercent((row.value / computedMax) * 100);

        return (
          <div key={row.label} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-[#111827]">{row.label}</p>
              <p className="shrink-0 text-sm font-semibold text-[#334155]">
                {Math.round(row.value)}
                {valueSuffix}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
              <div className="h-full rounded-full bg-[#3157d5]" style={{ width: `${percent}%` }} />
            </div>
            {row.detail ? <p className="text-xs text-[#64748b]">{row.detail}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function ScoreDistribution({ rows }: { rows: ChartDatum[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (total === 0) {
    return <p className="text-sm text-[#64748b]">Нет завершенных проверок для распределения.</p>;
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-3">
          <span className="text-sm font-semibold text-[#334155]">{row.label}</span>
          <div className="h-8 overflow-hidden rounded-md bg-[#edf2ff]">
            <div className="h-full rounded-md bg-[#3157d5]" style={{ width: `${(row.value / total) * 100}%` }} />
          </div>
          <span className="text-right text-sm font-semibold text-[#111827]">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function StackedBar({ segments }: { segments: StackedSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <p className="text-sm text-[#64748b]">Нет данных для распределения.</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex h-4 overflow-hidden rounded-full bg-[#e2e8f0]">
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            className={segment.color}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="grid gap-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${segment.color}`} />
              <span className="truncate text-[#334155]">{segment.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-[#111827]">{segment.value}</span>
          </div>
        ))}
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
  }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#64748b]">Нормы на выбранный период пока не заданы.</p>;
  }

  return (
    <div className="grid gap-4">
      {rows.map((row) => {
        const percent = row.planned > 0 ? clampPercent((row.actual / row.planned) * 100) : 0;

        return (
          <div key={row.label} className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-[#111827]">{row.label}</p>
              <p className="shrink-0 text-sm text-[#64748b]">
                {row.actual} из {row.planned}
              </p>
            </div>
            <PercentProgressBar value={percent} label={row.label} />
          </div>
        );
      })}
    </div>
  );
}
