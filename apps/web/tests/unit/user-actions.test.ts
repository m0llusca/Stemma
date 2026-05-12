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
    $transaction: vi.fn(),
    authSession: {
      updateMany: vi.fn()
    },
    externalIdentity: {
      count: vi.fn()
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    localCredential: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    identityProvider: {
      count: vi.fn(),
      findFirst: vi.fn()
    },
    workspace: {
      create: vi.fn(),
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

vi.mock("@/lib/auth/local-credentials", () => ({
  normalizeLocalLogin: (value: string) => value.trim().toLowerCase(),
  verifyLocalPassword: vi.fn(() => true)
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
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.isDemoAuthEnabled.mockReturnValue(true);
    mocks.headerGet.mockReturnValue("vitest-agent");
    mocks.headers.mockResolvedValue({ get: mocks.headerGet });
    mocks.cookies.mockResolvedValue({ set: mocks.cookieSet, delete: mocks.cookieDelete });
    mocks.createAuthSession.mockResolvedValue({ token: "session-token" });
    mocks.prisma.externalIdentity.count.mockResolvedValue(0);
    mocks.prisma.identityProvider.count.mockResolvedValue(0);
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({ id: "demo-provider" });
    mocks.prisma.localCredential.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.workspace.create.mockResolvedValue({ id: "primary-workspace" });
    mocks.prisma.workspace.findFirst.mockResolvedValue({ id: "primary-workspace" });
  });

  it("moves real local users out of the demo workspace before creating a local session", async () => {
    mocks.prisma.localCredential.findFirst
      .mockResolvedValueOnce({
        id: "credential-1",
        login: "real-admin",
        userId: "real-user",
        passwordHash: "hash",
        passwordSalt: "salt",
        keyVersion: "scrypt-v1",
        user: {
          id: "real-user",
          email: "real.admin@example.com",
          workspaceId: "demo-workspace"
        }
      })
      .mockResolvedValueOnce(null);
    mocks.prisma.identityProvider.count.mockResolvedValue(1);
    mocks.prisma.externalIdentity.count.mockResolvedValue(0);
    const { signInWithLocalCredentials } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("login", " real-admin ");
    formData.set("password", "local-password-123");
    formData.set("returnTo", "/reviews");

    await expect(signInWithLocalCredentials(formData)).rejects.toThrow("NEXT_REDIRECT:/reviews");

    expect(mocks.prisma.workspace.findFirst).toHaveBeenCalledWith({
      where: {
        identityProviders: {
          none: {
            type: "DEMO"
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        id: true
      }
    });
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: {
        id: "real-user"
      },
      data: {
        workspaceId: "primary-workspace"
      }
    });
    expect(mocks.prisma.localCredential.update).toHaveBeenCalledWith({
      where: {
        id: "credential-1"
      },
      data: {
        workspaceId: "primary-workspace"
      }
    });
    expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "real-user"
      },
      data: {
        workspaceId: "primary-workspace"
      }
    });
    expect(mocks.createAuthSession).toHaveBeenCalledWith({
      userId: "real-user",
      userAgent: "vitest-agent"
    });
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
