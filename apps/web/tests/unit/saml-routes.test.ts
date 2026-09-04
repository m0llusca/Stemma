import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSamlAuthorizationUrl: vi.fn(),
  generateSamlMetadata: vi.fn(),
  validateSamlPostResponse: vi.fn(),
  upsertUserFromSamlProfile: vi.fn(),
  createEnterpriseAssertion: vi.fn(),
  issueSessionFromEnterpriseAssertion: vi.fn(),
  setAuthSessionCookies: vi.fn(),
  logBackendEvent: vi.fn(),
  requestIdFromHeaders: vi.fn(() => "req-1"),
  prisma: {
    identityProvider: {
      findFirst: vi.fn()
    }
  }
}));

vi.mock("@/lib/auth/saml", () => ({
  buildSamlAuthorizationUrl: mocks.buildSamlAuthorizationUrl,
  generateSamlMetadata: mocks.generateSamlMetadata,
  validateSamlPostResponse: mocks.validateSamlPostResponse,
  upsertUserFromSamlProfile: mocks.upsertUserFromSamlProfile
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

function activeSamlProvider() {
  return {
    id: "provider-1",
    workspaceId: "workspace-1",
    slug: "saml",
    type: "SAML",
    status: "active",
    issuer: "https://idp.example.com",
    authorizationUrl: "https://idp.example.com/sso",
    samlEntityId: null,
    samlCertificateRef: "dev-cert",
    configJson: "{}"
  };
}

describe("SAML auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.identityProvider.findFirst.mockResolvedValue(activeSamlProvider());
    mocks.createEnterpriseAssertion.mockResolvedValue({
      token: "assertion-token",
      key: "assertion-token",
      expiresAt: new Date("2026-05-28T10:00:00.000Z")
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

  it("starts SAML from /auth/sso without setting OIDC flow cookies", async () => {
    mocks.buildSamlAuthorizationUrl.mockResolvedValue("https://idp.example.com/sso?SAMLRequest=request");
    const { GET } = await import("@/app/auth/sso/route");
    const response = await GET(
      new NextRequest("https://app.example.com/auth/sso?provider=saml&workspaceId=workspace-1&returnTo=/reports", {
        headers: {
          "x-forwarded-host": "attacker.example.com"
        }
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://idp.example.com/sso?SAMLRequest=request");
    expect(response.cookies.get("qc_oidc_state")).toBeUndefined();
    expect(mocks.buildSamlAuthorizationUrl).toHaveBeenCalledWith({
      provider: expect.objectContaining({ id: "provider-1" }),
      origin: "https://app.example.com",
      relayState: "/reports"
    });
  });

  it("serves SP metadata with a SAML metadata content type", async () => {
    mocks.generateSamlMetadata.mockReturnValue("<EntityDescriptor />");
    const { GET } = await import("@/app/auth/saml/metadata/route");
    const response = await GET(
      new NextRequest("https://app.example.com/auth/saml/metadata?providerId=provider-1&workspaceId=workspace-1", {
        headers: {
          "x-forwarded-host": "attacker.example.com"
        }
      })
    );

    await expect(response.text()).resolves.toBe("<EntityDescriptor />");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/samlmetadata+xml");
    expect(mocks.generateSamlMetadata).toHaveBeenCalledWith(expect.objectContaining({ id: "provider-1" }), "https://app.example.com");
    expect(mocks.prisma.identityProvider.findFirst).toHaveBeenCalledWith({
      where: {
        id: "provider-1",
        workspaceId: "workspace-1",
        type: "SAML",
        status: { not: "disabled" }
      },
      orderBy: { createdAt: "asc" }
    });
  });

  it("validates ACS responses and sets Auth.js plus legacy cookies with a safe RelayState redirect", async () => {
    const formData = new URLSearchParams();
    formData.set("SAMLResponse", "base64-response");
    formData.set("RelayState", "/reviews");
    mocks.validateSamlPostResponse.mockResolvedValue({ nameID: "name-id-1", mail: "agent@example.com" });
    mocks.upsertUserFromSamlProfile.mockResolvedValue({
      user: { id: "user-1", workspaceId: "workspace-1", role: "QA_ANALYST" },
      role: "QA_ANALYST"
    });

    const { POST } = await import("@/app/auth/saml/acs/route");
    const response = await POST(
      new NextRequest("https://app.example.com/auth/saml/acs?providerId=provider-1&workspaceId=workspace-1", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "vitest-saml",
          "x-forwarded-host": "attacker.example.com"
        },
        body: formData.toString()
      })
    );

    expect(response.status).toBe(307);
    // Generic RelayState /reviews → QA_ANALYST role home (no name on mock → due=overdue only)
    expect(response.headers.get("location")).toBe("https://app.example.com/reviews?due=overdue");
    expect(response.cookies.get("authjs.session-token")?.value).toBe("db-session-token");
    expect(response.cookies.get("qc_session")?.value).toBe("db-session-token");
    expect(mocks.createEnterpriseAssertion).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      providerId: "provider-1"
    });
    expect(mocks.issueSessionFromEnterpriseAssertion).toHaveBeenCalledWith({
      token: "assertion-token",
      providerId: "provider-1",
      userAgent: "vitest-saml"
    });
    expect(mocks.setAuthSessionCookies).toHaveBeenCalledWith(expect.any(Object), "db-session-token");
    expect(mocks.validateSamlPostResponse).toHaveBeenCalledWith({
      provider: expect.objectContaining({ id: "provider-1" }),
      origin: "https://app.example.com",
      samlResponse: "base64-response"
    });
    expect(mocks.prisma.identityProvider.findFirst).toHaveBeenCalledWith({
      where: {
        id: "provider-1",
        workspaceId: "workspace-1",
        type: "SAML",
        status: "active"
      },
      orderBy: { createdAt: "asc" }
    });
    expect(mocks.logBackendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.saml.login_succeeded",
        metadata: { sessionId: "session-1" }
      })
    );
  });

  it("returns safe ACS errors without logging raw SAMLResponse content", async () => {
    const formData = new URLSearchParams();
    formData.set("SAMLResponse", "raw-sensitive-saml-response");
    mocks.validateSamlPostResponse.mockRejectedValue(new Error("raw-sensitive-saml-response"));

    const { POST } = await import("@/app/auth/saml/acs/route");
    const response = await POST(
      new NextRequest("https://app.example.com/auth/saml/acs?provider=saml", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-host": "attacker.example.com" },
        body: formData.toString()
      })
    );

    expect(response.status).toBe(307);
    // Fail-closed ACS errors reset returnTo to generic `/` (role home applies after next login)
    expect(response.headers.get("location")).toBe("https://app.example.com/auth/login?returnTo=%2F");
    expect(response.cookies.get("qc_login_flash")?.value).toBe("sso_callback_failed");
    expect(JSON.stringify(mocks.logBackendEvent.mock.calls)).not.toContain("raw-sensitive-saml-response");
    expect(mocks.logBackendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.saml.login_failed",
        metadata: { reason: "acs_validation_failed" }
      })
    );
  });
});
