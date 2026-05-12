import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuotaProgressBars } from "@/components/reports/report-charts";

describe("QuotaProgressBars", () => {
  it("renders quota progress as percent without quality-score point labels", () => {
    render(<QuotaProgressBars rows={[{ label: "Операторы", planned: 10, actual: 7 }]} />);

    expect(screen.getByText("7 из 10")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Операторы: 70%" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.queryByText(/балл/)).not.toBeInTheDocument();
  });
});
