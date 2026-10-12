/**
 * Поддерживаемая область фильтров для расписаний и задач REPORT_EXPORT.
 * team/source/risk/block используют канонический контракт аналитики отчета;
 * атрибуты обращения применяются дополнительно через AND в loadReportExportRows.
 *
 * Клиентская проверка filtersJson предупреждает о неизвестных ключах без
 * блокировки. Сервер отклоняет невалидный JSON и не-объекты; загрузчик экспорта
 * проверяет известные значения и доступность фильтров аналитики.
 */
export const reportConversationFilterKeys = ["supportLine", "csatBucket", "externalSource", "assigneeName"] as const;
export const reportScheduleFilterKeys = [...reportConversationFilterKeys, "team", "source", "risk", "block"] as const;

export type ReportScheduleFiltersValidation = {
  status: "empty" | "valid" | "invalid";
  unknownKeys: string[];
};

export function validateReportScheduleFiltersJson(raw: string): ReportScheduleFiltersValidation {
  const value = raw.trim();

  if (!value) {
    return { status: "empty", unknownKeys: [] };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return { status: "invalid", unknownKeys: [] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "invalid", unknownKeys: [] };
  }

  const knownKeys = new Set<string>(reportScheduleFilterKeys);

  return {
    status: "valid",
    unknownKeys: Object.keys(parsed).filter((key) => !knownKeys.has(key))
  };
}
