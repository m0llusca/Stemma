import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

function makeRequest(cookie: string) {
  return new NextRequest("http://localhost/reviews", {
    headers: {
      cookie
    }
  });
}

// The login shell's "no workspace chrome" rule is no longer CSS: AppNav returns
// null for unauthenticated requests. That behaviour is covered directly in
// tests/unit/app-nav.test.tsx.

describe("auth proxy migration cookies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token"
  ])("allows page requests when %s is present", (cookieName) => {
    vi.stubEnv("QC_DEMO_AUTH", "disabled");

    const response = proxy(makeRequest(`${cookieName}=token`));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
