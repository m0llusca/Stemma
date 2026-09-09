import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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
  it("paints the shared static SVG and keeps Exec chrome off the Lead module", () => {
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
    expect(container.querySelector("svg.recharts-surface rect[data-key]")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(source).toContain("StaticCategoryBarPlot");
    expect(source).not.toContain("exec-risk-chart.client");
    expect(source).not.toContain("@/components/dashboard/exec-risk-chart");
    expect(source).not.toMatch(/^["']use client["']/m);
    expect(dashboard).toContain("LeadSlaChart");
    expect(dashboard).not.toContain("exec-risk-chart.client");
  });

  it("exposes a keyboard-operable drill per bar (Enter native, Space activates)", () => {
    render(<LeadSlaChart bars={bars} />);
    const overdue = screen.getByRole("link", {
      name: categoryBarDrillLabel("Просрочено SLA", 6)
    });

    expect(overdue).toHaveAttribute("href", OVERDUE_SLA_HREF);
    expect(overdue).toHaveAttribute("data-slot", "category-bar-drill");

    const click = vi.spyOn(overdue, "click").mockImplementation(() => undefined);
    fireEvent.keyDown(overdue, { key: " " });
    expect(click).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(overdue, { key: "Enter" });
    expect(click).toHaveBeenCalledTimes(1);

    click.mockRestore();
  });
});
