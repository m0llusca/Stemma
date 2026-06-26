import type { ReactNode } from "react";
import clsx from "clsx";
import type { StatusTone } from "@/lib/ui/status-tone";
import { statusToneClass } from "@/lib/ui/status-tone";

export function MetricValue({
  label,
  value,
  tone = "neutral",
  className
}: {
  label?: ReactNode;
  value: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span className={clsx("metric-value", statusToneClass(tone), className)}>
      {label ? <span className="metric-value__label">{label}</span> : null}
      <span className="metric-value__value">{value}</span>
    </span>
  );
}
