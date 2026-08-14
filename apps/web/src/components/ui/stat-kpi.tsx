import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusSurfaceClass, statusToneClass, type StatusTone } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

export type StatKpiTone = "neutral" | "accent" | "success" | "warning" | "danger" | "ai";

const statusToneByKpiTone: Record<Exclude<StatKpiTone, "neutral">, StatusTone> = {
  accent: "info",
  success: "positive",
  warning: "warning",
  danger: "negative",
  ai: "info"
};

export type StatKpiDeltaTone = "success" | "warning" | "danger" | "neutral" | "up" | "down";

export type StatKpiDelta = {
  value: string | number;
  /** Preferred: explicit direction. Optional for swarm call sites that only pass tone. */
  direction?: "up" | "down" | "flat";
  tone?: StatKpiDeltaTone | "up" | "down";
};

const deltaGlyphs: Record<"up" | "down" | "flat", string> = {
  up: "↑",
  down: "↓",
  flat: "→"
};

function resolveDirection(delta: StatKpiDelta): "up" | "down" | "flat" {
  if (delta.direction) {
    return delta.direction;
  }
  if (delta.tone === "up" || delta.tone === "success") {
    return "up";
  }
  if (delta.tone === "down" || delta.tone === "danger") {
    return "down";
  }
  return "flat";
}

/**
 * KPI tile composed from shadcn Card + Badge. Public API preserved + flexible delta.
 */
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
  delta?: StatKpiDelta | null;
  hint?: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
  tone?: StatKpiTone;
  className?: string;
}) {
  const direction = delta ? resolveDirection(delta) : null;
  const statusTone = tone === "neutral" ? null : statusToneByKpiTone[tone];

  return (
    <Card className={cn(statusTone != null && statusSurfaceClass(statusTone), className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardDescription className="uppercase tracking-wide">{label}</CardDescription>
        {icon != null ? <span className="text-muted-foreground">{icon}</span> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          {/* Value is a metric, not a section title: opt out of CardTitle heading semantics. */}
          <CardTitle
            role="presentation"
            aria-level={undefined}
            className={cn(
              "text-2xl font-semibold tabular-nums",
              statusTone != null && statusToneClass(statusTone)
            )}
          >
            {value}
          </CardTitle>
          {unit != null ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
          {delta != null && direction != null ? (
            <Badge
              variant="secondary"
              className={cn(
                (delta.tone === "success" || delta.tone === "up" || direction === "up") &&
                  "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                (delta.tone === "warning") && "bg-amber-500/15 text-amber-900 dark:text-amber-300",
                (delta.tone === "danger" || delta.tone === "down" || direction === "down") &&
                  "bg-destructive/15 text-destructive"
              )}
            >
              <span aria-hidden>{deltaGlyphs[direction]}</span>
              {delta.value}
            </Badge>
          ) : null}
        </div>
        {trend != null ? <div>{trend}</div> : null}
        {hint != null ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
