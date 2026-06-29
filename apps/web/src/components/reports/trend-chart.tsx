import { useMemo } from "react";

/**
 * Small, hand-built SVG trend chart (no external chart lib).
 *
 * Renders muted neutral volume bars in the background (`--panel-muted` /
 * `--border`) behind a single-accent trend line (`--accent`, 2px) with a dot on
 * the latest point. Min/max labels are printed on both axes in `--text-muted`.
 * Every color comes from a token via a CSS class, so it restyles with the theme
 * (including Night Ops). Numbers are rendered rounded. `role="img"` +
 * `aria-label` make it announce as a single image. All styling lives in
 * `src/app/styles/components/07-shell.css` under `.trend-chart*`.
 */
export type TrendPoint = {
  label: string;
  value: number;
};

function linePath(coords: Array<{ x: number; y: number }>) {
  return coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

export function TrendChart({
  points,
  volume,
  height = 96,
  ariaLabel = "Тренд",
  className
}: {
  points: TrendPoint[];
  /** Optional per-point volume; drives the background bars. */
  volume?: number[];
  height?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const chart = useMemo(() => {
    if (points.length === 0) {
      return null;
    }

    const width = 320;
    const padY = 8;
    const plotHeight = Math.max(1, height - padY * 2);
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const stepX = points.length > 1 ? width / (points.length - 1) : width;
    const barSlot = width / points.length;
    const barWidth = Math.max(2, barSlot * 0.5);
    const volMax = volume && volume.length > 0 ? Math.max(1, ...volume) : 0;

    const coords = points.map((point, index) => {
      const x = points.length > 1 ? index * stepX : width / 2;
      const y = padY + (1 - (point.value - min) / range) * plotHeight;
      return { x, y };
    });

    const bars =
      volume && volume.length > 0
        ? points.map((point, index) => {
            const raw = volume[index] ?? 0;
            const barHeight = (raw / volMax) * plotHeight;
            const slotCenter = points.length > 1 ? index * stepX : width / 2;
            return {
              x: slotCenter - barWidth / 2,
              y: height - padY - barHeight,
              width: barWidth,
              height: Math.max(0, barHeight)
            };
          })
        : [];

    return {
      width,
      height,
      min,
      max,
      coords,
      bars,
      path: linePath(coords),
      last: coords[coords.length - 1]
    };
  }, [points, volume, height]);

  if (!chart) {
    return null;
  }

  const firstLabel = points[0].label;
  const lastLabel = points[points.length - 1].label;

  return (
    <div className={["trend-chart", className].filter(Boolean).join(" ")}>
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="trend-chart__svg"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        {chart.bars.map((bar, index) => (
          <rect
            key={`bar:${index}`}
            className="trend-chart__bar"
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx="1"
          />
        ))}
        <path d={chart.path} className="trend-chart__line" />
        <circle className="trend-chart__dot" cx={chart.last.x} cy={chart.last.y} r="3" />
      </svg>
      <div className="trend-chart__axis trend-chart__axis--y" aria-hidden="true">
        <span>{Math.round(chart.max)}</span>
        <span>{Math.round(chart.min)}</span>
      </div>
      <div className="trend-chart__axis trend-chart__axis--x" aria-hidden="true">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}
