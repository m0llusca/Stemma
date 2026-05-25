import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicOriginError, resolvePublicOrigin } from "@/lib/public-origin";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe("public origin resolver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers explicit QC_PUBLIC_ORIGIN over request and forwarded hosts", () => {
    vi.stubEnv("QC_PUBLIC_ORIGIN", "https://configured.example.com");

    expect(
      resolvePublicOrigin({
        requestUrl: "https://internal.example.net/auth/sso",
        headers: headers({
          host: "internal.example.net",
          "x-forwarded-host": "attacker.example.com"
        })
      })
    ).toBe("https://configured.example.com");
  });

  it("ignores raw forwarded-host when it is not configured or allowlisted", () => {
    expect(
      resolvePublicOrigin({
        requestUrl: "https://app.example.com/auth/saml/metadata",
        headers: headers({
          host: "app.example.com",
          "x-forwarded-host": "attacker.example.com"
        })
      })
    ).toBe("https://app.example.com");
  });

  it("uses forwarded-host only when it is explicitly allowlisted", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QC_PUBLIC_ORIGIN_ALLOWLIST", "public.example.com");

    expect(
      resolvePublicOrigin({
        requestUrl: "http://internal:3000/auth/sso",
        headers: headers({
          host: "internal:3000",
          "x-forwarded-host": "public.example.com"
        })
      })
    ).toBe("https://public.example.com");
  });

  it("uses an allowlisted request host in production without trusting forwarded-host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QC_PUBLIC_ORIGIN_ALLOWLIST", "app.example.com");

    expect(
      resolvePublicOrigin({
        requestUrl: "https://app.example.com/auth/sso",
        headers: headers({
          host: "app.example.com",
          "x-forwarded-host": "attacker.example.com"
        })
      })
    ).toBe("https://app.example.com");
  });

  it("rejects missing public origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() =>
      resolvePublicOrigin({
        requestUrl: "http://internal:3000/auth/sso",
        headers: headers({ host: "internal:3000" })
      })
    ).toThrow(PublicOriginError);
  });

  it("rejects non-HTTPS configured public origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QC_PUBLIC_ORIGIN", "http://app.example.com");

    expect(() => resolvePublicOrigin()).toThrow(/HTTPS/);
  });
});
