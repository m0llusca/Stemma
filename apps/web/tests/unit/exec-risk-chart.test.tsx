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
  it("paints bar rects in a static-size SVG — not an empty ResponsiveContainer wrapper", () => {
    const { container } = render(<ExecRiskChart bars={bars} />);
    const chart = container.querySelector('[data-slot="chart"]');
    const surface = container.querySelector("svg.recharts-surface");
    const rects = container.querySelectorAll(
      ".recharts-bar-rectangle, .recharts-rectangle, rect[data-key], [data-key] rect"
    );

    expect(chart).toHaveClass("h-[240px]");
    expect(chart).toHaveAttribute("data-qc-motion", "chart-enter");
    expect(chart).toHaveAttribute("data-initial-width", "520");
    expect(chart).toHaveAttribute("data-initial-height", "240");
    expect(container.querySelector(".recharts-responsive-container")).not.toBeInTheDocument();
    expect(surface).toBeInTheDocument();
    expect(surface?.getAttribute("width")).toBe("520");
    expect(surface?.getAttribute("height")).toBe("240");
    expect(rects.length).toBeGreaterThanOrEqual(bars.length);
    expect(container.querySelector('[data-key="overdue"]')).toBeTruthy();
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

  it("disables animation so reduced-motion is not a second motion system", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/exec-risk-chart.client.tsx"),
      "utf8"
    );

    expect(source).toContain("accessibilityLayer");
    expect(source).toContain("isAnimationActive={false}");
    expect(source).toContain("StaticChartContainer");
    expect(source).toContain("width={EXEC_RISK_CHART_WIDTH}");
    expect(source).toContain("height={EXEC_RISK_CHART_HEIGHT}");
    expect(source).not.toContain("<ChartContainer");
    expect(source).not.toContain("ResponsiveContainer");
    expect(source).not.toContain("isAnimationActive={true}");
  });
});
