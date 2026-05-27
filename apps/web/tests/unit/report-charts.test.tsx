import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HorizontalBarChart, QuotaProgressBars, RankedList, ScoreDistribution, SparklineChart } from "@/components/reports/report-charts";
import { formatQualityScore } from "@/lib/score-display";

describe("QuotaProgressBars", () => {
  it("renders quota progress as percent without quality-score point labels", () => {
    render(<QuotaProgressBars rows={[{ label: "Операторы", planned: 10, actual: 7 }]} />);

    expect(screen.getByText("7 из 10")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Операторы: 70%" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.queryByText(/балл/)).not.toBeInTheDocument();
  });

  it("links quota rows to filtered review queues when drilldown href is provided", () => {
    render(<QuotaProgressBars rows={[{ label: "Иван Петров", planned: 10, actual: 7, href: "/reviews?assignee=Иван+Петров" }]} />);

    expect(screen.getByRole("link", { name: /Иван Петров/ })).toHaveAttribute("href", "/reviews?assignee=Иван+Петров");
  });
});

describe("HorizontalBarChart", () => {
  it("formats quality score values with point pluralization", () => {
    render(
      <HorizontalBarChart
        rows={[
          { label: "Один", value: 1 },
          { label: "Двадцать два", value: 22 },
          { label: "Двадцать пять", value: 25 }
        ]}
        valueFormatter={formatQualityScore}
        maxValue={100}
      />
    );

    expect(screen.getByText("1 балл")).toBeInTheDocument();
    expect(screen.getByText("22 балла")).toBeInTheDocument();
    expect(screen.getByText("25 баллов")).toBeInTheDocument();
  });
});

describe("SparklineChart", () => {
  it("uses the same target-aware scale for path and point markers", () => {
    const { container } = render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50 },
          { label: "02.05", value: 100 }
        ]}
        target={0}
      />
    );

    const path = container.querySelector("path");
    const circles = container.querySelectorAll(".interactive-sparkline__point-marker");

    expect(path).toHaveAttribute("d", "M 0.0 56.0 L 360.0 0.0");
    expect(circles[0]).toHaveAttribute("cy", "56");
    expect(circles[1]).toHaveAttribute("cy", "0");
  });

  it("renders accessible point hit targets with tooltip details", () => {
    const { container } = render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50, detail: "1 проверка" },
          { label: "02.05", value: 100, detail: "2 проверки" }
        ]}
      />
    );

    const point = screen.getByLabelText("02.05, 100 баллов, 2 проверки, +50 баллов к предыдущей точке");
    const tooltips = container.querySelectorAll(".interactive-sparkline__point-tooltip");

    expect(point).toHaveAttribute("tabindex", "0");
    expect(tooltips).toHaveLength(2);
    expect(tooltips[1]).toHaveTextContent("02.05");
    expect(tooltips[1]).toHaveTextContent("100 баллов");
    expect(tooltips[1]).toHaveTextContent("2 проверки, +50 баллов к предыдущей точке");
  });

  it("links trend points to the underlying filtered review queue", () => {
    render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50, detail: "1 проверка", href: "/reviews?finalizedFrom=2026-05-01&finalizedTo=2026-05-01" },
          { label: "02.05", value: 100, detail: "2 проверки", href: "/reviews?finalizedFrom=2026-05-02&finalizedTo=2026-05-02" }
        ]}
      />
    );

    expect(screen.getByRole("link", { name: "02.05, 100 баллов, 2 проверки, +50 баллов к предыдущей точке. Открыть проверки" })).toHaveAttribute(
      "href",
      "/reviews?finalizedFrom=2026-05-02&finalizedTo=2026-05-02"
    );
  });

  it("uses displayed rounded score points for sparkline deltas", () => {
    render(
      <SparklineChart
        points={[
          { label: "01.05", value: 72.6, detail: "прошлый период" },
          { label: "02.05", value: 74.4, detail: "текущий период" }
        ]}
      />
    );

    expect(screen.getByLabelText("02.05, 74 балла, текущий период, +1 балл к предыдущей точке")).toBeInTheDocument();
    expect(screen.queryByLabelText(/\+2 балла к предыдущей точке/)).not.toBeInTheDocument();
  });

  it("marks the focused point as active", () => {
    render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50, detail: "1 проверка" },
          { label: "02.05", value: 100, detail: "2 проверки" }
        ]}
      />
    );

    const point = screen.getByLabelText("02.05, 100 баллов, 2 проверки, +50 баллов к предыдущей точке");

    fireEvent.focus(point);

    expect(document.querySelector(".interactive-sparkline__point-marker--active")).toBeInTheDocument();
  });
});

describe("ScoreDistribution", () => {
  it("does not render visible bars for zero-count buckets", () => {
    const { container } = render(
      <ScoreDistribution
        rows={[
          { label: "0-50", value: 0 },
          { label: "51-70", value: 2 }
        ]}
      />
    );

    const bars = container.querySelectorAll<HTMLElement>(".score-histogram__bar");

    expect(bars[0]).toHaveStyle({ height: "0%" });
    expect(bars[0]).not.toHaveStyle({ minHeight: "10px" });
    expect(bars[1]).toHaveStyle({ height: "100%" });
  });
});

describe("RankedList", () => {
  it("renders ranked rows with metadata and drilldown action", () => {
    render(
      <RankedList
        rows={[
          {
            label: "Демо-импорт",
            value: 82,
            delta: -4,
            detail: "3 проверки",
            href: "/reviews?source=demo_import"
          }
        ]}
        valueFormatter={formatQualityScore}
        actionLabel="Открыть"
      />
    );

    expect(screen.getByText("Демо-импорт")).toBeInTheDocument();
    expect(screen.getByText("82 балла")).toBeInTheDocument();
    expect(screen.getByText("-4 балла")).toBeInTheDocument();
    expect(screen.getByText("3 проверки")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть" })).toHaveAttribute("href", "/reviews?source=demo_import");
  });
});
