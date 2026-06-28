import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Cross-screen KPI primitive.
 *
 * A flat, token-driven tile where the NUMBER is the hero: large tabular value
 * in `--foreground`, a quiet uppercase eyebrow, an optional reduced-size unit,
 * a signed semantic delta, one caption line, and an optional sparkline slot.
 * No heavy card chrome — separation is a hairline border + tint only. All
 * styling lives in `src/app/styles/components/06-data.css` and is driven
 * entirely by design tokens (no raw hex), so it holds across every theme
 * including Night Ops.
 */
export type StatKpiTone = "neutral" | "accent" | "success" | "warning" | "danger" | "ai";

export type StatKpiDeltaTone = "success" | "warning" | "danger" | "neutral";

export type StatKpiDelta = {
  value: string | number;
  direction: "up" | "down" | "flat";
  tone?: StatKpiDeltaTone;
};

const toneClassNames: Record<StatKpiTone, string> = {
  neutral: "stat-kpi--neutral",
  accent: "stat-kpi--accent",
  success: "stat-kpi--success",
  warning: "stat-kpi--warning",
  danger: "stat-kpi--danger",
  ai: "stat-kpi--ai"
};

const deltaToneClassNames: Record<StatKpiDeltaTone, string> = {
  success: "stat-kpi__delta--success",
  warning: "stat-kpi__delta--warning",
  danger: "stat-kpi__delta--danger",
  neutral: "stat-kpi__delta--neutral"
};

const deltaGlyphs: Record<StatKpiDelta["direction"], string> = {
  up: "↑",
  down: "↓",
  flat: "→"
};

export function StatKpi({
  label,
  value,
  unit,
  delta,
  hint,
  icon,
  trend,
  tone = "neutral",
  className
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: StatKpiDelta;
  hint?: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
  tone?: StatKpiTone;
  className?: string;
}) {
  return (
    <div className={clsx("stat-kpi", tone !== "neutral" && toneClassNames[tone], className)}>
      <div className="stat-kpi__head">
        <span className="stat-kpi__label">{label}</span>
        {icon != null ? (
          <span className="stat-kpi__icon" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="stat-kpi__value-row">
        <span className="stat-kpi__value">{value}</span>
        {unit != null ? <span className="stat-kpi__unit">{unit}</span> : null}
        {delta != null ? (
          <span
            className={clsx(
              "stat-kpi__delta",
              deltaToneClassNames[delta.tone ?? "neutral"]
            )}
          >
            <span className="stat-kpi__delta-glyph" aria-hidden>
              {deltaGlyphs[delta.direction]}
            </span>
            {delta.value}
          </span>
        ) : null}
      </div>
      {trend != null ? <div className="stat-kpi__trend">{trend}</div> : null}
      {hint != null ? <p className="stat-kpi__hint">{hint}</p> : null}
    </div>
  );
}
