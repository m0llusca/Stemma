import type { ReactNode } from "react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import type { StatusTone } from "@/lib/ui/status-tone";

/** Extended tones used by swarm-migrated pages (maps onto Chip tones). */
export type StatusBadgeTone =
  | StatusTone
  | "success"
  | "danger"
  | "accent"
  | "ai"
  | "risk"
  | "positive"
  | "negative"
  | "warning"
  | "neutral"
  | "info";

const chipToneForStatusTone: Record<string, ChipTone> = {
  positive: "success",
  success: "success",
  warning: "warning",
  negative: "danger",
  danger: "danger",
  risk: "danger",
  neutral: "neutral",
  info: "info",
  accent: "accent",
  ai: "ai"
};

type StatusBadgeProps = {
  label?: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
  tone?: StatusBadgeTone;
  className?: string;
  compact?: boolean;
  size?: string;
  icon?: ReactNode;
};

/**
 * Status chip wrapper around shadcn Badge via Chip.
 * Supports original {label,value,tone,compact} and compact {children,tone} APIs.
 */
export function StatusBadge({
  label,
  value,
  children,
  tone = "neutral",
  className,
  compact = false,
  size,
  icon
}: StatusBadgeProps) {
  const chipTone = chipToneForStatusTone[tone] ?? "neutral";
  const displayValue = value ?? children;

  if (compact || (label == null && displayValue != null)) {
    return (
      <Chip
        tone={chipTone}
        size={compact || size === "xs" || size === "sm" ? "xs" : "sm"}
        value={displayValue}
        icon={icon}
        title={
          typeof label === "string" && typeof displayValue === "string"
            ? `${label}: ${displayValue}`
            : undefined
        }
        className={className}
      />
    );
  }

  return (
    <Chip
      tone={chipTone}
      label={label}
      value={displayValue}
      icon={icon}
      baseClassName="status-badge"
      partPrefix="status-badge"
      className={className}
    />
  );
}
