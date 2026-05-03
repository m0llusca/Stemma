import type { ReactNode } from "react";

type StatusChipTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
type StatusChipSize = "xs" | "sm";

const toneClassNames: Record<StatusChipTone, string> = {
  neutral: "border-[#d9e0ea] bg-white text-[#475569]",
  success: "border-[#bbf7d0] bg-[#ecfdf5] text-[#15803d]",
  warning: "border-[#fed7aa] bg-[#fff7ed] text-[#b45309]",
  danger: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
  info: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  accent: "border-[#c7d2fe] bg-[#edf2ff] text-[#1d3fae]"
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
