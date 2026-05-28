import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/auth/logout/route";

const mocks = vi.hoisted(() => ({
  authJsSessionCookieNames: [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "authjs.callback-url",
    "__Secure-authjs.callback-url",
    "authjs.csrf-token",
    "__Host-authjs.csrf-token"
  ],
  revokeAuthSession: vi.fn()
}));

vi.mock("@/lib/auth/cookies", () => ({
  expiredCookieOptions: () => ({ path: "/", maxAge: 0 })
}));

vi.mock("@/lib/auth/session", () => ({
  authJsSessionCookieNames: mocks.authJsSessionCookieNames,
  revokeAuthSession: mocks.revokeAuthSession,
  sessionCookieName: "qc_session"
}));

vi.mock("@/lib/current-user", () => ({
  currentUserCookieName: "qc_current_user"
}));

function makeLogoutRequest(method: "GET" | "POST", cookie = "qc_session=session-token; qc_current_user=user-1") {
  return new NextRequest("http://localhost/auth/logout", {
    method,
    headers: {
      cookie
    }
  });
}

describe("auth logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects post logout submissions to the login page", async () => {
    const response = await POST(makeLogoutRequest("POST"));

    expect(mocks.revokeAuthSession).toHaveBeenCalledWith("session-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/auth/login?loggedOut=1");
    expect(response.cookies.get("qc_session")?.value).toBe("");
    expect(response.cookies.get("qc_current_user")?.value).toBe("");
  });

  it("clears legacy and Auth.js cookies on logout", async () => {
    const response = await POST(makeLogoutRequest("POST"));

    for (const cookieName of ["qc_session", ...mocks.authJsSessionCookieNames]) {
      expect(response.cookies.get(cookieName)?.value).toBe("");
    }
  });

  it("revokes the current Auth.js session token when the legacy cookie is absent", async () => {
    await POST(makeLogoutRequest("POST", "authjs.session-token=authjs-session-token; qc_current_user=user-1"));

    expect(mocks.revokeAuthSession).toHaveBeenCalledWith("authjs-session-token");
  });

  it("keeps direct get logout URLs compatible", async () => {
    const response = await GET(makeLogoutRequest("GET"));

    expect(mocks.revokeAuthSession).toHaveBeenCalledWith("session-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/auth/login?loggedOut=1");
  });
});
