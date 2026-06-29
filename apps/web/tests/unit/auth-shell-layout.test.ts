import { readFileSync, readdirSync } from "node:fs";
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
    // Component styles live in styles/components/*.css partials (globals.css holds
    // only the @tailwind layers, theme.css holds tokens/themes — see layout.tsx
    // import order). The monolith was split into ordered numbered partials.
    const dir = join(process.cwd(), "src/app/styles/components");
    const css = readdirSync(dir)
      .filter((file) => file.endsWith(".css"))
      .sort()
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n");

    expect(css).toContain(".page:has(.auth-shell) .app-nav");
    expect(css).toMatch(/\.page:has\(\.auth-shell\) \.app-nav\s*{\s*display:\s*none;/);
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
