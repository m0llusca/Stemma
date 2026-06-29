import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatKpi, type StatKpiDelta, type StatKpiTone } from "@/components/ui/stat-kpi";
import type { StatusTone } from "@/lib/ui/status-tone";

const statKpiToneForStatusTone: Record<StatusTone, StatKpiTone> = {
  positive: "neutral",
  warning: "neutral",
  negative: "danger",
  neutral: "neutral",
  info: "neutral"
};

/**
 * Drill-down KPI tile for the quality cockpit. The NUMBER is the hero: a calm
 * uppercase eyebrow, a large tabular value, an optional signed delta vs. the
 * previous period, and one caption line. Chrome stays flat — the whole tile is
 * a single hairline-bordered link into the filtered queue. Tone is rationed:
 * only a breached threshold (negative) recolors the value; otherwise the value
 * stays monochrome ink.
 */
export function OperationKpiCard({
  href,
  className,
  icon: Icon,
  value,
  unit,
  delta,
  tone,
  label,
  hint,
  trend
}: {
  href: string;
  className?: string;
  icon: LucideIcon;
  value: string | number;
  unit?: string;
  delta?: StatKpiDelta;
  tone: StatusTone;
  label: string;
  hint: string;
  trend?: ReactNode;
}) {
  return (
    <Link href={href} className={`dashboard-kpi ${className ?? ""}`.trim()}>
      <StatKpi
        label={label}
        value={value}
        unit={unit}
        delta={delta}
        hint={hint}
        trend={trend}
        icon={<Icon size={16} aria-hidden="true" />}
        tone={statKpiToneForStatusTone[tone]}
      />
    </Link>
  );
}
