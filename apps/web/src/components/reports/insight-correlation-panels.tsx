import Link from "next/link";
import { Inbox, MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartFrame } from "@/components/charts/chart-frame";
import { ReasonTrendChart } from "@/components/charts/reason-trend-chart.client";
import type { ChartView } from "@/components/charts/chart-view-links";
import { ownerTypeLabels } from "@/lib/labels";
import { formatAverageScore } from "@/lib/reports/report-format";
import type { ReasonTrendRow, SentimentCorrelation } from "@/lib/reports/report-aggregation";
import type {
  ReasonTimelineSeries,
  ReportChartBundle
} from "@/lib/reports/report-chart-models";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
import { cn } from "@/lib/utils";

export type ReasonTrendItem = ReasonTrendRow & {
  // Drill-through to the filtered reviews queue for this reason category.
  href: string;
};

// "Причины и темы": ranks recurring finding categories by current-period volume.
export function ReasonTrendPanel({
  rows,
  bundle,
  view,
  currentHref,
  periodLabel,
  actionLabel = "Открыть проверки"
}: {
  rows: ReasonTrendItem[];
  bundle: ReportChartBundle<ReasonTimelineSeries>;
  view: ChartView;
  currentHref: string;
  periodLabel: string;
  actionLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="overflow-hidden" aria-labelledby="reason-trend-title">
        <CardHeader className="border-b">
          <CardTitle id="reason-trend-title">Причины и темы</CardTitle>
          <CardDescription>Нет замечаний за выбранный период</CardDescription>
        </CardHeader>
        <CardContent className="pt-(--card-spacing)">
          <EmptyState
            icon={<Inbox size={22} aria-hidden="true" />}
            title="Нет замечаний"
            description="Причины и темы появятся после первых завершённых проверок с замечаниями."
            size="inline"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-label="Причины и темы" className="flex min-w-0 flex-col gap-4">
      {bundle.comparison.status === "missing" ? (
        <p className="text-sm text-muted-foreground">
          {bundle.comparison.message}
        </p>
      ) : null}
      <ChartFrame
        model={bundle.model}
        view={view}
        currentHref={currentHref}
        periodLabel={periodLabel}
        sample={bundle.sample}
        comparison={
          bundle.comparison.status === "stale"
            ? bundle.comparison
            : { status: "current" }
        }
        state={bundle.isEmpty ? { kind: "empty" } : { kind: "ready" }}
        graph={
          view === "graph" && !bundle.isEmpty ? (
            <ReasonTrendChart model={bundle.model} />
          ) : undefined
        }
      />
      <Card className="overflow-hidden" aria-labelledby="reason-trend-title">
        <CardHeader className="border-b">
          <CardTitle id="reason-trend-title">Причины и темы</CardTitle>
          <CardDescription>
            Повторяющиеся причины замечаний и их динамика к прошлому периоду
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-(--card-spacing)">
          {rows.map((row) => (
            <article
              key={row.category}
              className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 text-sm font-medium text-foreground">{row.category}</h3>
                <Chip tone="neutral" size="sm" numeric>
                  {row.count} замечаний
                </Chip>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>К прошлому периоду</span>
                {row.delta !== 0 ? (
                  <Chip tone={row.delta > 0 ? "danger" : "success"} size="xs" numeric>
                    {`${row.delta > 0 ? "+" : ""}${row.delta}`}
                  </Chip>
                ) : (
                  <span className="tabular-nums">без изменений</span>
                )}
                {row.highRiskCount > 0 ? (
                  <Chip tone="warning" size="xs">{`HIGH+ ${row.highRiskCount}`}</Chip>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Чаще всего отвечает: {ownerTypeLabels[row.topOwnerType]}. Было {row.previousCount}.
              </p>
              <Button
                render={
                  <Link
                    href={row.href}
                    {...reportPageLocalLinkProps(row.href)}
                  />
                }
                nativeButton={false}
                variant="outline"
                size="sm"
                className="w-fit"
              >
                {actionLabel}
              </Button>
            </article>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

// "Тональность и качество": correlates conversation sentiment against QA average score.
export function SentimentCorrelationPanel({
  correlation,
  actionHref,
  actionLabel = "Открыть проверки"
}: {
  correlation: SentimentCorrelation;
  actionHref?: string;
  actionLabel?: string;
}) {
  const { rows, scoredCount, unscoredCount, totalCount } = correlation;
  const coveragePercent = totalCount > 0 ? Math.round((scoredCount / totalCount) * 100) : 0;
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <Card className="overflow-hidden" aria-labelledby="sentiment-correlation-title">
      <CardHeader className="border-b">
        <div className="min-w-0">
          <CardTitle id="sentiment-correlation-title">Тональность и качество</CardTitle>
          <CardDescription>Средний балл проверки в разрезе тональности диалога.</CardDescription>
        </div>
        {actionHref ? (
          <CardAction>
            <Button
              render={
                <Link
                  href={actionHref}
                  {...reportPageLocalLinkProps(actionHref)}
                />
              }
              nativeButton={false}
              variant="outline"
              size="sm"
            >
              {actionLabel}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-(--card-spacing)">
        {scoredCount === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning size={22} aria-hidden="true" />}
            title="Тональность ещё не определена"
            description={
              totalCount > 0
                ? "Диалоги периода пока не размечены по тональности. Корреляция появится после авто-скоринга."
                : "Корреляция появится после первых завершённых проверок."
            }
            size="inline"
          />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {rows.map((row) => {
                const widthPercent = Math.round((row.count / maxCount) * 100);

                return (
                  <div key={row.key} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{row.label}</span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatAverageScore(row.averageScore)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full bg-primary/70 transition-[width]",
                          row.key === "negative" && "bg-destructive/70",
                          row.key === "positive" && "bg-emerald-500/70",
                          row.key === "neutral" && "bg-muted-foreground/40"
                        )}
                        style={{ width: `${row.count > 0 ? Math.max(6, widthPercent) : 0}%` }}
                      />
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {row.count > 0 ? `${row.count} проверок` : "нет проверок"}
                    </p>
                  </div>
                );
              })}
            </div>
            {unscoredCount > 0 ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="tabular-nums">
                  {coveragePercent}%
                </Badge>
                Размечено выборки. Ещё {unscoredCount} без тональности.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
