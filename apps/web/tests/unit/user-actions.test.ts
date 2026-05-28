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
    mocks.authSignIn.mockResolvedValue(undefined);
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

  it("stores failed local sign-in state in a flash cookie instead of the URL when Auth.js rejects credentials", async () => {
    const { AuthError } = await import("next-auth");
    mocks.authSignIn.mockRejectedValue(new AuthError("CredentialsSignin"));
    const { signInWithLocalCredentials } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("login", " DUBROVSKYRK ");
    formData.set("password", " wrong-password ");
    formData.set("returnTo", "/");

    await expect(signInWithLocalCredentials(formData)).rejects.toThrow("NEXT_REDIRECT:/auth/login?returnTo=%2F");

    expect(mocks.authSignIn).toHaveBeenCalledWith("credentials", {
      login: "dubrovskyrk",
      password: "wrong-password",
      redirectTo: "/"
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
  });

  it("rejects empty local credentials before calling Auth.js", async () => {
    const { signInWithLocalCredentials } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("login", " ");
    formData.set("password", "local-password-123");
    formData.set("returnTo", "/reviews");

    await expect(signInWithLocalCredentials(formData)).rejects.toThrow("NEXT_REDIRECT:/auth/login?returnTo=%2Freviews");

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

  it("delegates local credentials to Auth.js signIn with normalized login and safe redirect", async () => {
    mocks.authSignIn.mockRejectedValue(new Error("NEXT_REDIRECT:/reviews"));
    const { signInWithLocalCredentials } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("login", " Real-Admin ");
    formData.set("password", " local-password-123 ");
    formData.set("returnTo", "https://evil.example/reviews");

    await expect(signInWithLocalCredentials(formData)).rejects.toThrow("NEXT_REDIRECT:/reviews");

    expect(mocks.authSignIn).toHaveBeenCalledWith("credentials", {
      login: "real-admin",
      password: "local-password-123",
      redirectTo: "/reviews"
    });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.createAuthSession).not.toHaveBeenCalled();
  });

  it("preserves Auth.js server-action redirects for successful local sign-in", async () => {
    mocks.authSignIn.mockRejectedValue(new Error("NEXT_REDIRECT:/reviews"));
    const { signInWithLocalCredentials } = await import("@/lib/user-actions");
    const formData = new FormData();
    formData.set("login", " real-admin ");
    formData.set("password", "local-password-123");
    formData.set("returnTo", "/reviews");

    await expect(signInWithLocalCredentials(formData)).rejects.toThrow("NEXT_REDIRECT:/reviews");

    expect(mocks.authSignIn).toHaveBeenCalledWith("credentials", {
      login: "real-admin",
      password: "local-password-123",
      redirectTo: "/reviews"
    });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
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
