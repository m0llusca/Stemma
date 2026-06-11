import { describe, expect, it } from "vitest";
import { getPermissions, hasPermission, requirePermission } from "@/lib/auth/permissions";

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

  it("allows support agents to read their scoped review queue plus self-review, feedback and training", () => {
    expect(getPermissions("SUPPORT_AGENT")).toEqual(["reviews:read", "feedback:acknowledge", "self_review:write", "training:manage"]);
    expect(hasPermission("SUPPORT_AGENT", "integrations:manage")).toBe(false);
    expect(hasPermission("SUPPORT_AGENT", "reports:read")).toBe(false);
  });

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
    ).toThrow("Недостаточно прав для выполнения операции.");
  });
});
