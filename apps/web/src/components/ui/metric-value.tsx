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
 * Thin wrapper around the canonical {@link Chip} primitive (stacked variant).
 * The public API is unchanged; it keeps the legacy `metric-value` class hooks
 * (used by dashboard-kpi CSS) while sharing the `.chip` tone tokens.
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
