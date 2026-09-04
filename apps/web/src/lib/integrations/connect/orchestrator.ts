import { assertPublicBaseUrl } from "@/lib/net-guard";
import type {
  ConnectContext,
  ConnectStep,
  ConnectStepStatus,
  SourceConnectionProfile
} from "@/lib/integrations/connect/types";

type ReachabilityCheck = (baseUrl: string) => Promise<{ status: ConnectStepStatus; detail?: string; hint?: string }>;

type PersistFn = (args: {
  profile: SourceConnectionProfile;
  baseUrl: string;
  authMode: string;
  config: Record<string, unknown>;
  secretSlots: Array<{ kind: string; secret: string }>;
  workspaceId: string;
  actorId: string;
}) => Promise<{ integrationId: string }>;

export type RunConnectPipelineInput = {
  profile: SourceConnectionProfile;
  rawUrl: string;
  credentials: Record<string, string>;
  testTicketId?: string;
  workspaceId: string;
  actorId: string;
  reachabilityCheck: ReachabilityCheck;
  persist: PersistFn;
};

export type RunConnectPipelineResult = {
  steps: ConnectStep[];
  connected: boolean;
  integrationId?: string;
};

/**
 * Гонит конвейер подключения источника по шагам и собирает журнал статусов.
 * Сетевые/БД-зависимости (reachabilityCheck, persist) инъектируются вызывающим,
 * поэтому модуль полностью юнит-тестируем без сети и Prisma.
 */
export async function runConnectPipeline(input: RunConnectPipelineInput): Promise<RunConnectPipelineResult> {
  const { profile, rawUrl, credentials, testTicketId, workspaceId, actorId, reachabilityCheck, persist } = input;
  const steps: ConnectStep[] = [];

  // 1. validate_url — нормализация и SSRF-проверка адреса.
  let baseUrl: string;
  let hints: ConnectContext["hints"];

  try {
    const normalized = profile.normalizeUrl(rawUrl);
    baseUrl = normalized.baseUrl;
    hints = normalized.hints;
    if (!baseUrl) {
      throw new Error("Не указан адрес источника.");
    }
    assertPublicBaseUrl(new URL(baseUrl));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Адрес источника отклонён.";
    steps.push({
      step: "validate_url",
      status: "failed",
      detail: "Не удалось проверить адрес источника.",
      hint:
        `${reason} ` +
        "Для on-prem развёртываний в частной сети установите переменную окружения QC_ALLOW_PRIVATE_BASE_URLS=1."
    });
    return { steps, connected: false };
  }

  steps.push({
    step: "validate_url",
    status: "ok",
    detail: `Адрес нормализован: ${baseUrl}.`
  });

  const ctx: ConnectContext = {
    baseUrl,
    credentials,
    hints,
    testTicketId: testTicketId ?? hints?.testTicketId,
    config: {}
  };

  // 2. reachability — инъектированная проверка доступности.
  const reach = await reachabilityCheck(baseUrl);
  steps.push({ step: "reachability", status: reach.status, detail: reach.detail, hint: reach.hint });
  if (reach.status === "failed") {
    return { steps, connected: false };
  }

  // 3. auto_detect — опционально; warning не останавливает конвейер.
  if (profile.autoDetect) {
    const detected = await profile.autoDetect(ctx);
    if (detected.config) {
      ctx.config = { ...ctx.config, ...detected.config };
    }
    steps.push({ step: "auto_detect", status: detected.status, detail: detected.detail, hint: detected.hint });
  } else {
    steps.push({ step: "auto_detect", status: "skipped" });
  }

  // 4. verify_auth — failed останавливает конвейер до persist.
  const verify = await profile.verifyAuth(ctx);
  steps.push({ step: "verify_auth", status: verify.status, detail: verify.detail, hint: verify.hint });
  if (verify.status === "failed") {
    return { steps, connected: false };
  }

  // 5. capability/webhook probes — deepen readiness before persisting the source.
  if (profile.probeCapabilities) {
    const probed = await profile.probeCapabilities(ctx);
    steps.push({
      step: "capability_probe",
      status: probed.status,
      detail: probed.detail,
      hint: probed.hint,
      diagnostics: probed.diagnostics
    });
    if (probed.status === "failed") {
      return { steps, connected: false };
    }
  } else {
    steps.push({
      step: "capability_probe",
      status: "skipped",
      detail: "Для этого источника пока нет отдельной проверки возможностей."
    });
  }

  if (profile.probeWebhooks) {
    const probed = await profile.probeWebhooks(ctx);
    steps.push({
      step: "webhook_probe",
      status: probed.status,
      detail: probed.detail,
      hint: probed.hint,
      diagnostics: probed.diagnostics
    });
  } else {
    steps.push({
      step: "webhook_probe",
      status: "skipped",
      detail: "Вебхуки будут проверены на этапе живой сертификации."
    });
  }

  // 6. persist — инъектированная запись Integration + секрет-слотов.
  const { integrationId } = await persist({
    profile,
    baseUrl,
    authMode: verify.authMode,
    config: ctx.config,
    secretSlots: verify.secretSlots,
    workspaceId,
    actorId
  });
  steps.push({ step: "persist", status: "ok", detail: "Источник сохранён и активирован." });

  // 7. test_import — пробный импорт; warning не отменяет подключение.
  const ticketId = ctx.testTicketId;
  if (profile.testImport && ticketId) {
    const tested = await profile.testImport(ctx);
    steps.push({ step: "test_import", status: tested.status, detail: tested.detail, hint: tested.hint });
  } else {
    steps.push({
      step: "test_import",
      status: "skipped",
      detail: "Укажите № тикета для пробного импорта."
    });
  }

  // 8. certification_evidence — durable evidence is recorded by profiles that support it.
  if (profile.recordCertificationEvidence) {
    const recorded = await profile.recordCertificationEvidence(ctx);
    steps.push({
      step: "certification_evidence",
      status: recorded.status,
      detail: recorded.detail,
      hint: recorded.hint
    });
  } else {
    steps.push({
      step: "certification_evidence",
      status: "skipped",
      detail: "Evidence будет записан при protected live smoke-run."
    });
  }

  return { steps, connected: true, integrationId };
}
