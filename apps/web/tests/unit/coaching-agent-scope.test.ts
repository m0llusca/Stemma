import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("coaching page agent score scope", () => {
  const source = readFileSync(join(process.cwd(), "src/app/coaching/page.tsx"), "utf8");

  it("allows entry with training:manage or training:consume via canAccessTraining", () => {
    expect(source).toContain("canAccessTraining");
    expect(source).not.toContain('requireCurrentUserPermission("training:manage")');
  });

  it("scopes finalized score history to the support agent's own assigneeId", () => {
    expect(source).toContain("isSupportAgent ? { conversation: { assigneeId: user.id } }");
    expect(source).toContain("Ваш средний балл");
  });

  it("does not load team review candidates or support-user lists for agents", () => {
    expect(source).toContain("canManageCoachingOps");
    expect(source).toMatch(/canManageCoachingOps\s*\?\s*prisma\.user\.findMany/);
    expect(source).toMatch(/canManageCoachingOps\s*\?\s*prisma\.review\.findMany/);
  });

  it("loads open CoachingActions only for managers so agents cannot close team разборы", () => {
    expect(source).toMatch(/canManageCoachingOps\s*\?\s*prisma\.coachingAction\.findMany/);
    expect(source).toContain('status: "open"');
    expect(source).toContain("updateCoachingActionStatusState");
    expect(source).toContain("Разбор выполнен");
  });
});
