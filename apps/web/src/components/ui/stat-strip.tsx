import { cn } from "@/lib/utils";

export type StatStripTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "positive"
  | "risk";

export type StatStripItem = {
  label: string;
  value: string | number;
  tone?: StatStripTone;
  /** Короткое пояснение после значения (например «за все время»). */
  hint?: string;
};

const valueTone: Record<string, string> = {
  neutral: "text-foreground",
  accent: "text-primary",
  success: "text-emerald-700 dark:text-emerald-300",
  positive: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-800 dark:text-amber-300",
  danger: "text-destructive",
  risk: "text-destructive",
  info: "text-primary"
};

/**
 * Компактная строка метрик. ariaLabel optional for swarm-migrated call sites.
 */
export function StatStrip({
  items,
  ariaLabel,
  className
}: {
  items: StatStripItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-4 py-3",
        className
      )}
      aria-label={ariaLabel ?? "Метрики"}
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <dd
            className={cn(
              "text-xl font-semibold tabular-nums",
              valueTone[item.tone ?? "neutral"] ?? valueTone.neutral
            )}
          >
            {item.value}
          </dd>
          <dt className="text-xs text-muted-foreground">
            {item.label}
            {item.hint ? <span> · {item.hint}</span> : null}
          </dt>
        </div>
      ))}
    </dl>
  );
}
