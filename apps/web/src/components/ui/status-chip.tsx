import type { ReactNode } from "react";
import { Chip } from "@/components/ui/chip";

type StatusChipTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
type StatusChipSize = "xs" | "sm";

/**
 * Thin wrapper around the canonical {@link Chip} primitive. The public API is
 * unchanged; the look now comes entirely from the shared `.chip` token system.
 */
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
    <Chip tone={tone} size={size} title={title}>
      {children}
    </Chip>
  );
}
