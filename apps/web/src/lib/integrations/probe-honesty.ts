import type { StatusTone } from "@/lib/ui/status-tone";

export const certificationBadgeLabel = "Сертификация";
export const stepBadgeLabel = "Шаг";
export const adapterOperationalProfileTitle = "Операционный профиль";
export const adapterOperationalStepsLabel = "Операционные шаги";

export const certificationEvidenceEmptyText =
  "По этому источнику свидетельства сертификации ещё не записаны.";

export const diagnosticsNotLiveCertificationFooter = "Диагностика ≠ живая сертификация";

export const channelsEnabledWarningTitle = "Включённые уведомления — не сертификация";
export const channelsEnabledWarningDescription =
  "Счётчик «Включены» показывает операционный статус доставки. Живая сертификация исходящих уведомлений ещё не подключена.";

export const channelsSectionCardTitle = "Исходящие уведомления";
export const channelsPageDescription =
  "Доставка оповещений в Slack, Teams, Telegram и WhatsApp. Это не интеграции источников и не SSO.";
export const channelsIaDistinction =
  "Интеграции — входящие источники. Доступ — SSO. Здесь только исходящие уведомления.";

export const saveDoesNotCertifyCopy =
  "Сохранение настроек ≠ живая сертификация. Зелёный статус — только после live cert с evidence.";
export const activateWithoutProbeCopy =
  "Нельзя включить без успешного probe. Сначала проверьте доступ — иначе доставка не подтверждена. Живая сертификация — отдельный шаг.";
export const activateProbePassedNotLiveCopy =
  "Probe прошёл. Это ещё не живая сертификация — зелёный только после live cert.";
export const claimLiveWithoutCertCopy =
  "Нельзя сохранить как live-ready без живой сертификации и evidence.";
export const connectPersistedNotLiveCopy =
  "Проверка доступа прошла, источник записан. Это ещё не production-ready: зелёный статус — только после живой сертификации с evidence.";
export const probeBeforePersistCopy =
  "Stemma сначала проверит доступ (probe), и только при успехе сохранит источник. Зелёный production-ready — только после живой сертификации.";

export type ProbeBeforeSaveIntent = "config_only" | "activate" | "claim_live";

export type ProbeBeforeSaveEvidence = {
  probeSucceeded?: boolean;
  liveCertified?: boolean;
};

export type ProbeBeforeSaveDecision = {
  action: "allow" | "warn" | "block";
  tone: StatusTone;
  message: string;
};

/**
 * Action-level honesty gate. Labels can stay operational; the save/connect
 * action must not claim live readiness without probe/cert evidence.
 *
 * - claim_live without liveCertified → block (do not persist)
 * - activate without successful probe → block (probe-before-save fail-closed)
 * - activate with probe, without live cert → warn (operational enable ≠ live)
 * - config_only without live cert → warn (save ≠ live cert)
 *
 * Callers must evaluate this BEFORE persisting activate/claim_live intents and
 * must honor `action === "block"` (see `isProbeBeforeSaveAllowed`).
 */
export function probeBeforeSaveGate(
  intent: ProbeBeforeSaveIntent,
  evidence: ProbeBeforeSaveEvidence = {}
): ProbeBeforeSaveDecision {
  const liveCertified = Boolean(evidence.liveCertified);
  const probeSucceeded = Boolean(evidence.probeSucceeded);

  if (intent === "claim_live") {
    if (liveCertified) {
      return {
        action: "allow",
        tone: "positive",
        message: "Живая сертификация подтверждена."
      };
    }

    return {
      action: "block",
      tone: "negative",
      message: claimLiveWithoutCertCopy
    };
  }

  if (intent === "activate") {
    if (liveCertified) {
      return {
        action: "allow",
        tone: "positive",
        message: "Включено. Живая сертификация подтверждена."
      };
    }

    if (!probeSucceeded) {
      return {
        action: "block",
        tone: "negative",
        message: activateWithoutProbeCopy
      };
    }

    return {
      action: "warn",
      tone: "warning",
      message: activateProbePassedNotLiveCopy
    };
  }

  if (liveCertified) {
    return {
      action: "allow",
      tone: "info",
      message: "Настройки сохранены. Сертификация уже есть — это не повторный live-прогон."
    };
  }

  return {
    action: "warn",
    tone: "warning",
    message: saveDoesNotCertifyCopy
  };
}

/** Persist only when the gate did not block (activate/claim_live fail-closed). */
export function isProbeBeforeSaveAllowed(decision: ProbeBeforeSaveDecision): boolean {
  return decision.action !== "block";
}

export function saveActionSuccessTone(liveCertified: boolean): StatusTone {
  return liveCertified ? "positive" : "warning";
}

export type ProbeStepState = "ready" | "active" | "waiting" | "blocked";

export function adapterProfileStep(hasBaseUrl: boolean): {
  state: ProbeStepState;
  statusLabel: string;
} {
  return hasBaseUrl
    ? { state: "ready", statusLabel: "Готово" }
    : { state: "waiting", statusLabel: "Нужен адрес" };
}

export function probeStepStatusView(state: ProbeStepState): { label: string; tone: StatusTone } {
  const views: Record<ProbeStepState, { label: string; tone: StatusTone }> = {
    ready: { label: "Готово", tone: "info" },
    active: { label: "Активно", tone: "info" },
    waiting: { label: "Ожидание", tone: "neutral" },
    blocked: { label: "Блок", tone: "negative" }
  };

  return views[state];
}

export function diagnosticStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    succeeded: "Пройден",
    ok: "Пройден",
    passed: "Пройден",
    success: "Пройден",
    failed: "Ошибка",
    error: "Ошибка",
    warning: "Предупреждение",
    skipped: "Пропущен",
    running: "В процессе",
    pending: "В процессе"
  };

  return labels[status] ?? status;
}

export function diagnosticStatusTone(status: string): StatusTone {
  if (["succeeded", "ok", "passed", "success"].includes(status)) {
    return "info";
  }

  if (["failed", "error"].includes(status)) {
    return "negative";
  }

  if (status === "warning") {
    return "warning";
  }

  return "neutral";
}

const diagnosticStepLabels: Record<string, string> = {
  config: "Конфигурация",
  tls: "TLS",
  webservice: "WebService",
  auth: "Авторизация",
  ticket_search: "Поиск тикетов",
  ticket_get: "Получение тикета",
  normalize: "Нормализация",
  db_dry_run: "Пробная запись"
};

export function diagnosticStepLabel(key: string): string {
  return diagnosticStepLabels[key] ?? key;
}

export function certificationEvidenceEnvGateLabel(envGate: string): string {
  const tokens = envGate
    .split(/[;,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hasLiveSmokeAck = tokens.some((item) => item.endsWith("_LIVE_SMOKE=1"));
  const hasProtectedGate =
    tokens.includes("protected:live-smoke") || tokens.some((item) => item.startsWith("github-environment:"));

  if (hasLiveSmokeAck && hasProtectedGate) {
    return "Защищённый live-контур";
  }

  if (/github-environment/i.test(envGate)) {
    return "Контур GitHub Environment";
  }

  if (/LIVE_SMOKE/i.test(envGate)) {
    return "Флаг live-проверки";
  }

  return "Флаг окружения";
}

export function certificationEvidenceRunLabel(runId: string): string {
  return `запуск ${runId.slice(0, 8)}`;
}
