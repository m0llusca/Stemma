import { describe, expect, it } from "vitest";
import {
  SCORE_OVER_TIME_FALLBACK_WIDTH,
  SCORE_OVER_TIME_PLOT_HEIGHT,
  SCORE_OVER_TIME_PLOT_PAD_X,
  SCORE_OVER_TIME_PLOT_PAD_Y,
  buildSparklineGeometry,
  sparklineHitRegions,
  sparklinePath
} from "@/lib/charts/sparkline-geometry";

describe("sparkline geometry", () => {
  it("keeps markers inside the padded plot so edge dots are not clipped", () => {
    const chart = buildSparklineGeometry(
      [{ value: 50 }, { value: 100 }],
      { width: SCORE_OVER_TIME_FALLBACK_WIDTH, target: 0 }
    );

    expect(chart.padX).toBe(SCORE_OVER_TIME_PLOT_PAD_X);
    expect(chart.padY).toBe(SCORE_OVER_TIME_PLOT_PAD_Y);
    expect(chart.height).toBe(SCORE_OVER_TIME_PLOT_HEIGHT);
    expect(chart.mapped[0]?.x).toBe(SCORE_OVER_TIME_PLOT_PAD_X);
    expect(chart.mapped[1]?.x).toBe(
      SCORE_OVER_TIME_FALLBACK_WIDTH - SCORE_OVER_TIME_PLOT_PAD_X
    );
    expect(chart.mapped[0]?.y).toBeGreaterThan(chart.padY - 0.01);
    expect(chart.mapped[1]?.y).toBe(chart.padY);
    expect(chart.targetY).toBe(
      chart.height - SCORE_OVER_TIME_PLOT_PAD_Y
    );
    expect(sparklinePath(chart.mapped)).toBe("M 12.0 66.0 L 348.0 12.0");
  });

  it("tiles hit regions from padded midpoints without gaps", () => {
    const chart = buildSparklineGeometry(
      [{ value: 50 }, { value: 75 }, { value: 100 }],
      { width: SCORE_OVER_TIME_FALLBACK_WIDTH }
    );
    const regions = sparklineHitRegions(chart.mapped.map((point) => point.xPercent));

    expect(regions[0]?.left).toBe(0);
    expect(regions[2]?.left + (regions[2]?.width ?? 0)).toBeCloseTo(100);
    expect(
      (regions[0]?.width ?? 0) + (regions[1]?.width ?? 0) + (regions[2]?.width ?? 0)
    ).toBeCloseTo(100);
  });

  it("bridges null calendar slots so a sparse week still draws one continuous line", () => {
    const chart = buildSparklineGeometry(
      [{ value: 50 }, { value: null }, { value: 100 }],
      { width: SCORE_OVER_TIME_FALLBACK_WIDTH }
    );

    expect(chart.mapped).toHaveLength(3);
    expect(chart.mapped[1]?.y).toBeNull();
    expect(chart.mapped[0]?.x).toBe(SCORE_OVER_TIME_PLOT_PAD_X);
    expect(chart.mapped[2]?.x).toBe(
      SCORE_OVER_TIME_FALLBACK_WIDTH - SCORE_OVER_TIME_PLOT_PAD_X
    );
    expect(sparklinePath(chart.mapped)).toBe("M 12.0 120.0 L 348.0 12.0");
  });
});