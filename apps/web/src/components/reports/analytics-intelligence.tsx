import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Grid2x2 } from "lucide-react";
import { ChartFrame } from "@/components/charts/chart-frame";
import { PairedAiDriftCharts } from "@/components/charts/paired-ai-drift-charts.client";
import { RankedBreakdownChart } from "@/components/charts/ranked-breakdown-chart.client";
import type { ChartView } from "@/components/charts/chart-view-links";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { formatQualityScore } from "@/lib/score-display";
import type { AiHumanAgreementReport } from "@/lib/ai-quality/agreement-report";
import type { AiScoreDrift } from "@/lib/ai-quality/drift";
import type {
  AgreementSeries,
  AiDriftSeries,
  ReportChartBundle
} from "@/lib/reports/report-chart-models";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
import { cn } from "@/lib/utils";

export type MetricInsightTone = "neutral" | "ok" | "warn" | "danger";

export type MetricInsightItem = {
  label: string;
  value: string;
  detail: string;
  progress: number | null;
  progressLabel: string;
  explanation?: ReactNode;
  explanationLabel?: string;
  href?: string;
  tone?: MetricInsightTone;
};

export type CriterionHeatmapRow = {
  label: string;
  score: number | null;
  count: number;
  detail: string;
};

const metricToneRing: Record<MetricInsightTone, string> = {
  neutral: "ring-border",
  ok: "ring-emerald-500/30",
  warn: "ring-amber-500/35",
  danger: "ring-destructive/35"
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function roundedProgress(value: number | null) {
  return value == null ? null : Math.round(clampPercent(value));
}

function formatProgress(value: number | null) {
  const progress = roundedProgress(value);

  return progress == null ? "нет данных" : `${progress}%`;
}

/**
 * Single-hue intensity bucket. Lower scores read as denser fill, not traffic-light hues.
 */
function intensityClass(score: number | null) {
  if (score == null) {
    return "bg-muted text-muted-foreground";
  }

  if (score >= 90) {
    return "bg-primary/10 text-foreground";
  }

  if (score >= 80) {
    return "bg-primary/20 text-foreground";
  }

  if (score >= 70) {
    return "bg-primary/35 text-foreground";
  }

  return "bg-primary text-primary-foreground";
}

function averageScore(rows: CriterionHeatmapRow[]) {
  const values = rows
    .map((row) => row.score)
    .filter((score): score is number => score != null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

export function MetricInsightStrip({
  title,
  description,
  items
}: {
  title: string;
  description: string;
  items: MetricInsightItem[];
}) {
  return (
    <Card aria-labelledby="analytics-insight-strip-title">
      <CardHeader className="border-b sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardDescription>Интеллект периода</CardDescription>
          <CardTitle id="analytics-insight-strip-title">{title}</CardTitle>
        </div>
        <p className="max-w-md text-sm text-muted-foreground sm:text-right">{description}</p>
      </CardHeader>

      <CardContent className="grid gap-3 pt-(--card-spacing) md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const progress = roundedProgress(item.progress);
          return (
            <article
              key={item.label}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-lg bg-muted/20 p-3 ring-1",
                metricToneRing[item.tone ?? "neutral"]
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="truncate">{item.label}</span>
                  {item.explanation ? (
                    <HelpTooltip
                      label={item.explanationLabel ?? `Что значит сигнал ${item.label}?`}
                      content={item.explanation}
                      placement="top-start"
                    />
                  ) : null}
                </span>
                <strong className="shrink-0 text-base font-semibold tabular-nums text-foreground">
                  {item.value}
                </strong>
              </div>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
              {progress == null ? (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{item.progressLabel}</span>
                  <strong className="font-medium">нет данных</strong>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{item.progressLabel}</span>
                    <strong className="font-medium tabular-nums">{formatProgress(item.progress)}</strong>
                  </div>
                  <div
                    aria-label={`${item.label}: ${item.progressLabel}, ${progress}%`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={progress}
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {item.href ? (
                <Button
                  render={
                    <Link
                      href={item.href}
                      {...reportPageLocalLinkProps(item.href)}
                    />
                  }
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  className="mt-auto w-fit"
                >
                  Открыть срез
                  <span className="sr-only"> {item.label}</span>
                </Button>
              ) : null}
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function CriterionHeatmapPanel({
  title,
  description,
  rows,
  actionHref,
  actionLabel = "Разрезы"
}: {
  title: string;
  description: string;
  rows: CriterionHeatmapRow[];
  actionHref: string;
  actionLabel?: string;
}) {
  const sortedRows = [...rows].sort((left, right) => {
    if (left.score == null && right.score == null) {
      return left.label.localeCompare(right.label, "ru");
    }

    if (left.score == null) {
      return 1;
    }

    if (right.score == null) {
      return -1;
    }

    return left.score - right.score || left.label.localeCompare(right.label, "ru");
  });
  const evaluatedRows = sortedRows.filter((row) => row.score != null);
  const average = averageScore(sortedRows);
  const weakest = evaluatedRows[0];
  const totalEvaluations = sortedRows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card aria-labelledby="criterion-heatmap-title">
      <CardHeader className="border-b">
        <div className="min-w-0">
          <CardTitle id="criterion-heatmap-title">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
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
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
        <div className="grid gap-2 sm:grid-cols-3" aria-label="Сводка карты критериев">
          <article className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Среднее по блокам
            </span>
            <strong className="text-lg font-semibold tabular-nums">
              {average == null ? "—" : formatQualityScore(average)}
            </strong>
            <small className="text-xs text-muted-foreground">
              {sortedRows.length > 0 ? `${sortedRows.length} блоков в карте` : "Блоки появятся после оценок"}
            </small>
          </article>
          <article className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Слабая зона
            </span>
            <strong className="text-sm font-semibold">{weakest ? weakest.label : "—"}</strong>
            <small className="text-xs text-muted-foreground">
              {weakest
                ? `${formatQualityScore(weakest.score ?? 0)}, ${weakest.detail}`
                : "Пока нет оцененных критериев"}
            </small>
          </article>
          <article className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Оценки критериев
            </span>
            <strong className="text-lg font-semibold tabular-nums">{totalEvaluations}</strong>
            <small className="text-xs text-muted-foreground">
              Нормализованные баллы по оцененным критериям
            </small>
          </article>
        </div>

        {sortedRows.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2" aria-label="Карта блоков критериев">
              {sortedRows.map((row) => {
                const score = row.score == null ? null : Math.round(row.score);
                const progress = roundedProgress(score);

                return (
                  <li key={row.label} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{row.label}</span>
                      <span className="text-xs text-muted-foreground">{row.detail}</span>
                    </div>
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md px-2.5 py-2",
                        intensityClass(score)
                      )}
                    >
                      <span className="text-sm font-semibold tabular-nums">
                        {score == null ? "—" : formatQualityScore(score)}
                      </span>
                      <span
                        aria-label={`${row.label}: ${score == null ? "нет данных" : formatQualityScore(score)}`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={progress ?? undefined}
                        className="h-1.5 w-24 overflow-hidden rounded-full bg-background/50"
                        role={progress == null ? undefined : "progressbar"}
                      >
                        <span
                          className="block h-full rounded-full bg-current opacity-80"
                          style={{ width: `${progress ?? 0}%` }}
                        />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div
              className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              aria-label="Легенда: насыщенность заливки растет при низком балле"
            >
              <span className="inline-flex items-center gap-1" aria-hidden="true">
                <i className="size-3 rounded-sm bg-primary/10" />
                <i className="size-3 rounded-sm bg-primary/20" />
                <i className="size-3 rounded-sm bg-primary/35" />
                <i className="size-3 rounded-sm bg-primary" />
              </span>
              <span>Выше балл — светлее, ниже балл — плотнее заливка</span>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Grid2x2 size={22} aria-hidden="true" />}
            title="Нет оцененных критериев"
            description="Блоки критериев появятся после первых завершенных проверок за период."
            size="inline"
          />
        )}
      </CardContent>
    </Card>
  );
}

function missingComparisonCopy(
  comparison: ReportChartBundle<string>["comparison"]
) {
  return comparison.status === "missing" ? (
    <p className="text-sm text-muted-foreground">{comparison.message}</p>
  ) : null;
}

export function AiAgreementPanel({
  report,
  bundle,
  view,
  currentHref,
  periodLabel
}: {
  report: AiHumanAgreementReport | null;
  bundle: ReportChartBundle<AgreementSeries>;
  view: ChartView;
  currentHref: string;
  periodLabel: string;
}) {
  return (
    <section
      aria-label="AI↔человек: согласие"
      className="flex min-w-0 flex-col gap-4"
    >
      {!bundle.isEmpty && report ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Согласие AI и людей"
            value={`${Math.round((report.aggregate.agreementRate ?? 0) * 100)}%`}
            hint={`${report.aggregate.agreeCount} из ${report.aggregate.comparedCount} совпадений по критериям`}
            tone={
              (report.aggregate.agreementRate ?? 0) >= 0.8
                ? "positive"
                : (report.aggregate.agreementRate ?? 0) >= 0.6
                  ? "warning"
                  : "negative"
            }
          />
          <StatCard
            label="Сравнено диалогов"
            value={report.aiComparedConversations}
            hint={`из ${report.reviewsConsidered} финализированных ревью`}
            tone="info"
          />
          <StatCard
            label="Ср. расхождение (1–3)"
            value={
              report.aggregate.meanScaleDelta != null
                ? report.aggregate.meanScaleDelta.toFixed(2)
                : "—"
            }
            hint="Средняя |AI − человек| по балльным критериям"
            tone={
              report.aggregate.meanScaleDelta == null
                ? "neutral"
                : report.aggregate.meanScaleDelta <= 0.3
                  ? "positive"
                  : report.aggregate.meanScaleDelta <= 0.7
                    ? "warning"
                    : "negative"
            }
          />
        </div>
      ) : null}
      {missingComparisonCopy(bundle.comparison)}
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
            <RankedBreakdownChart model={bundle.model} />
          ) : undefined
        }
      />
    </section>
  );
}

function productizedRegressionDetail(
  regression: AiScoreDrift["regressions"][number]
) {
  return regression.kind === "fallback_spike"
    ? regression.detail.replace(
        /Доля детерминированного (?:фолбэка|fallback)/i,
        "Доля резервной оценки"
      )
    : regression.detail;
}

export function AiDriftPanel({
  report,
  bundle,
  view,
  currentHref,
  periodLabel
}: {
  report: AiScoreDrift | null;
  bundle: ReportChartBundle<AiDriftSeries>;
  view: ChartView;
  currentHref: string;
  periodLabel: string;
}) {
  const latest = report?.buckets[report.buckets.length - 1];

  return (
    <section
      aria-label="Дрейф AI-оценки"
      className="flex min-w-0 flex-col gap-4"
    >
      {latest ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Уверенность модели"
            value={
              latest.meanConfidence == null
                ? "—"
                : `${Math.round(latest.meanConfidence * 100)}%`
            }
            hint={`${latest.periodStart} · оценок: ${latest.count}`}
            tone={
              latest.meanConfidence == null
                ? "neutral"
                : latest.meanConfidence >= 0.8
                  ? "positive"
                  : latest.meanConfidence >= 0.6
                    ? "warning"
                    : "negative"
            }
          />
          <StatCard
            label="Доля резервной оценки"
            value={`${Math.round(latest.fallbackRate * 100)}%`}
            hint="Доля запусков с резервным движком"
            tone={
              latest.fallbackRate <= 0.2
                ? "positive"
                : latest.fallbackRate <= 0.5
                  ? "warning"
                  : "negative"
            }
          />
          <StatCard
            label="Регрессии"
            value={report?.regressions.length ?? 0}
            hint="Падения уверенности и рост доли резервной оценки"
            tone={
              (report?.regressions.length ?? 0) === 0
                ? "positive"
                : "negative"
            }
          />
        </div>
      ) : null}
      {report && report.regressions.length > 0 ? (
        <div className="flex flex-col gap-2">
          {report.regressions.map((regression, index) => (
            <article
              key={`${regression.periodStart}-${regression.kind}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3"
            >
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-destructive">
                  {regression.kind === "confidence_drop"
                    ? "Падение уверенности"
                    : "Рост доли резервной оценки"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {regression.periodStart} ·{" "}
                  {productizedRegressionDetail(regression)}
                </p>
              </div>
              <AlertTriangle
                size={18}
                aria-hidden="true"
                className="shrink-0 text-destructive"
              />
            </article>
          ))}
        </div>
      ) : null}
      {missingComparisonCopy(bundle.comparison)}
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
            <PairedAiDriftCharts model={bundle.model} />
          ) : undefined
        }
      />
    </section>
  );
}
