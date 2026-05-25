import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiError: vi.fn((code: string, message: string, status = 500) => ({ code, message, status })),
  apiJson: vi.fn((body: unknown, status = 200) => ({ body, status })),
  requestIdFromHeaders: vi.fn(() => "req-1"),
  requireCurrentUserPermission: vi.fn(),
  requireSessionApi: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    auditLog: {
      create: vi.fn()
    },
    identityProvider: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    }
  }
}));

vi.mock("@/lib/api/response", () => ({
  apiError: mocks.apiError,
  apiJson: mocks.apiJson,
  requestIdFromHeaders: mocks.requestIdFromHeaders
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("auth providers API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: {
        id: "actor-1",
        workspaceId: "workspace-1"
      }
    });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("rejects active generic OIDC provider creation without issuer", async () => {
    const { POST } = await import("@/app/api/v1/auth/providers/route");
    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/providers", {
        method: "POST",
        body: JSON.stringify({
          type: "OIDC",
          name: "Generic OIDC",
          slug: "generic-oidc",
          status: "active",
          clientId: "client-1",
          authorizationUrl: "https://issuer.example.com/auth",
          tokenUrl: "https://issuer.example.com/token",
          jwksUrl: "https://issuer.example.com/keys"
        })
      })
    );

    expect(response).toEqual({
      code: "bad_request",
      message: expect.stringContaining("OIDC"),
      status: 400
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects sensitive provider config JSON on create", async () => {
    const { POST } = await import("@/app/api/v1/auth/providers/route");
    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/providers", {
        method: "POST",
        body: JSON.stringify({
          type: "SAML",
          name: "SAML",
          slug: "saml",
          status: "draft",
          config: {
            nested: {
              authorizationHeader: "Bearer raw-secret-token"
            }
          }
        })
      })
    );

    expect(response).toEqual({
      code: "bad_request",
      message: expect.stringContaining("секретные"),
      status: 400
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects SAML provider config that disables all signature validation on create", async () => {
    const { POST } = await import("@/app/api/v1/auth/providers/route");
    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/providers", {
        method: "POST",
        body: JSON.stringify({
          type: "SAML",
          name: "SAML",
          slug: "saml",
          status: "draft",
          config: {
            wantAssertionsSigned: false,
            wantAuthnResponseSigned: false
          }
        })
      })
    );

    expect(response).toEqual({
      code: "bad_request",
      message: expect.stringContaining("подпись"),
      status: 400
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS provider endpoints but allows localhost HTTP", async () => {
    const { POST } = await import("@/app/api/v1/auth/providers/route");
    const badResponse = await POST(
      new Request("https://app.example.com/api/v1/auth/providers", {
        method: "POST",
        body: JSON.stringify({
          type: "OIDC",
          name: "Generic OIDC",
          slug: "generic-oidc",
          status: "draft",
          issuer: "https://issuer.example.com",
          authorizationUrl: "http://issuer.example.com/auth",
          tokenUrl: "https://issuer.example.com/token",
          jwksUrl: "https://issuer.example.com/keys"
        })
      })
    );

    expect(badResponse).toEqual({
      code: "bad_request",
      message: expect.stringContaining("HTTPS"),
      status: 400
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();

    mocks.prisma.identityProvider.upsert.mockResolvedValueOnce({
      id: "provider-1",
      type: "OIDC",
      name: "Generic OIDC",
      slug: "generic-oidc",
      status: "draft",
      clientSecretRef: null
    });
    const okResponse = await POST(
      new Request("https://app.example.com/api/v1/auth/providers", {
        method: "POST",
        body: JSON.stringify({
          type: "OIDC",
          name: "Generic OIDC",
          slug: "generic-oidc",
          status: "draft",
          issuer: "https://issuer.example.com",
          authorizationUrl: "http://localhost:8080/auth",
          tokenUrl: "https://issuer.example.com/token",
          jwksUrl: "https://issuer.example.com/keys"
        })
      })
    );

    expect(okResponse).toEqual({
      body: {
        provider: {
          id: "provider-1",
          type: "OIDC",
          name: "Generic OIDC",
          slug: "generic-oidc",
          status: "draft"
        }
      },
      status: 201
    });
  });

  it("rejects activating existing generic OIDC providers without an issuer", async () => {
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      type: "OIDC",
      status: "draft",
      issuer: null,
      tenantId: null,
      configJson: "{}",
      samlCertificateRef: null
    });

    const { PATCH } = await import("@/app/api/v1/auth/providers/[providerId]/route");
    const response = await PATCH(
      new Request("https://app.example.com/api/v1/auth/providers/provider-1", {
        method: "PATCH",
        body: JSON.stringify({
          status: "active"
        })
      }),
      { params: Promise.resolve({ providerId: "provider-1" }) }
    );

    expect(response).toEqual({
      code: "bad_request",
      message: expect.stringContaining("OIDC"),
      status: 400
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("issues a SCIM token through the provider API and returns plaintext only in the response", async () => {
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: null,
      scimTokenHash: null,
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });
    mocks.prisma.identityProvider.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.identityProvider.findUniqueOrThrow.mockImplementation(async () => ({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: mocks.prisma.identityProvider.updateMany.mock.calls.at(-1)?.[0].data.scimTokenPrefix,
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    }));

    const { POST } = await import("@/app/api/v1/auth/providers/[providerId]/scim-token/route");
    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/providers/provider-1/scim-token", {
        method: "POST"
      }),
      { params: Promise.resolve({ providerId: "provider-1" }) }
    );

    const responseBody = (response as unknown as { body: { plainToken: string } }).body;

    expect(response.status).toBe(201);
    expect(responseBody).toMatchObject({
      token: {
        hasToken: true,
        tokenPrefix: expect.stringMatching(/^scim_/)
      },
      plainToken: expect.stringMatching(/^scim_/)
    });
    const plainToken = responseBody.plainToken;
    expect(JSON.stringify(mocks.prisma.identityProvider.updateMany.mock.calls)).not.toContain(plainToken);
    expect(JSON.stringify(mocks.prisma.auditLog.create.mock.calls)).not.toContain(plainToken);
  });

  it("rotates and revokes a SCIM token through the provider API without exposing hashes", async () => {
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: "scim_old12...",
      scimTokenHash: "old-hash",
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });
    mocks.prisma.identityProvider.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.identityProvider.findUniqueOrThrow.mockImplementation(async () => ({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: mocks.prisma.identityProvider.updateMany.mock.calls.at(-1)?.[0].data.scimTokenPrefix,
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    }));

    const route = await import("@/app/api/v1/auth/providers/[providerId]/scim-token/route");
    const rotated = await route.PATCH(
      new Request("https://app.example.com/api/v1/auth/providers/provider-1/scim-token", {
        method: "PATCH"
      }),
      { params: Promise.resolve({ providerId: "provider-1" }) }
    );
    const revoked = await route.DELETE(
      new Request("https://app.example.com/api/v1/auth/providers/provider-1/scim-token", {
        method: "DELETE"
      }),
      { params: Promise.resolve({ providerId: "provider-1" }) }
    );

    const rotatedBody = (rotated as unknown as { body: Record<string, unknown> }).body;
    const revokedBody = (revoked as unknown as { body: Record<string, unknown> }).body;

    expect(rotated.status).toBe(200);
    expect(rotatedBody).toMatchObject({
      plainToken: expect.stringMatching(/^scim_/),
      token: {
        hasToken: true,
        tokenPrefix: expect.stringMatching(/^scim_/)
      }
    });
    expect(JSON.stringify(rotatedBody)).not.toContain("old-hash");
    expect(revoked).toEqual({
      body: {
        provider: {
          id: "provider-1",
          name: "Entra",
          type: "MICROSOFT_ENTRA_ID"
        },
        token: {
          hasToken: false,
          tokenPrefix: null,
          updatedAt: "2026-05-18T10:00:00.000Z"
        }
      },
      status: 200
    });
    expect(JSON.stringify(revokedBody)).not.toContain("old-hash");
    expect(mocks.prisma.identityProvider.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          scimTokenPrefix: null,
          scimTokenHash: null
        }
      })
    );
  });

  it("returns safe SCIM token lifecycle errors without secret details", async () => {
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: "scim_old12...",
      scimTokenHash: "old-hash",
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });

    const { POST } = await import("@/app/api/v1/auth/providers/[providerId]/scim-token/route");
    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/providers/provider-1/scim-token", {
        method: "POST"
      }),
      { params: Promise.resolve({ providerId: "provider-1" }) }
    );

    expect(response).toEqual({
      code: "conflict",
      message: "SCIM-токен уже выпущен. Используйте ротацию.",
      status: 409
    });
    expect(JSON.stringify(response)).not.toContain("old-hash");
  });

  it("returns a safe refresh-and-retry message when a SCIM token lifecycle write races", async () => {
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: "scim_old12...",
      scimTokenHash: "old-hash",
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });
    mocks.prisma.identityProvider.updateMany.mockResolvedValue({ count: 0 });

    const { PATCH } = await import("@/app/api/v1/auth/providers/[providerId]/scim-token/route");
    const response = await PATCH(
      new Request("https://app.example.com/api/v1/auth/providers/provider-1/scim-token", {
        method: "PATCH"
      }),
      { params: Promise.resolve({ providerId: "provider-1" }) }
    );

    expect(response).toEqual({
      code: "conflict",
      message: "SCIM-токен изменен другим запросом. Обновите состояние и повторите действие.",
      status: 409
    });
    expect(JSON.stringify(response)).not.toContain("old-hash");
  });
});
