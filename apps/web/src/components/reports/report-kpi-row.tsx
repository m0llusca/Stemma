import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricInsightItem, MetricInsightTone } from "@/components/reports/analytics-intelligence";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
import { cn } from "@/lib/utils";

/**
 * Six-track overview KPI row. The lead score occupies two tracks and the four
 * supporting facts occupy one each, preventing a desktop/tablet orphan.
 */

export type ReportKpiDelta = {
  value: ReactNode;
  direction?: "up" | "down" | "flat";
  tone?: "success" | "danger" | "neutral" | "up" | "down";
};

const insightToneBadge: Record<MetricInsightTone, string> = {
  neutral: "",
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive"
};

function KpiTile({
  href,
  desktopTrackSpan,
  tabletTrackSpan,
  className,
  children
}: {
  href?: string;
  desktopTrackSpan: 1 | 2;
  tabletTrackSpan: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  if (href) {
    return (
      <Link
        href={href}
        {...reportPageLocalLinkProps(href)}
        role="listitem"
        data-desktop-track-span={desktopTrackSpan}
        data-tablet-track-span={tabletTrackSpan}
        className={cn(
          "block min-w-0 rounded-xl outline-none hover:ring-2 hover:ring-ring/30 focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        {children}
        <span className="sr-only"> — открыть срез</span>
      </Link>
    );
  }

  return (
    <div
      role="listitem"
      data-desktop-track-span={desktopTrackSpan}
      data-tablet-track-span={tabletTrackSpan}
      className={cn("min-w-0", className)}
    >
      {children}
    </div>
  );
}

function deltaBadgeTone(delta: ReportKpiDelta): "up" | "down" | "neutral" {
  if (delta.direction === "up" || delta.tone === "success" || delta.tone === "up") {
    return "up";
  }
  if (delta.direction === "down" || delta.tone === "danger" || delta.tone === "down") {
    return "down";
  }
  return "neutral";
}

export function ReportKpiRow({
  scoreLabel,
  scoreValue,
  scoreUnit,
  scoreDelta,
  scoreHint,
  scoreHref,
  items
}: {
  scoreLabel: string;
  scoreValue: ReactNode;
  scoreUnit?: ReactNode;
  scoreDelta?: ReportKpiDelta;
  scoreHint?: ReactNode;
  scoreHref?: string;
  items: MetricInsightItem[];
}) {
  const scoreTone = scoreDelta ? deltaBadgeTone(scoreDelta) : "neutral";

  return (
    <div
      role="list"
      data-desktop-tracks="6"
      className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 xl:grid-cols-6"
      aria-label="Ключевые показатели периода"
    >
      <KpiTile
        href={scoreHref}
        desktopTrackSpan={2}
        tabletTrackSpan={2}
        className="min-[390px]:col-span-2 xl:col-span-2"
      >
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardDescription>{scoreLabel}</CardDescription>
            <div className="flex flex-wrap items-end gap-2">
              <CardTitle className="text-2xl font-semibold tabular-nums tracking-tight">
                {scoreValue}
              </CardTitle>
              {scoreUnit != null ? (
                <span className="pb-0.5 text-sm text-muted-foreground">{scoreUnit}</span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {scoreDelta ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    "tabular-nums",
                    scoreTone === "up" && "bg-success-soft text-success",
                    scoreTone === "down" && "bg-destructive-soft text-destructive"
                  )}
                >
                  {scoreTone === "up" ? "↑ " : scoreTone === "down" ? "↓ " : null}
                  {scoreDelta.value}
                </Badge>
              ) : null}
              {scoreHint}
            </div>
          </CardContent>
        </Card>
      </KpiTile>

      {items.map((item) => (
        <KpiTile
          key={item.label}
          href={item.href}
          desktopTrackSpan={1}
          tabletTrackSpan={1}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">{item.value}</CardTitle>
            </CardHeader>
            {item.detail ? (
              <CardContent className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {item.tone && item.tone !== "neutral" ? (
                  <Badge
                    variant="secondary"
                    className={cn("font-normal", insightToneBadge[item.tone])}
                  >
                    {item.tone === "ok" ? "норма" : item.tone === "warn" ? "внимание" : "риск"}
                  </Badge>
                ) : null}
                <span>{item.detail}</span>
              </CardContent>
            ) : null}
          </Card>
        </KpiTile>
      ))}
    </div>
  );
}
