import type { ReactNode } from "react";
import clsx from "clsx";
import type { StatusTone } from "@/lib/ui/status-tone";
import { statusToneClass } from "@/lib/ui/status-tone";

export function StatusBadge({
  label,
  value,
  tone = "neutral",
  className
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span className={clsx("status-badge", statusToneClass(tone), className)}>
      <span className="status-badge__label">{label}</span>
      {" "}
      <span className="status-badge__value">{value}</span>
    </span>
  );
}
