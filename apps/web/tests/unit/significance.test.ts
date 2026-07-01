import { describe, expect, it } from "vitest";

import { hasAdequateSample, isMeaningfulDelta, wilsonInterval } from "@/lib/analytics/significance";

describe("hasAdequateSample", () => {
  it("uses a default minimum of 5", () => {
    expect(hasAdequateSample(5)).toBe(true);
    expect(hasAdequateSample(6)).toBe(true);
    expect(hasAdequateSample(4)).toBe(false);
    expect(hasAdequateSample(0)).toBe(false);
  });

  it("honours a custom minimum at the boundary", () => {
    expect(hasAdequateSample(10, 10)).toBe(true);
    expect(hasAdequateSample(9, 10)).toBe(false);
    expect(hasAdequateSample(1, 1)).toBe(true);
  });
});

describe("wilsonInterval", () => {
  it("matches a known 95% interval (8/10)", () => {
    const { low, high } = wilsonInterval(8, 10);
    expect(low).toBeCloseTo(0.49, 2);
    expect(high).toBeCloseTo(0.94, 2);
  });

  it("returns {0,0} when total is not positive", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
    expect(wilsonInterval(3, -1)).toEqual({ low: 0, high: 0 });
  });

  it("clamps the interval into [0,1]", () => {
    const zero = wilsonInterval(0, 5);
    expect(zero.low).toBeGreaterThanOrEqual(0);
    expect(zero.low).toBeLessThanOrEqual(1);
    expect(zero.high).toBeGreaterThanOrEqual(0);
    expect(zero.high).toBeLessThanOrEqual(1);

    const full = wilsonInterval(5, 5);
    expect(full.low).toBeGreaterThanOrEqual(0);
    expect(full.high).toBeLessThanOrEqual(1);
  });
});

describe("isMeaningfulDelta", () => {
  it("is true only when the delta and the sample both clear their thresholds", () => {
    expect(isMeaningfulDelta({ delta: 2, sampleSize: 5 })).toBe(true);
    expect(isMeaningfulDelta({ delta: -2, sampleSize: 5 })).toBe(true);
  });

  it("gates on a small delta", () => {
    expect(isMeaningfulDelta({ delta: 0.5, sampleSize: 50 })).toBe(false);
  });

  it("gates on a small sample", () => {
    expect(isMeaningfulDelta({ delta: 10, sampleSize: 4 })).toBe(false);
  });

  it("honours custom thresholds", () => {
    expect(isMeaningfulDelta({ delta: 3, sampleSize: 8, minAbsDelta: 5, minSample: 5 })).toBe(false);
    expect(isMeaningfulDelta({ delta: 3, sampleSize: 8, minAbsDelta: 3, minSample: 8 })).toBe(true);
  });
});
