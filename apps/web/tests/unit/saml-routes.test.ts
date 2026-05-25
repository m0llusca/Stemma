import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSamlAuthorizationUrl: vi.fn(),
  generateSamlMetadata: vi.fn(),
  validateSamlPostResponse: vi.fn(),
  upsertUserFromSamlProfile: vi.fn(),
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

  it("validates ACS responses and creates an auth session with a safe RelayState redirect", async () => {
    const formData = new URLSearchParams();
    formData.set("SAMLResponse", "base64-response");
    formData.set("RelayState", "/reviews");
    mocks.validateSamlPostResponse.mockResolvedValue({ nameID: "name-id-1", mail: "agent@example.com" });
    mocks.upsertUserFromSamlProfile.mockResolvedValue({
      session: {
        token: "session-token",
        session: { id: "session-1", userId: "user-1" }
      }
    });

    const { POST } = await import("@/app/auth/saml/acs/route");
    const response = await POST(
      new NextRequest("https://app.example.com/auth/saml/acs?providerId=provider-1&workspaceId=workspace-1", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-host": "attacker.example.com" },
        body: formData
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/reviews");
    expect(response.cookies.get("qc_session")?.value).toBe("session-token");
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
        body: formData
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/auth/login?returnTo=%2Freviews");
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
