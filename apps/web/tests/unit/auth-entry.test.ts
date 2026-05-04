import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

function makeRequest(url: string, headers?: HeadersInit) {
  return new NextRequest(url, { headers });
}

describe("auth entry proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects production page requests without a session to the login page", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QC_DEMO_AUTH", "disabled");

    const response = proxy(makeRequest("http://localhost/reviews?status=queued"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("returnTo")).toBe("/reviews?status=queued");
  });

  it("allows auth pages and page requests with a session cookie", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QC_DEMO_AUTH", "disabled");

    expect(proxy(makeRequest("http://localhost/auth/login")).headers.get("x-middleware-next")).toBe("1");
    const response = proxy(makeRequest("http://localhost/reviews", { cookie: "qc_session=token" }));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
