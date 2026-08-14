import type { ReportPeriod } from "../src/lib/report-period";

const strictUtcInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type DemoCalendar = Readonly<{
  now: Date;
  startOfToday: Date;
  rollingSevenDaysStart: Date;
  previousSevenDaysStart: Date;
  thirtyDaysStart: Date;
  rollingThirtyFiveDaysStart: Date;
  previousThirtyFiveDaysStart: Date;
  previousThirtyFiveDaysEnd: Date;
  currentVkPeriod: ReportPeriod;
  previousVkPeriod: ReportPeriod;
  currentMonth: ReportPeriod;
  previousMonth: ReportPeriod;
}>;

export type DemoClock = Readonly<{
  hour?: number;
  minute?: number;
  second?: number;
}>;

const moscowOffsetMs = 3 * 60 * 60 * 1000;

function startOfMoscowDay(value: Date) {
  const shifted = new Date(value.getTime() + moscowOffsetMs);
  const result = new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate()
    ) - moscowOffsetMs
  );
  return result;
}

function atMoscowDayOffset(value: Date, offset: number, clock: DemoClock = {}) {
  const result = startOfMoscowDay(value);
  result.setUTCDate(result.getUTCDate() + offset);
  result.setTime(
    result.getTime() +
      (clock.hour ?? 0) * 60 * 60 * 1000 +
      (clock.minute ?? 0) * 60 * 1000 +
      (clock.second ?? 0) * 1000
  );
  return result;
}

function moscowDateParts(value: Date) {
  const shifted = new Date(value.getTime() + moscowOffsetMs);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate()
  };
}

function moscowDateAtUtc(
  year: number,
  month: number,
  day: number,
  endOfDay = false
) {
  const midnight = Date.UTC(year, month, day) - moscowOffsetMs;
  return new Date(midnight + (endOfDay ? 24 * 60 * 60 * 1000 - 1 : 0));
}

function createMoscowMonthPeriod(now: Date, monthOffset: number): ReportPeriod {
  const { year, month } = moscowDateParts(now);
  const start = moscowDateAtUtc(year, month + monthOffset, 1);
  const end = new Date(moscowDateAtUtc(year, month + monthOffset + 1, 1).getTime() - 1);
  return {
    preset: monthOffset === 0 ? "calendar-current" : "calendar-previous",
    start,
    end,
    label: monthOffset === 0 ? "Текущий календарный месяц" : "Предыдущий календарный месяц"
  };
}

function createMoscowVkPeriod(now: Date): ReportPeriod {
  const { year, month, day } = moscowDateParts(now);
  const startMonth = day >= 22 ? month : month - 1;
  return {
    preset: "vk-current",
    start: moscowDateAtUtc(year, startMonth, 22),
    end: moscowDateAtUtc(year, startMonth + 1, 21, true),
    label: "Текущий период 22–21"
  };
}

export function resolveDemoSeedNow(env: NodeJS.ProcessEnv): Date {
  const configuredNow = env.DEMO_SEED_NOW;

  if (configuredNow === undefined) {
    return new Date();
  }

  if (!strictUtcInstantPattern.test(configuredNow)) {
    throw new Error("DEMO_SEED_NOW must use the exact format YYYY-MM-DDTHH:mm:ss.sssZ");
  }

  const parsed = new Date(configuredNow);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== configuredNow) {
    throw new Error("DEMO_SEED_NOW must be a valid UTC instant");
  }

  return parsed;
}

export function createDemoCalendar(now: Date): DemoCalendar {
  const anchor = new Date(now.getTime());
  const startOfToday = startOfMoscowDay(anchor);
  const currentVkPeriod = createMoscowVkPeriod(anchor);
  const previousVkPeriod = createMoscowVkPeriod(
    new Date(currentVkPeriod.start.getTime() - 1)
  );
  previousVkPeriod.preset = "vk-previous";
  previousVkPeriod.label = "Предыдущий период 22–21";
  const currentMonth = createMoscowMonthPeriod(anchor, 0);

  return {
    now: anchor,
    startOfToday,
    rollingSevenDaysStart: atMoscowDayOffset(startOfToday, -6),
    previousSevenDaysStart: atMoscowDayOffset(startOfToday, -13),
    thirtyDaysStart: atMoscowDayOffset(startOfToday, -29),
    rollingThirtyFiveDaysStart: atMoscowDayOffset(startOfToday, -34),
    previousThirtyFiveDaysStart: atMoscowDayOffset(startOfToday, -69),
    previousThirtyFiveDaysEnd: new Date(
      atMoscowDayOffset(startOfToday, -34).getTime() - 1
    ),
    currentVkPeriod,
    previousVkPeriod,
    currentMonth,
    previousMonth: createMoscowMonthPeriod(anchor, -1)
  };
}

export function daysFrom(calendar: DemoCalendar, offset: number, clock?: DemoClock): Date {
  return atMoscowDayOffset(calendar.startOfToday, offset, clock);
}
