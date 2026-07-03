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
 * Thin wrapper around the canonical {@link Chip} primitive. The public API is
 * unchanged; it keeps the legacy `status-badge` class hooks while sharing the
 * `.chip` token-driven look (radius, border, tone fills).
 */
export function StatusBadge({
  label,
  value,
  tone = "neutral",
  className,
  compact = false
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: StatusTone;
  className?: string;
  /**
   * Компактный статус-чип: видимой подписи нет (значение самодостаточно —
   * «Активен», «В очереди»), рендерится маленьким value-only чипом; подпись
   * сохраняется в title. Канонический вид статусов в строках/таблицах админки.
   */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Chip
        tone={chipToneForStatusTone[tone]}
        size="xs"
        value={value}
        title={typeof label === "string" && typeof value === "string" ? `${label}: ${value}` : undefined}
        className={className}
      />
    );
  }

  return (
    <Chip
      tone={chipToneForStatusTone[tone]}
      label={label}
      value={value}
      baseClassName="status-badge"
      partPrefix="status-badge"
      className={className}
    />
  );
}
