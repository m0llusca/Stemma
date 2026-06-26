"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { enqueueBackendJob } from "@/lib/jobs/enqueue";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
  const dryRun = stringField(formData, "dryRun") === "true";

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
      providerId,
      ...(dryRun ? { dryRun: true } : {})
    }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "auth.directory_sync_queued",
    targetType: "identity_provider",
    targetId: providerId,
    metadata: {
      jobId: job.id,
      dryRun
    }
  });

  revalidatePath("/admin/system");
}
