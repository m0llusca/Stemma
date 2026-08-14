"use client";

import { cn } from "@/lib/utils";

export type ChartTooltipLine = Readonly<{
  label: string;
  value: string;
}>;

export function ChartTooltipStatus({
  id,
  label,
  detail,
  lines,
  className
}: {
  id: string;
  label: string;
  detail?: string;
  lines: readonly ChartTooltipLine[];
  className?: string;
}) {
  return (
    <div
      id={id}
      role="tooltip"
      aria-live="polite"
      className={cn(
        "pointer-events-none rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md",
        className
      )}
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
