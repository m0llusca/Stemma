import { describe, expect, it } from "vitest";
import {
  adminSubnavGroups,
  adminOverviewPermission,
  filterAdminSubnavGroups
} from "@/components/admin/admin-subnav";
import { adminSectionTitles } from "@/lib/admin-sections";

const allItems = adminSubnavGroups.flatMap((group) => group.items);

describe("admin subnav configuration", () => {
  it("exposes a dedicated AI scoring section", () => {
    const item = allItems.find((entry) => entry.href === "/admin/ai-scoring");
    expect(item?.label).toBe("AI-оценка");
  });

  it("exposes a dedicated messaging channels section", () => {
    const item = allItems.find((entry) => entry.href === "/admin/channels");
    expect(item?.label).toBe("Уведомления");
  });

  it("labels every rail item with the canonical section title", () => {
    for (const item of allItems) {
      expect(item.label).toBe(adminSectionTitles[item.href as keyof typeof adminSectionTitles]);
    }
  });

  it("includes the report-schedules section gated by reports:read", () => {
    const item = allItems.find((entry) => entry.href === "/admin/report-schedules");
    expect(item?.permission).toBe("reports:read");
  });

  it("keeps groups balanced instead of a catch-all bucket", () => {
    // 3/3/3/4: ни одна группа не должна собирать половину пунктов.
    const sizes = adminSubnavGroups.map((group) => group.items.length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(4);
    expect(adminSubnavGroups.map((group) => group.id)).toEqual(["methodology", "identity", "data-flows", "platform"]);
  });

  it("keeps every section href unique", () => {
    const hrefs = allItems.map((entry) => entry.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("maps every rail item to the permission that guards its page", () => {
    const permissionByHref = Object.fromEntries(
      allItems.map((entry) => [entry.href, entry.permission])
    );

    expect(permissionByHref).toMatchObject({
      "/admin/scorecards": "scorecards:manage",
      "/admin/sampling": "sampling:manage",
      "/admin/ai-scoring": "backend_jobs:manage",
      "/admin/integrations": "integrations:manage",
      "/admin/users": "users:manage",
      "/admin/access": "auth_providers:manage",
      "/admin/channels": "backend_jobs:manage",
      "/admin/tokens": "api_tokens:manage",
      "/admin/system": "backend_jobs:manage",
      "/admin/appearance": "appearance:manage",
      "/admin/localization": "appearance:manage",
      "/admin/audit": "audit:read",
      "/admin/report-schedules": "reports:read"
    });
  });

  it("guards the overview link with the audit:read permission", () => {
    expect(adminOverviewPermission).toBe("audit:read");
  });
});

describe("filterAdminSubnavGroups", () => {
  it("shows an ADMIN every section", () => {
    const filtered = filterAdminSubnavGroups(adminSubnavGroups, "ADMIN");
    const visibleHrefs = filtered.flatMap((group) => group.items.map((item) => item.href));
    const allHrefs = allItems.map((item) => item.href);

    expect(new Set(visibleHrefs)).toEqual(new Set(allHrefs));
    // No group is dropped for an admin.
    expect(filtered.map((group) => group.id)).toEqual(adminSubnavGroups.map((group) => group.id));
  });

  it("shows a TEAM_LEAD only the sections their role can open", () => {
    const filtered = filterAdminSubnavGroups(adminSubnavGroups, "TEAM_LEAD");
    const visibleHrefs = filtered.flatMap((group) => group.items.map((item) => item.href));

    // Has scorecards:manage, sampling:manage, audit:read, reports:read.
    expect(visibleHrefs).toEqual(
      expect.arrayContaining(["/admin/scorecards", "/admin/sampling", "/admin/audit", "/admin/report-schedules"])
    );

    // Lacks the permissions guarding these pages.
    for (const hidden of [
      "/admin/ai-scoring",
      "/admin/integrations",
      "/admin/users",
      "/admin/access",
      "/admin/channels",
      "/admin/tokens",
      "/admin/system",
      "/admin/appearance",
      "/admin/localization"
    ]) {
      expect(visibleHrefs).not.toContain(hidden);
    }
  });

  it("drops groups that have no visible item", () => {
    const filtered = filterAdminSubnavGroups(adminSubnavGroups, "TEAM_LEAD");
    // "identity" group is users/access/tokens — none of which a TEAM_LEAD can
    // reach, so the whole group disappears.
    expect(filtered.some((group) => group.id === "identity")).toBe(false);
    // "data-flows" survives thanks to report-schedules (reports:read).
    const dataFlows = filtered.find((group) => group.id === "data-flows");
    expect(dataFlows?.items.map((item) => item.href)).toEqual(["/admin/report-schedules"]);
    // Every surviving group keeps at least one item.
    for (const group of filtered) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("keeps an item with no declared permission visible to everyone", () => {
    const groups = [
      {
        id: "misc",
        label: "Misc",
        items: [{ href: "/admin/open", label: "Open", icon: adminSubnavGroups[0].items[0].icon }]
      }
    ];

    const filtered = filterAdminSubnavGroups(groups, "VIEWER");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].items[0].href).toBe("/admin/open");
  });
});
