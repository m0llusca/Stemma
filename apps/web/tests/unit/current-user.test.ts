import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cookieGet: vi.fn(),
  cookies: vi.fn(),
  getValidAuthSession: vi.fn(),
  prisma: {
    identityProvider: {
      findUnique: vi.fn()
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn()
    }
  }
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies
}));

vi.mock("../../auth", () => ({
  auth: mocks.auth
}));

vi.mock("@/lib/auth/session", () => ({
  getValidAuthSession: mocks.getValidAuthSession,
  sessionCookieName: "qc_session"
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

const workspace = {
  id: "workspace-1",
  name: "Quality Workspace",
  brandName: null,
  brandTagline: null,
  brandLogoUrl: null,
  brandLogoAlt: null,
  brandMark: null,
  brandPrimaryColor: "#3157d5",
  brandAccentColor: "#7c97ff",
  uiTheme: "graphite",
  uiDensity: "comfortable",
  uiCorners: "medium",
  uiContrast: "standard",
  uiPaletteOverridesJson: "{}",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    workspaceId: "workspace-1",
    email: "user@example.com",
    name: "User",
    role: "QA_ANALYST",
    lifecycleStatus: "ACTIVE",
    supportLine: null,
    teamName: null,
    workspace,
    ...overrides
  };
}

describe("current user resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.auth.mockResolvedValue(null);
    mocks.cookieGet.mockReturnValue({ value: "session-token" });
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    mocks.getValidAuthSession.mockResolvedValue(null);
    mocks.prisma.identityProvider.findUnique.mockResolvedValue(null);
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the canonical Auth.js user before checking the legacy session fallback", async () => {
    const authUser = user({
      id: "auth-user",
      email: "auth@example.com",
      name: "Auth User",
      role: "ADMIN"
    });
    mocks.auth.mockResolvedValue({
      user: {
        id: "auth-user",
        workspaceId: "workspace-1",
        email: "stale-auth@example.com",
        name: "Stale Auth",
        role: "QA_ANALYST"
      }
    });
    mocks.prisma.user.findUnique.mockResolvedValue(authUser);
    mocks.getValidAuthSession.mockResolvedValue({
      id: "legacy-session",
      providerId: null,
      user: user({
        id: "legacy-user",
        email: "legacy@example.com",
        name: "Legacy User"
      })
    });

    const { getCurrentUser } = await import("@/lib/current-user");

    await expect(getCurrentUser()).resolves.toEqual(authUser);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "auth-user" },
      include: { workspace: true }
    });
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.getValidAuthSession).not.toHaveBeenCalled();
  });

  it("rejects inactive Auth.js users with AuthRequiredError", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "inactive-user"
      }
    });
    mocks.prisma.user.findUnique.mockResolvedValue(
      user({
        id: "inactive-user",
        lifecycleStatus: "SUSPENDED"
      })
    );

    const { AuthRequiredError, getCurrentUser } = await import("@/lib/current-user");

    await expect(getCurrentUser()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "inactive-user" },
      include: { workspace: true }
    });
    expect(mocks.getValidAuthSession).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("keeps the legacy session fallback when Auth.js has no session", async () => {
    const legacyUser = user({
      id: "legacy-user",
      email: "legacy@example.com",
      name: "Legacy User",
      role: "TEAM_LEAD"
    });
    mocks.auth.mockResolvedValue(null);
    mocks.getValidAuthSession.mockResolvedValue({
      id: "legacy-session",
      providerId: null,
      user: legacyUser
    });

    const { getCurrentUser } = await import("@/lib/current-user");

    await expect(getCurrentUser()).resolves.toEqual(legacyUser);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.cookies).toHaveBeenCalledOnce();
    expect(mocks.getValidAuthSession).toHaveBeenCalledWith("session-token");
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("keeps the demo fallback when Auth.js and the legacy session are absent", async () => {
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    const demoUser = user({
      id: "demo-user",
      email: "demo@example.com",
      name: "Demo User"
    });
    mocks.auth.mockResolvedValue(null);
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.getValidAuthSession.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.findFirst.mockResolvedValue(demoUser);

    const { getCurrentUser } = await import("@/lib/current-user");

    await expect(getCurrentUser()).resolves.toEqual(demoUser);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.getValidAuthSession).toHaveBeenCalledWith(undefined);
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { role: { in: ["QA_ANALYST", "ADMIN", "TEAM_LEAD"] } },
      orderBy: {
        role: "asc"
      },
      include: { workspace: true }
    });
  });

  it("rejects already-active demo sessions when demo auth is disabled", async () => {
    vi.stubEnv("QC_DEMO_AUTH", "");
    mocks.getValidAuthSession.mockResolvedValue({
      id: "session-1",
      providerId: "demo-provider",
      user: {
        id: "demo-user",
        workspaceId: "workspace-1",
        email: "demo@example.com",
        name: "Demo",
        role: "QA_ANALYST",
        lifecycleStatus: "ACTIVE"
      }
    });
    mocks.prisma.identityProvider.findUnique.mockResolvedValue({ type: "DEMO" });

    const { getCurrentUser } = await import("@/lib/current-user");

    await expect(getCurrentUser()).rejects.toThrow("Нет активной пользовательской сессии.");
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
