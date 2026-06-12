import type { ReactNode } from "react";

type StatusChipTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
type StatusChipSize = "xs" | "sm";

const toneClassNames: Record<StatusChipTone, string> = {
  neutral: "border-[var(--border)] bg-[var(--panel)] text-[var(--text-subtle)]",
  success: "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--success)]",
  warning: "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--warning)]",
  danger: "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--danger)]",
  info: "border-[#bfdbfe] bg-[var(--accent-soft)] text-[#1d4ed8]",
  accent: "border-[#c7d2fe] bg-[var(--accent-soft)] text-[#1d3fae]"
};

const sizeClassNames: Record<StatusChipSize, string> = {
  xs: "min-h-[22px] px-2 py-0.5 text-[11px]",
  sm: "min-h-[26px] px-2.5 py-1 text-xs"
};

export function StatusChip({
  children,
  tone = "neutral",
  size = "sm",
  title
}: {
  children: ReactNode;
  tone?: StatusChipTone;
  size?: StatusChipSize;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center rounded-full border font-semibold leading-4 ${toneClassNames[tone]} ${sizeClassNames[size]}`}
    >
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
