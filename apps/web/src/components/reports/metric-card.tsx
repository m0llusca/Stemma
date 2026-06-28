import type { ReactNode } from "react";
import Link from "next/link";
import { StatKpi, type StatKpiDelta } from "@/components/ui/stat-kpi";
import { formatQualityScoreDelta, qualityScoreDelta } from "@/lib/score-display";

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

function formatAbsoluteDelta(value: number, unit: string) {
  if (unit.trim().startsWith("бал")) {
    return formatQualityScoreDelta(value);
  }

  return formatSignedValue(value, unit);
}

function comparisonDelta(current: number, previous: number, unit: string) {
  if (unit.trim().startsWith("бал")) {
    return qualityScoreDelta(current, previous) ?? 0;
  }

  return Math.round(current - previous);
}

/**
 * Split a formatted value like "92 балла" into a hero number + trailing unit so
 * StatKpi can render the number as the hero with a reduced-size unit.
 */
function splitValue(value: string): { value: string; unit?: string } {
  const match = value.match(/^(\s*[+-]?[\d\s.,%]+)(.*)$/);

  if (!match) {
    return { value };
  }

  const head = match[1].trim();
  const tail = match[2].trim();

  return { value: head, unit: tail.length > 0 ? tail : undefined };
}

function buildDelta(comparison: NonNullable<MetricCardProps["comparison"]>): StatKpiDelta | undefined {
  const { current, previous, unit = "" } = comparison;

  if (current == null || previous == null) {
    return undefined;
  }

  const delta = comparisonDelta(current, previous, unit);
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone = delta > 0 ? "success" : delta < 0 ? "danger" : "neutral";

  return {
    value: formatAbsoluteDelta(delta, unit),
    direction,
    tone
  };
}

export function MetricCard({ label, value, helper, icon, actionHref, actionLabel = "Открыть", comparison }: MetricCardProps) {
  const { value: heroValue, unit } = splitValue(value);
  const delta = comparison ? buildDelta(comparison) : undefined;
  const hint =
    comparison && delta == null
      ? "Нет базы сравнения"
      : helper;

  return (
    <div className="metric-card-shell">
      <StatKpi
        label={label}
        value={heroValue}
        unit={unit}
        delta={delta}
        hint={hint}
        icon={icon}
      />
      {actionHref ? (
        <Link href={actionHref} className="metric-card__action">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
