import { describe, expect, it } from "vitest";
import { isAuthPath, normalizeRequestPathname } from "@/lib/auth/auth-path";

describe("auth path helpers", () => {
  it.each(["/auth", "/auth/login", "/auth/pending-access", "/auth/logout"])(
    "treats %s as an auth entry path",
    (pathname) => {
      expect(isAuthPath(pathname)).toBe(true);
    }
  );

  it.each(["/", "/dashboard", "/reviews", "/authorization"])(
    "does not treat %s as an auth entry path",
    (pathname) => {
      expect(isAuthPath(pathname)).toBe(false);
    }
  );

  it("accepts a bare request pathname header", () => {
    expect(normalizeRequestPathname("/auth/login")).toBe("/auth/login");
  });

  it("rejects missing, protocol-relative, and backslash values", () => {
    expect(normalizeRequestPathname(null)).toBeNull();
    expect(normalizeRequestPathname("")).toBeNull();
    expect(normalizeRequestPathname("auth/login")).toBeNull();
    expect(normalizeRequestPathname("//evil.example/auth/login")).toBeNull();
    expect(normalizeRequestPathname("/auth\\login")).toBeNull();
  });
});
