import type { ConnectStep, ConnectStepStatus } from "@/lib/integrations/connect/types";

export type CapabilityMatrixRow = {
  key: string;
  label: string;
  status: ConnectStepStatus | "unknown";
  detail?: string;
};

const OPERATION_LABELS: Record<string, string> = {
  list_conversations: "Список обращений",
  get_conversation: "Карточка обращения",
  diagnostics: "Диагностика",
  webhook_ingest: "Приём webhook",
  ticket_search: "Поиск тикетов",
  ticket_get: "Получение тикета",
  preview: "Предпросмотр",
  fixture_import: "Импорт fixture",
  selected_import: "Выборочный импорт",
  review_export: "Экспорт проверок"
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/**
 * Builds an honest capability matrix from a connect capability_probe step.
 * Probe success is diagnostic only — never a live-certification claim.
 */
export function capabilityMatrixFromConnectSteps(steps: ConnectStep[]): {
  rows: CapabilityMatrixRow[];
  honestyNote: string;
} | null {
  const probe = steps.find((step) => step.step === "capability_probe");
  if (!probe || probe.status === "skipped") {
    return null;
  }

  const operations = asStringArray(probe.diagnostics?.operations);
  const rows: CapabilityMatrixRow[] =
    operations.length > 0
      ? operations.map((operation) => ({
          key: operation,
          label: OPERATION_LABELS[operation] ?? operation,
          status: probe.status === "failed" ? "failed" : probe.status === "warning" ? "warning" : "ok",
          detail: probe.status === "ok" ? "Подтверждено probe" : undefined
        }))
      : [
          {
            key: "capability_probe",
            label: "Проверка возможностей",
            status: probe.status,
            detail: probe.detail
          }
        ];

  return {
    rows,
    honestyNote:
      "Матрица — результат diagnostic probe. Зелёный production-ready только после живой сертификации с evidence."
  };
}

export function capabilityMatrixFromContract(input: {
  operations: string[];
  supportsDiagnostics: boolean;
  supportsInboundWebhooks: boolean;
  supportsPaging: boolean;
  supportsCursor: boolean;
}): CapabilityMatrixRow[] {
  const declared = new Set(input.operations);
  const flags: Array<{ key: string; label: string; enabled: boolean }> = [
    { key: "diagnostics", label: "Диагностика", enabled: input.supportsDiagnostics || declared.has("diagnostics") },
    {
      key: "webhook_ingest",
      label: "Входящие webhook",
      enabled: input.supportsInboundWebhooks || declared.has("webhook_ingest")
    },
    { key: "paging", label: "Постраничная выборка", enabled: input.supportsPaging },
    { key: "cursor", label: "Курсорная выборка", enabled: input.supportsCursor }
  ];

  const operationRows = input.operations.map((operation) => ({
    key: operation,
    label: OPERATION_LABELS[operation] ?? operation,
    status: "ok" as const,
    detail: "Заявлено контрактом"
  }));

  const flagRows = flags
    .filter((flag) => !declared.has(flag.key))
    .map((flag) => ({
      key: flag.key,
      label: flag.label,
      status: (flag.enabled ? "ok" : "skipped") as ConnectStepStatus,
      detail: flag.enabled ? "Заявлено контрактом" : "Не заявлено"
    }));

  return [...operationRows, ...flagRows];
}
