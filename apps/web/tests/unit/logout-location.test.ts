import { afterEach, describe, expect, it, vi } from "vitest";
import { isBindOnlyHostname, LOGOUT_LOGIN_PATH, resolveLogoutLocation } from "@/lib/auth/logout-location";

describe("resolveLogoutLocation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats 0.0.0.0 and IPv6 unspecified as bind-only hosts", () => {
    expect(isBindOnlyHostname("0.0.0.0")).toBe(true);
    expect(isBindOnlyHostname("::")).toBe(true);
    expect(isBindOnlyHostname("[::]")).toBe(true);
    expect(isBindOnlyHostname("localhost")).toBe(false);
    expect(isBindOnlyHostname("demo.trycloudflare.com")).toBe(false);
  });

  it("never returns a Location containing 0.0.0.0", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("QC_PUBLIC_ORIGIN", "");

    const location = resolveLogoutLocation(
      new Headers({
        host: "0.0.0.0:3000",
        "x-forwarded-proto": "https"
      })
    );

    expect(location).toBe(LOGOUT_LOGIN_PATH);
    expect(location).not.toContain("0.0.0.0");
  });

  it("prefers x-forwarded-host over the bind Host header", () => {
    const location = resolveLogoutLocation(
      new Headers({
        host: "0.0.0.0:3000",
        "x-forwarded-host": "demo.trycloudflare.com",
        "x-forwarded-proto": "https"
      })
    );

    expect(location).toBe("https://demo.trycloudflare.com/auth/login?loggedOut=1");
  });
});
