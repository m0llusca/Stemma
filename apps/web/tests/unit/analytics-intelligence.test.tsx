import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricInsightStrip } from "@/components/reports/analytics-intelligence";

describe("MetricInsightStrip", () => {
  it("adds explanatory help to operational signal cards without hiding the drilldown", () => {
    render(
      <MetricInsightStrip
        title="Операционные сигналы"
        description="Короткая проверка рисков."
        items={[
          {
            label: "Риск HIGH+",
            value: "10",
            detail: "43% всех замечаний",
            progress: 43,
            progressLabel: "доля риска",
            explanation:
              "Показывает замечания HIGH и CRITICAL. Высокая доля означает, что сначала стоит открыть список проверок с высоким риском.",
            href: "/reviews?riskLevel=HIGH_OR_CRITICAL",
            tone: "danger"
          }
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Что значит сигнал Риск HIGH+?" })).toBeInTheDocument();
    expect(screen.getByText(/Показывает замечания HIGH и CRITICAL/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть срез Риск HIGH+" })).toHaveAttribute(
      "href",
      "/reviews?riskLevel=HIGH_OR_CRITICAL"
    );
  });
});
