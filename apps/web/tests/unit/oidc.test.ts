import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertProductionSecretReference,
  buildAuthorizationUrl,
  clearOidcJwksCacheForTests,
  createOidcNonce,
  createOidcState,
  createPkceChallenge,
  createPkceVerifier,
  resolveOidcRoleClaims,
  resolveProviderClientSecret,
  validateOidcProviderConfigForSave,
  validateIdToken,
  type OidcClaims
} from "@/lib/auth/oidc";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body)
  } as unknown as Response;
}

function signJwt(input: { kid: string; claims: OidcClaims; privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"] }) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: input.kid, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(input.claims)).toString("base64url");
  const signer = createSign("RSA-SHA256");

  signer.update(`${header}.${payload}`);
  signer.end();

  return `${header}.${payload}.${signer.sign(input.privateKey, "base64url")}`;
}

describe("OIDC helpers", () => {
  beforeEach(() => {
    clearOidcJwksCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

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

  it("rejects inline client secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => assertProductionSecretReference("env:OIDC_SECRET")).not.toThrow();
    expect(() => assertProductionSecretReference("inline-secret")).toThrow(/production/);
  });

  it("creates opaque state and nonce values", () => {
    expect(createOidcState()).not.toBe(createOidcState());
    expect(createOidcNonce()).not.toBe(createOidcNonce());
  });

  it("validates ID token signature, issuer, audience, expiration, and nonce through a cached JWKS", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ keys: [{ ...jwk, kid: "kid-1", alg: "RS256", use: "sig" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const token = signJwt({
      kid: "kid-1",
      privateKey,
      claims: {
        iss: "https://login.microsoftonline.com/tenant-1/v2.0",
        aud: "client-1",
        exp: now + 300,
        sub: "subject-1",
        nonce: "nonce-1"
      }
    });

    await expect(
      validateIdToken({
        idToken: token,
        provider: {
          type: "OIDC",
          clientId: "client-1",
          issuer: "https://login.microsoftonline.com/tenant-1/v2.0",
          tenantId: "tenant-1",
          jwksUrl: "https://login.microsoftonline.com/tenant-1/discovery/v2.0/keys",
          authorizationUrl: null,
          tokenUrl: null,
          scopes: "openid profile email"
        },
        nonce: "nonce-1"
      })
    ).resolves.toMatchObject({ sub: "subject-1" });

    await validateIdToken({
      idToken: token,
      provider: {
        type: "OIDC",
        clientId: "client-1",
        issuer: "https://login.microsoftonline.com/tenant-1/v2.0",
        tenantId: "tenant-1",
        jwksUrl: "https://login.microsoftonline.com/tenant-1/discovery/v2.0/keys",
        authorizationUrl: null,
        tokenUrl: null,
        scopes: "openid profile email"
      },
      nonce: "nonce-1"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("derives the required Entra issuer from tenantId when issuer is not configured", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ keys: [{ ...jwk, kid: "kid-1", alg: "RS256", use: "sig" }] })));
    const token = signJwt({
      kid: "kid-1",
      privateKey,
      claims: {
        iss: "https://login.microsoftonline.com/tenant-1/v2.0",
        aud: "client-1",
        exp: now + 300,
        sub: "subject-1",
        nonce: "nonce-1"
      }
    });

    await expect(
      validateIdToken({
        idToken: token,
        provider: {
          type: "MICROSOFT_ENTRA_ID",
          clientId: "client-1",
          issuer: null,
          tenantId: "tenant-1",
          jwksUrl: "https://login.microsoftonline.com/tenant-1/discovery/v2.0/keys",
          authorizationUrl: null,
          tokenUrl: null,
          scopes: "openid profile email"
        },
        nonce: "nonce-1"
      })
    ).resolves.toMatchObject({ iss: "https://login.microsoftonline.com/tenant-1/v2.0" });
  });

  it("requires azp to match clientId when an ID token has multiple audiences", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ keys: [{ ...jwk, kid: "kid-1", alg: "RS256", use: "sig" }] })));
    const provider = {
      type: "OIDC" as const,
      clientId: "client-1",
      issuer: "https://issuer.example.com",
      tenantId: null,
      jwksUrl: "https://issuer.example.com/keys",
      authorizationUrl: "https://issuer.example.com/auth",
      tokenUrl: "https://issuer.example.com/token",
      scopes: "openid profile email"
    };
    const claims = {
      iss: "https://issuer.example.com",
      aud: ["client-1", "resource-api"],
      exp: now + 300,
      sub: "subject-1",
      nonce: "nonce-1"
    };
    const tokenWithoutAzp = signJwt({ kid: "kid-1", privateKey, claims });
    const tokenWithAzp = signJwt({ kid: "kid-1", privateKey, claims: { ...claims, azp: "client-1" } });

    await expect(validateIdToken({ idToken: tokenWithoutAzp, provider, nonce: "nonce-1" })).rejects.toThrow(/azp/);
    await expect(validateIdToken({ idToken: tokenWithAzp, provider, nonce: "nonce-1" })).resolves.toMatchObject({
      sub: "subject-1"
    });
  });

  it("fails closed when a generic OIDC provider has no configured issuer", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ keys: [{ ...jwk, kid: "kid-1", alg: "RS256", use: "sig" }] })));
    const token = signJwt({
      kid: "kid-1",
      privateKey,
      claims: {
        iss: "https://issuer.example.com",
        aud: "client-1",
        exp: now + 300,
        sub: "subject-1",
        nonce: "nonce-1"
      }
    });

    await expect(
      validateIdToken({
        idToken: token,
        provider: {
          type: "OIDC",
          clientId: "client-1",
          issuer: null,
          tenantId: null,
          jwksUrl: "https://issuer.example.com/keys",
          authorizationUrl: "https://issuer.example.com/auth",
          tokenUrl: "https://issuer.example.com/token",
          scopes: "openid profile email"
        },
        nonce: "nonce-1"
      })
    ).rejects.toThrow(/issuer/);
  });

  it("requires issuer metadata before active generic OIDC providers are saved", () => {
    expect(() =>
      validateOidcProviderConfigForSave({
        type: "OIDC",
        status: "active",
        issuer: null,
        tenantId: null
      })
    ).toThrow(/OIDC/);

    expect(() =>
      validateOidcProviderConfigForSave({
        type: "MICROSOFT_ENTRA_ID",
        status: "active",
        issuer: null,
        tenantId: "tenant-1"
      })
    ).not.toThrow();
  });

  it("fails closed on Entra group overage unless app roles or explicit Graph fallback are available", async () => {
    await expect(
      resolveOidcRoleClaims({
        provider: { configJson: "{}" },
        claims: { sub: "subject-1", hasgroups: true }
      })
    ).rejects.toThrow(/Graph fallback/);

    await expect(
      resolveOidcRoleClaims({
        provider: { configJson: "{}" },
        claims: { sub: "subject-1", hasgroups: true, roles: ["QC.Admin"] }
      })
    ).resolves.toMatchObject({ appRoles: ["QC.Admin"], groups: [] });
  });

  it("uses only configured Microsoft Graph endpoints for group overage and ignores claim source URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: ["group-1", "group-2"] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveOidcRoleClaims({
        provider: {
          configJson: JSON.stringify({
            graphGroupFallback: {
              enabled: true,
              endpoint: "https://graph.microsoft.com/v1.0",
              userIdClaim: "oid"
            }
          })
        },
        accessToken: "access-token-1",
        claims: {
          sub: "subject-1",
          oid: "oid-1",
          _claim_names: { groups: "src1" },
          _claim_sources: {
            src1: {
              endpoint: "https://attacker.example.com/groups"
            }
          }
        }
      })
    ).resolves.toMatchObject({ groups: ["group-1", "group-2"] });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/users/oid-1/getMemberGroups",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer access-token-1"
        })
      })
    );

    await expect(
      resolveOidcRoleClaims({
        provider: {
          configJson: JSON.stringify({
            graphGroupFallback: {
              enabled: true,
              endpoint: "https://graph.example.com/v1.0"
            }
          })
        },
        accessToken: "access-token-1",
        claims: { sub: "subject-1", hasgroups: true }
      })
    ).rejects.toThrow(/Microsoft Graph/);
  });
});
