import type { ReactNode } from "react";

type StatusChipTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
type StatusChipSize = "xs" | "sm";

const toneClassNames: Record<StatusChipTone, string> = {
  neutral: "border-[#d7dce5] bg-white text-[#475467]",
  success: "border-[#b9ddd2] bg-[#eef8f3] text-[#116466]",
  warning: "border-[#fed7aa] bg-[#fff7ed] text-[#b54708]",
  danger: "border-[#fecaca] bg-[#fff1f1] text-[#b42318]",
  info: "border-[#bfdbfe] bg-[#eff6ff] text-[#175cd3]",
  accent: "border-[#b9ddd2] bg-[#e8f3ef] text-[#0b4f52]"
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
