/**
 * Statistical-rigor helpers for analytics. Pure and dependency-free so any
 * dashboard or reporting surface can gate its numbers on sample adequacy and
 * confidence without pulling in a stats library. These do not touch Prisma,
 * React, or any shared state — the whole point is that they are trivially
 * testable and safe to call anywhere (server or client).
 */

/** Default minimum number of observations before a metric is trustworthy. */
export const DEFAULT_MIN_SAMPLE = 5;

/** Default z-score for a two-sided 95% confidence interval. */
export const DEFAULT_WILSON_Z = 1.96;

/** Default minimum |delta| (in metric units) that counts as a real move. */
export const DEFAULT_MIN_ABS_DELTA = 1;

/**
 * True when `n` reaches the minimum sample size. Anything below `min` is too
 * thin to report on and callers should render an "insufficient data" state.
 */
export function hasAdequateSample(n: number, min: number = DEFAULT_MIN_SAMPLE): boolean {
  return n >= min;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * Wilson score interval for a binomial proportion. Unlike the naive normal
 * approximation it stays inside [0,1] and behaves well for small samples and
 * extreme proportions (0% / 100%), which is exactly where QA metrics live.
 *
 * Returns `{ low: 0, high: 0 }` when `total <= 0` (nothing to estimate). The
 * bounds are clamped to [0,1] to guard against floating-point overshoot.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z: number = DEFAULT_WILSON_Z,
): { low: number; high: number } {
  if (total <= 0) {
    return { low: 0, high: 0 };
  }

  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  return {
    low: clamp01((center - margin) / denominator),
    high: clamp01((center + margin) / denominator),
  };
}

/**
 * True only when a move is both large enough to matter and backed by enough
 * data to believe. A big delta on a tiny sample, or a real sample with a
 * sub-threshold delta, both read as "not meaningful".
 */
export function isMeaningfulDelta(input: {
  delta: number;
  sampleSize: number;
  minAbsDelta?: number;
  minSample?: number;
}): boolean {
  const minAbsDelta = input.minAbsDelta ?? DEFAULT_MIN_ABS_DELTA;
  const minSample = input.minSample ?? DEFAULT_MIN_SAMPLE;

  return Math.abs(input.delta) >= minAbsDelta && hasAdequateSample(input.sampleSize, minSample);
}
