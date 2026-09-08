import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExecRiskHome } from "@/components/dashboard/exec-risk-home";
import { queueFilterResetHref } from "@/lib/auth/role-home";

const hrefs = {
  overdue: "/reviews?due=overdue",
  highRisk: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
  queued: "/reviews?qaStatus=QUEUED"
};

describe("ExecRiskHome empty over pending (LIVE-class)", () => {
  it("renders EmptyState + reset CTA and never «Загрузка графика» when bars are empty", () => {
    render(
      <ExecRiskHome
        signal={{ overdueReviewCount: 0, highRiskCount: 0, queuedCount: 0 }}
        hrefs={hrefs}
        inWorkCount={0}
      />
    );

    expect(document.querySelector('[data-slot="exec-risk-empty"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Открыть очередь без фильтра$/ })).toHaveAttribute(
      "href",
      queueFilterResetHref("EXEC")
    );
    expect(document.querySelector('[data-slot="exec-risk-chart-pending"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="exec-risk-chart-island"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Загрузка графика" })).not.toBeInTheDocument();
    expect(screen.queryByText("Загрузка графика")).not.toBeInTheDocument();
  });

  it("keeps pending / Suspense off the ExecRiskHome empty path so RSC cannot stream the loader", () => {
    const home = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/exec-risk-home.tsx"),
      "utf8"
    );

    expect(home).toContain("chart.empty");
    expect(home).toContain("ExecRiskEmptyState");
    expect(home).not.toContain("Suspense");
    expect(home).not.toContain("ExecRiskChartPending");
    expect(home).not.toContain("Загрузка графика");
    expect(home).not.toContain("next/dynamic");
  });
});
