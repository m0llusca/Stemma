import { describe, expect, it } from "vitest";
import {
  CATEGORY_BAR_MIN_HEIGHT,
  buildCategoryBarPlot,
  categoryBarDrillLabel
} from "@/lib/charts/category-bar-geometry";

describe("category bar geometry", () => {
  it("paints a visible minimum height for live values and keeps zeros flat", () => {
    const plot = buildCategoryBarPlot([
      {
        key: "overdue",
        label: "Просрочено SLA",
        value: 1,
        href: "/reviews?due=overdue",
        tone: "danger"
      },
      {
        key: "queued",
        label: "Очередь без старта",
        value: 0,
        href: "/reviews",
        tone: "neutral"
      }
    ]);

    expect(plot.bars[0]?.height).toBeGreaterThanOrEqual(CATEGORY_BAR_MIN_HEIGHT);
    expect(plot.bars[1]?.height).toBe(0);
    expect(plot.maxValue).toBe(1);
    expect(categoryBarDrillLabel("Просрочено SLA", 6)).toBe(
      "Просрочено SLA: 6. Открыть очередь"
    );
  });
});
