"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type ChartTooltipLine = Readonly<{
  label: string;
  value: string;
}>;

export type ChartTooltipAnchor = Readonly<{
  left: number;
  top: number;
  placement?: "above" | "beside";
}>;

function anchorStyle(anchor: ChartTooltipAnchor): CSSProperties {
  const { left, top, placement = "above" } = anchor;

  if (placement === "beside") {
    const towardLeft = left > 62;
    return {
      left: `${left}%`,
      top: `${top}%`,
      transform: towardLeft
        ? "translate(calc(-100% - 10px), -50%)"
        : "translate(12px, -50%)"
    };
  }

  const below = top < 28;
  const fromLeft = left < 22;
  const fromRight = left > 78;
  if (fromLeft) {
    return {
      left: `${left}%`,
      top: `${top}%`,
      transform: below ? "translate(0, 12px)" : "translate(0, calc(-100% - 10px))"
    };
  }
  if (fromRight) {
    return {
      left: `${left}%`,
      top: `${top}%`,
      transform: below
        ? "translate(-100%, 12px)"
        : "translate(-100%, calc(-100% - 10px))"
    };
  }
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: below
      ? "translate(-50%, 12px)"
      : "translate(-50%, calc(-100% - 10px))"
  };
}

export function ChartTooltipStatus({
  id,
  label,
  detail,
  lines,
  className,
  anchor
}: {
  id: string;
  label: string;
  detail?: string;
  lines: readonly ChartTooltipLine[];
  className?: string;
  anchor?: ChartTooltipAnchor;
}) {
  return (
    <div
      id={id}
      role="tooltip"
      aria-live="polite"
      data-slot="chart-tooltip"
      data-anchor-left={anchor ? String(anchor.left) : undefined}
      data-anchor-top={anchor ? String(anchor.top) : undefined}
      className={cn(
        "pointer-events-none z-50 max-w-64 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md",
        anchor ? "absolute" : "absolute left-3 top-3",
        className
      )}
      style={anchor ? anchorStyle(anchor) : undefined}
    >
      <p className="font-medium">{label}</p>
      {detail ? <p className="text-muted-foreground">{detail}</p> : null}
      <dl className="mt-1 grid gap-0.5">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd className="font-medium tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
