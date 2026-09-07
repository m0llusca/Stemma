import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminHubPermissions, canAccessAdminHub } from "@/lib/admin-access";

describe("canAccessAdminHub", () => {
  it("lets roles with at least one admin-section permission into the hub", () => {
    expect(canAccessAdminHub("ADMIN")).toBe(true);
    expect(canAccessAdminHub("TEAM_LEAD")).toBe(true);
    expect(canAccessAdminHub("QA_ANALYST")).toBe(true);
  });

  it("keeps roles without admin-section permissions out of the hub", () => {
    expect(canAccessAdminHub("SUPPORT_AGENT")).toBe(false);
    expect(canAccessAdminHub("EXEC")).toBe(false);
    expect(canAccessAdminHub("VIEWER")).toBe(false);
  });

  it("unlocks the hub for QA via reports:manage, not audit:read", () => {
    expect(adminHubPermissions).toContain("reports:manage");
    expect(adminHubPermissions).toContain("audit:read");
  });
});

describe("admin hub page contract", () => {
  const adminPage = readFileSync(join(process.cwd(), "src/app/admin/page.tsx"), "utf8");

  it("gates /admin on canAccessAdminHub instead of audit:read alone", () => {
    expect(adminPage).toContain("canAccessAdminHub(user.role)");
    expect(adminPage).toContain("denyPageAccess()");
    expect(adminPage).not.toContain('requirePagePermission("audit:read")');
  });

  it("shows the report-schedules card to QA analysts", () => {
    expect(adminPage).toContain('href: "/admin/report-schedules"');
    expect(adminPage).toMatch(
      /href: "\/admin\/report-schedules"[\s\S]*?roles: \["ADMIN", "TEAM_LEAD", "QA_ANALYST"\]/
    );
  });
});
