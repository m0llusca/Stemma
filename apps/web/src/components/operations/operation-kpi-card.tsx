import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { MetricValue } from "@/components/ui/metric-value";
import type { StatusTone } from "@/lib/ui/status-tone";

export function OperationKpiCard({
  href,
  className,
  icon: Icon,
  value,
  tone,
  label,
  hint
}: {
  href: string;
  className?: string;
  icon: LucideIcon;
  value: string | number;
  tone: StatusTone;
  label: string;
  hint: string;
}) {
  return (
    <Link href={href} className={`dashboard-kpi ${className ?? ""}`.trim()}>
      <span className="dashboard-kpi__icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <MetricValue value={value} tone={tone} />
      <span>{label}</span>
      <small>{hint}</small>
    </Link>
  );
}
