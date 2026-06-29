import type { BackendJob, BackendJobStatus, Prisma } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import type { IntegrationJobOperation } from "@/lib/integration-import-service";
import { runAiScoreJob } from "@/lib/jobs/ai-score-job";
import { runMessagingDeliveryJob } from "@/lib/jobs/messaging-delivery-job";
import type { BackendJobPayload } from "@/lib/jobs/enqueue";
import { logBackendEvent } from "@/lib/observability";

export { enqueueBackendJob } from "@/lib/jobs/enqueue";
export type { BackendJobPayload } from "@/lib/jobs/enqueue";

export const backendJobQueueDefaults = {
  claimRetries: 3,
  retryBaseDelayMs: 60_000,
  staleLockMs: 30 * 60_000,
  staleRecoveryLimit: 20
} as const;
const requeueConflictMessage = "Можно вернуть в очередь только ошибочную задачу текущего рабочего пространства.";
const cancelConflictMessage = "Можно отменить только задачу в очереди.";
const lostLockMessage = "Задача уже перехвачена другим worker.";
const cancelledIntegrationImportMessage = "Задача импорта отменена.";

export class BackendJobRequeueConflictError extends Error {
  constructor() {
    super(requeueConflictMessage);
    this.name = "BackendJobRequeueConflictError";
  }
}

export class BackendJobCancelConflictError extends Error {
  constructor() {
    super(cancelConflictMessage);
    this.name = "BackendJobCancelConflictError";
  }
}

export class BackendJobNotFoundError extends Error {
  constructor() {
    super("Фоновая задача не найдена.");
    this.name = "BackendJobNotFoundError";
  }
}

class BackendJobLostLockError extends Error {
  constructor() {
    super(lostLockMessage);
    this.name = "BackendJobLostLockError";
  }
}

type JobClient = Pick<
  Prisma.TransactionClient,
  | "backendJob"
  | "backendJobEvent"
  | "integration"
  | "integrationRun"
  | "identityProvider"
  | "externalIdentity"
  | "identityGroup"
  | "userIdentityGroup"
  | "groupRoleMapping"
  | "user"
  | "authSession"
  | "idempotencyKey"
  | "apiRateLimit"
  | "reportSnapshot"
  | "auditLog"
>;

function parsePayloadJson(payloadJson: string): BackendJobPayload {
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function restorableIntegrationStatus(value: unknown) {
  return typeof value === "string" && ["planned", "ready", "active", "paused", "error"].includes(value) ? value : "ready";
}

async function restoreCancelledIntegrationImportState(
  client: Pick<Prisma.TransactionClient, "integration" | "integrationRun">,
  job: Pick<BackendJob, "workspaceId" | "type" | "payloadJson">,
  finishedAt: Date
) {
  if (job.type !== "INTEGRATION_IMPORT") {
    return;
  }

  const payload = parsePayloadJson(job.payloadJson);
  const integrationId = typeof payload.integrationId === "string" ? payload.integrationId : null;
  const integrationRunId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;

  if (integrationRunId) {
    await client.integrationRun.updateMany({
      where: {
        id: integrationRunId,
        workspaceId: job.workspaceId,
        status: {
          in: ["queued", "dry_run_queued"]
        }
      },
      data: {
        status: "cancelled",
        errorMessage: cancelledIntegrationImportMessage,
        finishedAt
      }
    });
  }

  if (integrationId) {
    await client.integration.updateMany({
      where: {
        id: integrationId,
        workspaceId: job.workspaceId,
        status: "queued"
      },
      data: {
        status: restorableIntegrationStatus(payload.previousStatus),
        lastError: null
      }
    });
  }
}

export async function getBackendQueueMetrics(workspaceId: string): Promise<Array<{ queueName: string; status: BackendJobStatus; count: number }>> {
  const rows = await prisma.backendJob.groupBy({
    by: ["queueName", "status"],
    where: { workspaceId },
    _count: { _all: true },
    orderBy: [{ queueName: "asc" }, { status: "asc" }]
  });

  return rows.map((row) => ({
    queueName: row.queueName,
    status: row.status,
    count: row._count._all
  }));
}

export async function recordJobEvent(client: JobClient, jobId: string, level: string, message: string, metadata: unknown = {}) {
  await client.backendJobEvent.create({
    data: {
      jobId,
      level,
      message,
      metadata: JSON.stringify(metadata)
    }
  });
}

export function nextRetryRunAfter(input: { attempts: number; now?: Date; baseDelayMs?: number }) {
  const now = input.now ?? new Date();
  const baseDelayMs = input.baseDelayMs ?? backendJobQueueDefaults.retryBaseDelayMs;
  const delayMultiplier = Math.max(1, input.attempts);

  return new Date(now.getTime() + baseDelayMs * delayMultiplier);
}

export async function requeueBackendJob(input: { workspaceId: string; jobId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const requeued = await tx.backendJob.updateMany({
      where: {
        id: input.jobId,
        workspaceId: input.workspaceId,
        status: "FAILED"
      },
      data: {
        status: "QUEUED",
        attempts: 0,
        runAfter: new Date(),
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        finishedAt: null,
        errorMessage: null
      }
    });

    if (requeued.count === 0) {
      throw new BackendJobRequeueConflictError();
    }

    const updated = await tx.backendJob.findUnique({
      where: { id: input.jobId }
    });

    if (!updated) {
      throw new BackendJobRequeueConflictError();
    }

    await recordJobEvent(tx, updated.id, "warn", "Задача возвращена в очередь администратором.", {
      actorId: input.actorId
    });

    await auditLog(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "backend_job.requeued",
        targetType: "backend_job",
        targetId: updated.id,
        metadata: {
          type: updated.type,
          status: updated.status
        }
      },
      tx
    );

    return updated;
  });
}

export async function cancelBackendJob(input: { workspaceId: string; jobId: string; actorId: string; eventMessage?: string }) {
  const existing = await prisma.backendJob.findFirst({
    where: {
      id: input.jobId,
      workspaceId: input.workspaceId
    },
    select: {
      id: true,
      status: true,
      type: true,
      payloadJson: true,
      workspaceId: true
    }
  });

  if (!existing) {
    throw new BackendJobNotFoundError();
  }

  if (existing.status !== "QUEUED") {
    throw new BackendJobCancelConflictError();
  }

  return prisma.$transaction(async (tx) => {
    const finishedAt = new Date();
    const cancelled = await tx.backendJob.updateMany({
      where: {
        id: input.jobId,
        workspaceId: input.workspaceId,
        status: "QUEUED"
      },
      data: {
        status: "CANCELLED",
        finishedAt,
        lockedAt: null,
        lockedBy: null
      }
    });

    if (cancelled.count === 0) {
      throw new BackendJobCancelConflictError();
    }

    const updated = await tx.backendJob.findUnique({
      where: { id: input.jobId }
    });

    if (!updated) {
      throw new BackendJobCancelConflictError();
    }

    await restoreCancelledIntegrationImportState(tx, existing, finishedAt);

    await recordJobEvent(tx, updated.id, "warn", input.eventMessage ?? "Задача отменена администратором.", {
      actorId: input.actorId
    });

    await auditLog(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "backend_job.cancelled",
        targetType: "backend_job",
        targetId: updated.id,
        metadata: {
          type: updated.type
        }
      },
      tx
    );

    return updated;
  });
}

export async function claimNextBackendJob(workerId: string, filters: { queueName?: string; workspaceId?: string } = {}) {
  const now = new Date();

  for (let attempt = 0; attempt < backendJobQueueDefaults.claimRetries; attempt += 1) {
    const nextJob = await prisma.backendJob.findFirst({
      where: {
        status: "QUEUED",
        lockedAt: null,
        ...(filters.queueName ? { queueName: filters.queueName } : {}),
        ...(filters.workspaceId !== undefined ? { workspaceId: filters.workspaceId } : {}),
        runAfter: {
          lte: now
        }
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });

    if (!nextJob) {
      return null;
    }

    const claimed = await prisma.backendJob.updateMany({
      where: {
        id: nextJob.id,
        status: "QUEUED",
        lockedAt: null,
        ...(filters.workspaceId !== undefined ? { workspaceId: filters.workspaceId } : {}),
        runAfter: {
          lte: now
        }
      },
      data: {
        status: "RUNNING",
        attempts: {
          increment: 1
        },
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
        finishedAt: null,
        errorMessage: null
      }
    });

    if (claimed.count === 0) {
      continue;
    }

    const job = await prisma.backendJob.findUnique({
      where: { id: nextJob.id }
    });

    if (job) {
      return job;
    }
  }

  return null;
}

export async function recoverStaleBackendJobs(input: {
  workerId?: string;
  workspaceId?: string;
  now?: Date;
  staleAfterMs?: number;
  limit?: number;
} = {}) {
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? backendJobQueueDefaults.staleLockMs;
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const staleJobs = await prisma.backendJob.findMany({
    where: {
      status: "RUNNING",
      ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
      lockedAt: {
        lte: cutoff
      }
    },
    orderBy: [{ lockedAt: "asc" }, { createdAt: "asc" }],
    take: input.limit ?? backendJobQueueDefaults.staleRecoveryLimit
  });
  let recoveredCount = 0;

  for (const job of staleJobs) {
    const shouldRetry = job.attempts < job.maxAttempts;
    const message = shouldRetry
      ? "Задача возвращена в очередь после истечения lock."
      : "Задача помечена как ошибочная после истечения lock и исчерпания попыток.";

    const recovered = await prisma.$transaction(async (tx) => {
      const result = await tx.backendJob.updateMany({
        where: {
          id: job.id,
          status: "RUNNING",
          ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
          lockedAt: {
            lte: cutoff
          }
        },
        data: {
          status: shouldRetry ? "QUEUED" : "FAILED",
          runAfter: shouldRetry ? now : job.runAfter,
          finishedAt: shouldRetry ? null : now,
          lockedAt: null,
          lockedBy: null,
          errorMessage: message
        }
      });

      if (result.count === 0) {
        return false;
      }

      await recordJobEvent(tx, job.id, shouldRetry ? "warn" : "error", message, {
        previousWorkerId: job.lockedBy,
        recoveredBy: input.workerId,
        staleAfterMs,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts
      });

      return true;
    });

    if (recovered) {
      recoveredCount += 1;
    }
  }

  return { recoveredCount };
}

function parsePayload(job: BackendJob): BackendJobPayload {
  return parsePayloadJson(job.payloadJson);
}

function currentJobLockWhere(job: BackendJob) {
  return {
    id: job.id,
    status: "RUNNING" as const,
    lockedAt: job.lockedAt,
    lockedBy: job.lockedBy
  };
}

type JobLockState = {
  lockedAt: Date | null;
  renewed: boolean;
};

async function assertCurrentJobLock(client: Pick<Prisma.TransactionClient, "backendJob">, job: BackendJob, options: { renew?: boolean } = {}) {
  const renew = options.renew ?? true;
  const lockedAt = renew ? new Date() : job.lockedAt;
  const locked = await client.backendJob.updateMany({
    where: currentJobLockWhere(job),
    data: {
      lockedAt,
      lockedBy: job.lockedBy
    }
  });

  if (locked.count === 0) {
    throw new BackendJobLostLockError();
  }

  return { lockedAt, renewed: renew };
}

function applyJobLockState(job: BackendJob, lockState: JobLockState | null | undefined) {
  if (lockState?.renewed) {
    job.lockedAt = lockState.lockedAt;
  }
}

async function renewCurrentJobLock(client: Pick<Prisma.TransactionClient, "backendJob">, job: BackendJob) {
  applyJobLockState(job, await assertCurrentJobLock(client, job));
}

function integrationJobOperation(payload: BackendJobPayload): IntegrationJobOperation {
  return payload.operation === "otrs_selected_import" ? "otrs_selected_import" : "legacy_connector_run";
}

function stringArrayPayload(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

async function runLegacyIntegrationImportJob(job: BackendJob, payload: BackendJobPayload) {
  const integrationId = typeof payload.integrationId === "string" ? payload.integrationId : null;
  const integrationRunId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;
  const dryRun = payload.dryRun === true;

  if (!integrationId) {
    throw new Error("Для задачи импорта не указан integrationId.");
  }

  let pendingLockState: JobLockState | null = null;
  const { runIntegrationConnector } = await import("@/lib/integrations/runner");
  const result = await runIntegrationConnector({
    workspaceId: job.workspaceId,
    integrationId,
    integrationRunId,
    requestedLimit: payload.requestedLimit,
    dryRun,
    beforeWrite: async (client) => {
      pendingLockState = await assertCurrentJobLock(client, job);
    }
  });
  applyJobLockState(job, pendingLockState);

  await prisma.backendJobEvent.create({
    data: {
      jobId: job.id,
      level: "info",
      message: dryRun ? "Проверка подключения выполнена connector runner." : "Импорт интеграции выполнен connector runner.",
      metadata: JSON.stringify({
        integrationId,
        integrationRunId,
        source: result.source,
        checkedCount: result.checkedCount,
        importedCount: result.importedCount,
        externalIds: result.externalIds
      })
    }
  });

  return {
    integrationId,
    integrationRunId,
    ...result
  };
}

async function runSelectedOtrsImportJob(job: BackendJob, payload: BackendJobPayload) {
  const integrationId = typeof payload.integrationId === "string" ? payload.integrationId : null;
  const integrationRunId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;
  const selectedItemIds = stringArrayPayload(payload.integrationRunItemIds);

  if (!integrationId) {
    throw new Error("Для выборочного OTRS-импорта не указан integrationId.");
  }

  if (!integrationRunId) {
    throw new Error("Для выборочного OTRS-импорта не указан integrationRunId.");
  }

  if (selectedItemIds.length === 0) {
    throw new Error("Для выборочного OTRS-импорта не указаны integrationRunItemIds.");
  }

  let pendingLockState: JobLockState | null = null;
  const { runSelectedOtrsImportConnector } = await import("@/lib/integrations/runner");
  const result = await runSelectedOtrsImportConnector({
    workspaceId: job.workspaceId,
    integrationId,
    integrationRunId,
    selectedItemIds,
    beforeWrite: async (client) => {
      pendingLockState = await assertCurrentJobLock(client, job);
    }
  });
  applyJobLockState(job, pendingLockState);

  await prisma.backendJobEvent.create({
    data: {
      jobId: job.id,
      level: "info",
      message: "Выборочный OTRS-импорт выполнен.",
      metadata: JSON.stringify({
        operation: "otrs_selected_import",
        integrationId,
        integrationRunId,
        selectedCount: selectedItemIds.length,
        importedCount: result.importedCount,
        errorCount: result.errorCount
      })
    }
  });

  return {
    integrationId,
    integrationRunId,
    selectedCount: selectedItemIds.length,
    ...result
  };
}

async function runIntegrationImportJob(job: BackendJob, payload: BackendJobPayload) {
  await renewCurrentJobLock(prisma, job);

  return integrationJobOperation(payload) === "otrs_selected_import"
    ? runSelectedOtrsImportJob(job, payload)
    : runLegacyIntegrationImportJob(job, payload);
}

async function runReportExportJob(client: JobClient, job: BackendJob, payload: BackendJobPayload) {
  const lockState = await assertCurrentJobLock(client, job);

  const snapshot = await client.reportSnapshot.create({
    data: {
      workspaceId: job.workspaceId,
      name: typeof payload.name === "string" ? payload.name : "Отчет по качеству",
      periodStart: payload.periodStart ? new Date(String(payload.periodStart)) : new Date(),
      periodEnd: payload.periodEnd ? new Date(String(payload.periodEnd)) : new Date(),
      filtersJson: JSON.stringify(payload.filters ?? {}),
      metricsJson: JSON.stringify(payload.metrics ?? {}),
      exportFormat: typeof payload.format === "string" ? payload.format : null,
      status: "READY",
      createdById: job.createdById
    }
  });

  await recordJobEvent(client, job.id, "info", "Снимок отчета подготовлен.", { snapshotId: snapshot.id });

  return { result: { snapshotId: snapshot.id }, lockState };
}

async function runDirectorySyncJob(client: JobClient, job: BackendJob, payload: BackendJobPayload) {
  const providerId = typeof payload.providerId === "string" ? payload.providerId : null;
  const dryRun = payload.dryRun === true;

  if (!providerId) {
    throw new Error("Для синхронизации каталога не указан providerId.");
  }

  const lockState = await assertCurrentJobLock(client, job);
  const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

  const result = await syncDirectoryProvider({
    workspaceId: job.workspaceId,
    providerId,
    dryRun,
    client
  });

  await recordJobEvent(client, job.id, "info", dryRun ? "Dry-run синхронизации каталога выполнен." : "Синхронизация каталога выполнена.", result);

  return { result, lockState };
}

async function runRetentionCleanupJob(client: JobClient, job: BackendJob) {
  const lockState = await assertCurrentJobLock(client, job);

  const now = new Date();
  const rateLimitCutoff = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const [sessions, idempotencyKeys, rateLimits] = await Promise.all([
    client.authSession.updateMany({
      where: {
        workspaceId: job.workspaceId,
        status: "ACTIVE",
        expiresAt: {
          lt: now
        }
      },
      data: { status: "EXPIRED" }
    }),
    client.idempotencyKey.deleteMany({
      where: {
        workspaceId: job.workspaceId,
        expiresAt: {
          lt: now
        }
      }
    }),
    client.apiRateLimit.deleteMany({
      where: {
        workspaceId: job.workspaceId,
        windowStart: {
          lt: rateLimitCutoff
        }
      }
    })
  ]);

  await recordJobEvent(client, job.id, "info", "Очистка устаревших backend-записей выполнена.", {
    sessions: sessions.count,
    idempotencyKeys: idempotencyKeys.count,
    rateLimits: rateLimits.count
  });

  return {
    result: {
      expiredSessions: sessions.count,
      deletedIdempotencyKeys: idempotencyKeys.count,
      deletedRateLimitBuckets: rateLimits.count
    },
    lockState
  };
}

async function runWebhookIngestJob(job: BackendJob, payload: BackendJobPayload) {
  const endpointId = typeof payload.endpointId === "string" ? payload.endpointId : null;
  const rawBody = typeof payload.rawBody === "string" ? payload.rawBody : null;
  const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : null;

  if (!endpointId || !rawBody || !idempotencyKey) {
    throw new Error("Для webhook ingest задачи нужны endpointId, rawBody и idempotencyKey.");
  }

  let pendingLockState: JobLockState | null = null;
  const { ingestWebhookEvent } = await import("@/lib/webhooks/inbound");
  const result = await ingestWebhookEvent({
    endpointId,
    workspaceId: job.workspaceId,
    rawBody,
    idempotencyKey,
    timestamp: typeof payload.timestamp === "string" ? payload.timestamp : null,
    signature: typeof payload.signature === "string" ? payload.signature : null,
    beforeWrite: async (client) => {
      pendingLockState = await assertCurrentJobLock(client, job);
    }
  });
  applyJobLockState(job, pendingLockState);
  return result;
}

async function executeBackendJob(job: BackendJob) {
  const payload = parsePayload(job);

  await renewCurrentJobLock(prisma, job);

  await prisma.backendJobEvent.create({
    data: {
      jobId: job.id,
      level: "info",
      message: "Задача запущена.",
      metadata: JSON.stringify({
        type: job.type,
        attempt: job.attempts
      })
    }
  });

  let result: unknown;

  if (job.type === "INTEGRATION_IMPORT") {
    result = await runIntegrationImportJob(job, payload);
  } else if (job.type === "WEBHOOK_INGEST") {
    result = await runWebhookIngestJob(job, payload);
  } else if (job.type === "AI_SCORE") {
    result = await runAiScoreJob(job, payload);
  } else if (job.type === "MESSAGING_DELIVERY") {
    result = await runMessagingDeliveryJob(job, payload);
  } else if (job.type === "DIRECTORY_SYNC") {
    const transactionResult = await prisma.$transaction(async (tx) => runDirectorySyncJob(tx, job, payload));
    applyJobLockState(job, transactionResult.lockState);
    result = transactionResult.result;
  } else {
    const transactionResult = await prisma.$transaction(async (tx) =>
      job.type === "REPORT_EXPORT" ? runReportExportJob(tx, job, payload) : runRetentionCleanupJob(tx, job)
    );
    applyJobLockState(job, transactionResult.lockState);
    result = transactionResult.result;
  }

  await prisma.$transaction(async (tx) => {
    const finalized = await tx.backendJob.updateMany({
      where: currentJobLockWhere(job),
      data: {
        status: "SUCCEEDED",
        resultJson: JSON.stringify(result),
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        errorMessage: null
      }
    });

    if (finalized.count === 0) {
      throw new BackendJobLostLockError();
    }

    await recordJobEvent(tx, job.id, "info", "Задача завершена.", result);
  });

  return result;
}

export async function runDueBackendJobs(input: {
  workerId?: string;
  workspaceId?: string;
  limit?: number;
  recoverStale?: boolean;
  staleAfterMs?: number;
  queueName?: string;
} = {}) {
  const workerId = input.workerId ?? `worker-${process.pid}`;
  const limit = input.limit ?? 5;
  const results: Array<{ jobId: string; status: "SUCCEEDED" | "FAILED"; result?: unknown; error?: string }> = [];

  if (input.recoverStale ?? true) {
    await recoverStaleBackendJobs({
      workerId,
      workspaceId: input.workspaceId,
      staleAfterMs: input.staleAfterMs
    });
  }

  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextBackendJob(workerId, {
      queueName: input.queueName,
      workspaceId: input.workspaceId
    });

    if (!job) {
      break;
    }

    try {
      logBackendEvent({
        event: "backend_job.started",
        workspaceId: job.workspaceId,
        targetType: "backend_job",
        targetId: job.id,
        metadata: {
          type: job.type,
          workerId
        }
      });
      const result = await executeBackendJob(job);
      logBackendEvent({
        event: "backend_job.succeeded",
        workspaceId: job.workspaceId,
        targetType: "backend_job",
        targetId: job.id,
        metadata: {
          type: job.type
        }
      });
      results.push({ jobId: job.id, status: "SUCCEEDED", result });
    } catch (error) {
      if (error instanceof BackendJobLostLockError) {
        logBackendEvent({
          level: "warn",
          event: "backend_job.lost_lock",
          workspaceId: job.workspaceId,
          targetType: "backend_job",
          targetId: job.id,
          metadata: {
            type: job.type,
            workerId
          }
        });
        results.push({ jobId: job.id, status: "FAILED", error: error.message });
        continue;
      }

      const message = error instanceof Error ? error.message : "Неизвестная ошибка фоновой задачи.";
      const payload = parsePayload(job);
      const isDisabledIntegrationFailure = job.type === "INTEGRATION_IMPORT" && message === "Интеграция отключена.";
      const shouldRetry = !isDisabledIntegrationFailure && job.attempts < job.maxAttempts;

      const finalized = await prisma.$transaction(async (tx) => {
        const finalized = await tx.backendJob.updateMany({
          where: currentJobLockWhere(job),
          data: {
            status: shouldRetry ? "QUEUED" : "FAILED",
            errorMessage: message,
            runAfter: shouldRetry ? nextRetryRunAfter({ attempts: job.attempts }) : job.runAfter,
            finishedAt: shouldRetry ? null : new Date(),
            lockedAt: null,
            lockedBy: null
          }
        });

        if (finalized.count === 0) {
          return finalized;
        }

        await tx.backendJobEvent.create({
          data: {
            jobId: job.id,
            level: "error",
            message,
            metadata: JSON.stringify({ shouldRetry })
          }
        });

        if (job.type === "INTEGRATION_IMPORT") {
          const integrationId = typeof payload.integrationId === "string" ? payload.integrationId : null;
          const integrationRunId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;

          if (integrationId) {
            await tx.integration.updateMany({
              where: {
                id: integrationId,
                workspaceId: job.workspaceId,
                status: { not: "disabled" }
              },
              data: {
                status: shouldRetry ? "queued" : "error",
                lastError: message
              }
            });
          }

          if (integrationRunId) {
            await tx.integrationRun.updateMany({
              where: {
                id: integrationRunId,
                workspaceId: job.workspaceId
              },
              data: {
                status: shouldRetry ? "retry_scheduled" : "failed",
                errorCount: {
                  increment: 1
                },
                errorMessage: message,
                finishedAt: shouldRetry ? null : new Date()
              }
            });
          }
        }

        return finalized;
      });

      if (finalized.count === 0) {
        logBackendEvent({
          level: "warn",
          event: "backend_job.lost_lock",
          workspaceId: job.workspaceId,
          targetType: "backend_job",
          targetId: job.id,
          metadata: {
            type: job.type,
            workerId,
            originalError: message
          }
        });
        results.push({ jobId: job.id, status: "FAILED", error: lostLockMessage });
        continue;
      }

      logBackendEvent({
        level: "error",
        event: "backend_job.failed",
        workspaceId: job.workspaceId,
        targetType: "backend_job",
        targetId: job.id,
        metadata: {
          type: job.type,
          shouldRetry,
          error: message
        }
      });
      results.push({ jobId: job.id, status: "FAILED", error: message });
    }
  }

  return results;
}
