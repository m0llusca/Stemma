import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LeadSlaChart } from "@/components/dashboard/lead-sla-chart";
import { categoryBarDrillLabel } from "@/lib/charts/category-bar-geometry";
import type { ExecRiskChartBar } from "@/lib/dashboard/exec-risk-home";
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

describe("LeadSlaChart", () => {
  it("paints the shared Recharts plot and keeps Exec chrome off the Lead module", () => {
    const { container } = render(<LeadSlaChart bars={bars} />);
    const source = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/lead-sla-chart.tsx"),
      "utf8"
    );
    const dashboard = readFileSync(
      path.join(process.cwd(), "src/app/dashboard/page.tsx"),
      "utf8"
    );

    expect(container.querySelector('[data-slot="lead-sla-chart"]')).toBeInTheDocument();
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(source).toContain("StaticCategoryBarPlot");
    expect(source).not.toContain("exec-risk-chart.client");
    expect(source).not.toMatch(/^["']use client["']/m);
    expect(dashboard).toContain("LeadSlaChart");
    expect(dashboard).toContain("QualityWeekChart");
    expect(dashboard).not.toContain("exec-risk-chart.client");
  });

  it("exposes a drill link per bar", () => {
    render(<LeadSlaChart bars={bars} />);
    const overdue = screen.getByRole("link", {
      name: categoryBarDrillLabel("Просрочено SLA", 6)
    });

    expect(overdue).toHaveAttribute("href", OVERDUE_SLA_HREF);
    expect(overdue).toHaveAttribute("data-slot", "category-bar-drill");
  });
});
