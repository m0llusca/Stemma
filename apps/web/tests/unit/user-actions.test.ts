import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoUserByIdWhere } from "@/lib/auth/demo-users";

const mocks = vi.hoisted(() => ({
  createAuthSession: vi.fn(),
  cookieDelete: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  headerGet: vi.fn(),
  headers: vi.fn(),
  isDemoAuthEnabled: vi.fn(),
  prisma: {
    user: {
      findFirst: vi.fn()
    },
    localCredential: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    identityProvider: {
      findFirst: vi.fn()
    }
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: mocks.headers
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/auth/session", () => ({
  createAuthSession: mocks.createAuthSession,
  sessionCookieName: "qc_session"
}));

vi.mock("@/lib/current-user", () => ({
  currentUserCookieName: "qc_current_user_id",
  isDemoAuthEnabled: mocks.isDemoAuthEnabled
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("user actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemoAuthEnabled.mockReturnValue(true);
    mocks.headerGet.mockReturnValue("vitest-agent");
    mocks.headers.mockResolvedValue({ get: mocks.headerGet });
    mocks.cookies.mockResolvedValue({ set: mocks.cookieSet, delete: mocks.cookieDelete });
    mocks.createAuthSession.mockResolvedValue({ token: "session-token" });
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({ id: "demo-provider" });
  });

  it("keeps sidebar demo switching disabled when demo auth is off", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(false);
    const { switchCurrentUser } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("userId", "demo-user");

    await expect(switchCurrentUser(formData)).rejects.toThrow("Демо-переключение пользователей отключено.");
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("refuses demo switching to users that are not linked to the demo provider", async () => {
    const { switchCurrentUser } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("userId", "real-user");

    mocks.prisma.user.findFirst.mockResolvedValue(null);

    await expect(switchCurrentUser(formData)).rejects.toThrow("Демо-пользователь не найден.");
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: demoUserByIdWhere("real-user"),
      select: { id: true, workspaceId: true, role: true }
    });
    expect(mocks.createAuthSession).not.toHaveBeenCalled();
  });

  it("allows explicit demo sign-in from the login page without enabling auto demo auth", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(false);
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "demo-user",
      workspaceId: "workspace-1",
      role: "QA_ANALYST"
    });
    const { signInWithDemoUser } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("userId", "demo-user");
    formData.set("returnTo", "/reviews");

    await expect(signInWithDemoUser(formData)).rejects.toThrow("NEXT_REDIRECT:/reviews");

    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: demoUserByIdWhere("demo-user"),
      select: { id: true, workspaceId: true, role: true }
    });
    expect(mocks.createAuthSession).toHaveBeenCalledWith({
      userId: "demo-user",
      providerId: "demo-provider",
      userAgent: "vitest-agent"
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith("qc_session", "session-token", expect.objectContaining({ path: "/" }));
    expect(mocks.cookieSet).toHaveBeenCalledWith("qc_current_user_id", "demo-user", expect.objectContaining({ path: "/" }));
  });
});
