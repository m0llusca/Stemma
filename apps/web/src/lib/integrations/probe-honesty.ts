import type { StatusTone } from "@/lib/ui/status-tone";

export const certificationBadgeLabel = "Сертификация";
export const stepBadgeLabel = "Шаг";
export const adapterOperationalProfileTitle = "Операционный профиль";
export const adapterOperationalStepsLabel = "Операционные шаги";

export const certificationEvidenceEmptyText =
  "По этому источнику свидетельства сертификации ещё не записаны.";

export const diagnosticsNotLiveCertificationFooter = "Диагностика ≠ живая сертификация";

export const channelsEnabledWarningTitle = "Включённые каналы — не сертификация";
export const channelsEnabledWarningDescription =
  "Счётчик «Включены» показывает операционный статус доставки. Живая сертификация исходящих каналов ещё не подключена.";

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
