import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coachingInWorkKpiHint, coachingOverdueKpiHint } from "@/lib/coaching/empty-honesty";

describe("coaching KPI empty hints", () => {
  it("UX-ACCEPT: zero week-due hint stays observational, not under-control theater", () => {
    expect(coachingInWorkKpiHint(2)).toBe("2 со сроком на неделе");
    expect(coachingInWorkKpiHint(0)).toBe("Сроков на этой неделе нет");
    expect(coachingInWorkKpiHint(0)).not.toContain("под контролем");
  });

  it("UX-ACCEPT: zero overdue hint is slice-factual, not an all-clear certificate", () => {
    expect(coachingOverdueKpiHint(3)).toBe("Поднимаются в начало очереди");
    expect(coachingOverdueKpiHint(0)).toBe("Просроченных в текущем срезе нет");
    expect(coachingOverdueKpiHint(0)).not.toBe("Просроченных разборов нет");
    expect(coachingOverdueKpiHint(0)).not.toContain("под контролем");
  });
});

describe("coaching empty honesty adversarial", () => {
  const page = readFileSync(join(process.cwd(), "src/app/coaching/page.tsx"), "utf8");

  it("does not certify zero KPIs as under control or all-clear", () => {
    expect(page).toContain("coachingInWorkKpiHint");
    expect(page).toContain("coachingOverdueKpiHint");
    expect(page).not.toContain("Сроки под контролем");
    expect(page).not.toContain("Просроченных разборов нет");
  });
});
