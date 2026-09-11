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
    expect(source).toContain("const canViewPeerQualityMetrics = canViewPeerQuality(user.role)");
    expect(source).toContain("const canShowScoreTrend = isSupportAgent || canViewPeerQualityMetrics");
    expect(source).toContain("canShowScoreTrend");
    expect(source).toContain('canViewPeerQualityMetrics ? "Средний балл команды"');
    expect(source).toContain("loadAssignmentCoachingImpact");
    expect(source).not.toContain('{isSupportAgent ? "Ваш средний балл" : "Средний балл команды"}');
  });

  it("gates peer theme/score loads and themesByAgent behind peer_quality:read", () => {
    expect(source).toContain("canViewPeerQualityMetrics");
    expect(source).toMatch(/const themesByAgent = canViewPeerQualityMetrics/);
    expect(source).toContain("groupCoachingThemesByAgent");
    expect(source).not.toMatch(/const themesByAgent = canManageCoachingOps/);
  });

  it("hides create CTAs and empty assignee filter when agents cannot manage coaching ops", () => {
    expect(source).toContain("canManageCoachingOps");
    expect(source).toContain("Добавить правило");
    expect(source).toContain("Добавить в обучение");
    expect(source).toContain("Новая задача");
    expect(source).toContain("supportUsers.length > 0");
    expect(source).toContain('id="filter-assigneeId"');
  });
});
