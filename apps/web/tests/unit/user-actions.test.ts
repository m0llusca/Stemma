import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoUserByIdWhere } from "@/lib/auth/demo-users";

const mocks = vi.hoisted(() => ({
  AuthError: class AuthError extends Error {
    type: string;

    constructor(type: string) {
      super(type);
      this.name = "AuthError";
      this.type = type;
    }
  },
  authSignIn: vi.fn(),
  authorizeLocalCredentials: vi.fn(),
  createAuthSession: vi.fn(),
  cookieDelete: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  headerGet: vi.fn(),
  headers: vi.fn(),
  isDemoAuthEnabled: vi.fn(),
  verifyLocalPassword: vi.fn(),
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
  revalidatePath: vi.fn(),
  setAuthSessionCookies: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next-auth", () => ({
  AuthError: mocks.AuthError
}));

vi.mock("../../auth", () => ({
  signIn: mocks.authSignIn
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
  setAuthSessionCookies: mocks.setAuthSessionCookies,
  sessionCookieName: "qc_session"
}));

vi.mock("@/lib/auth/local-credentials", () => ({
  normalizeLocalLogin: (value: string) => value.trim().toLowerCase()
}));

vi.mock("@/auth/providers/local", () => ({
  authorizeLocalCredentials: mocks.authorizeLocalCredentials
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
    mocks.authSignIn.mockRejectedValue(new Error("Auth.js signIn should not be called by local credential actions."));
    mocks.authorizeLocalCredentials.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.isDemoAuthEnabled.mockReturnValue(true);
    mocks.headerGet.mockReturnValue("vitest-agent");
    mocks.headers.mockResolvedValue({ get: mocks.headerGet });
    mocks.cookies.mockResolvedValue({ set: mocks.cookieSet, delete: mocks.cookieDelete });
    mocks.createAuthSession.mockResolvedValue({ token: "session-token" });
    mocks.setAuthSessionCookies.mockImplementation(
      (cookieStore: { set: (name: string, value: string, options: Record<string, unknown>) => void }, token: string) => {
        const options = {
          httpOnly: true,
          maxAge: 60 * 60 * 12,
          path: "/",
          sameSite: "lax",
          secure: false
        };
        cookieStore.set("authjs.session-token", token, options);
        cookieStore.set("qc_session", token, options);
      }
    );
    mocks.prisma.externalIdentity.count.mockResolvedValue(0);
    mocks.prisma.identityProvider.count.mockResolvedValue(0);
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({ id: "demo-provider" });
    mocks.prisma.localCredential.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.workspace.create.mockResolvedValue({ id: "primary-workspace" });
    mocks.prisma.workspace.findFirst.mockResolvedValue({ id: "primary-workspace" });
  });

  it("stores failed local sign-in state in a flash cookie instead of the URL when local authorization rejects credentials", async () => {
    mocks.authorizeLocalCredentials.mockResolvedValue(null);
    const { signInWithLocalCredentials } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("login", " DUBROVSKYRK ");
    formData.set("password", " wrong-password ");
    formData.set("returnTo", "/");

    await expect(signInWithLocalCredentials(formData)).rejects.toThrow("NEXT_REDIRECT:/auth/login?returnTo=%2F");

    expect(mocks.authorizeLocalCredentials).toHaveBeenCalledWith({
      login: "dubrovskyrk",
      password: "wrong-password"
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "qc_login_flash",
      "invalid_credentials",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      })
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/login?returnTo=%2F");
    expect(mocks.createAuthSession).not.toHaveBeenCalled();
    expect(mocks.setAuthSessionCookies).not.toHaveBeenCalled();
    expect(mocks.authSignIn).not.toHaveBeenCalled();
  });

  it("rejects empty local credentials before calling local authorization", async () => {
    const { signInWithLocalCredentials } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("login", " ");
    formData.set("password", "local-password-123");
    formData.set("returnTo", "/reviews");

    await expect(signInWithLocalCredentials(formData)).rejects.toThrow("NEXT_REDIRECT:/auth/login?returnTo=%2Freviews");

    expect(mocks.authorizeLocalCredentials).not.toHaveBeenCalled();
    expect(mocks.authSignIn).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "qc_login_flash",
      "invalid_credentials",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      })
    );
  });

  it("creates an AuthSession and sets Auth.js plus legacy cookies for successful local sign-in", async () => {
    mocks.authorizeLocalCredentials.mockResolvedValue({
      id: "real-user",
      workspaceId: "workspace-1",
      email: "real.admin@example.com",
      name: "Real Admin",
      role: "ADMIN"
    });
    const { signInWithLocalCredentials } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("login", " Real-Admin ");
    formData.set("password", " local-password-123 ");
    formData.set("returnTo", "https://evil.example/reviews");

    await expect(signInWithLocalCredentials(formData)).rejects.toThrow("NEXT_REDIRECT:/reviews");

    expect(mocks.authorizeLocalCredentials).toHaveBeenCalledWith({
      login: "real-admin",
      password: "local-password-123"
    });
    expect(mocks.createAuthSession).toHaveBeenCalledWith({
      userId: "real-user",
      userAgent: "vitest-agent"
    });
    expect(mocks.setAuthSessionCookies).toHaveBeenCalledWith(
      expect.objectContaining({
        delete: mocks.cookieDelete,
        set: mocks.cookieSet
      }),
      "session-token"
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "authjs.session-token",
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      })
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "qc_session",
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      })
    );
    expect(mocks.cookieDelete).toHaveBeenCalledWith("qc_login_flash");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.authSignIn).not.toHaveBeenCalled();
  });

  it("keeps demo sign-in behavior while using the shared session cookie helper", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "demo-user",
      workspaceId: "demo-workspace",
      role: "SUPPORT_AGENT"
    });
    const { signInWithDemoUser } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("userId", "demo-user");
    formData.set("returnTo", "/reviews");

    await expect(signInWithDemoUser(formData)).rejects.toThrow("NEXT_REDIRECT:/self-review");

    expect(mocks.createAuthSession).toHaveBeenCalledWith({
      providerId: "demo-provider",
      userAgent: "vitest-agent",
      userId: "demo-user"
    });
    expect(mocks.setAuthSessionCookies).toHaveBeenCalledWith(
      expect.objectContaining({
        delete: mocks.cookieDelete,
        set: mocks.cookieSet
      }),
      "session-token"
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "authjs.session-token",
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      })
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "qc_session",
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      })
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "qc_current_user_id",
      "demo-user",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      })
    );
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

  it("rejects explicit demo sign-in when demo auth is disabled without querying users or creating a session", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(false);
    const { signInWithDemoUser } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("userId", "demo-user");
    formData.set("returnTo", "/reviews");

    await expect(signInWithDemoUser(formData)).rejects.toThrow("Демо-переключение пользователей отключено.");

    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.identityProvider.findFirst).not.toHaveBeenCalled();
    expect(mocks.createAuthSession).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
