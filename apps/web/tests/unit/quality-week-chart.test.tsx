import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { QualityWeekChart } from "@/components/dashboard/quality-week-chart.client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
  width: 560,
  height: 180,
  top: 0,
  left: 0,
  bottom: 180,
  right: 560,
  x: 0,
  y: 0,
  toJSON() {
    return {};
  }
} as DOMRect);

describe("QualityWeekChart", () => {
  it("uses Recharts LineChart through ChartContainer", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/quality-week-chart.client.tsx"),
      "utf8"
    );

    expect(source).toContain("from \"recharts\"");
    expect(source).toContain("LineChart");
    expect(source).toContain("ChartContainer");
    expect(source).toContain("aria-label=\"Тренд средней оценки\"");
    expect(source).not.toContain("InteractiveSparklineChart");
  });

  it("paints a named Recharts week trend", () => {
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
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
    expect(container.querySelector("svg.recharts-surface")).toBeInTheDocument();
  });
});
