import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("dashboard exec chrome", () => {
  const source = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

  it("renders the exec risk home instead of lead/analyst ops chrome", () => {
    expect(source).toContain('const isExecDashboard = user.role === "EXEC"');
    expect(source).toContain("if (isExecDashboard)");
    expect(source).toContain("<ExecRiskHome");
    expect(source).toContain("overdue: \"/reviews?due=overdue\"");
    expect(source).toContain("queued: \"/reviews?qaStatus=QUEUED\"");
    expect(source).toContain("highRisk: thirtyDayHighRiskHref");
  });

  it("skips activity and training feeds for exec", () => {
    expect(source).toMatch(/isExecDashboard\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*prisma\.reviewEvent\.findMany/);
    expect(source).toMatch(
      /isExecDashboard\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*prisma\.trainingAssignment\.findMany/
    );
  });
});
