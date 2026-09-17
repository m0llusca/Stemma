import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COACHING_PLANS_AGENT_EMPTY_BODY,
  COACHING_PLANS_AGENT_EMPTY_DESCRIPTION,
  COACHING_PLANS_LEAD_EMPTY_DESCRIPTION,
  coachingInWorkKpiHint,
  coachingOverdueKpiHint,
  coachingPlansEmptyDescription,
  isCoachingOperatorHome
} from "@/lib/coaching/empty-honesty";

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

describe("coaching operator plans empty", () => {
  it("is operator home for SUPPORT_AGENT, not for lead/admin/QA", () => {
    expect(isCoachingOperatorHome("SUPPORT_AGENT")).toBe(true);
    expect(isCoachingOperatorHome("TEAM_LEAD")).toBe(false);
    expect(isCoachingOperatorHome("ADMIN")).toBe(false);
    expect(isCoachingOperatorHome("QA_ANALYST")).toBe(false);
    expect(isCoachingOperatorHome("EXEC")).toBe(false);
  });

  it("gives ivan@ / agent empty copy, never the lead grouping line", () => {
    expect(coachingPlansEmptyDescription("SUPPORT_AGENT")).toBe(COACHING_PLANS_AGENT_EMPTY_DESCRIPTION);
    expect(coachingPlansEmptyDescription("SUPPORT_AGENT")).not.toContain("Сгруппируйте разборы оператора");
    expect(coachingPlansEmptyDescription("TEAM_LEAD")).toBe(COACHING_PLANS_LEAD_EMPTY_DESCRIPTION);
    expect(coachingPlansEmptyDescription("ADMIN")).toBe(COACHING_PLANS_LEAD_EMPTY_DESCRIPTION);
    expect(COACHING_PLANS_AGENT_EMPTY_BODY).toContain("тимлид назначит план");
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

  it("wires operator plans empty through role-aware helper, not a lead-only string", () => {
    expect(page).toContain("coachingPlansEmptyDescription(user.role)");
    expect(page).toContain("COACHING_PLANS_AGENT_EMPTY_BODY");
    expect(page).not.toMatch(
      /coachingPlans\.length > 0\s*\?[\s\S]{0,200}Сгруппируйте разборы оператора/
    );
  });
});
