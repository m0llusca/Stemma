import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Line, LineChart } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { StaticChartContainer } from "@/components/ui/chart-container";

const config = {
  score: {
    label: "Баллы",
    color: "var(--chart-1)"
  }
};

describe("shadcn chart container contract", () => {
  it("keeps positive SSR geometry before responsive measurements", () => {
    const html = renderToStaticMarkup(
      <ChartContainer id="ssr-chart" config={config} initialDimension={{ width: 560, height: 200 }}>
        <LineChart data={[{ score: 80 }, { score: 90 }]}>
          <Line dataKey="score" isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const chart = document.querySelector('[data-slot="chart"]');
    const wrapper = chart?.querySelector(".recharts-wrapper");
    expect(chart?.getAttribute("data-initial-width")).toBe("560");
    expect(wrapper?.getAttribute("width")).toBe("560");
    expect(wrapper?.getAttribute("height")).toBe("200");
    expect(chart?.querySelector(".recharts-responsive-container")).not.toBeNull();
  });

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
