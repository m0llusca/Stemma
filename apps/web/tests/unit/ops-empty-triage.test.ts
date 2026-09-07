import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildOpsEmptyTriage } from "@/lib/dashboard/ops-empty-triage";

describe("buildOpsEmptyTriage", () => {
  it("UX-ACCEPT: Lead/Analyst empty triage is accent and non-certifying, matching Exec", () => {
    const empty = buildOpsEmptyTriage();

    expect(empty.tone).toBe("accent");
    expect(empty.title).toBe("Нет сигналов за период");
    expect(empty.description).toContain("не сертификат");
    expect(empty.actionLabel).toBe("Открыть очередь");
    expect(empty.title).not.toMatch(/нет$/i);
    expect(empty.title).not.toContain("Критичных");
    expect(empty.description).not.toMatch(/всё ок|в порядке(?!»).|под контролем/i);
  });
});

describe("ops empty triage adversarial", () => {
  const dashboardPage = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

  it("does not paint an empty Lead/Analyst strip success-green or claim no deviations", () => {
    expect(dashboardPage).toContain("buildOpsEmptyTriage");
    expect(dashboardPage).not.toContain("Критичных отклонений нет");
    expect(dashboardPage).not.toMatch(/focusItems\.length \? .* : "success"/);
    expect(dashboardPage).not.toContain("<CheckCircle2");
  });
});
