import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HorizontalBarChart, QuotaProgressBars } from "@/components/reports/report-charts";
import { formatQualityScore } from "@/lib/score-display";

describe("QuotaProgressBars", () => {
  it("renders quota progress as percent without quality-score point labels", () => {
    render(<QuotaProgressBars rows={[{ label: "Операторы", planned: 10, actual: 7 }]} />);

    expect(screen.getByText("7 из 10")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Операторы: 70%" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.queryByText(/балл/)).not.toBeInTheDocument();
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
