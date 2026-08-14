import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartContainer } from "@/components/ui/chart";
import { StaticChartContainer } from "@/components/ui/chart-container";

const config = {
  score: {
    label: "Баллы",
    color: "var(--chart-1)"
  }
};

describe("shadcn chart container contract", () => {
  it("keeps the public wrapper responsive and the lean static wrapper explicit", () => {
    const { container, rerender } = render(
      <ChartContainer
        id="public-chart"
        config={config}
        initialDimension={{ width: 320, height: 200 }}
      >
        <svg data-testid="public-chart-child" />
      </ChartContainer>
    );

    expect(
      container.querySelector(".recharts-responsive-container")
    ).toBeInTheDocument();

    rerender(
      <StaticChartContainer
        id="static-chart"
        config={config}
        initialDimension={{ width: 320, height: 200 }}
      >
        <svg data-testid="static-chart-child" />
      </StaticChartContainer>
    );

    expect(
      container.querySelector(".recharts-responsive-container")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("static-chart-child")).toBeInTheDocument();
  });
});
