"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { enqueueBackendJob } from "@/lib/jobs/enqueue";
import { cancelBackendJob, runDueBackendJobs } from "@/lib/jobs/queue";
import { logBackendEvent } from "@/lib/observability";
import { queueDirectorySync as queueDirectorySyncAction } from "@/lib/system-enqueue-actions";

export async function queueDirectorySync(formData: FormData) {
  return queueDirectorySyncAction(formData);
}

function numberField(formData: FormData, key: string, fallback: number, max: number) {
  const value = formData.get(key);
  const parsed = Number(typeof value === "string" ? value : "");

  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function runQueuedBackendJobs(formData: FormData) {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);
  const limit = numberField(formData, "limit", 5, 20);
  const results = await runDueBackendJobs({
    limit,
    workerId: `ui-${user.id.slice(0, 8)}`,
    workspaceId: user.workspaceId
  });

  logBackendEvent({
    event: "backend_jobs.run_from_ui",
    workspaceId: user.workspaceId,
    actorId: user.id,
    metadata: {
      limit,
      processed: results.length
    }
  });

  try {
    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "backend_jobs.run_from_ui",
      targetType: "backend_job",
      targetId: "batch",
      metadata: {
        limit,
        processed: results.length
      }
    });
  } catch (error) {
    logBackendEvent({
      level: "error",
      event: "backend_jobs.run_from_ui_audit_failed",
      workspaceId: user.workspaceId,
      actorId: user.id,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown audit logging error"
      }
    });
  }

  revalidatePath("/admin/system");
}

export async function queueRetentionCleanup() {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);
  const job = await enqueueBackendJob({
    workspaceId: user.workspaceId,
    type: "RETENTION_CLEANUP",
    queueName: "maintenance",
    priority: 80,
    createdById: user.id,
    payload: {
      source: "admin_system"
    }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "backend_job.retention_cleanup_queued",
    targetType: "backend_job",
    targetId: job.id,
    metadata: {
      queueName: job.queueName
    }
  });

  revalidatePath("/admin/system");
}

export async function cancelQueuedBackendJob(formData: FormData) {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);
  const jobId = stringField(formData, "jobId");
  const job = await cancelBackendJob({
    workspaceId: user.workspaceId,
    jobId,
    actorId: user.id,
    eventMessage: "Задача отменена администратором из интерфейса."
  });

  revalidatePath("/admin/system");
  revalidatePath(`/admin/system/jobs/${job.id}`);
}
