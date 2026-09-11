import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("dashboard exec chrome", () => {
  const source = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
  const loadingSource = readFileSync(join(process.cwd(), "src/app/dashboard/loading.tsx"), "utf8");

  it("renders the exec risk home instead of lead/analyst ops chrome", () => {
    expect(source).toContain('const isExecDashboard = user.role === "EXEC"');
    expect(source).toContain("if (isExecDashboard)");
    expect(source).toContain("<ExecRiskHome");
    expect(source).toContain("overdue: OVERDUE_SLA_HREF");
    expect(source).toContain("queued: QUEUED_STATUS_HREF");
    expect(source).toContain("highRisk: thirtyDayHighRiskHref");
    expect(source).toContain("role={user.role}");
  });

  it("picks the exec/risk skeleton instead of the ops 4-KPI dashboard flash", () => {
    expect(source).toContain("dashboardSkeletonVariantForRole(user.role)");
    expect(source).toContain("variant={skeletonVariant}");
    expect(source.indexOf("requirePagePermission")).toBeLessThan(source.indexOf("<Suspense"));
    // Route loading stays sync (ops skeleton) so soft nav is not gated on auth.
    // Exec shape is applied by the page Suspense fallback after role resolves.
    expect(loadingSource).not.toContain("resolveDashboardSkeletonVariant");
    expect(loadingSource).toContain('variant="dashboard"');
  });

  it("keeps the Recharts drill chart on ExecRiskHome only — Agent and VIEWER stay chartless", () => {
    const execHome = readFileSync(join(process.cwd(), "src/components/dashboard/exec-risk-home.tsx"), "utf8");
    const chartIsland = readFileSync(
      join(process.cwd(), "src/components/dashboard/exec-risk-chart-island.client.tsx"),
      "utf8"
    );
    const selfReview = readFileSync(join(process.cwd(), "src/app/self-review/page.tsx"), "utf8");
    const pendingAccess = readFileSync(join(process.cwd(), "src/app/auth/pending-access/page.tsx"), "utf8");
    const appNav = readFileSync(join(process.cwd(), "src/components/app-nav.tsx"), "utf8");

    expect(execHome).not.toMatch(/^["']use client["']/m);
    expect(execHome).not.toContain("next/dynamic");
    expect(execHome).not.toContain("ssr: false");
    expect(execHome).toContain("exec-risk-chart-island.client");
    expect(execHome).toContain("ExecRiskEmptyState");
    expect(execHome).toContain("chart.empty");
    expect(execHome).not.toContain("Suspense");
    expect(execHome).not.toContain("ExecRiskChartPending");
    expect(execHome).not.toContain("Загрузка графика");
    expect(chartIsland).toMatch(/^["']use client["']/m);
    expect(chartIsland).toContain("exec-risk-chart.client");
    expect(chartIsland).not.toContain("next/dynamic");
    expect(chartIsland).not.toContain("ssr: false");
    expect(source).not.toContain("exec-risk-chart.client");
    expect(selfReview).not.toContain("exec-risk-chart");
    expect(selfReview).not.toContain("BarChart");
    expect(selfReview).not.toContain("ChartContainer");
    expect(pendingAccess).not.toContain("exec-risk-chart");
    expect(pendingAccess).not.toContain("BarChart");
    expect(pendingAccess).not.toContain("ChartContainer");
    expect(appNav).not.toContain("exec-risk-chart");
    expect(appNav).not.toContain("BarChart");
  });

  it("skips activity and training feeds for exec", () => {
    expect(source).toMatch(/isExecDashboard\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*prisma\.reviewEvent\.findMany/);
    expect(source).toMatch(
      /isExecDashboard\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*prisma\.trainingAssignment\.findMany/
    );
  });

  it("skips unused week and training counts on the exec risk home", () => {
    expect(source).toMatch(/isExecDashboard\s*\?\s*Promise\.resolve\(0\)\s*:\s*prisma\.review\.count/);
    expect(source).toMatch(
      /isExecDashboard\s*\?\s*Promise\.resolve\(0\)\s*:\s*prisma\.trainingAssignment\.count/
    );
    expect(source).toContain("queuedCount");
    expect(source).toContain("highRiskCount");
    expect(source).toContain("overdueReviewCount");
  });
});
