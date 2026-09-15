import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/auth/logout/route";
import { LOGOUT_LOGIN_PATH } from "@/lib/auth/logout-location";

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
    vi.unstubAllEnvs();
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("QC_PUBLIC_ORIGIN", "");
  });

  it("redirects post logout submissions to the login page", async () => {
    const response = await POST(makeLogoutRequest("POST"));

    expect(mocks.revokeAuthSession).toHaveBeenCalledWith("session-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/auth/login?loggedOut=1");
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
    expect(response.headers.get("cache-control")).toBe("no-store");
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
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not revoke the session on Next Link prefetch", async () => {
    const request = new NextRequest("http://localhost/auth/logout", {
      method: "GET",
      headers: {
        cookie: "qc_session=session-token; qc_current_user=user-1",
        "next-router-prefetch": "1",
        purpose: "prefetch"
      }
    });

    const response = await GET(request);

    expect(mocks.revokeAuthSession).not.toHaveBeenCalled();
    expect(response.status).toBe(204);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("qc_session")).toBeUndefined();
  });

  it("uses the public forwarded host instead of localhost or the bind address", async () => {
    const request = new NextRequest("http://localhost:3000/auth/logout", {
      method: "POST",
      headers: {
        cookie: "qc_session=session-token",
        host: "localhost:3000",
        "x-forwarded-host": "two-estimate-jury-experiences.trycloudflare.com",
        "x-forwarded-proto": "https"
      }
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://two-estimate-jury-experiences.trycloudflare.com/auth/login?loggedOut=1"
    );
    expect(response.headers.get("location")).not.toContain("localhost");
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
  });

  it("never emits 0.0.0.0 when Next bound that host behind a Cloudflare tunnel", async () => {
    const request = new NextRequest("https://0.0.0.0:3000/auth/logout", {
      method: "POST",
      headers: {
        cookie: "qc_session=session-token",
        host: "0.0.0.0:3000",
        "x-forwarded-host": "demo.trycloudflare.com",
        "x-forwarded-proto": "https"
      }
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://demo.trycloudflare.com/auth/login?loggedOut=1");
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
  });

  it("falls back to AUTH_URL when the only request host is the bind address", async () => {
    vi.stubEnv("AUTH_URL", "https://stemma.example");

    const request = new NextRequest("https://0.0.0.0:3000/auth/logout", {
      method: "POST",
      headers: {
        cookie: "qc_session=session-token",
        host: "0.0.0.0:3000",
        "x-forwarded-proto": "https"
      }
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe("https://stemma.example/auth/login?loggedOut=1");
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
  });

  it("keeps a relative Location when no public host or auth origin exists", async () => {
    const request = new NextRequest("https://0.0.0.0:3000/auth/logout", {
      method: "POST",
      headers: {
        cookie: "qc_session=session-token",
        host: "0.0.0.0:3000",
        "x-forwarded-proto": "https"
      }
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe(LOGOUT_LOGIN_PATH);
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
  });
});
