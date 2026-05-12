import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/auth/logout/route";

const mocks = vi.hoisted(() => ({
  revokeAuthSession: vi.fn()
}));

vi.mock("@/lib/auth/cookies", () => ({
  expiredCookieOptions: () => ({ path: "/", maxAge: 0 })
}));

vi.mock("@/lib/auth/session", () => ({
  revokeAuthSession: mocks.revokeAuthSession,
  sessionCookieName: "qc_session"
}));

vi.mock("@/lib/current-user", () => ({
  currentUserCookieName: "qc_current_user"
}));

function makeLogoutRequest(method: "GET" | "POST") {
  return new NextRequest("http://localhost/auth/logout", {
    method,
    headers: {
      cookie: "qc_session=session-token; qc_current_user=user-1"
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

  it("keeps direct get logout URLs compatible", async () => {
    const response = await GET(makeLogoutRequest("GET"));

    expect(mocks.revokeAuthSession).toHaveBeenCalledWith("session-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/auth/login?loggedOut=1");
  });
});
