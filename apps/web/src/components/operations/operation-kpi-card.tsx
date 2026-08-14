import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status-tone";

export type OperationKpiDelta = {
  value: ReactNode;
  direction?: "up" | "down" | "flat";
  tone?: "up" | "down" | "neutral" | "success" | "warning" | "danger";
};

const deltaGlyphs: Record<NonNullable<OperationKpiDelta["direction"]>, string> = {
  up: "↑",
  down: "↓",
  flat: "→"
};

/**
 * Drill-down KPI tile for the quality cockpit. The NUMBER is the hero: a calm
 * uppercase eyebrow, a large tabular value, an optional signed delta vs. the
 * previous period, and one caption line. Chrome stays flat — the whole tile is
 * a single hairline-bordered link into the filtered queue. Tone is rationed:
 * only a breached threshold (negative) recolors the value; otherwise the value
 * stays monochrome ink.
 */
export function OperationKpiCard({
  href,
  className,
  icon: Icon,
  value,
  unit,
  delta,
  tone,
  label,
  hint,
  trend
}: {
  href: string;
  className?: string;
  icon: LucideIcon;
  value: string | number;
  unit?: string;
  delta?: OperationKpiDelta | null;
  tone: StatusTone;
  label: string;
  hint: string;
  trend?: ReactNode;
}) {
  const deltaTone = delta?.tone;
  const isNegativeValue = tone === "negative";

  return (
    <Link href={href} className={cn("block min-w-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wide">{label}</CardDescription>
            <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>
          <CardTitle
            className={cn(
              "flex flex-wrap items-baseline gap-1.5 text-2xl font-semibold tabular-nums group-data-[size=sm]/card:text-2xl",
              isNegativeValue && "text-destructive"
            )}
          >
            <span>{value}</span>
            {unit ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
          </CardTitle>
        </CardHeader>
        {(delta != null || hint || trend != null) && (
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              {delta != null ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    (deltaTone === "up" || deltaTone === "success") &&
                      "bg-success-soft text-success",
                    (deltaTone === "down" || deltaTone === "danger") && "bg-destructive/15 text-destructive",
                    deltaTone === "warning" && "bg-warning-soft text-warning"
                  )}
                >
                  {delta.direction ? (
                    <span aria-hidden="true">{deltaGlyphs[delta.direction]}</span>
                  ) : null}
                  <span>{delta.value}</span>
                </Badge>
              ) : null}
              {hint ? <span className="min-w-0">{hint}</span> : null}
            </div>
            {trend != null ? <div className="min-w-0">{trend}</div> : null}
          </CardContent>
        )}
      </Card>
    </Link>
  );
}
