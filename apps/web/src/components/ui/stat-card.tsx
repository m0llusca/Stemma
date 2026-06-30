import { MetricValue } from "@/components/ui/metric-value";
import type { StatusTone } from "@/lib/ui/status-tone";

/**
 * Compact metric tile used across the admin operational surfaces (system,
 * channels, AI scoring). Token-driven; tone maps to the shared soft-callout
 * styling. Extracted from admin/system so multiple admin pages share one copy.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral"
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: StatusTone;
}) {
  const toneClass = {
    positive: "soft-callout--ok",
    warning: "soft-callout--warn",
    negative: "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)]",
    info: "",
    neutral: ""
  }[tone];

  return (
    <div className={`soft-callout ${toneClass}`}>
      <p className="soft-callout__label">{label}</p>
      <MetricValue value={value} tone={tone} />
      <p className="record-meta">{hint}</p>
    </div>
  );
}
