import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceNextRun,
  computeInitialNextRun,
  enqueueDueReportSchedules,
  resolvePeriodPreset
} from "@/lib/report-schedule";

const mocks = vi.hoisted(() => ({
  enqueueBackendJob: vi.fn()
}));

vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueBackendJob: mocks.enqueueBackendJob
}));

describe("resolvePeriodPreset", () => {
  const now = new Date("2026-06-30T10:00:00.000Z");

  it("resolves last_7_days as the 7-day window ending now", () => {
    const { start, end } = resolvePeriodPreset("last_7_days", now);

    expect(end.toISOString()).toBe(now.toISOString());
    expect(start.toISOString()).toBe(new Date("2026-06-23T10:00:00.000Z").toISOString());
  });

  it("resolves last_30_days as the 30-day window ending now", () => {
    const { start, end } = resolvePeriodPreset("last_30_days", now);

    expect(end.toISOString()).toBe(now.toISOString());
    expect(start.toISOString()).toBe(new Date("2026-05-31T10:00:00.000Z").toISOString());
  });

  it("resolves previous_calendar_month to the full prior month", () => {
    const { start, end } = resolvePeriodPreset("previous_calendar_month", now);

    expect(start.toISOString()).toBe(new Date("2026-05-01T00:00:00.000Z").toISOString());
    expect(end.toISOString()).toBe(new Date("2026-05-31T23:59:59.999Z").toISOString());
  });

  it("falls back to last_7_days for unknown presets", () => {
    const fallback = resolvePeriodPreset("nonsense", now);
    const baseline = resolvePeriodPreset("last_7_days", now);

    expect(fallback.start.toISOString()).toBe(baseline.start.toISOString());
    expect(fallback.end.toISOString()).toBe(baseline.end.toISOString());
  });
});

describe("advanceNextRun", () => {
  const from = new Date("2026-06-30T10:00:00.000Z");

  it("advances daily cadence by one day", () => {
    expect(advanceNextRun("daily", from).toISOString()).toBe(new Date("2026-07-01T10:00:00.000Z").toISOString());
  });

  it("advances weekly cadence by seven days", () => {
    expect(advanceNextRun("weekly", from).toISOString()).toBe(new Date("2026-07-07T10:00:00.000Z").toISOString());
  });

  it("advances monthly cadence by one calendar month", () => {
    expect(advanceNextRun("monthly", from).toISOString()).toBe(new Date("2026-07-30T10:00:00.000Z").toISOString());
  });

  it("treats unknown cadence as weekly", () => {
    expect(advanceNextRun("hourly", from).toISOString()).toBe(advanceNextRun("weekly", from).toISOString());
  });
});

describe("computeInitialNextRun", () => {
  it("schedules the first run one cadence period from now", () => {
    const now = new Date("2026-06-30T10:00:00.000Z");
    expect(computeInitialNextRun("weekly", now).toISOString()).toBe(advanceNextRun("weekly", now).toISOString());
  });
});

describe("enqueueDueReportSchedules", () => {
  const now = new Date("2026-06-30T10:00:00.000Z");

  function buildClient(schedules: Array<Record<string, unknown>>) {
    return {
      reportSchedule: {
        findMany: vi.fn().mockResolvedValue(schedules),
        update: vi.fn().mockResolvedValue({})
      }
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues one REPORT_EXPORT job per due active schedule and advances nextRunAt", async () => {
    const client = buildClient([
      {
        id: "sched-1",
        workspaceId: "workspace-1",
        name: "Еженедельный отчет",
        periodPreset: "last_7_days",
        exportFormat: "xlsx",
        cadence: "weekly",
        filtersJson: JSON.stringify({ supportLine: "L1" }),
        createdById: "user-1"
      }
    ]);

    const result = await enqueueDueReportSchedules(now, client as never);

    expect(client.reportSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, nextRunAt: { lte: now } })
      })
    );
    expect(mocks.enqueueBackendJob).toHaveBeenCalledTimes(1);

    const [jobInput, passedClient] = mocks.enqueueBackendJob.mock.calls[0];
    expect(passedClient).toBe(client);
    expect(jobInput).toMatchObject({
      workspaceId: "workspace-1",
      type: "REPORT_EXPORT",
      createdById: "user-1"
    });
    expect(jobInput.payload).toMatchObject({
      name: "Еженедельный отчет",
      format: "xlsx",
      filters: { supportLine: "L1" }
    });
    expect(new Date(jobInput.payload.periodStart).toISOString()).toBe(
      resolvePeriodPreset("last_7_days", now).start.toISOString()
    );
    expect(new Date(jobInput.payload.periodEnd).toISOString()).toBe(
      resolvePeriodPreset("last_7_days", now).end.toISOString()
    );

    expect(client.reportSchedule.update).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data: {
        lastRunAt: now,
        nextRunAt: advanceNextRun("weekly", now)
      }
    });

    expect(result.enqueuedCount).toBe(1);
  });

  it("does nothing when no schedules are due", async () => {
    const client = buildClient([]);

    const result = await enqueueDueReportSchedules(now, client as never);

    expect(mocks.enqueueBackendJob).not.toHaveBeenCalled();
    expect(client.reportSchedule.update).not.toHaveBeenCalled();
    expect(result.enqueuedCount).toBe(0);
  });

  it("tolerates malformed filtersJson by enqueuing empty filters", async () => {
    const client = buildClient([
      {
        id: "sched-2",
        workspaceId: "workspace-1",
        name: "Сломанные фильтры",
        periodPreset: "last_7_days",
        exportFormat: "csv",
        cadence: "daily",
        filtersJson: "{not json",
        createdById: null
      }
    ]);

    await enqueueDueReportSchedules(now, client as never);

    const [jobInput] = mocks.enqueueBackendJob.mock.calls[0];
    expect(jobInput.payload.filters).toEqual({});
    expect(client.reportSchedule.update).toHaveBeenCalledWith({
      where: { id: "sched-2" },
      data: {
        lastRunAt: now,
        nextRunAt: advanceNextRun("daily", now)
      }
    });
  });
});
