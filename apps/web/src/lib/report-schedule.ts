import type { Prisma } from "@prisma/client";
import { enqueueBackendJob } from "@/lib/jobs/enqueue";

/**
 * Pure scheduling helpers + the due-schedule materializer for recurring report
 * exports (Workstream A2). The on-demand worker calls enqueueDueReportSchedules
 * at the top of runDueBackendJobs, so every drain of the queue first turns any
 * due ReportSchedule rows into REPORT_EXPORT BackendJobs.
 *
 * The enqueued payload mirrors what runReportExportJob in jobs/queue.ts reads:
 *   { name, periodStart, periodEnd, filters, format }
 * (metrics is intentionally omitted — the snapshot defaults it to {}).
 */

export const REPORT_SCHEDULE_PERIOD_PRESETS = [
  "last_7_days",
  "last_30_days",
  "previous_calendar_month"
] as const;
export type ReportSchedulePeriodPreset = (typeof REPORT_SCHEDULE_PERIOD_PRESETS)[number];

export const REPORT_SCHEDULE_CADENCES = ["daily", "weekly", "monthly"] as const;
export type ReportScheduleCadence = (typeof REPORT_SCHEDULE_CADENCES)[number];

export const REPORT_SCHEDULE_FORMATS = ["xlsx", "csv", "pdf"] as const;
export type ReportScheduleFormat = (typeof REPORT_SCHEDULE_FORMATS)[number];

const DEFAULT_PERIOD_PRESET: ReportSchedulePeriodPreset = "last_7_days";
const DEFAULT_CADENCE: ReportScheduleCadence = "weekly";
const oneDayMs = 24 * 60 * 60 * 1000;

export function isReportSchedulePeriodPreset(value: string): value is ReportSchedulePeriodPreset {
  return (REPORT_SCHEDULE_PERIOD_PRESETS as readonly string[]).includes(value);
}

export function isReportScheduleCadence(value: string): value is ReportScheduleCadence {
  return (REPORT_SCHEDULE_CADENCES as readonly string[]).includes(value);
}

export function isReportScheduleFormat(value: string): value is ReportScheduleFormat {
  return (REPORT_SCHEDULE_FORMATS as readonly string[]).includes(value);
}

export type ReportSchedulePeriod = {
  start: Date;
  end: Date;
};

/**
 * Resolves a stored period preset into a concrete [start, end] window relative
 * to `now`. Unknown presets fall back to the 7-day rolling window.
 */
export function resolvePeriodPreset(preset: string, now: Date): ReportSchedulePeriod {
  if (preset === "last_30_days") {
    return { start: new Date(now.getTime() - 30 * oneDayMs), end: new Date(now.getTime()) };
  }

  if (preset === "previous_calendar_month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0) - 1);
    return { start, end };
  }

  // last_7_days (default).
  return { start: new Date(now.getTime() - 7 * oneDayMs), end: new Date(now.getTime()) };
}

/**
 * Advances a run timestamp by one cadence period. Daily/weekly add a fixed day
 * count; monthly steps one calendar month forward. Unknown cadence -> weekly.
 */
export function advanceNextRun(cadence: string, from: Date): Date {
  if (cadence === "daily") {
    return new Date(from.getTime() + oneDayMs);
  }

  if (cadence === "monthly") {
    return new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth() + 1,
        from.getUTCDate(),
        from.getUTCHours(),
        from.getUTCMinutes(),
        from.getUTCSeconds(),
        from.getUTCMilliseconds()
      )
    );
  }

  // weekly (default).
  return new Date(from.getTime() + 7 * oneDayMs);
}

/**
 * First nextRunAt for a freshly created schedule: one cadence period from now.
 */
export function computeInitialNextRun(cadence: string, now: Date): Date {
  return advanceNextRun(cadence, now);
}

function parseFiltersJson(filtersJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(filtersJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

type DueScheduleRow = {
  id: string;
  workspaceId: string;
  name: string;
  periodPreset: string;
  exportFormat: string;
  cadence: string;
  filtersJson: string;
  createdById: string | null;
};

type ReportScheduleClient = Pick<Prisma.TransactionClient, "reportSchedule" | "backendJob">;

/**
 * Finds active schedules whose nextRunAt has passed, enqueues a REPORT_EXPORT
 * job for each (payload shaped for runReportExportJob), then advances each
 * schedule's lastRunAt/nextRunAt. Returns how many jobs were enqueued.
 */
export async function enqueueDueReportSchedules(now: Date, client: ReportScheduleClient) {
  const dueSchedules = (await client.reportSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now }
    },
    orderBy: { nextRunAt: "asc" }
  })) as DueScheduleRow[];

  let enqueuedCount = 0;

  for (const schedule of dueSchedules) {
    const { start, end } = resolvePeriodPreset(schedule.periodPreset, now);

    await enqueueBackendJob(
      {
        workspaceId: schedule.workspaceId,
        type: "REPORT_EXPORT",
        queueName: "reports",
        priority: 90,
        createdById: schedule.createdById ?? undefined,
        payload: {
          name: schedule.name,
          periodStart: start.toISOString(),
          periodEnd: end.toISOString(),
          filters: parseFiltersJson(schedule.filtersJson),
          format: schedule.exportFormat,
          reportScheduleId: schedule.id
        }
      },
      client
    );

    await client.reportSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        nextRunAt: advanceNextRun(schedule.cadence, now)
      }
    });

    enqueuedCount += 1;
  }

  return { enqueuedCount };
}
