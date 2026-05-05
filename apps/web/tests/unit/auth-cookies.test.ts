import { afterEach, describe, expect, it, vi } from "vitest";
import { authCookieOptions, demoUserCookieOptions, expiredCookieOptions, oidcFlowCookieOptions } from "@/lib/auth/cookies";

describe("auth cookie policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses secure cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(authCookieOptions(60)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60
    });
    expect(oidcFlowCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 600
    });
  });

  it("does not force secure cookies in local development", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(authCookieOptions(60).secure).toBe(false);
    expect(demoUserCookieOptions(60).secure).toBe(false);
  });

  it("keeps demo user cookies readable while using secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(demoUserCookieOptions(60)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60
    });
  });

  it("expires cookies with path and max age", () => {
    expect(expiredCookieOptions()).toEqual({
      path: "/",
      maxAge: 0
    });
  });
});
