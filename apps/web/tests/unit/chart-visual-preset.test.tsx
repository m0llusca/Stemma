import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ChartGoalBadge,
  ChartScaleFooter,
  chartGoalLabel
} from "@/components/charts/chart-visual-preset";
import { queueFilterResetHref } from "@/lib/auth/role-home";

describe("chart visual preset (#109)", () => {
  it("prints the goal badge as muted HTML, not rotated SVG text", () => {
    const { container } = render(
      <div className="relative">
        <ChartGoalBadge value={90} />
      </div>
    );
    const badge = container.querySelector('[data-slot="chart-goal-badge"]');

    expect(badge).toHaveTextContent(chartGoalLabel(90));
    expect(badge).toHaveClass("text-xs", "text-muted-foreground", "tabular-nums");
    expect(badge).not.toHaveAttribute("transform");
    expect(badge?.tagName).toBe("SPAN");
  });

  it("keeps Мин/Цель/Макс outside the plot as tabular-nums", () => {
    render(
      <ChartScaleFooter
        min={69}
        max={80}
        target={90}
        formatValue={(value) => String(value)}
      />
    );

    const scale = screen.getByText("Мин 69").parentElement;
    expect(scale).toHaveAttribute("data-slot", "sparkline-scale");
    expect(scale).toHaveClass("text-sm", "tabular-nums");
    expect(screen.getByText("Цель 90")).toBeInTheDocument();
    expect(screen.getByText("Макс 80")).toBeInTheDocument();
  });

  it("locks Exec empty risk to EmptyState + queueFilterResetHref(EXEC)", () => {
    const home = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/exec-risk-home.tsx"),
      "utf8"
    );
    const empty = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/exec-risk-empty.tsx"),
      "utf8"
    );
    const island = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/exec-risk-chart-island.client.tsx"),
      "utf8"
    );
    const model = readFileSync(
      path.join(process.cwd(), "src/lib/dashboard/exec-risk-home.ts"),
      "utf8"
    );

    expect(home).toContain("ExecRiskEmptyState");
    expect(home).toContain("chart.resetHref");
    expect(home).toContain("chart.empty");
    expect(empty).toContain("EmptyState");
    expect(empty).toContain('data-slot="exec-risk-empty"');
    expect(island).toContain("isExecRiskBarsEmpty");
    expect(island).toContain("ExecRiskEmptyState");
    expect(island.indexOf("isExecRiskBarsEmpty")).toBeLessThan(island.indexOf("<ExecRiskChart key"));
    expect(model).toContain("queueFilterResetHref(input.role");
    expect(queueFilterResetHref("EXEC")).toBe("/reviews");
    expect(home).not.toContain("status=unreviewed");
    expect(home).not.toContain("qaStatus=QUEUED");
    expect(empty).not.toContain("status=unreviewed");
    expect(empty).not.toContain("Загрузка графика");
    expect(empty).not.toContain("ExecRiskChartPending");
  });
});
