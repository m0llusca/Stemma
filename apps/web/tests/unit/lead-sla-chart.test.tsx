import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LeadSlaChart } from "@/components/dashboard/lead-sla-chart";
import { categoryBarDrillLabel } from "@/lib/charts/category-bar-geometry";
import type { ExecRiskChartBar } from "@/lib/dashboard/exec-risk-home";
import { OVERDUE_SLA_HREF, QUEUED_STATUS_HREF } from "@/lib/dashboard/queue-kpi-href";

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
  it("paints the shared static SVG plot and keeps Exec chrome off the Lead module", () => {
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
    expect(container.querySelector("svg.recharts-surface")).toBeInTheDocument();
    expect(container.querySelector("rect[data-slot='category-bar']")).toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).not.toBeInTheDocument();
    expect(container.querySelector(".recharts-responsive-container")).not.toBeInTheDocument();
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
