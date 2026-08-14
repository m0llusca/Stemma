import type { ReactNode } from "react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import type { StatusTone } from "@/lib/ui/status-tone";

const chipToneForStatusTone: Record<StatusTone, ChipTone> = {
  positive: "success",
  warning: "warning",
  negative: "danger",
  neutral: "neutral",
  info: "info"
};

/**
 * Thin wrapper around Chip (stacked). Public API unchanged.
 */
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
    <Chip
      tone={chipToneForStatusTone[tone]}
      variant="stacked"
      numeric
      label={label}
      value={value}
      baseClassName="metric-value"
      partPrefix="metric-value"
      className={className}
    />
  );
}
