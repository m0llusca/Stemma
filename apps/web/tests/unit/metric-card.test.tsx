import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "@/components/reports/metric-card";

describe("MetricCard", () => {
  it("shows score comparison as an absolute point delta, not as a relative percent", () => {
    render(
      <MetricCard
        label="Средняя оценка"
        value="92 балла"
        helper="Нормализованная оценка"
        comparison={{ current: 92, previous: 89, unit: " балла", stable: true }}
      />
    );

    expect(screen.getByText("+3 балла")).toBeInTheDocument();
    expect(screen.getByText("к прошлому периоду")).toBeInTheDocument();
    expect(screen.queryByText("+3%")).not.toBeInTheDocument();
  });

  it("keeps score delta consistent with the rounded values shown to the user", () => {
    render(
      <MetricCard
        label="Средняя оценка"
        value="74 балла"
        helper="Нормализованная оценка"
        comparison={{ current: 74.4, previous: 72.6, unit: " балла", stable: true }}
      />
    );

    expect(screen.getByText("+1 балл")).toBeInTheDocument();
    expect(screen.queryByText("+2 балла")).not.toBeInTheDocument();
  });
});
