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

  it("gates team average / team trend behind peer_quality:read, not merely !SUPPORT_AGENT", () => {
    expect(source).toContain("const canViewPeerQualityMetrics = canViewPeerQuality(user.role)");
    expect(source).toContain("const showScoreTrendCard = isSupportAgent || canViewPeerQualityMetrics");
    expect(source).toContain('{canViewPeerQualityMetrics ? "Средний балл команды" : "Ваш средний балл"}');
    expect(source).toContain("{showScoreTrendCard ? (");
    expect(source).not.toContain('{isSupportAgent ? "Ваш средний балл" : "Средний балл команды"}');
  });

  it("hides create CTAs and empty assignee filter when agents cannot manage coaching ops", () => {
    expect(source).toContain("canManageCoachingOps");
    expect(source).toMatch(/canManageCoachingOps\s*\?\s*\([\s\S]*?Добавить правило/);
    expect(source).toMatch(/canManageCoachingOps\s*\?\s*\([\s\S]*?Добавить в обучение/);
    expect(source).toMatch(/canManageCoachingOps\s*\?\s*\([\s\S]*?Новая задача/);
    expect(source).toContain("supportUsers.length > 0 ? (");
    expect(source).toContain('id="filter-assigneeId"');
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

  it("scopes coaching plans by conversation assigneeId for agents, not agentName", () => {
    expect(source).toContain("filterCoachingPlansForAgent");
    expect(source).toContain("filterCoachingPlansForAgent(plans, user.id)");
    expect(source).not.toContain("plan.agentName === user.name");
  });
});
