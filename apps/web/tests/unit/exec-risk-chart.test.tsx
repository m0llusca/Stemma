import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ExecRiskChart } from "@/components/dashboard/exec-risk-chart.client";
import type { ExecRiskChartBar } from "@/lib/dashboard/exec-risk-home";
import { categoryBarDrillLabel } from "@/lib/charts/category-bar-geometry";
import { EMPTY_TRIAGE_IMPOSTOR_HREF } from "@/lib/dashboard/empty-triage";
import { OVERDUE_SLA_HREF, QUEUED_STATUS_HREF } from "@/lib/dashboard/queue-kpi-href";

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
  width: 520,
  height: 180,
  top: 0,
  left: 0,
  bottom: 180,
  right: 520,
  x: 0,
  y: 0,
  toJSON() {
    return {};
  }
} as DOMRect);

const bars: readonly ExecRiskChartBar[] = [
  {
    key: "overdue",
    label: "Просрочено SLA",
    value: 6,
    href: OVERDUE_SLA_HREF,
    tone: "danger"
  },
  {
    key: "highRisk",
    label: "Высокий риск",
    value: 3,
    href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
    tone: "danger"
  },
  {
    key: "queued",
    label: "Очередь без старта",
    value: 11,
    href: QUEUED_STATUS_HREF,
    tone: "warning"
  }
];

describe("ExecRiskChart", () => {
  it("paints Recharts bars with first-paint dimensions and KPI drills", () => {
    const { container } = render(<ExecRiskChart bars={bars} />);
    const chart = container.querySelector('[data-slot="chart"]');

    expect(chart).toHaveClass("h-[180px]");
    expect(chart).toHaveAttribute("data-qc-motion", "chart-enter");
    expect(chart).toHaveAttribute("data-initial-width", "520");
    expect(chart).toHaveAttribute("data-initial-height", "180");
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
    expect(container.querySelector("svg.recharts-surface")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="category-bar-x-axis"]')).toHaveTextContent(
      "Просрочено SLA"
    );
    expect(screen.getByRole("table", { name: "Сводка риска и SLA" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Просрочено SLA" })).toHaveAttribute("href", OVERDUE_SLA_HREF);
    expect(
      screen.getByRole("link", { name: categoryBarDrillLabel("Просрочено SLA", 6) })
    ).toHaveAttribute("href", OVERDUE_SLA_HREF);
    expect(container.innerHTML).not.toContain(EMPTY_TRIAGE_IMPOSTOR_HREF);
    expect(container.innerHTML).not.toContain("status=unreviewed");
  });

  it("keeps drill hrefs on the axis links", () => {
    render(<ExecRiskChart bars={bars} />);
    expect(
      screen.getByRole("link", { name: categoryBarDrillLabel("Высокий риск", 3) })
    ).toHaveAttribute("href", bars[1].href);
    expect(
      screen.getByRole("link", { name: categoryBarDrillLabel("Очередь без старта", 11) })
    ).toHaveAttribute("href", QUEUED_STATUS_HREF);
  });

  it("uses ChartContainer + BarChart instead of a frozen empty wrapper", () => {
    const plotSource = readFileSync(
      path.join(process.cwd(), "src/components/charts/static-category-bars.tsx"),
      "utf8"
    );

    expect(plotSource).toContain("from \"recharts\"");
    expect(plotSource).toContain("BarChart");
    expect(plotSource).toContain("ChartTooltip");
    expect(plotSource).toContain("initialDimension");
  });
});
