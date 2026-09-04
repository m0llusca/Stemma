import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/secrets";
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

  it("rejects vault client secret references at runtime", () => {
    expect(() => resolveProviderClientSecret({ clientSecretRef: "vault:qc/oidc/client-secret" })).toThrow(
      /исполняются только env:- и зашифрованные v1:-ссылки/
    );
    expect(() => resolveProviderClientSecret({ clientSecretRef: "secret:qc/oidc/client-secret" })).toThrow(
      /исполняются только env:- и зашифрованные v1:-ссылки/
    );
  });

  it("round-trips encrypted client secret references", () => {
    const encrypted = encryptSecret("encrypted-client-secret");

    expect(resolveProviderClientSecret({ clientSecretRef: encrypted })).toBe("encrypted-client-secret");
  });

  it("rejects inline client secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => assertProductionSecretReference("env:OIDC_SECRET")).not.toThrow();
    expect(() => assertProductionSecretReference("inline-secret")).toThrow(/production/);
    expect(() => assertProductionSecretReference("vault:qc/oidc/client-secret")).toThrow(/vault:\/secret:/);
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

describe("OIDC user upsert session boundary", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/auth/providers");
    vi.doUnmock("@/lib/auth/session");
    vi.resetModules();
  });

  it("returns the resolved user and role without creating an AuthSession", async () => {
    vi.resetModules();

    const updatedUser = {
      id: "user-1",
      workspaceId: "workspace-1",
      email: "agent@example.com",
      name: "Agent One",
      role: "TEAM_LEAD",
      lifecycleStatus: "ACTIVE",
      sourceOfTruthProviderId: "provider-1",
      supportLine: "Tier 2",
      teamName: "Escalations"
    };
    const tx = {
      externalIdentity: {
        findUnique: vi.fn().mockResolvedValue({
          id: "identity-1",
          userId: "user-1",
          user: { id: "user-1", lifecycleStatus: "ACTIVE" }
        }),
        update: vi.fn().mockResolvedValue({ id: "identity-1" }),
        create: vi.fn()
      },
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(updatedUser)
      }
    };
    const prismaMock = {
      identityProvider: {
        findUnique: vi.fn().mockResolvedValue({ configJson: "{}" })
      },
      $transaction: vi.fn(async (callback) => callback(tx))
    };
    const resolveIdentityPolicyFromExternalClaims = vi.fn().mockResolvedValue({
      role: "TEAM_LEAD",
      supportLine: "Tier 2",
      teamName: "Escalations"
    });
    const createAuthSession = vi.fn().mockResolvedValue({
      token: "session-token",
      session: { id: "session-1", userId: "user-1" }
    });

    vi.doMock("@/lib/db", () => ({
      prisma: prismaMock
    }));
    vi.doMock("@/lib/auth/providers", () => ({
      buildEntraAuthorizationMetadata: vi.fn(),
      resolveIdentityPolicyFromExternalClaims
    }));
    vi.doMock("@/lib/auth/session", () => ({
      createAuthSession
    }));

    const { upsertUserFromOidcClaims } = await import("@/lib/auth/oidc");

    await expect(
      upsertUserFromOidcClaims({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        accessToken: "access-token-1",
        userAgent: "test-agent",
        claims: {
          sub: "subject-1",
          email: "agent@example.com",
          name: "Agent One",
          roles: ["QC.TeamLead"]
        }
      })
    ).resolves.toEqual({
      user: updatedUser,
      role: "TEAM_LEAD"
    });

    expect(tx.externalIdentity.update).toHaveBeenCalledWith({
      where: { id: "identity-1" },
      data: expect.objectContaining({
        email: "agent@example.com",
        displayName: "Agent One",
        rawClaimsJson: expect.any(String),
        lastLoginAt: expect.any(Date)
      })
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        email: "agent@example.com",
        name: "Agent One",
        role: "TEAM_LEAD",
        sourceOfTruthProviderId: "provider-1",
        supportLine: "Tier 2",
        teamName: "Escalations",
        lastDirectorySyncAt: expect.any(Date)
      })
    });
    expect(createAuthSession).not.toHaveBeenCalled();
  });
});

describe("OIDC user lifecycle enforcement", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/auth/providers");
    vi.resetModules();
  });

  function buildUpsertMocks(input: {
    existingIdentity?: { id: string; userId: string; user: { id: string; lifecycleStatus: string } } | null;
    userByEmail?: { id: string; lifecycleStatus: string; role?: string; name?: string; sourceOfTruthProviderId?: string } | null;
  }) {
    const tx = {
      externalIdentity: {
        findUnique: vi.fn().mockResolvedValue(input.existingIdentity ?? null),
        update: vi.fn().mockResolvedValue({ id: "identity-1" }),
        create: vi.fn().mockResolvedValue({ id: "identity-1" })
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(input.userByEmail ?? null),
        create: vi.fn(),
        update: vi.fn()
      }
    };
    const prismaMock = {
      identityProvider: {
        findUnique: vi.fn().mockResolvedValue({ configJson: "{}" })
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx))
    };

    vi.doMock("@/lib/db", () => ({
      prisma: prismaMock
    }));
    vi.doMock("@/lib/auth/providers", () => ({
      buildEntraAuthorizationMetadata: vi.fn(),
      resolveIdentityPolicyFromExternalClaims: vi.fn().mockResolvedValue({
        role: "AGENT"
      })
    }));

    return tx;
  }

  it("rejects login through an existing identity when the user is suspended and does not update records", async () => {
    vi.resetModules();

    const tx = buildUpsertMocks({
      existingIdentity: {
        id: "identity-1",
        userId: "user-1",
        user: { id: "user-1", lifecycleStatus: "SUSPENDED" }
      }
    });

    const { upsertUserFromOidcClaims } = await import("@/lib/auth/oidc");

    await expect(
      upsertUserFromOidcClaims({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        claims: {
          sub: "subject-1",
          email: "agent@example.com",
          name: "Agent One",
          roles: ["QC.Agent"]
        }
      })
    ).rejects.toThrow("Пользователь приостановлен или деактивирован.");

    expect(tx.externalIdentity.update).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects login through an existing identity when the user is deprovisioned", async () => {
    vi.resetModules();

    const tx = buildUpsertMocks({
      existingIdentity: {
        id: "identity-1",
        userId: "user-1",
        user: { id: "user-1", lifecycleStatus: "DEPROVISIONED" }
      }
    });

    const { upsertUserFromOidcClaims } = await import("@/lib/auth/oidc");

    await expect(
      upsertUserFromOidcClaims({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        claims: {
          sub: "subject-1",
          email: "agent@example.com",
          roles: ["QC.Agent"]
        }
      })
    ).rejects.toThrow("Пользователь приостановлен или деактивирован.");

    expect(tx.externalIdentity.update).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects linking a new identity by email when the matched user is suspended", async () => {
    vi.resetModules();

    const tx = buildUpsertMocks({
      existingIdentity: null,
      userByEmail: {
        id: "user-1",
        lifecycleStatus: "SUSPENDED"
      }
    });

    const { upsertUserFromOidcClaims } = await import("@/lib/auth/oidc");

    await expect(
      upsertUserFromOidcClaims({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        claims: {
          sub: "subject-1",
          email: "agent@example.com",
          roles: ["QC.Agent"]
        }
      })
    ).rejects.toThrow("Пользователь приостановлен или деактивирован.");

    expect(tx.externalIdentity.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("keeps repeat login working for an active linked user", async () => {
    vi.resetModules();

    const updatedUser = {
      id: "user-1",
      workspaceId: "workspace-1",
      email: "agent@example.com",
      name: "Agent One",
      role: "AGENT",
      lifecycleStatus: "ACTIVE"
    };
    const tx = buildUpsertMocks({
      existingIdentity: {
        id: "identity-1",
        userId: "user-1",
        user: { id: "user-1", lifecycleStatus: "ACTIVE" }
      }
    });

    tx.user.update.mockResolvedValue(updatedUser);

    const { upsertUserFromOidcClaims } = await import("@/lib/auth/oidc");

    await expect(
      upsertUserFromOidcClaims({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        claims: {
          sub: "subject-1",
          email: "agent@example.com",
          name: "Agent One",
          roles: ["QC.Agent"]
        }
      })
    ).resolves.toEqual({
      user: updatedUser,
      role: "AGENT"
    });

    expect(tx.externalIdentity.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });
});
