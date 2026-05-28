import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeAuthorizationCode: vi.fn(),
  validateIdToken: vi.fn(),
  upsertUserFromOidcClaims: vi.fn(),
  createEnterpriseAssertion: vi.fn(),
  issueSessionFromEnterpriseAssertion: vi.fn(),
  setAuthSessionCookies: vi.fn(),
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

vi.mock("@/auth/providers/assertion", () => ({
  createEnterpriseAssertion: mocks.createEnterpriseAssertion,
  issueSessionFromEnterpriseAssertion: mocks.issueSessionFromEnterpriseAssertion
}));

vi.mock("@/lib/auth/session", () => ({
  setAuthSessionCookies: mocks.setAuthSessionCookies
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
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        email: "agent@example.com",
        name: "Agent One",
        role: "SUPPORT_AGENT"
      },
      role: "SUPPORT_AGENT"
    });
    mocks.createEnterpriseAssertion.mockResolvedValue({
      token: "assertion-token-1",
      key: "assertion-token-1",
      expiresAt: new Date("2099-01-01T00:00:00.000Z")
    });
    mocks.issueSessionFromEnterpriseAssertion.mockResolvedValue({
      token: "db-session-token",
      session: { id: "session-1", userId: "user-1" }
    });
    mocks.setAuthSessionCookies.mockImplementation((cookieStore, sessionToken) => {
      cookieStore.set("authjs.session-token", sessionToken, { path: "/", maxAge: 43_200 });
      cookieStore.set("qc_session", sessionToken, { path: "/", maxAge: 43_200 });
    });
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
    expect(mocks.exchangeAuthorizationCode).toHaveBeenCalledWith({
      provider: expect.objectContaining({ id: "provider-1" }),
      code: "code-1",
      redirectUri: "https://app.example.com/auth/callback",
      codeVerifier: "verifier-1"
    });
    expect(mocks.upsertUserFromOidcClaims).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      providerId: "provider-1",
      claims: { sub: "user-1", email: "agent@example.com" },
      accessToken: "access-token",
      userAgent: null
    });
    expect(mocks.createEnterpriseAssertion).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      providerId: "provider-1"
    });
    expect(mocks.issueSessionFromEnterpriseAssertion).toHaveBeenCalledWith({
      token: "assertion-token-1",
      providerId: "provider-1",
      userAgent: null
    });
    expect(mocks.setAuthSessionCookies).toHaveBeenCalledWith(expect.any(Object), "db-session-token");
    expect(response.cookies.get("authjs.session-token")?.value).toBe("db-session-token");
    expect(response.cookies.get("qc_session")?.value).toBe("db-session-token");
    expect(response.headers.get("location")).toBe("https://app.example.com/reviews");
    expect(mocks.logBackendEvent).toHaveBeenCalledWith({
      requestId: "req-1",
      event: "auth.oidc.login_succeeded",
      workspaceId: "workspace-1",
      actorId: "user-1",
      targetType: "identity_provider",
      targetId: "provider-1",
      metadata: { sessionId: "session-1" }
    });
  });
});
