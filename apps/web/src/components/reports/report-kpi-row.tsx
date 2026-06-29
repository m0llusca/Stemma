import Link from "next/link";
import type { ReactNode } from "react";
import { StatKpi, type StatKpiDelta, type StatKpiTone } from "@/components/ui/stat-kpi";
import { TrendChart, type TrendPoint } from "@/components/reports/trend-chart";
import type { MetricInsightItem, MetricInsightTone } from "@/components/reports/analytics-intelligence";

/**
 * Analytics-cockpit KPI row. A 4-up strip of StatKpi tiles where the NUMBER is
 * the hero: a quiet eyebrow label, a big tabular value, a signed semantic delta
 * chip, a one-line caption, and — on the lead tile — a muted-volume + indigo
 * line TrendChart sparkline. Drill-everywhere: a tile with an href becomes a
 * full-tile link. Tokens only; holds in light + dark.
 */

const insightToneToKpiTone: Record<MetricInsightTone, StatKpiTone> = {
  neutral: "neutral",
  ok: "success",
  warn: "warning",
  danger: "danger"
};

function KpiTile({
  href,
  children
}: {
  href?: string;
  children: ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} className="report-kpi-tile report-kpi-tile--link">
        {children}
        <span className="sr-only"> — открыть срез</span>
      </Link>
    );
  }

  return <div className="report-kpi-tile">{children}</div>;
}

export function ReportKpiRow({
  scoreLabel,
  scoreValue,
  scoreUnit,
  scoreDelta,
  scoreHint,
  scoreHref,
  trendPoints,
  trendVolume,
  trendAriaLabel,
  items
}: {
  scoreLabel: string;
  scoreValue: ReactNode;
  scoreUnit?: ReactNode;
  scoreDelta?: StatKpiDelta;
  scoreHint?: ReactNode;
  scoreHref?: string;
  trendPoints: TrendPoint[];
  trendVolume?: number[];
  trendAriaLabel?: string;
  items: MetricInsightItem[];
}) {
  return (
    <div className="report-kpi-row" aria-label="Ключевые показатели периода">
      <KpiTile href={scoreHref}>
        <StatKpi
          label={scoreLabel}
          value={scoreValue}
          unit={scoreUnit}
          delta={scoreDelta}
          hint={scoreHint}
          tone="accent"
          trend={
            trendPoints.length > 0 ? (
              <TrendChart
                points={trendPoints}
                volume={trendVolume}
                height={72}
                ariaLabel={trendAriaLabel ?? "Тренд средней оценки"}
              />
            ) : undefined
          }
        />
      </KpiTile>
      {items.map((item) => {
        const tone = insightToneToKpiTone[item.tone ?? "neutral"];

        return (
          <KpiTile key={item.label} href={item.href}>
            <StatKpi label={item.label} value={item.value} tone={tone} hint={item.detail} />
          </KpiTile>
        );
      })}
    </div>
  );
}
