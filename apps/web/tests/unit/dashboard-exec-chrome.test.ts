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
    expect(source).toContain("overdue: \"/reviews?due=overdue\"");
    expect(source).toContain("queued: \"/reviews?qaStatus=QUEUED\"");
    expect(source).toContain("highRisk: thirtyDayHighRiskHref");
  });

  it("picks the exec/risk skeleton instead of the ops 4-KPI dashboard flash", () => {
    expect(source).toContain("resolveDashboardSkeletonVariant");
    expect(source).toContain("variant={skeletonVariant}");
    expect(loadingSource).toContain("resolveDashboardSkeletonVariant");
    expect(loadingSource).toContain("variant={variant}");
    expect(loadingSource).not.toContain('variant="dashboard"');
  });

  it("skips activity and training feeds for exec", () => {
    expect(source).toMatch(/isExecDashboard\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*prisma\.reviewEvent\.findMany/);
    expect(source).toMatch(
      /isExecDashboard\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*prisma\.trainingAssignment\.findMany/
    );
  });
});
