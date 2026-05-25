import { describe, expect, it } from "vitest";
import {
  composePhaseDReadinessReport,
  isProtectedLiveEnvGate,
  redactCertificationDiagnostics
} from "@/lib/certification/readiness-report";

describe("Phase D readiness report", () => {
  it("does not live-certify integrations from unprotected smoke evidence", () => {
    const report = composePhaseDReadinessReport({
      generatedAt: new Date("2026-05-25T10:00:00.000Z"),
      integrations: [
        {
          id: "integration-zendesk",
          source: "zendesk",
          displayName: "Zendesk sandbox",
          type: "native_helpdesk",
          status: "active",
          baseUrl: "https://zendesk.example.com",
          credentials: [{ kind: "auth_password" }]
        }
      ],
      identityProviders: [],
      evidence: [
        {
          id: "evidence-1",
          targetType: "integration",
          source: "zendesk",
          provider: null,
          integrationId: "integration-zendesk",
          identityProviderId: null,
          runId: "run-1",
          actorId: "actor-1",
          actor: { name: "Admin", email: "admin@example.com" },
          recordedAt: new Date("2026-05-25T09:00:00.000Z"),
          envGate: "VITEST_INCLUDE_LIVE=1",
          result: "passed",
          redactedDiagnosticsJson: JSON.stringify({
            url: "https://user:secret@zendesk.example.com/tickets?token=raw",
            token: "raw-token"
          })
        }
      ]
    });
    const zendesk = report.integrations.find((item) => item.source === "zendesk");

    expect(zendesk).toMatchObject({
      status: "ready_for_live_certification",
      productionReady: false,
      latestEvidence: {
        protectedEnvGate: false,
        result: "passed",
        redactedDiagnostics: {
          token: "[redacted]"
        }
      }
    });
    expect(zendesk?.latestEvidence?.redactedDiagnostics.url).toBe("https://%5Bredacted%5D:%5Bredacted%5D@zendesk.example.com/tickets?redacted=1");
    expect(zendesk?.blockers).toContain("Нет успешного protected live smoke evidence.");
  });

  it("marks providers live-certified only when protected evidence passed", () => {
    const report = composePhaseDReadinessReport({
      generatedAt: new Date("2026-05-25T10:00:00.000Z"),
      integrations: [],
      identityProviders: [
        {
          id: "provider-entra",
          type: "MICROSOFT_ENTRA_ID",
          name: "Entra tenant",
          slug: "entra",
          status: "active",
          issuer: null,
          tenantId: "tenant-1",
          clientId: "client-1",
          clientSecretRef: "env:QC_ENTRA_SECRET",
          authorizationUrl: null,
          tokenUrl: null,
          jwksUrl: null,
          samlCertificateRef: null,
          ldapsUrl: null,
          ldapsBindDn: null,
          ldapsBindSecretRef: null,
          scimTokenPrefix: "scim_123",
          configJson: "{}"
        }
      ],
      evidence: [
        {
          id: "evidence-2",
          targetType: "identity_provider",
          source: "MICROSOFT_ENTRA_ID",
          provider: "entra",
          integrationId: null,
          identityProviderId: "provider-entra",
          runId: "run-2",
          actorId: null,
          actor: null,
          recordedAt: new Date("2026-05-25T09:30:00.000Z"),
          envGate: "IDENTITY_LIVE_SMOKE=1;github-environment:identity-live",
          result: "passed",
          redactedDiagnosticsJson: JSON.stringify({
            certificationScope: "interactive_sso",
            interactiveSsoValidated: true
          })
        }
      ]
    });

    expect(report.identityProviders[0]).toMatchObject({
      status: "live_certified",
      productionReady: true,
      blockers: []
    });
    expect(report.summary.liveCertified).toBeGreaterThanOrEqual(1);
  });

  it("redacts secret diagnostics and recognizes protected gates", () => {
    expect(isProtectedLiveEnvGate("HELPDESK_LIVE_SMOKE=1;protected:live-smoke")).toBe(true);
    expect(isProtectedLiveEnvGate("HELPDESK_LIVE_SMOKE=1")).toBe(false);
    expect(isProtectedLiveEnvGate("protected:live-smoke")).toBe(false);
    expect(isProtectedLiveEnvGate("VITEST_INCLUDE_LIVE=1")).toBe(false);
    expect(isProtectedLiveEnvGate("protected:local")).toBe(false);
    expect(isProtectedLiveEnvGate("github-environment:dev")).toBe(false);
    expect(
      redactCertificationDiagnostics({
        Authorization: "Bearer token",
        callbackUrl: "https://app.example.com/callback?code=secret",
        nested: { clientSecret: "raw" }
      })
    ).toEqual({
      Authorization: "[redacted]",
      callbackUrl: "https://app.example.com/callback?redacted=1",
      nested: { clientSecret: "[redacted]" }
    });
  });

  it("does not reuse identity evidence across providers or promote discovery-only evidence", () => {
    const report = composePhaseDReadinessReport({
      generatedAt: new Date("2026-05-25T10:00:00.000Z"),
      integrations: [],
      identityProviders: [
        {
          id: "provider-oidc-1",
          type: "OIDC",
          name: "OIDC one",
          slug: "oidc-one",
          status: "active",
          issuer: "https://issuer.example.com",
          tenantId: null,
          clientId: "client-1",
          clientSecretRef: "env:OIDC_SECRET",
          authorizationUrl: "https://issuer.example.com/auth",
          tokenUrl: "https://issuer.example.com/token",
          jwksUrl: "https://issuer.example.com/keys",
          samlCertificateRef: null,
          ldapsUrl: null,
          ldapsBindDn: null,
          ldapsBindSecretRef: null,
          scimTokenPrefix: "scim_123",
          configJson: "{}"
        },
        {
          id: "provider-oidc-2",
          type: "OIDC",
          name: "OIDC two",
          slug: "oidc-two",
          status: "active",
          issuer: "https://issuer-two.example.com",
          tenantId: null,
          clientId: "client-2",
          clientSecretRef: "env:OIDC_SECRET_TWO",
          authorizationUrl: "https://issuer-two.example.com/auth",
          tokenUrl: "https://issuer-two.example.com/token",
          jwksUrl: "https://issuer-two.example.com/keys",
          samlCertificateRef: null,
          ldapsUrl: null,
          ldapsBindDn: null,
          ldapsBindSecretRef: null,
          scimTokenPrefix: "scim_456",
          configJson: "{}"
        }
      ],
      evidence: [
        {
          id: "evidence-3",
          targetType: "identity_provider",
          source: "OIDC",
          provider: "oidc",
          integrationId: null,
          identityProviderId: "provider-oidc-1",
          runId: "run-3",
          actorId: null,
          actor: null,
          recordedAt: new Date("2026-05-25T09:30:00.000Z"),
          envGate: "IDENTITY_LIVE_SMOKE=1;github-environment:identity-live",
          result: "passed",
          redactedDiagnosticsJson: JSON.stringify({
            certificationScope: "discovery_metadata",
            interactiveSsoValidated: false
          })
        }
      ]
    });

    expect(report.identityProviders[0]).toMatchObject({
      status: "ready_for_live_certification",
      productionReady: false,
      latestEvidence: expect.objectContaining({ runId: "run-3" })
    });
    expect(report.identityProviders[1]).toMatchObject({
      status: "ready_for_live_certification",
      productionReady: false,
      latestEvidence: null
    });
  });

  it("does not attach identity evidence when provider id and provider type disagree", () => {
    const report = composePhaseDReadinessReport({
      generatedAt: new Date("2026-05-25T10:00:00.000Z"),
      integrations: [],
      identityProviders: [
        {
          id: "provider-saml",
          type: "SAML",
          name: "SAML",
          slug: "saml",
          status: "active",
          issuer: "https://idp.example.com",
          tenantId: null,
          clientId: null,
          clientSecretRef: null,
          authorizationUrl: "https://idp.example.com/sso",
          tokenUrl: null,
          jwksUrl: null,
          samlCertificateRef: "env:SAML_CERT",
          ldapsUrl: null,
          ldapsBindDn: null,
          ldapsBindSecretRef: null,
          scimTokenPrefix: "scim_789",
          configJson: "{}"
        }
      ],
      evidence: [
        {
          id: "evidence-4",
          targetType: "identity_provider",
          source: "OIDC",
          provider: "oidc",
          integrationId: null,
          identityProviderId: "provider-saml",
          runId: "run-4",
          actorId: null,
          actor: null,
          recordedAt: new Date("2026-05-25T09:30:00.000Z"),
          envGate: "IDENTITY_LIVE_SMOKE=1;github-environment:identity-live",
          result: "passed",
          redactedDiagnosticsJson: JSON.stringify({
            certificationScope: "interactive_sso",
            interactiveSsoValidated: true
          })
        }
      ]
    });

    expect(report.identityProviders[0]).toMatchObject({
      status: "ready_for_live_certification",
      productionReady: false,
      latestEvidence: null
    });
  });
});
