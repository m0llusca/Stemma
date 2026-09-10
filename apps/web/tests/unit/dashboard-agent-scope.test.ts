import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("dashboard page agent scope", () => {
  const source = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

  it("redirects roles without dashboard access to their role home", () => {
    expect(source).toContain("canAccessDashboard(user.role)");
    expect(source).toContain("redirect(roleHomePath(user.role, { name: user.name }))");
    expect(source).toContain('await requirePagePermission("reviews:read")');
  });

  it("scopes SUPPORT_AGENT review metrics by conversation.assigneeId", () => {
    expect(source).toContain(
      'user.role === "SUPPORT_AGENT" ? { conversation: { assigneeId: user.id } } : {}'
    );
  });

  it("scopes SUPPORT_AGENT conversation queues by assigneeId", () => {
    expect(source).toContain(
      'user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {}'
    );
  });

  it("scopes SUPPORT_AGENT review events by conversation.assigneeId", () => {
    expect(source).toContain(
      'user.role === "SUPPORT_AGENT" ? { review: { conversation: { assigneeId: user.id } } } : {}'
    );
  });

  it("resets Lead/Admin welcome-back to role-home, not the reviews inbox", () => {
    expect(source).toContain('welcomeBackResetHref("dashboard", user.role, { name: user.name })');
    expect(source).not.toContain("resetHref={queueFilterResetHref");
    // Zero high-risk KPI may use queue reset (same as exec chart); welcome-back must not.
    expect(source).toContain("highRiskKpiHref");
    expect(source).toContain("queueFilterResetHref(user.role, { name: user.name })");
  });

  it("does not authorize SUPPORT_AGENT metrics by assigneeName: user.name", () => {
    expect(source).not.toMatch(/assigneeName:\s*user\.name/);
  });

  it("does not load peer leaderboard or avg reviews unless canViewPeerQuality", () => {
    expect(source).toContain("const canViewPeerQualityMetrics = canViewPeerQuality(user.role)");
    expect(source).toMatch(/canViewPeerQualityMetrics\s*\?\s*prisma\.review\.findMany/);
    expect(source).toContain("canViewPeerQualityMetrics ? computeAgentLeaderboard(agentReviews, 5) : []");
    expect(source).toContain("{canViewPeerQualityMetrics ? (");
    expect(source).not.toContain('label="Средний балл"');
    expect(source).not.toContain("showPeerScoreRows");
    expect(source).not.toContain('user.role !== "SUPPORT_AGENT"');
  });
});
