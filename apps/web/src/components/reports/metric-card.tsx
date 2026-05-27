import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  icon?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  comparison?: {
    current: number | null;
    previous: number | null;
    unit?: string;
    stable?: boolean;
  };
};

function formatSignedValue(value: number, unit = "") {
  if (value === 0) {
    return `0${unit}`;
  }

  return `${value > 0 ? "+" : "-"}${Math.abs(value)}${unit}`;
}

function MetricComparison({
  current,
  previous,
  unit = "",
  stable = true
}: {
  current: number | null;
  previous: number | null;
  unit?: string;
  stable?: boolean;
}) {
  if (current == null || previous == null) {
    return (
      <div className="metric-card__trend metric-card__trend--unavailable" aria-label="К прошлому периоду: нет данных">
        <span className="metric-card__trend-icon" aria-hidden="true">
          <Minus size={18} />
        </span>
        <span className="metric-card__trend-body">
          <span className="metric-card__trend-value">нет данных</span>
          <span className="metric-card__trend-caption">к прошлому периоду</span>
        </span>
      </div>
    );
  }

  const delta = Math.round(current - previous);
  const relativeDelta = previous === 0 ? null : Math.round((delta / Math.abs(previous)) * 100);
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const relativeLabel = relativeDelta == null ? (delta > 0 ? "новый рост" : "0%") : formatSignedValue(relativeDelta, "%");
  const absoluteLabel = formatSignedValue(delta, unit);
  const mainLabel = stable ? relativeLabel : absoluteLabel;
  const detailLabel = stable ? absoluteLabel : "малая выборка";

  return (
    <div className={`metric-card__trend metric-card__trend--${trend}`} aria-label={`К прошлому периоду: ${mainLabel}, ${detailLabel}`}>
      <span className="metric-card__trend-icon" aria-hidden="true">
        <TrendIcon size={18} />
      </span>
      <span className="metric-card__trend-body">
        <span className="metric-card__trend-main">
          <span className="metric-card__trend-value">{mainLabel}</span>
          <span className="metric-card__trend-detail">{detailLabel}</span>
        </span>
        <span className="metric-card__trend-caption">к прошлому периоду</span>
      </span>
    </div>
  );
}

export function MetricCard({ label, value, helper, icon, actionHref, actionLabel = "Открыть", comparison }: MetricCardProps) {
  return (
    <article className="panel metric-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="metric-card__label">{label}</p>
          <p className="metric-card__value">{value}</p>
        </div>
        {icon ? <div className="icon-box">{icon}</div> : null}
      </div>
      {comparison ? <MetricComparison {...comparison} /> : null}
      <p className="metric-card__helper">{helper}</p>
      {actionHref ? (
        <Link href={actionHref} className="metric-card__action">
          {actionLabel}
        </Link>
      ) : null}
    </article>
  );
}
