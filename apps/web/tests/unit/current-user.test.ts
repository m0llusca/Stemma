import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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

vi.mock("@/lib/auth/session", () => ({
  getValidAuthSession: mocks.getValidAuthSession,
  sessionCookieName: "qc_session"
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("current user resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.cookieGet.mockReturnValue({ value: "session-token" });
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
