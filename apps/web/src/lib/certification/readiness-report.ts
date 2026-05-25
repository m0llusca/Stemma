import type { CertificationStatus } from "@/lib/certification/status";
import { certificationStatusLabels } from "@/lib/certification/status";
import { prisma } from "@/lib/db";
import { getIntegrationCapability, listIntegrationCapabilities, type IntegrationCapability } from "@/lib/integrations/capabilities";

export type CertificationEvidenceTargetType = "integration" | "identity_provider";
export type CertificationEvidenceResult = "passed" | "failed" | "blocked" | "skipped";

export type CertificationEvidenceView = {
  id: string;
  targetType: CertificationEvidenceTargetType;
  source: string;
  provider: string | null;
  integrationId: string | null;
  identityProviderId: string | null;
  runId: string;
  actor: string | null;
  recordedAt: string;
  envGate: string;
  result: CertificationEvidenceResult;
  redactedDiagnostics: Record<string, unknown>;
  protectedEnvGate: boolean;
};

export type PhaseDReadinessItem = {
  key: string;
  targetType: CertificationEvidenceTargetType;
  source: string;
  provider: string | null;
  displayName: string;
  status: CertificationStatus;
  label: string;
  productionReady: boolean;
  configured: boolean;
  liveSmokeCommand: string;
  blockers: string[];
  latestEvidence: CertificationEvidenceView | null;
};

export type PhaseDReadinessReport = {
  generatedAt: string;
  summary: {
    total: number;
    liveCertified: number;
    readyForLiveCertification: number;
    waitingForAccess: number;
    failedOrLimited: number;
  };
  integrations: PhaseDReadinessItem[];
  identityProviders: PhaseDReadinessItem[];
  evidenceModel: {
    requiredFields: string[];
    protectedEnvGates: string[];
  };
};

export type CertificationEvidenceInput = {
  workspaceId: string;
  targetType: CertificationEvidenceTargetType;
  source: string;
  provider?: string | null;
  integrationId?: string | null;
  identityProviderId?: string | null;
  runId: string;
  actorId?: string | null;
  envGate: string;
  result: CertificationEvidenceResult;
  redactedDiagnostics?: unknown;
  recordedAt?: Date;
};

type IntegrationForReport = {
  id: string;
  source: string;
  displayName: string;
  type: string;
  status: string;
  baseUrl: string | null;
  credentials: Array<{ kind: string }>;
};

type IdentityProviderForReport = {
  id: string;
  type: string;
  name: string;
  slug: string;
  status: string;
  issuer: string | null;
  tenantId: string | null;
  clientId: string | null;
  clientSecretRef: string | null;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  jwksUrl: string | null;
  samlCertificateRef: string | null;
  ldapsUrl: string | null;
  ldapsBindDn: string | null;
  ldapsBindSecretRef: string | null;
  scimTokenPrefix: string | null;
  configJson: string;
};

type EvidenceForReport = {
  id: string;
  targetType: string;
  source: string;
  provider: string | null;
  integrationId: string | null;
  identityProviderId: string | null;
  runId: string;
  actorId: string | null;
  actor?: { name: string; email: string } | null;
  recordedAt: Date;
  envGate: string;
  result: string;
  redactedDiagnosticsJson: string;
};

const liveSmokeAckGates = [
  "OTRS_LIVE_SMOKE=1",
  "HELPDESK_LIVE_SMOKE=1",
  "IDENTITY_LIVE_SMOKE=1"
] as const;

const protectedEnvironmentGates = [
  "github-environment:otrs-live",
  "github-environment:helpdesk-live",
  "github-environment:identity-live",
  "protected:live-smoke",
  "protected:phase-d-live-smoke"
] as const;

export const protectedLiveEnvGates = [...liveSmokeAckGates, ...protectedEnvironmentGates] as const;

const secretKeyPattern = /(authorization|cookie|password|passwd|secret|token|api[_-]?key|client[_-]?secret|credential)/i;

function parseJsonObject(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function redactString(value: string) {
  if (/^(Bearer|Basic)\s+/i.test(value)) {
    return "[redacted]";
  }

  try {
    const url = new URL(value);
    url.username = url.username ? "[redacted]" : "";
    url.password = url.password ? "[redacted]" : "";
    if (url.search) {
      url.search = "?redacted=1";
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function redactCertificationDiagnostics(value: unknown): Record<string, unknown> {
  function redact(input: unknown, key = ""): unknown {
    if (secretKeyPattern.test(key)) {
      return "[redacted]";
    }

    if (typeof input === "string") {
      return redactString(input);
    }

    if (Array.isArray(input)) {
      return input.map((item) => redact(item));
    }

    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
    }

    return input;
  }

  const redacted = redact(value);
  return redacted && typeof redacted === "object" && !Array.isArray(redacted) ? (redacted as Record<string, unknown>) : {};
}

export async function recordCertificationEvidence(input: CertificationEvidenceInput) {
  if (!isProtectedLiveEnvGate(input.envGate)) {
    throw new Error("Certification evidence requires a protected live smoke env gate.");
  }

  return prisma.certificationEvidence.create({
    data: {
      workspaceId: input.workspaceId,
      targetType: input.targetType,
      source: input.source,
      provider: input.provider ?? null,
      integrationId: input.integrationId ?? null,
      identityProviderId: input.identityProviderId ?? null,
      runId: input.runId,
      actorId: input.actorId ?? null,
      envGate: input.envGate,
      result: input.result,
      redactedDiagnosticsJson: JSON.stringify(redactCertificationDiagnostics(input.redactedDiagnostics ?? {})),
      ...(input.recordedAt ? { recordedAt: input.recordedAt } : {})
    }
  });
}

export function isProtectedLiveEnvGate(envGate: string) {
  const normalized = envGate
    .split(/[;,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    normalized.some((item) => liveSmokeAckGates.includes(item as (typeof liveSmokeAckGates)[number])) &&
    normalized.some((item) => protectedEnvironmentGates.includes(item as (typeof protectedEnvironmentGates)[number]))
  );
}

function normalizeEvidenceResult(result: string): CertificationEvidenceResult {
  return result === "passed" || result === "failed" || result === "blocked" || result === "skipped" ? result : "blocked";
}

function evidenceView(row: EvidenceForReport): CertificationEvidenceView {
  return {
    id: row.id,
    targetType: row.targetType === "identity_provider" ? "identity_provider" : "integration",
    source: row.source,
    provider: row.provider,
    integrationId: row.integrationId,
    identityProviderId: row.identityProviderId,
    runId: row.runId,
    actor: row.actor?.name || row.actor?.email || row.actorId,
    recordedAt: row.recordedAt.toISOString(),
    envGate: row.envGate,
    result: normalizeEvidenceResult(row.result),
    redactedDiagnostics: redactCertificationDiagnostics(parseJsonObject(row.redactedDiagnosticsJson)),
    protectedEnvGate: isProtectedLiveEnvGate(row.envGate)
  };
}

function latestEvidenceForItem(
  evidence: CertificationEvidenceView[],
  targetType: CertificationEvidenceTargetType,
  source: string,
  id: string | null
) {
  const targetIdEvidence = evidence.find(
    (item) =>
      item.targetType === targetType &&
      item.source === source &&
      Boolean(id) &&
      (item.integrationId === id || item.identityProviderId === id)
  );

  if (targetType === "identity_provider") {
    return targetIdEvidence ?? null;
  }

  return targetIdEvidence ?? evidence.find((item) => item.targetType === targetType && item.source === source) ?? null;
}

function evidenceHasPromotableLiveScope(
  targetType: CertificationEvidenceTargetType,
  source: string,
  evidence: CertificationEvidenceView | null
) {
  if (!(evidence?.result === "passed" && evidence.protectedEnvGate)) {
    return false;
  }

  if (targetType === "integration") {
    return true;
  }

  if (source === "ACTIVE_DIRECTORY_LDAPS") {
    return evidence.redactedDiagnostics.certificationScope === "ldaps_bind_search";
  }

  if (source === "MICROSOFT_ENTRA_ID" || source === "OIDC" || source === "SAML") {
    return evidence.redactedDiagnostics.certificationScope === "interactive_sso" && evidence.redactedDiagnostics.interactiveSsoValidated === true;
  }

  return false;
}

function statusFromEvidence(
  baseStatus: CertificationStatus,
  evidence: CertificationEvidenceView | null,
  targetType: CertificationEvidenceTargetType,
  source: string
): CertificationStatus {
  if (!evidence) {
    return baseStatus;
  }

  if (
    evidenceHasPromotableLiveScope(targetType, source, evidence) &&
    (baseStatus === "ready_for_live_certification" || baseStatus === "live_certified")
  ) {
    return "live_certified";
  }

  if (evidence.result === "failed") {
    return "limited";
  }

  return baseStatus;
}

function labelForStatus(status: CertificationStatus) {
  return certificationStatusLabels[status];
}

function productionReady(status: CertificationStatus) {
  return status === "live_certified";
}

function hasRequiredCredentials(integration: IntegrationForReport | undefined, capability: IntegrationCapability) {
  if (!integration) {
    return false;
  }

  return capability.requiredSecrets.every((secret) => integration.credentials.some((credential) => credential.kind === secret));
}

function integrationBlockers(
  integration: IntegrationForReport | undefined,
  capability: IntegrationCapability,
  evidence: CertificationEvidenceView | null
) {
  const blockers: string[] = [];

  if (!integration) {
    blockers.push("Источник не настроен в workspace.");
  }

  if (integration && capability.type !== "custom_api" && capability.type !== "webhook_bridge" && !integration.baseUrl?.trim()) {
    blockers.push("Не задан Base URL для живой проверки.");
  }

  if (integration && !hasRequiredCredentials(integration, capability)) {
    blockers.push("Не заполнены требуемые secret slots.");
  }

  if (!evidenceHasPromotableLiveScope("integration", capability.source, evidence) && capability.certification.summary.status !== "live_certified") {
    blockers.push("Нет успешного protected live smoke evidence.");
  }

  return blockers;
}

function helpdeskLiveSmokeCommand(capability: IntegrationCapability) {
  if (["otrs", "znuny", "otobo"].includes(capability.source)) {
    return "OTRS_LIVE_SMOKE=1 npm run test:otrs:live";
  }

  if (capability.type === "native_helpdesk" || capability.type === "enterprise") {
    return `HELPDESK_LIVE_SMOKE=1 HELPDESK_LIVE_SOURCE=${capability.source} npm run test:live:helpdesk`;
  }

  if (capability.source === "generic_webhook") {
    return "HELPDESK_LIVE_SMOKE=1 npm run test:live:helpdesk";
  }

  return "Protected live smoke is source-specific.";
}

function identityLiveSmokeCommand(provider: IdentityProviderForReport) {
  const providerKind =
    provider.type === "MICROSOFT_ENTRA_ID"
      ? "entra"
      : provider.type === "ACTIVE_DIRECTORY_LDAPS"
        ? "ldaps"
        : provider.type.toLowerCase();

  return `IDENTITY_LIVE_SMOKE=1 IDENTITY_LIVE_PROVIDER=${providerKind} npm run test:live:identity`;
}

function hasString(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasStringEntry(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && Boolean(item.trim()));
  }

  return typeof value === "string" && Boolean(value.trim());
}

function hasConfigString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && Boolean(value.trim());
}

function ldapsConfigObject(config: Record<string, unknown>) {
  const ldaps = config.ldaps;
  return ldaps && typeof ldaps === "object" && !Array.isArray(ldaps) ? (ldaps as Record<string, unknown>) : config;
}

function identityBaseStatus(provider: IdentityProviderForReport): CertificationStatus {
  if (provider.type === "DEMO") {
    return "not_production_ready";
  }

  if (provider.status !== "active") {
    return "configuration_required";
  }

  const config = parseJsonObject(provider.configJson);

  if (provider.type === "MICROSOFT_ENTRA_ID") {
    return hasString(provider.tenantId) && hasString(provider.clientId) ? "ready_for_live_certification" : "configuration_required";
  }

  if (provider.type === "OIDC") {
    return hasString(provider.issuer) && hasString(provider.authorizationUrl) && hasString(provider.tokenUrl) && hasString(provider.jwksUrl) && hasString(provider.clientId)
      ? "ready_for_live_certification"
      : "configuration_required";
  }

  if (provider.type === "SAML") {
    const hasIdpSso = hasString(provider.authorizationUrl) || hasConfigString(config, "idpSsoUrl");
    const hasCertificate = hasString(provider.samlCertificateRef) || hasStringEntry(config.idpCertRefs) || hasStringEntry(config.idpCerts);
    return hasIdpSso && hasCertificate ? "ready_for_live_certification" : "certificate_required";
  }

  if (provider.type === "ACTIVE_DIRECTORY_LDAPS") {
    const ldaps = ldapsConfigObject(config);
    return hasString(provider.ldapsUrl) && hasString(provider.ldapsBindDn) && hasString(provider.ldapsBindSecretRef) && hasConfigString(ldaps, "userSearchBase") && hasConfigString(ldaps, "groupSearchBase")
      ? "ready_for_live_certification"
      : "configuration_required";
  }

  return "configuration_required";
}

function identityBlockers(provider: IdentityProviderForReport, evidence: CertificationEvidenceView | null) {
  const blockers: string[] = [];
  const status = identityBaseStatus(provider);

  if (provider.type === "DEMO") {
    blockers.push("Демо-провайдер не участвует в live certification.");
  }

  if (status !== "ready_for_live_certification") {
    blockers.push(labelForStatus(status));
  }

  if (provider.type !== "DEMO" && !provider.scimTokenPrefix) {
    blockers.push("SCIM token не выпущен; provisioning нельзя считать live-certified.");
  }

  if (!evidenceHasPromotableLiveScope("identity_provider", provider.type, evidence)) {
    blockers.push("Нет успешного protected identity live smoke evidence.");
  }

  return blockers;
}

export function composePhaseDReadinessReport(input: {
  generatedAt: Date;
  integrations: IntegrationForReport[];
  identityProviders: IdentityProviderForReport[];
  evidence: EvidenceForReport[];
}): PhaseDReadinessReport {
  const evidence = input.evidence.map(evidenceView);
  const integrationsBySource = new Map(input.integrations.map((integration) => [integration.source, integration]));
  const integrationItems = listIntegrationCapabilities().map((capability) => {
    const integration = integrationsBySource.get(capability.source);
    const latestEvidence = latestEvidenceForItem(evidence, "integration", capability.source, integration?.id ?? null);
    const status = statusFromEvidence(capability.certification.summary.status, latestEvidence, "integration", capability.source);

    return {
      key: `integration:${capability.source}`,
      targetType: "integration" as const,
      source: capability.source,
      provider: null,
      displayName: integration?.displayName ?? capability.displayName,
      status,
      label: labelForStatus(status),
      productionReady: productionReady(status),
      configured: Boolean(integration),
      liveSmokeCommand: helpdeskLiveSmokeCommand(capability),
      blockers: integrationBlockers(integration, capability, latestEvidence),
      latestEvidence
    };
  });
  const identityItems = input.identityProviders.map((provider) => {
    const latestEvidence = latestEvidenceForItem(evidence, "identity_provider", provider.type, provider.id);
    const status = statusFromEvidence(identityBaseStatus(provider), latestEvidence, "identity_provider", provider.type);

    return {
      key: `identity_provider:${provider.id}`,
      targetType: "identity_provider" as const,
      source: provider.type,
      provider: provider.slug,
      displayName: provider.name,
      status,
      label: labelForStatus(status),
      productionReady: productionReady(status),
      configured: provider.status === "active",
      liveSmokeCommand: identityLiveSmokeCommand(provider),
      blockers: identityBlockers(provider, latestEvidence),
      latestEvidence
    };
  });
  const allItems = [...integrationItems, ...identityItems];

  return {
    generatedAt: input.generatedAt.toISOString(),
    summary: {
      total: allItems.length,
      liveCertified: allItems.filter((item) => item.status === "live_certified").length,
      readyForLiveCertification: allItems.filter((item) => item.status === "ready_for_live_certification").length,
      waitingForAccess: allItems.filter((item) => item.status === "waiting_for_access" || item.status === "configuration_required" || item.status === "secret_required" || item.status === "certificate_required").length,
      failedOrLimited: allItems.filter((item) => item.status === "limited" || item.status === "not_production_ready").length
    },
    integrations: integrationItems,
    identityProviders: identityItems,
    evidenceModel: {
      requiredFields: ["provider/source", "runId", "actor", "timestamp", "envGate", "result", "redactedDiagnostics"],
      protectedEnvGates: [...protectedLiveEnvGates]
    }
  };
}

export async function getPhaseDReadinessReport(workspaceId: string) {
  const [integrations, identityProviders, evidence] = await Promise.all([
    prisma.integration.findMany({
      where: { workspaceId },
      orderBy: [{ source: "asc" }],
      select: {
        id: true,
        source: true,
        displayName: true,
        type: true,
        status: true,
        baseUrl: true,
        credentials: {
          select: {
            kind: true
          }
        }
      }
    }),
    prisma.identityProvider.findMany({
      where: { workspaceId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: {
        id: true,
        type: true,
        name: true,
        slug: true,
        status: true,
        issuer: true,
        tenantId: true,
        clientId: true,
        clientSecretRef: true,
        authorizationUrl: true,
        tokenUrl: true,
        jwksUrl: true,
        samlCertificateRef: true,
        ldapsUrl: true,
        ldapsBindDn: true,
        ldapsBindSecretRef: true,
        scimTokenPrefix: true,
        configJson: true
      }
    }),
    prisma.certificationEvidence.findMany({
      where: { workspaceId },
      orderBy: [{ recordedAt: "desc" }],
      take: 100,
      include: {
        actor: {
          select: {
            name: true,
            email: true
          }
        }
      }
    })
  ]);

  return composePhaseDReadinessReport({
    generatedAt: new Date(),
    integrations,
    identityProviders,
    evidence
  });
}

export function capabilityForEvidenceSource(source: string) {
  return getIntegrationCapability(source);
}
