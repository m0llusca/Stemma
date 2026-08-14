"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ChartFrame } from "@/components/charts/chart-frame";
import {
  QualityTrendChart,
  type QualityTrendSeries
} from "@/components/charts/quality-trend-chart.client";
import {
  chartViewFromHref,
  eventTimeReportHref,
  type ChartView
} from "@/components/charts/chart-view-links";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { ChartModel } from "@/lib/charts/contracts";

// Minimum finalized reviews before the score trend is considered
// representative; ChartFrame warns "Недостаточно выборки" below this floor.
export const SCORE_PANEL_MINIMUM_SAMPLE_SIZE = 5;

function visibleTrendModel(
  model: ChartModel<QualityTrendSeries>,
  visibleSeries: readonly QualityTrendSeries[]
): ChartModel<QualityTrendSeries> {
  const visible = new Set(visibleSeries);

  return {
    ...model,
    series: model.series.filter((series) => visible.has(series.key)),
    points: model.points.map((point) => ({
      ...point,
      values: Object.fromEntries(
        model.series
          .filter((series) => visible.has(series.key))
          .map((series) => [series.key, point.values[series.key]])
      ) as Record<QualityTrendSeries, number | null>
    }))
  };
}

// The address bar owns the trend panel's presentation state. Series toggles
// and the Graph/Table switch commit through the native History API (the App
// Router can drop navigation commits on a fresh page load on Next 16.2.x), so
// the panel derives its live view and series from the current search params
// and only falls back to the server-rendered props when the URL carries no
// usable value.
function liveTrendSeries(
  seriesParam: string | null,
  orderedKeys: readonly QualityTrendSeries[],
  fallback: readonly QualityTrendSeries[]
): readonly QualityTrendSeries[] {
  if (!seriesParam) {
    return fallback;
  }

  const requested = seriesParam.split(",");
  if (new Set(requested).size !== requested.length) {
    return fallback;
  }

  const filtered = orderedKeys.filter((key) => requested.includes(key));
  return filtered.length > 0 && filtered.length === requested.length
    ? filtered
    : fallback;
}

export function PrimaryScorePanel({
  finalizedCount,
  previousCount,
  model,
  visibleSeries,
  view,
  currentHref,
  periodLabel
}: {
  finalizedCount: number;
  previousCount: number;
  model: ChartModel<QualityTrendSeries>;
  visibleSeries: readonly QualityTrendSeries[];
  view: ChartView;
  currentHref: string;
  periodLabel: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const hookHref = `${pathname}${search ? `?${search}` : ""}`;
  const liveHref = eventTimeReportHref(hookHref, currentHref);
  const liveView = chartViewFromHref(liveHref) ?? view;
  const liveSeries = liveTrendSeries(
    searchParams.get("series"),
    model.series.map((series) => series.key),
    visibleSeries
  );
  const visibleModel = visibleTrendModel(model, liveSeries);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1 px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Средняя оценка за период
        </span>
        <HelpTooltip
          label="Как считать оценку в баллах?"
          content="Итоговая оценка хранится как нормализованное значение от 0 до 100 и показывается как баллы."
          placement="top-start"
        />
      </div>
      <ChartFrame
        model={visibleModel}
        view={liveView}
        currentHref={liveHref}
        periodLabel={periodLabel}
        sample={{
          size: finalizedCount,
          denominator: finalizedCount + previousCount,
          minimum: SCORE_PANEL_MINIMUM_SAMPLE_SIZE
        }}
        state={
          finalizedCount === 0
            ? { kind: "empty" }
            : { kind: "ready" }
        }
        graph={
          <QualityTrendChart
            model={model}
            visibleSeries={liveSeries}
            currentHref={liveHref}
          />
        }
      />
    </div>
  );
}
