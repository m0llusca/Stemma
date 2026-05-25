import { randomUUID } from "node:crypto";
import { Client } from "ldapts";
import { describe, expect, it } from "vitest";
import { recordCertificationEvidence } from "@/lib/certification/readiness-report";

type IdentityLiveProvider = "entra" | "oidc" | "saml" | "scim" | "ldaps";

const liveSmokeAck = process.env.IDENTITY_LIVE_SMOKE === "1";
const liveProvider = normalizeProvider(process.env.IDENTITY_LIVE_PROVIDER);
const hasIdentityLiveInputs = Object.keys(process.env).some((key) => key.startsWith("IDENTITY_LIVE_"));
const unsupportedProviderConfigured = Boolean(process.env.IDENTITY_LIVE_PROVIDER && !liveProvider);
const missingHardGate = hasIdentityLiveInputs && !liveSmokeAck;
const missingProviderConfig = liveSmokeAck && !unsupportedProviderConfigured && (!liveProvider || missingRequiredEnvironment(liveProvider).length > 0);
const runLive = Boolean(liveSmokeAck && liveProvider && missingRequiredEnvironment(liveProvider).length === 0);
const evidenceWorkspaceId = process.env.CERTIFICATION_EVIDENCE_WORKSPACE_ID;
const evidenceRunId = process.env.CERTIFICATION_EVIDENCE_RUN_ID || `identity-live-${randomUUID()}`;
const evidenceActorId = process.env.CERTIFICATION_EVIDENCE_ACTOR_ID || null;
const evidenceIdentityProviderId = process.env.CERTIFICATION_EVIDENCE_IDENTITY_PROVIDER_ID || null;

function normalizeProvider(value: string | undefined): IdentityLiveProvider | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "entra" || normalized === "oidc" || normalized === "saml" || normalized === "scim" || normalized === "ldaps"
    ? normalized
    : null;
}

function stringEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function missingRequiredEnvironment(provider: IdentityLiveProvider) {
  const requiredByProvider: Record<IdentityLiveProvider, string[]> = {
    entra: ["IDENTITY_LIVE_TENANT_ID"],
    oidc: [],
    saml: ["IDENTITY_LIVE_SAML_METADATA_URL"],
    scim: ["IDENTITY_LIVE_SCIM_BASE_URL", "IDENTITY_LIVE_SCIM_TOKEN"],
    ldaps: ["IDENTITY_LIVE_LDAPS_URL", "IDENTITY_LIVE_LDAPS_BIND_DN", "IDENTITY_LIVE_LDAPS_BIND_PASSWORD", "IDENTITY_LIVE_LDAPS_USER_SEARCH_BASE"]
  };
  const required = requiredByProvider[provider];

  if (provider === "oidc" && !stringEnv("IDENTITY_LIVE_OIDC_DISCOVERY_URL") && !stringEnv("IDENTITY_LIVE_OIDC_ISSUER")) {
    return ["IDENTITY_LIVE_OIDC_DISCOVERY_URL or IDENTITY_LIVE_OIDC_ISSUER"];
  }

  return required.filter((name) => !stringEnv(name));
}

function evidenceSource(provider: IdentityLiveProvider) {
  const sources: Record<IdentityLiveProvider, string> = {
    entra: "MICROSOFT_ENTRA_ID",
    oidc: "OIDC",
    saml: "SAML",
    scim: "SCIM",
    ldaps: "ACTIVE_DIRECTORY_LDAPS"
  };

  return sources[provider];
}

function discoveryUrl(provider: IdentityLiveProvider) {
  if (provider === "entra") {
    return `https://login.microsoftonline.com/${encodeURIComponent(stringEnv("IDENTITY_LIVE_TENANT_ID"))}/v2.0/.well-known/openid-configuration`;
  }

  const explicit = stringEnv("IDENTITY_LIVE_OIDC_DISCOVERY_URL");
  if (explicit) return explicit;

  return `${stringEnv("IDENTITY_LIVE_OIDC_ISSUER").replace(/\/+$/, "")}/.well-known/openid-configuration`;
}

async function smokeOidc(provider: Extract<IdentityLiveProvider, "entra" | "oidc">) {
  const response = await fetch(discoveryUrl(provider), { headers: { accept: "application/json" } });
  expect(response.ok).toBe(true);

  const body = (await response.json()) as Record<string, unknown>;
  expect(typeof body.issuer).toBe("string");
  expect(typeof body.authorization_endpoint).toBe("string");
  expect(typeof body.token_endpoint).toBe("string");
  expect(typeof body.jwks_uri).toBe("string");

  return {
    certificationScope: "discovery_metadata",
    interactiveSsoValidated: false,
    issuer: body.issuer,
    authorizationEndpoint: body.authorization_endpoint,
    tokenEndpoint: body.token_endpoint,
    jwksUri: body.jwks_uri
  };
}

async function smokeSaml() {
  const response = await fetch(stringEnv("IDENTITY_LIVE_SAML_METADATA_URL"), { headers: { accept: "application/samlmetadata+xml,text/xml" } });
  expect(response.ok).toBe(true);

  const body = await response.text();
  expect(body).toMatch(/EntityDescriptor|EntitiesDescriptor/);
  expect(body).toMatch(/IDPSSODescriptor|SingleSignOnService/);

  return {
    certificationScope: "saml_metadata",
    interactiveSsoValidated: false,
    metadataUrl: stringEnv("IDENTITY_LIVE_SAML_METADATA_URL"),
    metadataBytes: body.length
  };
}

async function smokeScim() {
  const serviceProviderConfigUrl = `${stringEnv("IDENTITY_LIVE_SCIM_BASE_URL").replace(/\/+$/, "")}/ServiceProviderConfig`;
  const response = await fetch(serviceProviderConfigUrl, {
    headers: {
      accept: "application/scim+json,application/json",
      authorization: `Bearer ${stringEnv("IDENTITY_LIVE_SCIM_TOKEN")}`
    }
  });
  expect(response.ok).toBe(true);

  const body = (await response.json()) as { schemas?: unknown };
  expect(body.schemas).toEqual(expect.arrayContaining(["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"]));

  return {
    certificationScope: "scim_service_provider_config",
    serviceProviderConfigUrl,
    schemas: body.schemas
  };
}

async function smokeLdaps() {
  const client = new Client({
    url: stringEnv("IDENTITY_LIVE_LDAPS_URL"),
    connectTimeout: 10_000,
    timeout: 15_000,
    tlsOptions: {
      minVersion: "TLSv1.2"
    }
  });

  try {
    await client.bind(stringEnv("IDENTITY_LIVE_LDAPS_BIND_DN"), stringEnv("IDENTITY_LIVE_LDAPS_BIND_PASSWORD"));
    const result = await client.search(stringEnv("IDENTITY_LIVE_LDAPS_USER_SEARCH_BASE"), {
      scope: "base",
      filter: "(objectClass=*)",
      sizeLimit: 1,
      attributes: ["dn"]
    });

    expect(result.searchEntries.length).toBeGreaterThanOrEqual(1);

    return {
      certificationScope: "ldaps_bind_search",
      ldapsUrl: stringEnv("IDENTITY_LIVE_LDAPS_URL"),
      userSearchBase: stringEnv("IDENTITY_LIVE_LDAPS_USER_SEARCH_BASE"),
      entryCount: result.searchEntries.length
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

async function runSmoke(provider: IdentityLiveProvider) {
  if (provider === "entra" || provider === "oidc") return smokeOidc(provider);
  if (provider === "saml") return smokeSaml();
  if (provider === "scim") return smokeScim();
  return smokeLdaps();
}

describe.skipIf(!runLive && !unsupportedProviderConfigured && !missingHardGate && !missingProviderConfig)("live identity provider smoke", () => {
  it("validates one protected identity provider tenant", async () => {
    if (missingHardGate) {
      throw new Error("Refusing to run live identity smoke: set IDENTITY_LIVE_SMOKE=1 in a protected environment.");
    }

    if (unsupportedProviderConfigured) {
      throw new Error("IDENTITY_LIVE_PROVIDER must be one of: entra, oidc, saml, scim, ldaps.");
    }

    if (missingProviderConfig || !liveProvider) {
      throw new Error(`Live identity smoke is missing required environment: ${missingRequiredEnvironment(liveProvider ?? "oidc").join(", ")}`);
    }

    const diagnostics = await runSmoke(liveProvider);

    if (evidenceWorkspaceId && !evidenceIdentityProviderId) {
      throw new Error("CERTIFICATION_EVIDENCE_IDENTITY_PROVIDER_ID is required when recording identity live smoke evidence.");
    }

    if (evidenceWorkspaceId && evidenceIdentityProviderId) {
      await recordCertificationEvidence({
        workspaceId: evidenceWorkspaceId,
        targetType: "identity_provider",
        source: evidenceSource(liveProvider),
        provider: liveProvider,
        identityProviderId: evidenceIdentityProviderId,
        runId: evidenceRunId,
        actorId: evidenceActorId,
        envGate: "IDENTITY_LIVE_SMOKE=1;protected:live-smoke",
        result: "passed",
        redactedDiagnostics: diagnostics
      });
    }
  });
});
