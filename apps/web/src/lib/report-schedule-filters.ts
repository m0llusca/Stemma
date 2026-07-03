/**
 * Клиентская валидация поля filtersJson в форме расписаний отчетов
 * (#20). Сервер (normalizedFiltersJson в report-schedule-actions.ts) молча
 * заменяет невалидный JSON и не-объекты на "{}", поэтому ловим это до сабмита.
 *
 * Список ключей отражает атрибуты обращения, которые реально попадают в строки
 * выгрузки (loadReportExportRows в report-export.ts: supportLine, csatBucket,
 * externalSource, assigneeName) — тот же контракт использует пример
 * {"supportLine":"L1"} в тестах report-schedule.test.ts. Неизвестные ключи
 * сохраняются как есть (payload REPORT_EXPORT принимает произвольный объект),
 * поэтому они дают мягкое предупреждение, а не блокировку.
 */
export const reportScheduleFilterKeys = ["supportLine", "csatBucket", "externalSource", "assigneeName"] as const;

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
