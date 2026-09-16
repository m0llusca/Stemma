import { createDemoCalendar, daysFrom } from "../../../prisma/demo-calendar";
import { resolveReportPeriod } from "../../../src/lib/report-period";

function formatUtcDate(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${value.getUTCFullYear()}`;
}

/**
 * Operational queue/coaching dates follow the Moscow seed `anchor`.
 * Report headings follow UTC `dateOnly(now)` — the same clock
 * `resolveReportPeriod` uses in the running app. Pass wall-clock `now` from
 * e2e so the Moscow-22nd / UTC-21st window (~21:00–00:00Z) expects the
 * heading the app actually renders. Product timezone is unchanged.
 */
export function buildDemoDateExpectations(anchor: Date, now: Date = anchor) {
  const calendar = createDemoCalendar(anchor);
  const currentReportPeriod = resolveReportPeriod(
    { period: "vk-current" },
    now
  );
  const previousReportPeriod = resolveReportPeriod(
    { period: "vk-previous" },
    now
  );

  return {
    reportHeadings: {
      current: `Текущий период 22-21: ${formatUtcDate(currentReportPeriod.start)} - ${formatUtcDate(currentReportPeriod.end)}`,
      previous: `Прошлый период 22-21: ${formatUtcDate(previousReportPeriod.start)} - ${formatUtcDate(previousReportPeriod.end)}`
    },
    queueDueDates: {
      QUEUED: formatUtcDate(daysFrom(calendar, -1, { hour: 18 })),
      ASSIGNED: formatUtcDate(daysFrom(calendar, 2, { hour: 12 })),
      IN_PROGRESS: formatUtcDate(daysFrom(calendar, 3, { hour: 12 })),
      REOPENED: formatUtcDate(daysFrom(calendar, 0, { hour: 16 }))
    },
    coachingDueDates: [
      formatUtcDate(daysFrom(calendar, 0, { hour: 11 })),
      formatUtcDate(daysFrom(calendar, 1, { hour: 12 }))
    ] as const
  } as const;
}
