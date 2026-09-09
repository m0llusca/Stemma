export const SCORE_OVER_TIME_FALLBACK_WIDTH = 360;
export const SCORE_OVER_TIME_PLOT_HEIGHT = 200;
export const SCORE_OVER_TIME_PLOT_PAD_X = 12;
export const SCORE_OVER_TIME_PLOT_PAD_Y = 14;

export type SparklineMappedPoint<T> = T & {
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
};

export type SparklineHitRegion = {
  left: number;
  width: number;
};

/**
 * Score-over-time geometry in CSS pixels. Inner padding keeps circular
 * markers and the target line off the clip edge — `preserveAspectRatio="none"`
 * plus points at 0/width was squashing «Цель 90» chrome and clipping dots.
 */
export function buildSparklineGeometry<T extends { value: number }>(
  points: readonly T[],
  options: {
    width: number;
    height?: number;
    target?: number;
  }
) {
  const width = options.width;
  const height = options.height ?? SCORE_OVER_TIME_PLOT_HEIGHT;
  const padX = SCORE_OVER_TIME_PLOT_PAD_X;
  const padY = SCORE_OVER_TIME_PLOT_PAD_Y;
  const innerWidth = Math.max(1, width - padX * 2);
  const innerHeight = Math.max(1, height - padY * 2);
  const values = points.map((point) => point.value);
  const min = Math.min(...values, options.target ?? values[0]);
  const max = Math.max(...values, options.target ?? values[0]);
  const range = Math.max(1, max - min);
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

  const mapped = points.map((point, index): SparklineMappedPoint<T> => {
    const x = points.length > 1 ? padX + index * stepX : padX + innerWidth / 2;
    const y = padY + innerHeight - ((point.value - min) / range) * innerHeight;

    return {
      ...point,
      x,
      y,
      xPercent: (x / width) * 100,
      yPercent: (y / height) * 100
    };
  });

  const targetY =
    options.target == null
      ? null
      : padY + innerHeight - ((options.target - min) / range) * innerHeight;

  return {
    height,
    innerHeight,
    innerWidth,
    mapped,
    max,
    min,
    padX,
    padY,
    range,
    targetY,
    width
  };
}

export function sparklinePath(points: readonly { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

/** Hit strips tile 0–100% from neighboring midpoints so padding cannot open gaps. */
export function sparklineHitRegions(xPercents: readonly number[]): SparklineHitRegion[] {
  return xPercents.map((xPercent, index) => {
    const previous = xPercents[index - 1];
    const next = xPercents[index + 1];
    const left = previous == null ? 0 : (previous + xPercent) / 2;
    const right = next == null ? 100 : (xPercent + next) / 2;

    return {
      left,
      width: right - left
    };
  });
}
