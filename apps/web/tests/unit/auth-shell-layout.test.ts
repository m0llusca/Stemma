import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth shell layout", () => {
  it("removes workspace chrome while the login shell is rendered", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain(".page:has(.auth-shell) .app-sidebar");
    expect(css).toContain(".page:has(.auth-shell) .app-topbar");
    expect(css).toMatch(/\.page:has\(\.auth-shell\) \.app-sidebar,\s*\.page:has\(\.auth-shell\) \.app-topbar\s*{\s*display:\s*none;/);
  });
});
