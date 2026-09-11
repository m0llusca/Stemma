export const SCORE_OVER_TIME_FALLBACK_WIDTH = 360;
/** Compact plot height — wide Lead columns used to look mostly empty at 200px. */
export const SCORE_OVER_TIME_PLOT_HEIGHT = 132;
export const SCORE_OVER_TIME_PLOT_PAD_X = 12;
export const SCORE_OVER_TIME_PLOT_PAD_Y = 12;

export type SparklineMappedPoint<T> = T & {
  x: number;
  y: number | null;
  xPercent: number;
  yPercent: number | null;
};

export type SparklineHitRegion = {
  left: number;
  width: number;
};

/**
 * Score-over-time geometry in CSS pixels. Inner padding keeps circular
 * markers and the target line off the clip edge — `preserveAspectRatio="none"`
 * plus points at 0/width was squashing «Цель 90» chrome and clipping dots.
 *
 * `value: null` keeps the calendar slot (so a «7 дней» title still spans seven
 * weekdays) while the path gaps across empty days.
 */
export function buildSparklineGeometry<T extends { value: number | null }>(
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
  const numericValues = points
    .map((point) => point.value)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const baseline = numericValues[0] ?? options.target ?? 0;
  const min = Math.min(...(numericValues.length ? numericValues : [baseline]), options.target ?? baseline);
  const max = Math.max(...(numericValues.length ? numericValues : [baseline]), options.target ?? baseline);
  const range = Math.max(1, max - min);
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

  const mapped = points.map((point, index): SparklineMappedPoint<T> => {
    const x = points.length > 1 ? padX + index * stepX : padX + innerWidth / 2;
    if (point.value == null || !Number.isFinite(point.value)) {
      return {
        ...point,
        x,
        y: null,
        xPercent: (x / width) * 100,
        yPercent: null
      };
    }

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

/** Polyline that bridges empty days: null `y` keeps the weekday slot but does
 *  not break the path, so a sparse «7 дней» spark still draws a continuous line. */
export function sparklinePath(points: readonly { x: number; y: number | null }[]) {
  const commands: string[] = [];
  let started = false;

  for (const point of points) {
    if (point.y == null) {
      continue;
    }

    commands.push(
      `${started ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    );
    started = true;
  }

  return commands.join(" ");
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
