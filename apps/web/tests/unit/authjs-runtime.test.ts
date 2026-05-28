import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    auth: vi.fn(),
    handlers: {
      GET: vi.fn(),
      POST: vi.fn()
    },
    signIn: vi.fn(),
    signOut: vi.fn()
  }))
}));

describe("Auth.js runtime wiring", () => {
  it("keeps database sessions without Credentials providers in Auth.js runtime config", async () => {
    const { authConfig } = await import("@/auth/config");

    expect(authConfig.adapter).toBeDefined();
    expect(authConfig.secret).toBeDefined();
    expect(authConfig.session?.strategy).toBe("database");
    expect(authConfig.cookies?.sessionToken?.name).toBe("authjs.session-token");
    expect(authConfig.providers).toEqual([]);
  });

  it("sets Auth.js and legacy session cookies with the same database session token", async () => {
    const cookieStore = {
      set: vi.fn()
    };
    const { authJsSessionCookieName, authJsSessionTtlSeconds, sessionCookieName, setAuthSessionCookies } = await import(
      "@/lib/auth/session"
    );
    const { authCookieOptions } = await import("@/lib/auth/cookies");

    expect(authJsSessionCookieName).toBe("authjs.session-token");
    expect(authJsSessionTtlSeconds).toBe(60 * 60 * 12);

    setAuthSessionCookies(cookieStore, "db-session-token");

    const expectedOptions = authCookieOptions(authJsSessionTtlSeconds);
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    expect(cookieStore.set).toHaveBeenNthCalledWith(1, authJsSessionCookieName, "db-session-token", expectedOptions);
    expect(cookieStore.set).toHaveBeenNthCalledWith(2, sessionCookieName, "db-session-token", expectedOptions);
  });

  it("exports Auth.js handlers and helpers from the root auth module", async () => {
    const runtime = await import("../../auth");

    expect(runtime.auth).toEqual(expect.any(Function));
    expect(runtime.signIn).toEqual(expect.any(Function));
    expect(runtime.signOut).toEqual(expect.any(Function));
    expect(runtime.handlers.GET).toEqual(expect.any(Function));
    expect(runtime.handlers.POST).toEqual(expect.any(Function));
  });

  it("exposes the App Router Auth.js route handlers", async () => {
    const route = await import("@/app/api/auth/[...nextauth]/route");

    expect(route.GET).toEqual(expect.any(Function));
    expect(route.POST).toEqual(expect.any(Function));
  });
});
