import { describe, expect, it } from "vitest";
import { buildAuthorizationUrl, createOidcNonce, createOidcState, createPkceChallenge, createPkceVerifier, resolveProviderClientSecret } from "@/lib/auth/oidc";

describe("OIDC helpers", () => {
  it("creates PKCE verifier/challenge pairs", () => {
    const verifier = createPkceVerifier();
    const challenge = createPkceChallenge(verifier);

    expect(verifier.length).toBeGreaterThan(40);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createPkceChallenge(verifier)).toBe(challenge);
  });

  it("builds an authorization-code redirect for Microsoft Entra", () => {
    const url = buildAuthorizationUrl({
      provider: {
        tenantId: "tenant-1",
        clientId: "client-1",
        authorizationUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
        tokenUrl: null,
        jwksUrl: null,
        scopes: "openid profile email"
      },
      redirectUri: "https://app.example.com/auth/callback",
      state: "state-1",
      nonce: "nonce-1",
      codeChallenge: "challenge-1"
    });

    expect(url.toString()).toContain("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("nonce")).toBe("nonce-1");
  });

  it("resolves client secrets from environment references", () => {
    process.env.TEST_OIDC_SECRET = "secret-from-env";

    expect(resolveProviderClientSecret({ clientSecretRef: "env:TEST_OIDC_SECRET" })).toBe("secret-from-env");
    expect(resolveProviderClientSecret({ clientSecretRef: "inline-secret" })).toBe("inline-secret");
  });

  it("creates opaque state and nonce values", () => {
    expect(createOidcState()).not.toBe(createOidcState());
    expect(createOidcNonce()).not.toBe(createOidcNonce());
  });
});

