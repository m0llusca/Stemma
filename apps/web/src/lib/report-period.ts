export type ReportPeriod = {
  preset: string;
  start: Date;
  end: Date;
  label: string;
  adjustment?: {
    kind: "max-span";
    maximumDays: number;
    requestedStart: string;
    requestedEnd: string;
    message: string;
  };
};

const oneDayMs = 24 * 60 * 60 * 1000;
export const MAX_CUSTOM_REPORT_PERIOD_DAYS = 366;

function dateOnly(value: Date) {
  const normalized = new Date(value.getTime());
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

function endOfDay(value: Date) {
  const normalized = new Date(value.getTime());
  normalized.setUTCHours(23, 59, 59, 999);
  return normalized;
}

function addMonths(value: Date, months: number) {
  const normalized = dateOnly(value);
  normalized.setUTCMonth(normalized.getUTCMonth() + months);
  return normalized;
}

function addDays(value: Date, days: number) {
  return new Date(dateOnly(value).getTime() + days * oneDayMs);
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDateInput(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || formatDateInput(parsed) !== value
    ? undefined
    : parsed;
}

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function currentVkPeriod(today = new Date()) {
  const normalized = dateOnly(today);
  const year = normalized.getUTCFullYear();
  const month = normalized.getUTCMonth();
  const day = normalized.getUTCDate();
  const start = day >= 22 ? new Date(Date.UTC(year, month, 22)) : new Date(Date.UTC(year, month - 1, 22));
  const end = endOfDay(new Date(addMonths(start, 1).getTime() - oneDayMs));

  return { start, end };
}

function currentCalendarMonth(today = new Date()) {
  const normalized = dateOnly(today);
  const start = new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), 1));
  const end = endOfDay(new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth() + 1, 0)));

  return { start, end };
}

function previousPeriodFor(start: Date, end: Date) {
  const days = Math.round((dateOnly(end).getTime() - dateOnly(start).getTime()) / oneDayMs) + 1;
  const previousEnd = endOfDay(new Date(dateOnly(start).getTime() - oneDayMs));
  const previousStart = dateOnly(new Date(previousEnd.getTime() - (days - 1) * oneDayMs));

  return { start: previousStart, end: previousEnd };
}

export function resolveReportPeriod(params: Record<string, string | string[] | undefined>, today = new Date()): ReportPeriod {
  const preset = firstParam(params.period) ?? "vk-current";
  const customStart = parseDateInput(firstParam(params.start));
  const customEnd = parseDateInput(firstParam(params.end));

  if (preset === "custom" && customStart && customEnd && customStart <= customEnd) {
    const maximumEnd = addDays(
      customStart,
      MAX_CUSTOM_REPORT_PERIOD_DAYS - 1
    );
    const rangeWasClamped = customEnd > maximumEnd;
    const resolvedEnd = rangeWasClamped ? maximumEnd : customEnd;

    return {
      preset,
      start: customStart,
      end: endOfDay(resolvedEnd),
      label: "Произвольный период",
      ...(rangeWasClamped
        ? {
            adjustment: {
              kind: "max-span" as const,
              maximumDays: MAX_CUSTOM_REPORT_PERIOD_DAYS,
              requestedStart: formatDateInput(customStart),
              requestedEnd: formatDateInput(customEnd),
              message: `Диапазон ограничен до ${MAX_CUSTOM_REPORT_PERIOD_DAYS} дней. В отчёте и ссылках применены даты ${formatDateInput(customStart)} — ${formatDateInput(resolvedEnd)}.`
            }
          }
        : {})
    };
  }

  if (preset === "custom") {
    const current = currentVkPeriod(today);

    return {
      preset,
      start: current.start,
      end: current.end,
      label: "Произвольный период"
    };
  }

  if (preset === "calendar-current") {
    const { start, end } = currentCalendarMonth(today);
    return { preset, start, end, label: "Календарный месяц" };
  }

  if (preset === "calendar-previous") {
    const current = currentCalendarMonth(today);
    const previousStart = new Date(Date.UTC(current.start.getUTCFullYear(), current.start.getUTCMonth() - 1, 1));
    const previousEnd = endOfDay(new Date(Date.UTC(current.start.getUTCFullYear(), current.start.getUTCMonth(), 0)));
    return { preset, start: previousStart, end: previousEnd, label: "Прошлый календарный месяц" };
  }

  if (preset === "quarter-current") {
    const normalized = dateOnly(today);
    const quarterStartMonth = Math.floor(normalized.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(normalized.getUTCFullYear(), quarterStartMonth, 1));
    const end = endOfDay(new Date(Date.UTC(normalized.getUTCFullYear(), quarterStartMonth + 3, 0)));
    return { preset, start, end, label: "Текущий квартал" };
  }

  if (preset === "vk-previous") {
    const current = currentVkPeriod(today);
    const previous = previousPeriodFor(current.start, current.end);
    return { preset, start: previous.start, end: previous.end, label: "Прошлый период 22-21" };
  }

  const current = currentVkPeriod(today);
  return { preset: "vk-current", start: current.start, end: current.end, label: "Текущий период 22-21" };
}

export function resolvePreviousReportPeriod(period: ReportPeriod): ReportPeriod {
  const previous = previousPeriodFor(period.start, period.end);

  return {
    preset: "previous",
    start: previous.start,
    end: previous.end,
    label: "Предыдущий сопоставимый период"
  };
}

export function reportDateInputValue(value: Date) {
  return formatDateInput(value);
}

export function reportPeriodUsesCustomDates(period: ReportPeriod) {
  return period.preset === "custom";
}

export function reportPeriodDateLabel(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();

  return `${day}.${month}.${year}`;
}
