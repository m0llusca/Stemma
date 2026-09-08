import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const EXEC_RISK_CHART_MIN_HEIGHT_CLASS = "h-[240px]";
export const SCORE_OVER_TIME_MIN_HEIGHT_CLASS = "min-h-[200px]";
export const SCORE_OVER_TIME_PLOT_HEIGHT = 200;

export const CHART_SERIES_STROKE = "var(--chart-1)";
export const CHART_SERIES_STROKE_WIDTH = 2;
export const CHART_MARKER_RADIUS = 3;
export const CHART_MARKER_RADIUS_LAST = 4;

export function chartGoalLabel(value: number) {
  return `Цель ${value}`;
}

/**
 * Goal copy lives outside the plot as HTML — never an SVG <text> that
 * `preserveAspectRatio="none"` can squash or rotate.
 */
export function ChartGoalBadge({
  value,
  slot = "chart-goal-badge",
  className
}: {
  value: number;
  slot?: string;
  className?: string;
}) {
  return (
    <span
      data-slot={slot}
      className={cn(
        "pointer-events-none absolute top-2 right-2 z-10 text-xs text-muted-foreground",
        className
      )}
    >
      {chartGoalLabel(value)}
    </span>
  );
}

export function ChartScaleFooter({
  min,
  max,
  target,
  formatValue
}: {
  min: number;
  max: number;
  target?: number;
  formatValue: (value: number) => string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="sparkline-scale"
      className="flex flex-wrap justify-between gap-2 text-sm font-medium tabular-nums text-muted-foreground"
    >
      <span>Мин {formatValue(min)}</span>
      {target != null ? <span>{chartGoalLabel(target)}</span> : null}
      <span>Макс {formatValue(max)}</span>
    </div>
  );
}

export function ChartEnter({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"div">, "children" | "className">) {
  return (
    <div data-qc-motion="chart-enter" className={className} {...props}>
      {children}
    </div>
  );
}
