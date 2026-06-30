import { beforeEach, describe, expect, it, vi } from "vitest";
import { advanceNextRun } from "@/lib/report-schedule";

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  assertCanPersistSettings: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    reportSchedule: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn()
    }
  }
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission,
  assertCanPersistSettings: mocks.assertCanPersistSettings
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function adminUser() {
  return { id: "user-1", workspaceId: "workspace-1", role: "ADMIN" };
}

describe("createReportSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue(adminUser());
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.prisma.reportSchedule.create.mockResolvedValue({ id: "sched-1" });
  });

  function buildFormData(overrides: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("name", "Еженедельный отчет");
    formData.set("periodPreset", "last_7_days");
    formData.set("exportFormat", "xlsx");
    formData.set("cadence", "weekly");
    for (const [key, value] of Object.entries(overrides)) {
      formData.set(key, value);
    }
    return formData;
  }

  it("gates on the reports:read permission and the demo settings guard", async () => {
    const { createReportSchedule } = await import("@/lib/report-schedule-actions");

    await createReportSchedule({ status: "idle" }, buildFormData());

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("reports:read");
    expect(mocks.assertCanPersistSettings).toHaveBeenCalledWith(adminUser());
  });

  it("computes nextRunAt from cadence and persists the schedule", async () => {
    const { createReportSchedule } = await import("@/lib/report-schedule-actions");

    const before = new Date();
    const result = await createReportSchedule({ status: "idle" }, buildFormData());
    const after = new Date();

    expect(result.status).toBe("success");
    expect(mocks.prisma.reportSchedule.create).toHaveBeenCalledTimes(1);

    const data = mocks.prisma.reportSchedule.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      workspaceId: "workspace-1",
      name: "Еженедельный отчет",
      periodPreset: "last_7_days",
      exportFormat: "xlsx",
      cadence: "weekly",
      isActive: true,
      createdById: "user-1"
    });

    // nextRunAt is one weekly cadence period from "now" (bounded by the call window).
    const nextRunAt: Date = data.nextRunAt;
    expect(nextRunAt.getTime()).toBeGreaterThanOrEqual(advanceNextRun("weekly", before).getTime() - 5);
    expect(nextRunAt.getTime()).toBeLessThanOrEqual(advanceNextRun("weekly", after).getTime() + 5);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/report-schedules");
  });

  it("rejects an empty name without touching the database", async () => {
    const { createReportSchedule } = await import("@/lib/report-schedule-actions");

    const result = await createReportSchedule({ status: "idle" }, buildFormData({ name: "  " }));

    expect(result.status).toBe("error");
    expect(mocks.prisma.reportSchedule.create).not.toHaveBeenCalled();
  });

  it("normalizes unknown cadence/preset/format to defaults", async () => {
    const { createReportSchedule } = await import("@/lib/report-schedule-actions");

    await createReportSchedule(
      { status: "idle" },
      buildFormData({ cadence: "hourly", periodPreset: "nonsense", exportFormat: "doc" })
    );

    const data = mocks.prisma.reportSchedule.create.mock.calls[0][0].data;
    expect(data.cadence).toBe("weekly");
    expect(data.periodPreset).toBe("last_7_days");
    expect(data.exportFormat).toBe("xlsx");
  });
});

describe("setReportScheduleActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue(adminUser());
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.prisma.reportSchedule.updateMany.mockResolvedValue({ count: 1 });
  });

  it("scopes the toggle to the caller's workspace", async () => {
    const { setReportScheduleActive } = await import("@/lib/report-schedule-actions");

    const formData = new FormData();
    formData.set("scheduleId", "sched-1");
    formData.set("isActive", "false");

    await setReportScheduleActive(formData);

    expect(mocks.prisma.reportSchedule.updateMany).toHaveBeenCalledWith({
      where: { id: "sched-1", workspaceId: "workspace-1" },
      data: { isActive: false }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/report-schedules");
  });
});

describe("deleteReportSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue(adminUser());
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.prisma.reportSchedule.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("scopes the delete to the caller's workspace", async () => {
    const { deleteReportSchedule } = await import("@/lib/report-schedule-actions");

    const formData = new FormData();
    formData.set("scheduleId", "sched-1");

    await deleteReportSchedule(formData);

    expect(mocks.prisma.reportSchedule.deleteMany).toHaveBeenCalledWith({
      where: { id: "sched-1", workspaceId: "workspace-1" }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/report-schedules");
  });
});
