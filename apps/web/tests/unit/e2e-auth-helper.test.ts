import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInE2EUser } from "../e2e/helpers/auth";

const mocks = vi.hoisted(() => ({
  createAuthSession: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  authJsSessionCookieName: "authjs.session-token",
  createAuthSession: mocks.createAuthSession,
  sessionCookieName: "qc_session"
}));

describe("e2e auth helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets Auth.js and legacy session cookies with the same database session token", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    const session = { expiresAt };
    const context = {
      addCookies: vi.fn().mockResolvedValue(undefined)
    };
    mocks.createAuthSession.mockResolvedValue({ token: "db-session-token", session });

    const result = await signInE2EUser(
      context as unknown as Parameters<typeof signInE2EUser>[0],
      { id: "user-1" },
      "playwright-e2e"
    );

    const expectedCookieOptions = {
      value: "db-session-token",
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
      expires: Math.floor(expiresAt.getTime() / 1000)
    };
    expect(mocks.createAuthSession).toHaveBeenCalledWith({
      userId: "user-1",
      userAgent: "playwright-e2e"
    });
    expect(context.addCookies).toHaveBeenCalledWith([
      {
        name: "authjs.session-token",
        ...expectedCookieOptions
      },
      {
        name: "qc_session",
        ...expectedCookieOptions
      }
    ]);
    expect(result).toEqual({ token: "db-session-token", session });
  });
});
