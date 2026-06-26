import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildShellNavItems, getShellSnapshot } from "@/lib/shell/snapshot";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn()
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser
}));

describe("shell snapshot navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows support agents self review without admin navigation", () => {
    const hrefs = buildShellNavItems({ role: "SUPPORT_AGENT" }).map((item) => item.href);

    expect(hrefs).toContain("/self-review");
    expect(hrefs).not.toContain("/admin");
  });

  it("shows admin navigation without self review", () => {
    const hrefs = buildShellNavItems({ role: "ADMIN" }).map((item) => item.href);

    expect(hrefs).toContain("/admin");
    expect(hrefs).not.toContain("/self-review");
  });

  it("returns small user, branding, and role-filtered nav data", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "lead@example.com",
      name: "Lead User",
      role: "TEAM_LEAD",
      workspace: {
        brandName: "Acme QA",
        brandTagline: "Quality desk",
        brandLogoUrl: null,
        brandLogoAlt: null,
        brandMark: "AQ",
        brandPrimaryColor: "#3157d5",
        brandAccentColor: "#7c97ff",
        uiPaletteOverridesJson: "{}"
      }
    });

    const snapshot = await getShellSnapshot();

    expect(snapshot).toEqual({
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        email: "lead@example.com",
        name: "Lead User",
        role: "TEAM_LEAD"
      },
      branding: expect.objectContaining({
        brandName: "Acme QA",
        brandTagline: "Quality desk",
        brandMark: "AQ"
      }),
      navItems: expect.arrayContaining([
        expect.objectContaining({ href: "/dashboard" }),
        expect.objectContaining({ href: "/admin" })
      ])
    });
    expect(snapshot.navItems.some((item) => item.href === "/self-review")).toBe(false);
  });

  it("keeps shell snapshot imports away from heavy runtime boundaries", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/shell/snapshot.ts"), "utf8");
    const importLines = source.match(/^import\s.+from\s+["'].+["'];$/gm)?.join("\n") ?? "";

    expect(importLines).not.toMatch(/ldap|ldaps|queue|integration/i);
  });
});
