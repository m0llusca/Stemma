import { MetricValue } from "@/components/ui/metric-value";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { StatusTone } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

/**
 * Compact metric tile used across admin operational surfaces.
 * Public API preserved; surface is shadcn Card.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral"
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: StatusTone;
}) {
  return (
    <Card
      className={cn(
        tone === "positive" && "border-emerald-500/30 bg-emerald-500/5",
        tone === "warning" && "border-amber-500/30 bg-amber-500/5",
        tone === "negative" && "border-destructive/30 bg-destructive/5"
      )}
    >
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <MetricValue value={value} tone={tone} />
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
