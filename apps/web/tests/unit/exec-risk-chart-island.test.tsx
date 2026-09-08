import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ExecRiskChartIsland } from "@/components/dashboard/exec-risk-chart-island.client";
import type { ExecRiskChartBar } from "@/lib/dashboard/exec-risk-home";
import { OVERDUE_SLA_HREF, QUEUED_STATUS_HREF } from "@/lib/dashboard/queue-kpi-href";

const chartState = vi.hoisted(() => ({
  shouldThrow: false
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockExecRiskChart() {
      if (chartState.shouldThrow) {
        throw new Error("recharts render failed");
      }

      return <div data-slot="exec-risk-chart" />;
    }
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

describe("ExecRiskChartIsland", () => {
  it("keeps next/dynamic ssr:false inside a client module", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/exec-risk-chart-island.client.tsx"),
      "utf8"
    );

    expect(source).toMatch(/^["']use client["']/m);
    expect(source).toContain("next/dynamic");
    expect(source).toContain("ssr: false");
    expect(source).toContain("getDerivedStateFromError");
    expect(source).toContain("exec-risk-chart.client");
  });

  it("renders the deferred Recharts island when the chart chunk succeeds", () => {
    chartState.shouldThrow = false;
    render(<ExecRiskChartIsland bars={bars} />);

    expect(document.querySelector('[data-slot="exec-risk-chart-island"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="exec-risk-chart"]')).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("contains a chart render failure and retries without blanking the parent", () => {
    chartState.shouldThrow = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <section>
        <a href={OVERDUE_SLA_HREF}>Просрочено SLA</a>
        <ExecRiskChartIsland bars={bars} />
      </section>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить график");
    expect(screen.getByRole("link", { name: "Просрочено SLA" })).toHaveAttribute(
      "href",
      OVERDUE_SLA_HREF
    );
    expect(document.querySelector('[data-slot="exec-risk-chart"]')).not.toBeInTheDocument();

    chartState.shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(document.querySelector('[data-slot="exec-risk-chart"]')).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
