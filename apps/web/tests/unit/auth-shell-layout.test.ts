import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("auth shell layout", () => {
  it("removes workspace chrome while the login shell is rendered", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain(".page:has(.auth-shell) .app-sidebar");
    expect(css).toContain(".page:has(.auth-shell) .app-topbar");
    expect(css).toMatch(/\.page:has\(\.auth-shell\) \.app-sidebar,\s*\.page:has\(\.auth-shell\) \.app-topbar\s*{\s*display:\s*none;/);
  });
});

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
