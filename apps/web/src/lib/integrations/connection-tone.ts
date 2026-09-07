import { isLiveCertified } from "@/lib/certification/status";
import type { SemanticTone } from "@/lib/ui/semantic-status";
import type { StatusTone } from "@/lib/ui/status-tone";

export type PipelineStageTone = "ok" | "warn" | "error" | "neutral";
export type AdminHubTone = "ok" | "warn" | "neutral";

/**
 * Honesty gate for connection/channel chips.
 * `ready` / `active` is operational state, not production-green.
 * Green only when the cert chip would also be green (live cert).
 */
export function integrationConnectionTone(
  status: string,
  certificationStatus?: string | null
): StatusTone {
  if (status === "error") {
    return "negative";
  }

  if (status === "disabled") {
    return "warning";
  }

  if (status === "queued") {
    return "info";
  }

  if (status === "active" || status === "ready") {
    return isLiveCertified(certificationStatus) ? "positive" : "warning";
  }

  return "neutral";
}

/** Same honesty gate as connection chips: no green without live_certified. */
export function messagingChannelTone(
  status: string,
  certificationStatus?: string | null
): StatusTone {
  return integrationConnectionTone(status, certificationStatus);
}

/**
 * Catalog readiness chip: `production_slice` is not production-green by itself.
 * Green only when certification is live_certified — same bar as connection/channel.
 */
export function catalogReadinessTone(
  readiness: string,
  certificationStatus?: string | null
): StatusTone {
  if (readiness === "production_slice") {
    return isLiveCertified(certificationStatus) ? "positive" : "warning";
  }

  if (readiness === "adapter_ready") {
    return "info";
  }

  if (readiness === "roadmap") {
    return "warning";
  }

  return "neutral";
}

function coverageTone(successCount: number, totalCount: number, empty: PipelineStageTone): PipelineStageTone {
  if (totalCount <= 0) {
    return empty;
  }

  return successCount === totalCount ? "ok" : "warn";
}

/**
 * Доступы: green only when every source has that stage’s success (URL + secrets).
 * A configured subset that happens to be fully credentialed is not coverage.
 */
export function accessPipelineStageTone(input: {
  integrationCount: number;
  accessReadyCount: number;
}): PipelineStageTone {
  return coverageTone(input.accessReadyCount, input.integrationCount, "warn");
}

/**
 * Диагностика: green only when every source has a successful latest diagnostic.
 * “No failures in the last slice” is not coverage.
 */
export function diagnosticsPipelineStageTone(input: {
  integrationCount: number;
  successfulDiagnostics: number;
  failedDiagnostics: number;
}): PipelineStageTone {
  if (input.failedDiagnostics > 0) {
    return "error";
  }

  return coverageTone(input.successfulDiagnostics, input.integrationCount, "neutral");
}

/** Сертификация: green only when every source is live_certified. */
export function certificationPipelineStageTone(input: {
  integrationCount: number;
  certifiedCount: number;
}): PipelineStageTone {
  return coverageTone(input.certifiedCount, input.integrationCount, "warn");
}

/** Импорт: green only after a real import ran. */
export function importPipelineStageTone(input: {
  hasImport: boolean;
  activeSourceCount: number;
}): PipelineStageTone {
  if (input.hasImport) {
    return "ok";
  }

  return input.activeSourceCount > 0 ? "warn" : "neutral";
}

/**
 * Мониторинг: green only when every active source has a monitoring signal.
 * “Sources exist and no jobs queued” is not that stage’s success.
 */
export function monitoringPipelineStageTone(input: {
  activeSourceCount: number;
  monitoredSourceCount: number;
  activeJobCount: number;
}): PipelineStageTone {
  if (input.activeJobCount > 0) {
    return "warn";
  }

  return coverageTone(input.monitoredSourceCount, input.activeSourceCount, "neutral");
}

/**
 * Priority panel: info/warning until live-cert coverage is honest.
 * Positive only when every source is live_certified and nothing else is blocking.
 */
export function integrationPriorityTone(input: {
  failedDiagnostics: number;
  activeSourceCount: number;
  activeJobCount: number;
  certifiedCount: number;
  integrationCount: number;
}): SemanticTone {
  if (input.failedDiagnostics > 0) {
    return "negative";
  }

  if (input.activeSourceCount === 0) {
    return "warning";
  }

  if (input.activeJobCount > 0) {
    return "info";
  }

  if (input.integrationCount <= 0 || input.certifiedCount < input.integrationCount) {
    return "warning";
  }

  return "positive";
}

/** Hub integrations: ok only when every listed source is live_certified. */
export function adminHubIntegrationsTone(input: {
  integrationCount: number;
  liveCertifiedCount: number;
}): AdminHubTone {
  if (input.integrationCount <= 0) {
    return "neutral";
  }

  return input.liveCertifiedCount === input.integrationCount ? "ok" : "warn";
}

/** Hub access: warning until Phase D live SSO evidence exists. */
export function adminHubAccessTone(input: {
  liveSsoCount: number;
  providerWarningCount: number;
}): AdminHubTone {
  if (input.liveSsoCount <= 0 || input.providerWarningCount > 0) {
    return "warn";
  }

  return "ok";
}

/**
 * Hub channels: same bar as channel chips — active is not ok without live cert.
 * Map the shared StatusTone onto the hub card scale.
 */
export function adminHubChannelsTone(
  activeChannelCount: number,
  certificationStatus?: string | null
): AdminHubTone {
  if (activeChannelCount <= 0) {
    return "neutral";
  }

  return messagingChannelTone("active", certificationStatus) === "positive" ? "ok" : "warn";
}

/** Appearance is a setting, not a health signal. */
export function adminHubAppearanceTone(): AdminHubTone {
  return "neutral";
}

export type AdminHubOverviewTone = "warning" | "success" | "accent";

/**
 * Hub banner: success only for roles that can open cert-health sections.
 * QA (and any role without integrations/access) must not inherit a cert-green
 * “всё готово” strip from sections they cannot open (#79 merge).
 */
export function adminHubOverviewTone(input: {
  hasSetupGap: boolean;
  canSeeCertHealth: boolean;
}): AdminHubOverviewTone {
  if (input.hasSetupGap) {
    return "warning";
  }

  return input.canSeeCertHealth ? "success" : "accent";
}
