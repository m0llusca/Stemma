"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatQualityScore, formatQualityScoreDelta, qualityScoreDelta } from "@/lib/score-display";
import type { ChartDatum } from "@/components/reports/report-charts";

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
    return <p className="text-sm text-[var(--text-muted)]">Нет завершенных проверок за выбранный период.</p>;
  }

  const firstPoint = chart.points[0];
  const lastPoint = chart.points[chart.points.length - 1];
  // Each hover control is a vertical strip as wide as the gap between points, so
  // every point stays reachable no matter how narrow the chart column gets.
  const controlWidthPercent = chart.points.length > 1 ? 100 / (chart.points.length - 1) : 100;
  const targetLabel = target == null ? null : `Цель ${target}`;
  const targetBandY = chart.targetY == null ? null : Math.max(0, Math.min(chart.height, chart.targetY));

  return (
    <div className="interactive-sparkline">
      <div className="interactive-sparkline__summary">
        <div>
          <p>Начало периода</p>
          <strong>{formatQualityScore(firstPoint.value)}</strong>
          <span>{firstPoint.label}</span>
        </div>
        <div>
          <p>Последняя точка</p>
          <strong>{formatQualityScore(lastPoint.value)}</strong>
          <span>{lastPoint.label}</span>
        </div>
      </div>

      <div className="interactive-sparkline__plot" ref={plotRef}>
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="interactive-sparkline__svg"
          preserveAspectRatio="none"
          role="img"
          aria-label="Тренд средней оценки"
        >
          {targetBandY != null ? (
            <rect
              x="0"
              y="0"
              width={chart.width}
              height={targetBandY}
              className="interactive-sparkline__target-band"
            />
          ) : null}
          <line x1="0" y1={chart.height} x2={chart.width} y2={chart.height} className="interactive-sparkline__axis" />
          {chart.targetY != null ? (
            <>
              <line
                x1="0"
                y1={chart.targetY}
                x2={chart.width}
                y2={chart.targetY}
                className="interactive-sparkline__target-line"
              />
              <text x={chart.width - 2} y={Math.max(10, chart.targetY - 6)} className="interactive-sparkline__target-label">
                {targetLabel}
              </text>
            </>
          ) : null}
          <path d={chart.path} className="interactive-sparkline__area-line" />
          {chart.points.map((point, index) => {
            const isActive = index === activeIndex;
            const isLatest = index === chart.points.length - 1;
            const markerClass = [
              "interactive-sparkline__point-marker",
              isActive ? "interactive-sparkline__point-marker--active" : "",
              isLatest ? "interactive-sparkline__point-marker--latest" : ""
            ].filter(Boolean).join(" ");

            return (
              <g
                key={`${point.label}:${index}`}
                className="interactive-sparkline__point"
              >
                <title>{point.tooltip}</title>
                <circle
                  className="interactive-sparkline__hit-target"
                  cx={point.x}
                  cy={point.y}
                  r="14"
                />
                <circle
                  className={markerClass}
                  cx={point.x}
                  cy={point.y}
                  r={isActive || isLatest ? "5.5" : "4"}
                />
              </g>
            );
          })}
        </svg>
        <div className="interactive-sparkline__hit-layer">
          {chart.points.map((point, index) => {
            const showPoint = () => setActiveIndex(index);
            const hidePoint = () => setActiveIndex(null);
            const pointControlClass = [
              "interactive-sparkline__point-control",
              point.xPercent < 32 ? "interactive-sparkline__point-control--left" : "",
              point.xPercent > 68 ? "interactive-sparkline__point-control--right" : "",
              point.yPercent < 44 ? "interactive-sparkline__point-control--top" : ""
            ].filter(Boolean).join(" ");
            const content = (
              <span className="interactive-sparkline__point-tooltip" aria-hidden="true" style={{ top: `${point.yPercent}%` }}>
                <strong>{point.label}</strong>
                <span>{formatQualityScore(point.value)}</span>
                <small>{[point.detail, pointDeltaLabel(point.delta)].filter(Boolean).join(", ")}</small>
              </span>
            );
            const controlProps = {
              "aria-label": point.href ? `${point.tooltip}. Открыть проверки` : point.tooltip,
              className: pointControlClass,
              style: { left: `${point.xPercent}%`, width: `${controlWidthPercent}%` },
              onFocus: showPoint,
              onBlur: hidePoint,
              onMouseEnter: showPoint,
              onMouseLeave: hidePoint,
              onPointerEnter: showPoint,
              onPointerLeave: hidePoint
            };

            return point.href ? (
              <Link key={`${point.label}:${index}:hit`} href={point.href} {...controlProps}>
                {content}
              </Link>
            ) : (
              <span key={`${point.label}:${index}:hit`} tabIndex={0} {...controlProps}>
                {content}
              </span>
            );
          })}
        </div>
      </div>

      <div className="interactive-sparkline__scale" aria-label="Диапазон графика">
        <span>Мин {formatQualityScore(chart.min)}</span>
        {targetLabel ? <span>{targetLabel}</span> : null}
        <span>Макс {formatQualityScore(chart.max)}</span>
      </div>

      {annotation ? <p className="chart-annotation">{annotation}</p> : null}
    </div>
  );
}
