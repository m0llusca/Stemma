"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { enqueueBackendJob, runDueBackendJobs } from "@/lib/jobs/queue";
import { logBackendEvent } from "@/lib/observability";

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
    workerId: `ui-${user.id.slice(0, 8)}`
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

export async function queueDirectorySync(formData: FormData) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  await assertCanPersistSettings(user);
  const providerId = stringField(formData, "providerId");

  if (!providerId) {
    throw new Error("Провайдер авторизации не указан.");
  }

  const job = await enqueueBackendJob({
    workspaceId: user.workspaceId,
    type: "DIRECTORY_SYNC",
    queueName: "directory",
    priority: 70,
    createdById: user.id,
    payload: {
      providerId
    }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "auth.directory_sync_queued",
    targetType: "identity_provider",
    targetId: providerId,
    metadata: {
      jobId: job.id
    }
  });

  revalidatePath("/admin/system");
}

export async function cancelQueuedBackendJob(formData: FormData) {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);
  const jobId = stringField(formData, "jobId");

  const job = await prisma.backendJob.findFirst({
    where: {
      id: jobId,
      workspaceId: user.workspaceId
    }
  });

  if (!job) {
    throw new Error("Фоновая задача не найдена.");
  }

  if (job.status !== "QUEUED") {
    throw new Error("Можно отменить только задачу в очереди.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.backendJob.update({
      where: { id: job.id },
      data: {
        status: "CANCELLED",
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null
      }
    });

    await tx.backendJobEvent.create({
      data: {
        jobId: job.id,
        level: "warn",
        message: "Задача отменена администратором из интерфейса.",
        metadata: JSON.stringify({ actorId: user.id })
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "backend_job.cancelled",
        targetType: "backend_job",
        targetId: job.id,
        metadata: {
          type: job.type
        }
      },
      tx
    );
  });

  revalidatePath("/admin/system");
  revalidatePath(`/admin/system/jobs/${job.id}`);
}
