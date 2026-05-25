import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveIdentityPolicyFromExternalClaims: vi.fn(),
  createAuthSession: vi.fn(),
  prisma: {
    ssoRequestState: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn()
    },
    identityProvider: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

vi.mock("@/lib/auth/providers", () => ({
  resolveIdentityPolicyFromExternalClaims: mocks.resolveIdentityPolicyFromExternalClaims
}));

vi.mock("@/lib/auth/session", () => ({
  createAuthSession: mocks.createAuthSession
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("SAML helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects inline IdP certificates in production but allows env references", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { validateSamlProviderConfigForSave } = await import("@/lib/auth/saml");

    expect(() =>
      validateSamlProviderConfigForSave({
        type: "SAML",
        samlCertificateRef: "env:SAML_IDP_CERT_CURRENT\nenv:SAML_IDP_CERT_NEXT",
        config: {
          idpCertRefs: ["env:SAML_IDP_CERT_THIRD"]
        }
      })
    ).not.toThrow();

    expect(() =>
      validateSamlProviderConfigForSave({
        type: "SAML",
        samlCertificateRef: "-----BEGIN CERTIFICATE-----\ninline\n-----END CERTIFICATE-----",
        config: {}
      })
    ).toThrow(/production/);
  });

  it("rejects SAML configs that disable both response and assertion signature requirements", async () => {
    const { validateSamlProviderConfigForSave } = await import("@/lib/auth/saml");

    expect(() =>
      validateSamlProviderConfigForSave({
        type: "SAML",
        samlCertificateRef: "env:SAML_IDP_CERT_CURRENT",
        config: {
          wantAssertionsSigned: false,
          wantAuthnResponseSigned: false
        }
      })
    ).toThrow(/подпись/);

    expect(() =>
      validateSamlProviderConfigForSave({
        type: "SAML",
        samlCertificateRef: "env:SAML_IDP_CERT_CURRENT",
        config: {
          wantAssertionsSigned: false,
          wantAuthnResponseSigned: true
        }
      })
    ).not.toThrow();
  });

  it("fails closed at runtime when persisted SAML config disables all signature requirements", async () => {
    const { buildSamlAuthorizationUrl } = await import("@/lib/auth/saml");

    await expect(
      buildSamlAuthorizationUrl({
        origin: "https://app.example.com",
        relayState: "/reviews",
        provider: {
          id: "provider-1",
          workspaceId: "workspace-1",
          slug: "saml",
          issuer: "https://idp.example.com",
          authorizationUrl: "https://idp.example.com/sso",
          samlEntityId: null,
          samlCertificateRef: "dev-cert",
          configJson: JSON.stringify({
            wantAssertionsSigned: false,
            wantAuthnResponseSigned: false
          })
        }
      })
    ).rejects.toThrow(/подпись/);
  });

  it("builds provider/workspace-discriminated SP metadata and ACS URLs", async () => {
    const { buildSamlServiceProviderUrls } = await import("@/lib/auth/saml");

    expect(
      buildSamlServiceProviderUrls(
        {
          id: "provider-1",
          workspaceId: "workspace-1",
          samlEntityId: null
        },
        "https://app.example.com"
      )
    ).toEqual({
      entityId: "https://app.example.com/auth/saml/metadata?providerId=provider-1&workspaceId=workspace-1",
      metadataUrl: "https://app.example.com/auth/saml/metadata?providerId=provider-1&workspaceId=workspace-1",
      acsUrl: "https://app.example.com/auth/saml/acs?providerId=provider-1&workspaceId=workspace-1"
    });
  });

  it("persists, reads, expires, and removes SAML request IDs through Prisma", async () => {
    const { PrismaSamlCacheProvider } = await import("@/lib/auth/saml");
    const cache = new PrismaSamlCacheProvider({ id: "provider-1", workspaceId: "workspace-1" }, 60_000);
    mocks.prisma.ssoRequestState.upsert.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));

    await expect(cache.saveAsync("request-1", "request-1")).resolves.toMatchObject({
      value: "request-1",
      createdAt: expect.any(Number)
    });
    expect(mocks.prisma.ssoRequestState.deleteMany).toHaveBeenCalledWith({
      where: {
        providerId: "provider-1",
        expiresAt: { lte: expect.any(Date) }
      }
    });
    expect(mocks.prisma.ssoRequestState.upsert).toHaveBeenCalledWith({
      where: { key: "provider-1:request-1" },
      create: expect.objectContaining({
        key: "provider-1:request-1",
        workspaceId: "workspace-1",
        providerId: "provider-1",
        value: "request-1",
        consumedAt: null,
        expiresAt: expect.any(Date)
      }),
      update: expect.objectContaining({
        value: "request-1",
        consumedAt: null,
        expiresAt: expect.any(Date)
      })
    });

    mocks.prisma.ssoRequestState.findUnique.mockResolvedValueOnce({
      key: "provider-1:request-1",
      value: "request-1",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null
    });
    mocks.prisma.ssoRequestState.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(cache.getAsync("request-1")).resolves.toBe("request-1");
    expect(mocks.prisma.ssoRequestState.updateMany).toHaveBeenCalledWith({
      where: {
        key: "provider-1:request-1",
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) }
      },
      data: { consumedAt: expect.any(Date) }
    });

    mocks.prisma.ssoRequestState.findUnique.mockResolvedValueOnce({
      key: "provider-1:request-1",
      value: "request-1",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: expect.any(Date)
    });
    await expect(cache.getAsync("request-1")).resolves.toBeNull();
  });

  it("returns null when a concurrent SAML request-state consume loses the update race", async () => {
    const { PrismaSamlCacheProvider } = await import("@/lib/auth/saml");
    const cache = new PrismaSamlCacheProvider({ id: "provider-1", workspaceId: "workspace-1" }, 60_000);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.ssoRequestState.findUnique.mockResolvedValueOnce({
      key: "provider-1:request-1",
      value: "request-1",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null
    });
    mocks.prisma.ssoRequestState.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(cache.getAsync("request-1")).resolves.toBeNull();
  });

  it("maps NameID, email, display name, groups, app roles, support line, and team into an auth session", async () => {
    const tx = {
      externalIdentity: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          workspaceId: "workspace-1",
          email: "agent@example.com",
          name: "Old Name",
          role: "SUPPORT_AGENT",
          sourceOfTruthProviderId: null,
          supportLine: null,
          teamName: null
        }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({
          id: "user-1",
          workspaceId: "workspace-1",
          email: "agent@example.com",
          name: "Agent Example",
          role: "QA_ANALYST",
          sourceOfTruthProviderId: "provider-1",
          supportLine: "Premium",
          teamName: "Refunds"
        })
      }
    };
    mocks.prisma.identityProvider.findUnique.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      slug: "saml",
      issuer: "https://idp.example.com",
      authorizationUrl: "https://idp.example.com/sso",
      samlEntityId: null,
      samlCertificateRef: "dev-cert",
      configJson: JSON.stringify({
        attributeMappings: {
          email: "mail",
          displayName: "displayName",
          groups: "memberOf",
          roles: "appRole",
          supportLine: "supportLine",
          teamName: "teamName"
        }
      })
    });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    mocks.resolveIdentityPolicyFromExternalClaims.mockResolvedValue({
      role: "QA_ANALYST",
      roleSource: "app_role",
      supportLine: "Premium",
      teamName: "Refunds"
    });
    mocks.createAuthSession.mockResolvedValue({
      token: "session-token",
      session: { id: "session-1", userId: "user-1" }
    });

    const { upsertUserFromSamlProfile } = await import("@/lib/auth/saml");
    await expect(
      upsertUserFromSamlProfile({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        userAgent: "vitest",
        profile: {
          issuer: "https://idp.example.com",
          nameID: "name-id-1",
          nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
          mail: "agent@example.com",
          displayName: "Agent Example",
          memberOf: ["QC_Analysts", "Support"],
          appRole: ["QC.Analyst"],
          supportLine: "Premium",
          teamName: "Refunds"
        }
      })
    ).resolves.toMatchObject({
      user: { id: "user-1", role: "QA_ANALYST" },
      session: { token: "session-token" }
    });

    expect(mocks.resolveIdentityPolicyFromExternalClaims).toHaveBeenCalledWith("workspace-1", "provider-1", {
      appRoles: ["QC.Analyst"],
      groups: ["QC_Analysts", "Support"],
      supportLine: "Premium",
      teamName: "Refunds",
      attributes: expect.objectContaining({
        mail: "agent@example.com",
        nameID: "name-id-1"
      })
    });
    expect(tx.externalIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerSubject: "https://idp.example.com:name-id-1",
        email: "agent@example.com",
        displayName: "Agent Example"
      })
    });
  });
});
