"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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

function chartPath(points: SparklinePoint[]) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

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
  // A fixed viewBox would letterbox on wide columns (the dots drift away from the
  // hover strips), so the points are placed against the actual rendered width.
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

    const width = plotWidth ?? 360;
    const height = 132;
    const values = points.map((point) => point.value);
    const min = Math.min(...values, target ?? values[0]);
    const max = Math.max(...values, target ?? values[0]);
    const range = Math.max(1, max - min);
    const stepX = points.length > 1 ? width / (points.length - 1) : width;
    const nextPoints = points.map((point, index): SparklinePoint => {
      const x = points.length > 1 ? index * stepX : width / 2;
      const y = height - ((point.value - min) / range) * height;
      const delta = index === 0 ? null : qualityScoreDelta(point.value, points[index - 1].value);

      return {
        ...point,
        x,
        y,
        xPercent: (x / width) * 100,
        yPercent: (y / height) * 100,
        delta,
        tooltip: buildTooltip(point, delta)
      };
    });
    const targetY = target == null ? null : height - ((target - min) / range) * height;

    return {
      height,
      max,
      min,
      path: chartPath(nextPoints),
      points: nextPoints,
      range,
      targetY,
      width
    };
  }, [points, target, plotWidth]);

  if (!chart) {
    return <p className="text-sm text-muted-foreground">Нет завершенных проверок за выбранный период.</p>;
  }

  const firstPoint = chart.points[0];
  const lastPoint = chart.points[chart.points.length - 1];
  // Each control owns the region between the neighboring midpoints. The first
  // and last points use half-width regions, so hit targets tile without overlap.
  const pointGapPercent = chart.points.length > 1 ? 100 / (chart.points.length - 1) : 100;
  const targetLabel = target == null ? null : `Цель ${target}`;
  const targetBandY = chart.targetY == null ? null : Math.max(0, Math.min(chart.height, chart.targetY));

  return (
    <div data-slot="interactive-sparkline-chart" className="grid gap-3">
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
        className="relative min-h-[180px] overflow-visible rounded-lg border border-border bg-card px-2.5 pb-3 pt-9"
        ref={plotRef}
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 27px, var(--border) 28px)"
        }}
      >
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          width="100%"
          height={chart.height}
          className="block overflow-visible"
          preserveAspectRatio="none"
          role="img"
          aria-label="Тренд средней оценки"
          focusable="false"
        >
          {targetBandY != null ? (
            <rect
              x="0"
              y="0"
              width={chart.width}
              height={targetBandY}
              aria-hidden="true"
              data-slot="sparkline-target-band"
              fill="color-mix(in srgb, var(--chart-2) 8%, transparent)"
            />
          ) : null}
          <line
            x1="0"
            y1={chart.height}
            x2={chart.width}
            y2={chart.height}
            aria-hidden="true"
            data-slot="sparkline-axis"
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {chart.targetY != null ? (
            <>
              <line
                x1="0"
                y1={chart.targetY}
                x2={chart.width}
                y2={chart.targetY}
                aria-hidden="true"
                data-slot="sparkline-target"
                stroke="color-mix(in srgb, var(--chart-2) 56%, var(--border))"
                strokeDasharray="6 6"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={chart.width - 2}
                y={Math.max(10, chart.targetY - 6)}
                aria-hidden="true"
                data-slot="sparkline-target-label"
                fill="var(--chart-2)"
                fontSize="11"
                fontWeight="700"
                textAnchor="end"
              >
                {targetLabel}
              </text>
            </>
          ) : null}
          <path
            d={chart.path}
            data-slot="sparkline-line"
            fill="none"
            stroke="var(--primary)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
          {chart.points.map((point, index) => {
            const isActive = index === activeIndex;
            const isLatest = index === chart.points.length - 1;

            return (
              <g key={`${point.label}:${index}`}>
                <title>{point.tooltip}</title>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? "7" : isLatest ? "5.5" : "4"}
                  data-slot="sparkline-point"
                  fill={isActive || isLatest ? "var(--primary)" : "var(--card)"}
                  stroke={isActive || isLatest ? "var(--card)" : "var(--primary)"}
                  strokeWidth={isActive || isLatest ? "3" : "2"}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-x-2.5 bottom-3 h-[132px]">
          {chart.points.map((point, index) => {
            const showPoint = () => setActiveIndex(index);
            const hidePoint = () => setActiveIndex(null);
            const isActive = index === activeIndex;
            const tooltipId = `${tooltipIdPrefix}-point-${index}`;
            const controlLeftPercent = Math.max(0, point.xPercent - pointGapPercent / 2);
            const controlRightPercent = Math.min(100, point.xPercent + pointGapPercent / 2);
            const pointControlClass =
              "group absolute inset-y-0 pointer-events-auto border-0 bg-transparent p-0 text-left outline-none";
            const focusRingStyle =
              index === 0
                ? {
                    left: "0%",
                    transform: "translate(-50%, -50%)"
                  }
                : index === chart.points.length - 1
                  ? {
                      right: "0%",
                      transform: "translate(50%, -50%)"
                    }
                  : {
                      left: "50%",
                      transform: "translate(-50%, -50%)"
                    };
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
                  style={{ top: `${point.yPercent}%`, ...focusRingStyle }}
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
                left: `${controlLeftPercent}%`,
                width: `${controlRightPercent - controlLeftPercent}%`
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

      <div
        aria-hidden="true"
        data-slot="sparkline-scale"
        className="flex flex-wrap justify-between gap-2 text-[11px] font-medium tabular-nums text-muted-foreground"
      >
        <span>Мин {formatQualityScore(chart.min)}</span>
        {targetLabel ? <span>{targetLabel}</span> : null}
        <span>Макс {formatQualityScore(chart.max)}</span>
      </div>

      {annotation ? (
        <p className="rounded-md border border-border bg-muted/50 px-2.5 py-2 text-xs leading-snug text-muted-foreground">
          {annotation}
        </p>
      ) : null}
    </div>
  );
}
