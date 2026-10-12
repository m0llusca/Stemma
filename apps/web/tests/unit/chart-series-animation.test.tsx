import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kineticsDurationMs } from "@stemma/kinetics/durations";
import { chartSeriesAnimationDurationMs, useChartSeriesAnimationEnabled } from "@/lib/charts/series-animation";

afterEach(() => vi.unstubAllGlobals());

describe("chart series motion", () => {
  it("uses the canonical spring entrance duration", () => {
    expect(chartSeriesAnimationDurationMs).toBe(kineticsDurationMs.springEnter);
    expect(chartSeriesAnimationDurationMs).toBe(550);
  });

  it("responds to reduced-motion changes and removes its listener on unmount", () => {
    let listener: (() => void) | undefined;
    const media = {
      matches: true,
      addEventListener: vi.fn((_event: string, callback: () => void) => { listener = callback; }),
      removeEventListener: vi.fn()
    };
    const matchMedia = vi.fn().mockReturnValue(media);
    vi.stubGlobal("matchMedia", matchMedia);
    const { result, unmount } = renderHook(() => useChartSeriesAnimationEnabled());
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(result.current).toBe(false);
    act(() => {
      media.matches = false;
      listener?.();
    });
    expect(result.current).toBe(true);
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
  });
});
