"use client";

import { useMemo } from "react";
import { Curve, Rectangle } from "recharts";
import {
  StaticChartContainer,
  type ChartConfig
} from "@/components/ui/chart-container";
import type {
  QualityTrendSeries
} from "@/components/charts/quality-trend-chart.client";
import type { DriverSeries } from "@/components/charts/ranked-driver-chart.client";
import type { ChartModel } from "@/lib/charts/contracts";
import {
  buildPairedAiDriftGeometry,
  buildQualityTrendGeometry,
  buildRankedBreakdownGeometry,
  buildReasonTrendGeometry,
  buildScoreDistributionGeometry,
  buildRankedDriverGeometry,
  fitSvgLabel,
  planXAxisTickIndexes
} from "@/lib/charts/plot-geometry";

// Task 10 hydration instrumentation (approved additive-only change): module
// evaluation of the deferred rich renderer is the app-owned
// "qc-chart-hydration-start" point. The module evaluates once per document
// (module cache), so this mark is recorded exactly once per page load; the
// measurement harness pairs it with the earliest "qc-chart-hydration-end".
if (typeof performance !== "undefined" && typeof performance.mark === "function") {
  performance.mark("qc-chart-hydration-start");
}

const qualityTrendConfig = {
  score: {
    label: "Средний балл",
    color: "var(--chart-1)"
  },
  previous: {
    label: "Прошлый период",
    color: "var(--chart-2)"
  },
  target: {
    label: "Цель",
    color: "var(--chart-4)"
  },
  volume: {
    label: "Проверки",
    color: "var(--chart-volume, var(--muted-foreground))"
  }
} satisfies ChartConfig;

const driverConfig = {
  down: {
    label: "Просадка",
    color: "var(--destructive)"
  },
  up: {
    label: "Улучшение",
    color: "var(--success)"
  }
} satisfies ChartConfig;

const distributionConfig = {
  count: {
    label: "Проверки",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

const driftConfig = {
  confidence: {
    label: "Уверенность модели",
    color: "var(--chart-1)"
  },
  reserve: {
    label: "Доля резервной оценки",
    color: "var(--chart-2)"
  }
} satisfies ChartConfig;

const reasonConfig = {
  current: {
    label: "Текущий период",
    color: "var(--chart-1)"
  },
  previous: {
    label: "Прошлый период",
    color: "var(--chart-2)"
  }
} satisfies ChartConfig;

const agreementConfig = {
  agreement: {
    label: "Согласие",
    color: "var(--chart-1)"
  },
  reference: {
    label: "Ориентир 80%",
    color: "var(--chart-4)"
  }
} satisfies ChartConfig;

function polylinePoints(points: readonly { x: number; y: number }[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function QualityTrendVisual({
  model,
  visibleSeries
}: {
  model: ChartModel<QualityTrendSeries>;
  visibleSeries: readonly QualityTrendSeries[];
}) {
  const visible = useMemo(() => new Set(visibleSeries), [visibleSeries]);
  const chartData = useMemo(
    () =>
      model.points.map((point) => ({
        id: point.id,
        label: point.label,
        score: point.values.score,
        previous: point.values.previous,
        target: point.values.target,
        volume: point.values.volume
      })),
    [model.points]
  );
  const geometry = useMemo(
    () => buildQualityTrendGeometry(model, visibleSeries),
    [model, visibleSeries]
  );
  const {
    width,
    height,
    margin,
    plotWidth,
    plotHeight,
    barWidth,
    xFor,
    yForScore,
    yForVolume
  } = geometry;
  const xTickIndexes = new Set(
    planXAxisTickIndexes(model.points.length, plotWidth)
  );
  const scoreSegments = geometry.lineSegments("score");
  const previousSegments = geometry.lineSegments("previous");
  const scorePoints = geometry.linePoints("score");
  const previousPoints = geometry.linePoints("previous");

  return (
    <StaticChartContainer
      id={model.id}
      config={qualityTrendConfig}
      className="h-[216px] w-full min-[390px]:h-[232px] md:h-[280px] xl:h-[320px]"
      initialDimension={{ width: 720, height: 320 }}
    >
      <svg
        aria-hidden="true"
        className="recharts-surface block h-full w-full"
        tabIndex={-1}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = yForScore(tick);
          return (
            <g key={tick} aria-hidden="true">
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeOpacity={0.55}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={margin.left - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {tick}
              </text>
            </g>
          );
        })}
        {chartData.map((point, index) =>
          xTickIndexes.has(index) ? (
            <text
              key={point.id}
              data-slot="x-axis-tick"
              x={xFor(index)}
              y={height - 12}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize={11}
            >
              {point.label}
            </text>
          ) : null
        )}
        {visible.has("volume") ? (
          <g
            data-series="volume"
            data-tone="neutral"
            data-animation-active="false"
          >
            {chartData.map((point, index) => {
              const barY = yForVolume(point.volume ?? 0);
              const barHeight = margin.top + plotHeight - barY;
              return (
                <Rectangle
                  key={point.id}
                  x={xFor(index) - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  radius={[3, 3, 0, 0]}
                  fill="var(--color-volume)"
                  fillOpacity={0.22}
                />
              );
            })}
          </g>
        ) : null}
        {visible.has("previous") ? (
          <g
            data-series="previous"
            data-marker="diamond"
            data-animation-active="false"
            strokeDasharray="6 5"
            data-segment-count={previousSegments.length}
          >
            {previousSegments.map((segment, index) => (
              <Curve
                key={`segment-${index}`}
                type="linear"
                points={segment}
                fill="none"
                stroke="var(--color-previous)"
                strokeWidth={1.5}
                strokeDasharray="6 5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {previousPoints.map((point) => (
              <rect
                key={point.pointId}
                data-point-id={point.pointId}
                x={point.x - 3}
                y={point.y - 3}
                width={6}
                height={6}
                fill="var(--background)"
                stroke="var(--color-previous)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                transform={`rotate(45 ${point.x} ${point.y})`}
              />
            ))}
          </g>
        ) : null}
        {visible.has("score") ? (
          <g
            data-series="score"
            data-animation-active="false"
            data-segment-count={scoreSegments.length}
          >
            {scoreSegments.map((segment, index) => (
              <Curve
                key={`segment-${index}`}
                type="linear"
                points={segment}
                fill="none"
                stroke="var(--color-score)"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {scorePoints.map((point) => (
              <circle
                key={point.pointId}
                data-point-id={point.pointId}
                cx={point.x}
                cy={point.y}
                r={3}
                fill="var(--background)"
                stroke="var(--color-score)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ) : null}
        {visible.has("target") ? (
          <g
            data-series="target"
            aria-label={`Цель ${geometry.targetValue ?? 90} баллов`}
          >
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={yForScore(geometry.targetValue ?? 90)}
              y2={yForScore(geometry.targetValue ?? 90)}
              stroke="var(--color-target)"
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={width - margin.right}
              y={yForScore(geometry.targetValue ?? 90) - 6}
              textAnchor="end"
              fill="var(--muted-foreground)"
              fontSize={11}
            >
              Цель {geometry.targetValue ?? 90}
            </text>
          </g>
        ) : null}
      </svg>
    </StaticChartContainer>
  );
}

export function RankedDriverVisual({
  model,
  height
}: {
  model: ChartModel<DriverSeries>;
  height: number;
}) {
  const geometry = useMemo(
    () => buildRankedDriverGeometry(model, height),
    [height, model]
  );
  const { width, margin, zeroX } = geometry;

  return (
    <StaticChartContainer
      id={model.id}
      config={driverConfig}
      className="w-full"
      style={{ height }}
      initialDimension={{ width: 440, height }}
    >
      <svg
        aria-hidden="true"
        className="recharts-surface block h-full w-full"
        tabIndex={-1}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <line
          data-slot="ranked-zero-line"
          x1={zeroX}
          x2={zeroX}
          y1={margin.top}
          y2={height - margin.bottom}
          stroke="var(--border)"
          vectorEffect="non-scaling-stroke"
        />
        <g
          data-series="down"
          data-direction="negative"
          data-animation-active="false"
        >
          {model.points.map((point, index) => {
            const bar = geometry.bar(index);
            if (!bar || bar.value >= 0) {
              return null;
            }
            return (
              <Rectangle
                key={point.id}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                radius={[3, 0, 0, 3]}
                fill="var(--color-down)"
              />
            );
          })}
        </g>
        <g
          data-series="up"
          data-direction="positive"
          data-animation-active="false"
        >
          {model.points.map((point, index) => {
            const bar = geometry.bar(index);
            if (!bar || bar.value <= 0) {
              return null;
            }
            return (
              <Rectangle
                key={point.id}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                radius={[0, 3, 3, 0]}
                fill="var(--color-up)"
              />
            );
          })}
        </g>
        {model.points.map((point, index) => {
          const label = fitSvgLabel(point.label, geometry.labelMaxWidth);
          return (
            <text
              key={point.id}
              x={margin.left - 8}
              y={geometry.yFor(index) + 4}
              textAnchor="end"
              fill="var(--muted-foreground)"
              fontSize={11}
            >
              {label.truncated ? <title>{point.label}</title> : null}
              {label.text}
            </text>
          );
        })}
      </svg>
    </StaticChartContainer>
  );
}

export function ScoreDistributionVisual({
  model
}: {
  model: ChartModel<"count">;
}) {
  const geometry = useMemo(
    () => buildScoreDistributionGeometry(model),
    [model]
  );
  const { width, height, margin, plotHeight } = geometry;

  return (
    <StaticChartContainer
      id={model.id}
      config={distributionConfig}
      className="h-[200px] w-full min-[390px]:h-[216px] md:h-[240px] xl:h-[260px]"
      initialDimension={{ width, height }}
    >
      <svg
        aria-hidden="true"
        className="recharts-surface block h-full w-full"
        tabIndex={-1}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        data-animation-active="false"
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = margin.top + plotHeight * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeOpacity={0.55}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <g data-series="count">
          {geometry.bars.map((bar, index) => (
            <g key={bar.pointId}>
              <rect
                data-point-id={bar.pointId}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={4}
                fill="var(--color-count)"
              />
              <text
                x={bar.x + bar.width / 2}
                y={height - 14}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {model.points[index].label}
              </text>
              <text
                x={bar.x + bar.width / 2}
                y={Math.max(margin.top + 12, bar.y - 7)}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize={11}
                fontWeight={600}
              >
                {bar.value}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </StaticChartContainer>
  );
}

export function PairedAiDriftVisual({
  model
}: {
  model: ChartModel<"confidence" | "reserve">;
}) {
  const geometry = useMemo(() => buildPairedAiDriftGeometry(model), [model]);
  const {
    width,
    height,
    margin,
    plotWidth,
    panelHeight,
    confidenceTop,
    reserveTop,
    xFor
  } = geometry;
  const xTickIndexes = new Set(
    planXAxisTickIndexes(model.points.length, plotWidth)
  );
  const confidenceSegments = geometry.lineSegments("confidence");
  const reserveSegments = geometry.lineSegments("reserve");

  return (
    <StaticChartContainer
      id={model.id}
      config={driftConfig}
      className="h-[340px] w-full sm:h-[380px]"
      initialDimension={{ width, height }}
    >
      <svg
        aria-hidden="true"
        className="recharts-surface block h-full w-full"
        tabIndex={-1}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        data-animation-active="false"
      >
        {[
          ["Уверенность модели", confidenceTop],
          ["Доля резервной оценки", reserveTop]
        ].map(([label, top]) => (
          <g key={String(label)}>
            <text
              x={margin.left}
              y={Number(top) - 7}
              fill="var(--muted-foreground)"
              fontSize={11}
            >
              {label}
            </text>
            {[0, 50, 100].map((tick) => {
              const y = Number(top) + panelHeight * (1 - tick / 100);
              return (
                <g key={tick}>
                  <line
                    x1={margin.left}
                    x2={width - margin.right}
                    y1={y}
                    y2={y}
                    stroke="var(--border)"
                    strokeOpacity={0.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={margin.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="var(--muted-foreground)"
                    fontSize={10}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
        <g
          data-series="confidence"
          data-segment-count={confidenceSegments.length}
        >
          {confidenceSegments.map((segment, index) => (
            <polyline
              key={index}
              points={polylinePoints(segment)}
              fill="none"
              stroke="var(--color-confidence)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {confidenceSegments.flat().map((point) => (
            <circle
              key={point.pointId}
              data-point-id={point.pointId}
              cx={point.x}
              cy={point.y}
              r={3}
              fill="var(--background)"
              stroke="var(--color-confidence)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <g
          data-series="reserve"
          data-segment-count={reserveSegments.length}
        >
          {reserveSegments.map((segment, index) => (
            <polyline
              key={index}
              points={polylinePoints(segment)}
              fill="none"
              stroke="var(--color-reserve)"
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {reserveSegments.flat().map((point) => (
            <circle
              key={point.pointId}
              data-point-id={point.pointId}
              cx={point.x}
              cy={point.y}
              r={3}
              fill="var(--background)"
              stroke="var(--color-reserve)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {model.points.map((point, index) =>
          xTickIndexes.has(index) ? (
            <text
              key={point.id}
              data-slot="x-axis-tick"
              x={xFor(index)}
              y={height - 12}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize={10}
            >
              {point.label}
            </text>
          ) : null
        )}
      </svg>
    </StaticChartContainer>
  );
}

export function ReasonTrendVisual({
  model
}: {
  model: ChartModel<"current" | "previous">;
}) {
  const geometry = useMemo(() => buildReasonTrendGeometry(model), [model]);
  const { width, height, margin, plotWidth, plotHeight, maximum, xFor, yFor } =
    geometry;
  const xTickIndexes = new Set(
    planXAxisTickIndexes(model.points.length, plotWidth)
  );
  const currentSegments = geometry.lineSegments("current");
  const previousSegments = geometry.lineSegments("previous");

  return (
    <StaticChartContainer
      id={model.id}
      config={reasonConfig}
      className="h-[200px] w-full min-[390px]:h-[216px] md:h-[240px] xl:h-[260px]"
      initialDimension={{ width, height }}
    >
      <svg
        aria-hidden="true"
        className="recharts-surface block h-full w-full"
        tabIndex={-1}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        data-animation-active="false"
      >
        {[0, 0.5, 1].map((ratio) => {
          const value = maximum * ratio;
          const y = yFor(value);
          return (
            <g key={ratio}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeOpacity={0.5}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={margin.left - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize={10}
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}
        <g
          data-series="previous"
          data-segment-count={previousSegments.length}
        >
          {previousSegments.map((segment, index) => (
            <polyline
              key={index}
              points={polylinePoints(segment)}
              fill="none"
              stroke="var(--color-previous)"
              strokeWidth={1.75}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <g data-series="current" data-segment-count={currentSegments.length}>
          {currentSegments.map((segment, index) => (
            <polyline
              key={index}
              points={polylinePoints(segment)}
              fill="none"
              stroke="var(--color-current)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {model.points.map((point, index) =>
          xTickIndexes.has(index) ? (
            <text
              key={point.id}
              data-slot="x-axis-tick"
              x={xFor(index)}
              y={margin.top + plotHeight + 24}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize={10}
            >
              {point.label}
            </text>
          ) : null
        )}
      </svg>
    </StaticChartContainer>
  );
}

export function RankedBreakdownVisual({
  model
}: {
  model: ChartModel<"agreement" | "reference">;
}) {
  const geometry = useMemo(
    () => buildRankedBreakdownGeometry(model),
    [model]
  );
  const { width, height, margin, referenceX } = geometry;

  return (
    <StaticChartContainer
      id={model.id}
      config={agreementConfig}
      className="w-full"
      style={{ height }}
      initialDimension={{ width, height }}
    >
      <svg
        aria-hidden="true"
        className="recharts-surface block h-full w-full"
        tabIndex={-1}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        data-animation-active="false"
      >
        <line
          data-slot="agreement-reference"
          data-reference-value={geometry.referenceValue}
          x1={referenceX}
          x2={referenceX}
          y1={margin.top}
          y2={height - margin.bottom}
          stroke="var(--color-reference)"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <g data-series="agreement">
          {geometry.bars.map((bar, index) => {
            // Labels that fit stay inside the bar in primary-foreground; the
            // fallback (null or narrow bar) would render white-on-card, so it
            // moves past the bar end in muted-foreground instead.
            const labelInside = bar.x + bar.width - 6 >= margin.left + 22;
            return (
            <g key={bar.pointId}>
              <rect
                data-point-id={bar.pointId}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={4}
                fill="var(--color-agreement)"
              />
              <text
                x={margin.left - 8}
                y={geometry.yFor(index) + 4}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {model.points[index].label}
              </text>
              <text
                x={
                  labelInside
                    ? bar.x + bar.width - 6
                    : bar.x + bar.width + 6
                }
                y={geometry.yFor(index) + 4}
                textAnchor={labelInside ? "end" : "start"}
                fill={
                  labelInside
                    ? "var(--primary-foreground)"
                    : "var(--muted-foreground)"
                }
                fontSize={10}
              >
                {bar.value == null ? "—" : `${Math.round(bar.value)}%`}
              </text>
            </g>
            );
          })}
        </g>
      </svg>
    </StaticChartContainer>
  );
}
