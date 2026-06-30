"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  computeInitialNextRun,
  isReportScheduleCadence,
  isReportScheduleFormat,
  isReportSchedulePeriodPreset,
  type ReportScheduleCadence,
  type ReportScheduleFormat,
  type ReportSchedulePeriodPreset
} from "@/lib/report-schedule";

/**
 * Server actions for recurring report exports (Workstream A2). All actions are
 * gated behind the same `reports:read` permission used by the report export
 * routes (see app/reports/export/route.ts) plus the demo-settings guard the
 * rest of /admin uses (assertCanPersistSettings). The on-demand worker
 * materializes due schedules into REPORT_EXPORT jobs — see report-schedule.ts.
 */

const REPORT_SCHEDULES_PATH = "/admin/report-schedules";

const DEFAULT_PERIOD_PRESET: ReportSchedulePeriodPreset = "last_7_days";
const DEFAULT_FORMAT: ReportScheduleFormat = "xlsx";
const DEFAULT_CADENCE: ReportScheduleCadence = "weekly";

export type ReportScheduleActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizedPeriodPreset(value: string): ReportSchedulePeriodPreset {
  return isReportSchedulePeriodPreset(value) ? value : DEFAULT_PERIOD_PRESET;
}

function normalizedFormat(value: string): ReportScheduleFormat {
  return isReportScheduleFormat(value) ? value : DEFAULT_FORMAT;
}

function normalizedCadence(value: string): ReportScheduleCadence {
  return isReportScheduleCadence(value) ? value : DEFAULT_CADENCE;
}

function normalizedFiltersJson(value: string): string {
  if (!value) {
    return "{}";
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify(parsed);
    }
  } catch {
    // Fall through to the empty-object default below.
  }

  return "{}";
}

export async function createReportSchedule(
  _previousState: ReportScheduleActionState,
  formData: FormData
): Promise<ReportScheduleActionState> {
  const user = await requireCurrentUserPermission("reports:read");
  await assertCanPersistSettings(user);

  const name = stringField(formData, "name");

  if (!name) {
    return { status: "error", message: "Укажите название расписания." };
  }

  const cadence = normalizedCadence(stringField(formData, "cadence"));
  const now = new Date();

  try {
    const schedule = await prisma.reportSchedule.create({
      data: {
        workspaceId: user.workspaceId,
        name,
        periodPreset: normalizedPeriodPreset(stringField(formData, "periodPreset")),
        exportFormat: normalizedFormat(stringField(formData, "exportFormat")),
        cadence,
        filtersJson: normalizedFiltersJson(stringField(formData, "filtersJson")),
        isActive: true,
        nextRunAt: computeInitialNextRun(cadence, now),
        createdById: user.id
      }
    });

    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "report_schedule.created",
      targetType: "report_schedule",
      targetId: schedule.id,
      metadata: {
        cadence,
        periodPreset: schedule.periodPreset,
        exportFormat: schedule.exportFormat
      }
    });

    revalidatePath(REPORT_SCHEDULES_PATH);

    return { status: "success", message: "Расписание создано." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Не удалось создать расписание."
    };
  }
}

export async function setReportScheduleActive(formData: FormData) {
  const user = await requireCurrentUserPermission("reports:read");
  await assertCanPersistSettings(user);

  const scheduleId = stringField(formData, "scheduleId");
  const isActive = stringField(formData, "isActive") === "true";

  if (!scheduleId) {
    throw new Error("Расписание не указано.");
  }

  const updated = await prisma.reportSchedule.updateMany({
    where: { id: scheduleId, workspaceId: user.workspaceId },
    data: { isActive }
  });

  if (updated.count === 0) {
    throw new Error("Расписание не найдено.");
  }

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "report_schedule.status_changed",
    targetType: "report_schedule",
    targetId: scheduleId,
    metadata: { isActive }
  });

  revalidatePath(REPORT_SCHEDULES_PATH);
}

export async function deleteReportSchedule(formData: FormData) {
  const user = await requireCurrentUserPermission("reports:read");
  await assertCanPersistSettings(user);

  const scheduleId = stringField(formData, "scheduleId");

  if (!scheduleId) {
    throw new Error("Расписание не указано.");
  }

  const deleted = await prisma.reportSchedule.deleteMany({
    where: { id: scheduleId, workspaceId: user.workspaceId }
  });

  if (deleted.count === 0) {
    throw new Error("Расписание не найдено.");
  }

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "report_schedule.deleted",
    targetType: "report_schedule",
    targetId: scheduleId,
    metadata: {}
  });

  revalidatePath(REPORT_SCHEDULES_PATH);
}
