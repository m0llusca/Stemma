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

  it("gates team score history and sparkline behind peer_quality:read", () => {
    expect(source).toContain("canViewPeerQuality(user.role)");
    expect(source).toContain("canViewPeerQualityMetrics");
    expect(source).toContain("canShowScoreTrend");
    expect(source).toMatch(/canShowScoreTrend\s*\?\s*prisma\.review\.findMany/);
    expect(source).toContain('canViewPeerQualityMetrics ? "Средний балл команды"');
    expect(source).toContain("loadAssignmentCoachingImpact");
    expect(source).toMatch(/if\s*\(\s*canShowScoreTrend\s*\)/);
  });

  it("gates peer theme/score loads and themesByAgent behind peer_quality:read", () => {
    expect(source).toContain("canViewPeerQualityMetrics");
    expect(source).toMatch(/canViewPeerQualityMetrics\s*\?\s*prisma\.review\.findMany/);
    expect(source).toMatch(/const themesByAgent = canViewPeerQualityMetrics/);
    expect(source).toContain("groupCoachingThemesByAgent");
    // Must not build themesByAgent from training:manage alone (QA leak).
    expect(source).not.toMatch(/const themesByAgent = canManageCoachingOps/);
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
