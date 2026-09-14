import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartTooltipStatus } from "@/components/charts/chart-tooltip-status";

describe("ChartTooltipStatus", () => {
  it("anchors the inspection card to the hovered mark", () => {
    render(
      <ChartTooltipStatus
        id="chart-tip"
        label="Четверг"
        lines={[{ label: "Балл", value: "80" }]}
        anchor={{ left: 42, top: 61 }}
      />
    );

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.getAttribute("data-anchor-left")).toBe("42");
    expect(tooltip.getAttribute("data-anchor-top")).toBe("61");
    expect(tooltip.style.left).toBe("42%");
    expect(tooltip.style.top).toBe("61%");
  });
});
