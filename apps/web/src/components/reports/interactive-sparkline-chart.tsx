"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CHART_MARKER_RADIUS,
  CHART_MARKER_RADIUS_LAST,
  CHART_SERIES_STROKE,
  CHART_SERIES_STROKE_WIDTH,
  ChartEnter,
  ChartGoalBadge,
  ChartScaleFooter,
  SCORE_OVER_TIME_MIN_HEIGHT_CLASS,
  SCORE_OVER_TIME_PLOT_HEIGHT
} from "@/components/charts/chart-visual-preset";
import {
  SCORE_OVER_TIME_FALLBACK_WIDTH,
  buildSparklineGeometry,
  sparklineHitRegions,
  sparklinePath
} from "@/lib/charts/sparkline-geometry";
import { formatQualityScore, formatQualityScoreDelta, qualityScoreDelta } from "@/lib/score-display";
import type { ChartDatum } from "@/components/reports/report-charts";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";

type SparklinePoint = ChartDatum & {
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
  delta: number | null;
  tooltip: string;
};

type InteractiveSparklineChartProps = {
  points: ChartDatum[];
  target?: number;
  annotation?: string;
};

function pointDeltaLabel(delta: number | null) {
  if (delta == null) {
    return "первая точка периода";
  }

  if (delta === 0) {
    return "без изменений к предыдущей точке";
  }

  return `${formatQualityScoreDelta(delta)} к предыдущей точке`;
}

function buildTooltip(point: ChartDatum, delta: number | null) {
  return [point.label, formatQualityScore(point.value), point.detail, pointDeltaLabel(delta)].filter(Boolean).join(", ");
}

export function InteractiveSparklineChart({
  points,
  target,
  annotation
}: InteractiveSparklineChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const tooltipIdPrefix = useId();
  // Measure the real plot width so the chart geometry is built 1:1 in CSS pixels.
  // A fixed viewBox stretched with preserveAspectRatio="none" turns markers into
  // ellipses and was squashing the score-over-time card on wide Lead columns.
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState<number | null>(null);

  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) {
        setPlotWidth(width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const chart = useMemo(() => {
    if (points.length === 0) {
      return null;
    }

    const geometry = buildSparklineGeometry(points, {
      width: plotWidth ?? SCORE_OVER_TIME_FALLBACK_WIDTH,
      height: SCORE_OVER_TIME_PLOT_HEIGHT,
      target
    });
    const nextPoints = geometry.mapped.map((point, index): SparklinePoint => {
      const delta = index === 0 ? null : qualityScoreDelta(point.value, points[index - 1].value);

      return {
        ...point,
        delta,
        tooltip: buildTooltip(point, delta)
      };
    });

    return {
      height: geometry.height,
      max: geometry.max,
      min: geometry.min,
      padX: geometry.padX,
      padY: geometry.padY,
      path: sparklinePath(nextPoints),
      points: nextPoints,
      range: geometry.range,
      targetY: geometry.targetY,
      width: geometry.width
    };
  }, [points, target, plotWidth]);

  if (!chart) {
    return <p className="text-sm text-muted-foreground">Нет завершенных проверок за выбранный период.</p>;
  }

  const firstPoint = chart.points[0];
  const lastPoint = chart.points[chart.points.length - 1];
  const hitRegions = sparklineHitRegions(chart.points.map((point) => point.xPercent));
  const targetBandY = chart.targetY == null ? null : Math.max(0, Math.min(chart.height, chart.targetY));
  const gridTicks = [0, 0.5, 1];

  return (
    <ChartEnter
      data-slot="interactive-sparkline-chart"
      className="grid gap-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Начало периода</p>
          <strong className="mt-0.5 block text-lg font-semibold tabular-nums text-foreground">
            {formatQualityScore(firstPoint.value)}
          </strong>
          <span className="text-xs text-muted-foreground">{firstPoint.label}</span>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground">Последняя точка</p>
          <strong className="mt-0.5 block text-lg font-semibold tabular-nums text-foreground">
            {formatQualityScore(lastPoint.value)}
          </strong>
          <span className="text-xs text-muted-foreground">{lastPoint.label}</span>
        </div>
      </div>

      <div
        className={`relative ${SCORE_OVER_TIME_MIN_HEIGHT_CLASS} overflow-visible rounded-lg border border-border bg-card px-2.5 pb-3 pt-10`}
        ref={plotRef}
      >
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          width="100%"
          height={chart.height}
          className="block overflow-visible"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Тренд средней оценки"
          focusable="false"
        >
          {gridTicks.map((ratio) => {
            const y = chart.padY + (1 - ratio) * (chart.height - chart.padY * 2);

            return (
              <line
                key={ratio}
                x1={chart.padX}
                x2={chart.width - chart.padX}
                y1={y}
                y2={y}
                aria-hidden="true"
                data-slot="sparkline-grid"
                stroke="var(--border)"
                strokeOpacity={0.55}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {targetBandY != null ? (
            <rect
              x={chart.padX}
              y={chart.padY}
              width={chart.width - chart.padX * 2}
              height={Math.max(0, targetBandY - chart.padY)}
              aria-hidden="true"
              data-slot="sparkline-target-band"
              fill="color-mix(in srgb, var(--chart-2) 8%, transparent)"
            />
          ) : null}
          <line
            x1={chart.padX}
            y1={chart.height - chart.padY}
            x2={chart.width - chart.padX}
            y2={chart.height - chart.padY}
            aria-hidden="true"
            data-slot="sparkline-axis"
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {chart.targetY != null ? (
            <line
              x1={chart.padX}
              y1={chart.targetY}
              x2={chart.width - chart.padX}
              y2={chart.targetY}
              aria-hidden="true"
              data-slot="sparkline-target"
              stroke="color-mix(in srgb, var(--chart-2) 56%, var(--border))"
              strokeDasharray="6 6"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <path
            d={chart.path}
            data-slot="sparkline-line"
            fill="none"
            stroke={CHART_SERIES_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={CHART_SERIES_STROKE_WIDTH}
            vectorEffect="non-scaling-stroke"
          />
          {chart.points.map((point, index) => {
            const isLatest = index === chart.points.length - 1;

            return (
              <g key={`${point.label}:${index}`}>
                <title>{point.tooltip}</title>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isLatest ? CHART_MARKER_RADIUS_LAST : CHART_MARKER_RADIUS}
                  data-slot="sparkline-point"
                  fill={CHART_SERIES_STROKE}
                  stroke={CHART_SERIES_STROKE}
                  strokeWidth={CHART_SERIES_STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        {target != null ? (
          <ChartGoalBadge
            value={target}
            slot="sparkline-target-label"
            className="right-2.5 top-2"
          />
        ) : null}
        <div className="pointer-events-none absolute inset-x-2.5 bottom-3 h-[200px]">
          {chart.points.map((point, index) => {
            const showPoint = () => setActiveIndex(index);
            const hidePoint = () => setActiveIndex(null);
            const isActive = index === activeIndex;
            const tooltipId = `${tooltipIdPrefix}-point-${index}`;
            const region = hitRegions[index] ?? { left: 0, width: 100 };
            const pointControlClass =
              "group absolute inset-y-0 pointer-events-auto border-0 bg-transparent p-0 text-left outline-none";
            const tooltipBelowPoint = point.yPercent < 44;
            const tooltipStyle =
              point.xPercent < 32
                ? {
                    left: "0%",
                    transform: tooltipBelowPoint
                      ? "translateY(12px)"
                      : "translateY(calc(-100% - 12px))"
                  }
                : point.xPercent > 68
                  ? {
                      right: "0%",
                      transform: tooltipBelowPoint
                        ? "translateY(12px)"
                        : "translateY(calc(-100% - 12px))"
                    }
                  : {
                      left: "50%",
                      transform: tooltipBelowPoint
                        ? "translate(-50%, 12px)"
                        : "translate(-50%, calc(-100% - 12px))"
                    };
            const content = (
              <>
                <span
                  aria-hidden="true"
                  data-slot="sparkline-focus-ring"
                  className="pointer-events-none absolute size-6 rounded-full opacity-0 ring-2 ring-ring ring-offset-2 ring-offset-card transition-opacity group-focus-visible:opacity-100"
                  style={{
                    left: `${point.xPercent}%`,
                    top: `${point.yPercent}%`,
                    transform: "translate(-50%, -50%)"
                  }}
                />
                {isActive ? (
                  <span
                    id={tooltipId}
                    role="tooltip"
                    className="pointer-events-none absolute z-10 grid w-[min(210px,calc(100vw-48px))] gap-0.5 rounded-lg border border-primary/40 bg-popover px-2.5 py-2 text-left shadow-md"
                    style={{ top: `${point.yPercent}%`, ...tooltipStyle }}
                  >
                    <strong className="text-xs font-semibold leading-tight text-popover-foreground">
                      {point.label}
                    </strong>
                    <span className="text-sm font-semibold tabular-nums text-primary">
                      {formatQualityScore(point.value)}
                    </span>
                    <small className="text-xs leading-snug text-muted-foreground">
                      {[point.detail, pointDeltaLabel(point.delta)].filter(Boolean).join(", ")}
                    </small>
                  </span>
                ) : null}
              </>
            );
            const controlProps = {
              "aria-label": point.href ? `${point.tooltip}. Открыть проверки` : point.tooltip,
              "aria-describedby": isActive ? tooltipId : undefined,
              className: pointControlClass,
              style: {
                left: `${region.left}%`,
                width: `${region.width}%`
              },
              onFocus: showPoint,
              onBlur: hidePoint,
              onMouseEnter: showPoint,
              onMouseLeave: hidePoint,
              onPointerEnter: showPoint,
              onPointerLeave: hidePoint
            };

            return point.href ? (
              <Link
                key={`${point.label}:${index}:hit`}
                href={point.href}
                {...reportPageLocalLinkProps(point.href)}
                {...controlProps}
              >
                {content}
              </Link>
            ) : (
              <button key={`${point.label}:${index}:hit`} type="button" {...controlProps}>
                {content}
              </button>
            );
          })}
        </div>
      </div>

      <ChartScaleFooter
        min={chart.min}
        max={chart.max}
        target={target}
        formatValue={formatQualityScore}
      />

      {annotation ? (
        <p className="rounded-md border border-border bg-muted/50 px-2.5 py-2 text-xs leading-snug text-muted-foreground">
          {annotation}
        </p>
      ) : null}
    </ChartEnter>
  );
}
