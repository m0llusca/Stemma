import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeAuthorizationCode: vi.fn(),
  validateIdToken: vi.fn(),
  upsertUserFromOidcClaims: vi.fn(),
  signIn: vi.fn(),
  logBackendEvent: vi.fn(),
  requestIdFromHeaders: vi.fn(() => "req-1"),
  prisma: {
    user: {
      findUnique: vi.fn()
    },
    identityProvider: {
      findUnique: vi.fn(),
      findFirst: vi.fn()
    }
  }
}));

vi.mock("@/lib/auth/oidc", () => ({
  exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
  oidcNonceCookieName: "qc_oidc_nonce",
  oidcProviderCookieName: "qc_oidc_provider",
  oidcReturnToCookieName: "qc_oidc_return_to",
  oidcStateCookieName: "qc_oidc_state",
  oidcVerifierCookieName: "qc_oidc_verifier",
  upsertUserFromOidcClaims: mocks.upsertUserFromOidcClaims,
  validateIdToken: mocks.validateIdToken
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("../../auth", () => ({
  signIn: mocks.signIn
}));

vi.mock("@/lib/observability", () => ({
  logBackendEvent: mocks.logBackendEvent,
  requestIdFromHeaders: mocks.requestIdFromHeaders
}));

function activeOidcProvider() {
  return {
    id: "provider-1",
    workspaceId: "workspace-1",
    type: "OIDC",
    status: "active",
    issuer: "https://idp.example.com",
    clientId: "client-1",
    clientSecretRef: "env:OIDC_SECRET"
  };
}

describe("OIDC callback route public origin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.identityProvider.findUnique.mockResolvedValue(activeOidcProvider());
    mocks.exchangeAuthorizationCode.mockResolvedValue({
      id_token: "id-token",
      access_token: "access-token"
    });
    mocks.validateIdToken.mockResolvedValue({ sub: "user-1", email: "agent@example.com" });
    mocks.upsertUserFromOidcClaims.mockResolvedValue({
      session: {
        token: "session-token",
        session: { id: "session-1", userId: "user-1" }
      }
    });
    mocks.signIn.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the allowlisted public host for token exchange redirect_uri", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QC_PUBLIC_ORIGIN_ALLOWLIST", "app.example.com");

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest("http://internal:3000/auth/callback?code=code-1&state=state-1", {
        headers: {
          cookie:
            "qc_oidc_state=state-1; qc_oidc_verifier=verifier-1; qc_oidc_nonce=nonce-1; qc_oidc_provider=provider-1; qc_oidc_return_to=/reviews",
          host: "internal:3000",
          "x-forwarded-host": "app.example.com"
        }
      })
    );

    expect(response.status).toBe(307);
    expect(mocks.signIn).toHaveBeenCalledWith("enterprise-assertion", {
      userId: "user-1",
      providerId: "provider-1",
      redirect: false
    });
    expect(mocks.exchangeAuthorizationCode).toHaveBeenCalledWith({
      provider: expect.objectContaining({ id: "provider-1" }),
      code: "code-1",
      redirectUri: "https://app.example.com/auth/callback",
      codeVerifier: "verifier-1"
    });
    expect(response.headers.get("location")).toBe("https://app.example.com/reviews");
  });
});

describe("enterprise assertion credentials provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the assertion provider with JWT session projection for Auth.js issuance", async () => {
    const { authConfig } = await import("@/auth/config");

    expect(authConfig.session.strategy).toBe("jwt");
    expect(authConfig.providers).toContainEqual(expect.objectContaining({ id: "enterprise-assertion", type: "credentials" }));

    const token = await authConfig.callbacks.jwt({
      token: {},
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        email: "agent@example.com",
        name: "Agent One",
        role: "SUPPORT_AGENT"
      }
    } as never);
    const session = await authConfig.callbacks.session({
      session: { user: {}, expires: "2099-01-01T00:00:00.000Z" },
      token
    } as never);

    expect(session.user).toEqual({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "agent@example.com",
      emailVerified: null,
      name: "Agent One",
      role: "SUPPORT_AGENT"
    });
  });

  it("returns canonical Auth.js user fields for active assertion users", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "agent@example.com",
      name: "Agent One",
      role: "SUPPORT_AGENT",
      lifecycleStatus: "ACTIVE"
    });
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      status: "active"
    });

    const { authorizeEnterpriseAssertion } = await import("@/auth/providers/assertion");

    await expect(authorizeEnterpriseAssertion({ userId: "user-1", providerId: "provider-1" })).resolves.toEqual({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "agent@example.com",
      name: "Agent One",
      role: "SUPPORT_AGENT"
    });
  });

  it("refuses inactive assertion users", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "agent@example.com",
      name: "Agent One",
      role: "SUPPORT_AGENT",
      lifecycleStatus: "SUSPENDED"
    });

    const { authorizeEnterpriseAssertion } = await import("@/auth/providers/assertion");

    await expect(authorizeEnterpriseAssertion({ userId: "user-1" })).resolves.toBeNull();
    expect(mocks.prisma.identityProvider.findFirst).not.toHaveBeenCalled();
  });

  it("refuses assertions for providers outside the user workspace", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "agent@example.com",
      name: "Agent One",
      role: "SUPPORT_AGENT",
      lifecycleStatus: "ACTIVE"
    });
    mocks.prisma.identityProvider.findFirst.mockResolvedValue(null);

    const { authorizeEnterpriseAssertion } = await import("@/auth/providers/assertion");

    await expect(authorizeEnterpriseAssertion({ userId: "user-1", providerId: "provider-2" })).resolves.toBeNull();
    expect(mocks.prisma.identityProvider.findFirst).toHaveBeenCalledWith({
      where: {
        id: "provider-2",
        workspaceId: "workspace-1",
        status: "active"
      }
    });
  });
});
