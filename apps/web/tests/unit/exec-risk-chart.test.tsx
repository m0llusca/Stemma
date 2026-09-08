import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ExecRiskChart } from "@/components/dashboard/exec-risk-chart.client";
import type { ExecRiskChartBar } from "@/lib/dashboard/exec-risk-home";
import { EMPTY_TRIAGE_IMPOSTOR_HREF } from "@/lib/dashboard/empty-triage";
import { OVERDUE_SLA_HREF, QUEUED_STATUS_HREF } from "@/lib/dashboard/queue-kpi-href";

const navigation = vi.hoisted(() => ({
  push: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation
}));

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
  it("paints first-commit SVG bar geometry — not an empty Recharts wrapper", () => {
    const { container } = render(<ExecRiskChart bars={bars} />);
    const chart = container.querySelector('[data-slot="chart"]');
    const surface = container.querySelector("svg.recharts-surface");
    const rects = [...container.querySelectorAll("svg.recharts-surface rect[data-key]")];

    expect(chart).toHaveClass("h-[240px]");
    expect(chart).toHaveAttribute("data-qc-motion", "chart-enter");
    expect(chart).toHaveAttribute("data-initial-width", "520");
    expect(chart).toHaveAttribute("data-initial-height", "240");
    expect(container.querySelector(".recharts-wrapper")).not.toBeInTheDocument();
    expect(container.querySelector(".recharts-responsive-container")).not.toBeInTheDocument();
    expect(surface).toBeInTheDocument();
    expect(surface).toHaveAttribute("viewBox", "0 0 520 240");
    expect(surface).toHaveAttribute("data-animation-active", "false");
    expect(rects).toHaveLength(bars.length);
    expect(rects.every((rect) => Number(rect.getAttribute("width")) > 0)).toBe(true);
    expect(rects.every((rect) => Number(rect.getAttribute("height")) > 0)).toBe(true);
    expect(container.querySelector('[data-key="overdue"]')).toHaveAttribute(
      "data-href",
      OVERDUE_SLA_HREF
    );
    expect(container.querySelector('[data-key="highRisk"]')).toBeTruthy();
    expect(container.querySelector('[data-key="queued"]')).toBeTruthy();
    expect(screen.getByRole("table", { name: "Сводка риска и SLA" })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Просрочено SLA" })).toHaveAttribute("href", OVERDUE_SLA_HREF);
    expect(screen.getByRole("link", { name: "Высокий риск" })).toHaveAttribute(
      "href",
      bars[1].href
    );
    expect(screen.getByRole("link", { name: "Очередь без старта" })).toHaveAttribute(
      "href",
      QUEUED_STATUS_HREF
    );
    expect(container.innerHTML).not.toContain(EMPTY_TRIAGE_IMPOSTOR_HREF);
    expect(container.innerHTML).not.toContain("status=unreviewed");
  });

  it("drills a clicked bar through the same href as the KPI tile", () => {
    navigation.push.mockClear();
    const { container } = render(<ExecRiskChart bars={bars} />);
    const overdueCell = container.querySelector('[data-href="/reviews?due=overdue"]');

    expect(overdueCell).toBeTruthy();
    fireEvent.click(overdueCell ?? container);

    expect(navigation.push).toHaveBeenCalledWith(OVERDUE_SLA_HREF);
  });

  it("uses a reports-style static SVG and never imports Recharts BarChart", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/exec-risk-chart.client.tsx"),
      "utf8"
    );

    expect(source).toContain("StaticChartContainer");
    expect(source).toContain("svg");
    expect(source).toContain('className="recharts-surface');
    expect(source).toContain('data-animation-active="false"');
    expect(source).not.toContain("from \"recharts\"");
    expect(source).not.toContain("BarChart");
    expect(source).not.toContain("<ChartContainer");
    expect(source).not.toContain("ResponsiveContainer");
    expect(source).not.toContain("isAnimationActive");
  });
});
