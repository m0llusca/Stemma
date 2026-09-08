import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ExecRiskChartIsland } from "@/components/dashboard/exec-risk-chart-island.client";
import { queueFilterResetHref } from "@/lib/auth/role-home";
import type { ExecRiskChartBar } from "@/lib/dashboard/exec-risk-home";
import { OVERDUE_SLA_HREF, QUEUED_STATUS_HREF } from "@/lib/dashboard/queue-kpi-href";

const chartState = vi.hoisted(() => ({
  shouldThrow: false
}));

vi.mock("@/components/dashboard/exec-risk-chart.client", () => ({
  ExecRiskChart: () => {
    if (chartState.shouldThrow) {
      throw new Error("recharts render failed");
    }

    return <div data-slot="exec-risk-chart" />;
  }
}));

const resetHref = queueFilterResetHref("EXEC");

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
  it("renders EmptyState + queueFilterResetHref instead of the pending shell when bars are empty", () => {
    chartState.shouldThrow = false;

    render(<ExecRiskChartIsland bars={[]} resetHref={resetHref} />);

    expect(document.querySelector('[data-slot="exec-risk-empty"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="exec-risk-chart-pending"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="exec-risk-chart"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Открыть очередь без фильтра$/ })).toHaveAttribute(
      "href",
      resetHref
    );
    expect(resetHref).toBe("/reviews");
  });

  it("treats all-zero bars as empty even if the chart module is available", () => {
    chartState.shouldThrow = false;

    const zeroBars: readonly ExecRiskChartBar[] = bars.map((bar) => ({
      ...bar,
      value: 0,
      tone: "neutral"
    }));

    render(<ExecRiskChartIsland bars={zeroBars} resetHref={resetHref} />);

    expect(document.querySelector('[data-slot="exec-risk-empty"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="exec-risk-chart-pending"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Открыть очередь без фильтра$/ })).toHaveAttribute(
      "href",
      "/reviews"
    );
  });

  it("statically imports the Recharts chart from the client island — no ssr:false bailout", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/exec-risk-chart-island.client.tsx"),
      "utf8"
    );

    expect(source).toMatch(/^["']use client["']/m);
    expect(source).toContain('from "@/components/dashboard/exec-risk-chart.client"');
    expect(source).toContain("getDerivedStateFromError");
    expect(source).not.toContain("next/dynamic");
    expect(source).not.toContain("ssr: false");
    expect(source).not.toContain("ExecRiskChartPending");
  });

  it("renders live bars through the static chart import, not a pending shell", () => {
    chartState.shouldThrow = false;
    render(<ExecRiskChartIsland bars={bars} resetHref={resetHref} />);

    expect(document.querySelector('[data-slot="exec-risk-chart-island"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="exec-risk-chart"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="exec-risk-chart-pending"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Загрузка графика" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("contains a chart render failure and retries without blanking the parent", () => {
    chartState.shouldThrow = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <section>
        <a href={OVERDUE_SLA_HREF}>Просрочено SLA</a>
        <ExecRiskChartIsland bars={bars} resetHref={resetHref} />
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
