import { isLiveCertified } from "@/lib/certification/status";
import { russianPlural } from "@/lib/reports/report-format";

export const integrationListConnectionColumn = "Статус подключения";
export const integrationListCertificationColumn = "Сертификация";

/**
 * Catalog/list readiness copy. `production_slice` is an implementation slice,
 * not production-ready — «Готово к эксплуатации» only after live cert.
 */
export function capabilityReadinessLabel(readiness: string, certificationStatus?: string | null) {
  if (readiness === "production_slice") {
    return isLiveCertified(certificationStatus) ? "Готово к эксплуатации" : "Срез для внедрения";
  }

  if (readiness === "adapter_ready") {
    return "Адаптер готов";
  }

  if (readiness === "roadmap") {
    return "В плане";
  }

  return readiness;
}

/**
 * Access progress is not live certification. URL + secrets means accesses
 * are filled and diagnostics can start — never «Готово к живой сертификации».
 */
export function readinessActionLabel(hasBaseUrl: boolean, hasRequiredSecrets: boolean) {
  return hasBaseUrl && hasRequiredSecrets ? "Доступы заполнены" : "Ожидает доступы";
}

export function diagnosticReadinessHint(canRunDiagnostics: boolean) {
  return canRunDiagnostics ? "Можно запускать диагностику" : null;
}

/**
 * Compact cert chip: keep Живая/Live vs dry-run/stub. Do not collapse to
 * «Проверка пройдена» / «Готово к проверке».
 */
export function compactCertificationLabel(value: string) {
  if (value === "Не готово к промышленной эксплуатации") {
    return "Не готово";
  }

  return value;
}

/**
 * Ops connection chip. Soften `active` / `ready` when not live-certified so
 * «Активна» is not read as production-live.
 */
export function integrationOpsStatusLabel(status: string, certificationStatus?: string | null) {
  const live = isLiveCertified(certificationStatus);
  const labels: Record<string, string> = {
    planned: "Запланировано",
    ready: live ? "Готова к подключению" : "Настроена",
    active: live ? "Активна" : "Включена",
    queued: "В очереди",
    paused: "На паузе",
    error: "Ошибка",
    disabled: "Отключена"
  };

  return labels[status] ?? status;
}

const integrationModeLabels: Record<string, string> = {
  diagnostics: "Диагностика",
  dry_run: "Проверка без импорта",
  fixture_import: "Импорт тестовых данных",
  import: "Импорт",
  manual: "Ручной запуск",
  manual_ticket_ids: "Ручные TicketID",
  preview: "Предпросмотр",
  scheduled: "По расписанию",
  selected_import: "Выборочный импорт",
  ticket_search: "Поиск тикетов"
};

export function integrationModeLabel(value: string) {
  return integrationModeLabels[value] ?? value;
}

const integrationRunItemStatusLabels: Record<string, string> = {
  failed: "Ошибка",
  imported: "Импортировано",
  previewed: "Предпросмотр",
  queued: "В очереди"
};

export function integrationRunItemStatusLabel(value: string) {
  return integrationRunItemStatusLabels[value] ?? value;
}

export function formatArticleCount(count: number) {
  return russianPlural(count, ["статья", "статьи", "статей"]);
}

export function formatAttachmentCount(count: number) {
  return russianPlural(count, ["файл", "файла", "файлов"]);
}
