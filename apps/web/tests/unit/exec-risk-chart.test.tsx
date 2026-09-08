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
  it("keeps a fixed-height ChartContainer and an accessibility table of the same drills", () => {
    const { container } = render(<ExecRiskChart bars={bars} />);

    expect(container.querySelector('[data-slot="chart"]')).toHaveClass("h-[240px]");
    expect(container.querySelector('[data-slot="chart"]')).toHaveAttribute(
      "data-qc-motion",
      "chart-enter"
    );
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
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
    expect(source).toContain("ChartContainer");
    expect(source).not.toContain("isAnimationActive={true}");
  });
});
