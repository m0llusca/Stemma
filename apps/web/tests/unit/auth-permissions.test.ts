import type { RoleName } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canViewPeerQuality, getPermissions, hasPermission, PermissionDeniedError, requirePermission } from "@/lib/auth/permissions";

describe("auth permissions", () => {
  it("allows admins to manage backend jobs and auth providers", () => {
    expect(hasPermission("ADMIN", "backend_jobs:manage")).toBe(true);
    expect(hasPermission("ADMIN", "auth_providers:manage")).toBe(true);
    expect(hasPermission("ADMIN", "users:manage")).toBe(true);
    expect(hasPermission("TEAM_LEAD", "users:manage")).toBe(false);
  });

  it("restricts report export management to admin, team lead and QA analyst roles", () => {
    expect(hasPermission("ADMIN", "reports:manage")).toBe(true);
    expect(hasPermission("TEAM_LEAD", "reports:manage")).toBe(true);
    expect(hasPermission("QA_ANALYST", "reports:manage")).toBe(true);
    expect(hasPermission("SUPPORT_AGENT", "reports:manage")).toBe(false);
    expect(hasPermission("VIEWER", "reports:manage")).toBe(false);
  });

  it("splits training:consume for agents from training:manage for operators", () => {
    expect(hasPermission("ADMIN", "training:manage")).toBe(true);
    expect(hasPermission("TEAM_LEAD", "training:manage")).toBe(true);
    expect(hasPermission("QA_ANALYST", "training:manage")).toBe(true);
    expect(hasPermission("SUPPORT_AGENT", "training:manage")).toBe(false);
    expect(hasPermission("VIEWER", "training:manage")).toBe(false);

    expect(hasPermission("SUPPORT_AGENT", "training:consume")).toBe(true);
    expect(hasPermission("ADMIN", "training:consume")).toBe(false);
    expect(hasPermission("TEAM_LEAD", "training:consume")).toBe(false);
    expect(hasPermission("QA_ANALYST", "training:consume")).toBe(false);
    expect(hasPermission("VIEWER", "training:consume")).toBe(false);
  });

  it("allows support agents to read their scoped review queue plus self-review, feedback and training consume", () => {
    expect(getPermissions("SUPPORT_AGENT")).toEqual([
      "reviews:read",
      "feedback:acknowledge",
      "self_review:write",
      "training:consume"
    ]);
    expect(hasPermission("SUPPORT_AGENT", "integrations:manage")).toBe(false);
    expect(hasPermission("SUPPORT_AGENT", "reports:read")).toBe(false);
    expect(hasPermission("SUPPORT_AGENT", "peer_quality:read")).toBe(false);
  });

  it.each([
    ["ADMIN", true],
    ["TEAM_LEAD", true],
    ["QA_ANALYST", false],
    ["SUPPORT_AGENT", false],
    ["VIEWER", false]
  ] as const satisfies ReadonlyArray<readonly [RoleName, boolean]>)(
    "gates peer leaderboard and avg to TEAM_LEAD+ADMIN (%s → %s)",
    (role, allowed) => {
      expect(hasPermission(role, "peer_quality:read")).toBe(allowed);
      expect(canViewPeerQuality(role)).toBe(allowed);
    }
  );

  it("throws a Russian authorization error for forbidden operations", () => {
    expect(() =>
      requirePermission(
        {
          id: "user-1",
          workspaceId: "workspace-1",
          email: "agent@example.com",
          name: "Оператор",
          role: "SUPPORT_AGENT"
        },
        "scorecards:manage"
      )
    ).toThrow(PermissionDeniedError);
    expect(() =>
      requirePermission(
        {
          id: "user-1",
          workspaceId: "workspace-1",
          email: "agent@example.com",
          name: "Оператор",
          role: "SUPPORT_AGENT"
        },
        "scorecards:manage"
      )
    ).toThrow("Недостаточно прав для выполнения операции.");
  });
});
