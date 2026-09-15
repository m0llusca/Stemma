import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { QualityWeekChart } from "@/components/dashboard/quality-week-chart.client";

vi.mock("next/link", () => ({
  default: ({
    scroll,
    prefetch,
    replace: _replace,
    ...props
  }: ComponentProps<"a"> & {
    scroll?: boolean;
    prefetch?: boolean;
    replace?: boolean;
  }) => (
    <a
      {...props}
      data-next-scroll={scroll === undefined ? undefined : String(scroll)}
      data-next-prefetch={prefetch === undefined ? undefined : String(prefetch)}
    />
  )
}));

describe("QualityWeekChart", () => {
  it("does not import Recharts or ResponsiveContainer", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/quality-week-chart.client.tsx"),
      "utf8"
    );

    expect(source).toContain("InteractiveSparklineChart");
    expect(source).not.toContain("from \"recharts\"");
    expect(source).not.toContain("from \"@/components/ui/chart\"");
    expect(source).not.toContain("LineChart");
    expect(source).not.toContain("ResponsiveContainer");
    expect(source).not.toContain("<ChartContainer");
  });

  it("paints the reports static SVG trend, not a Recharts wrapper", () => {
    const { container } = render(
      <QualityWeekChart
        points={[
          { label: "пн", value: 80, href: "/reports" },
          { label: "вт", value: 92, href: "/reports" }
        ]}
        target={90}
      />
    );

    expect(screen.getByRole("img", { name: "Тренд средней оценки" })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="interactive-sparkline-chart"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sparkline-line"]')).toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).not.toBeInTheDocument();
    expect(container.querySelector(".recharts-responsive-container")).not.toBeInTheDocument();
  });
});
