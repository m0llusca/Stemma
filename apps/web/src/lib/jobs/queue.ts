import type { BackendJob, BackendJobStatus, BackendJobType, Prisma } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { syncDirectoryProvider } from "@/lib/auth/directory-sync";
import { prisma } from "@/lib/db";
import type { IntegrationJobOperation } from "@/lib/integration-import-service";
import { runIntegrationConnector, runSelectedOtrsImportConnector } from "@/lib/integrations/runner";
import { logBackendEvent } from "@/lib/observability";
import { ingestWebhookEvent } from "@/lib/webhooks/inbound";

export type BackendJobPayload = Record<string, unknown>;
export const backendJobQueueDefaults = {
  claimRetries: 3,
  retryBaseDelayMs: 60_000,
  staleLockMs: 30 * 60_000,
  staleRecoveryLimit: 20
} as const;
const requeueConflictMessage = "Можно вернуть в очередь только ошибочную задачу текущего рабочего пространства.";

export class BackendJobRequeueConflictError extends Error {
  constructor() {
    super(requeueConflictMessage);
    this.name = "BackendJobRequeueConflictError";
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

type EnqueueJobClient = Pick<Prisma.TransactionClient, "backendJob">;

export async function enqueueBackendJob(input: {
  workspaceId: string;
  type: BackendJobType;
  payload?: BackendJobPayload;
  queueName?: string;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  createdById?: string;
}, client: EnqueueJobClient = prisma) {
  return client.backendJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      payloadJson: JSON.stringify(input.payload ?? {}),
      queueName: input.queueName ?? "default",
      priority: input.priority ?? 100,
      runAfter: input.runAfter ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
      createdById: input.createdById
    }
  });
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

export async function claimNextBackendJob(workerId: string, filters: { queueName?: string } = {}) {
  const now = new Date();

  for (let attempt = 0; attempt < backendJobQueueDefaults.claimRetries; attempt += 1) {
    const nextJob = await prisma.backendJob.findFirst({
      where: {
        status: "QUEUED",
        lockedAt: null,
        ...(filters.queueName ? { queueName: filters.queueName } : {}),
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
  try {
    const parsed = JSON.parse(job.payloadJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
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

  const result = await runIntegrationConnector({
    workspaceId: job.workspaceId,
    integrationId,
    integrationRunId,
    requestedLimit: payload.requestedLimit,
    dryRun
  });

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

  const result = await runSelectedOtrsImportConnector({
    workspaceId: job.workspaceId,
    integrationId,
    integrationRunId,
    selectedItemIds
  });

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
  return integrationJobOperation(payload) === "otrs_selected_import"
    ? runSelectedOtrsImportJob(job, payload)
    : runLegacyIntegrationImportJob(job, payload);
}

async function runReportExportJob(client: JobClient, job: BackendJob, payload: BackendJobPayload) {
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

  return { snapshotId: snapshot.id };
}

async function runDirectorySyncJob(client: JobClient, job: BackendJob, payload: BackendJobPayload) {
  const providerId = typeof payload.providerId === "string" ? payload.providerId : null;
  const dryRun = payload.dryRun === true;

  if (!providerId) {
    throw new Error("Для синхронизации каталога не указан providerId.");
  }

  const result = await syncDirectoryProvider({
    workspaceId: job.workspaceId,
    providerId,
    dryRun,
    client
  });

  await recordJobEvent(client, job.id, "info", dryRun ? "Dry-run синхронизации каталога выполнен." : "Синхронизация каталога выполнена.", result);

  return result;
}

async function runRetentionCleanupJob(client: JobClient, job: BackendJob) {
  const now = new Date();
  const rateLimitCutoff = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const [sessions, idempotencyKeys, rateLimits] = await Promise.all([
    client.authSession.updateMany({
      where: {
        status: "ACTIVE",
        expiresAt: {
          lt: now
        }
      },
      data: { status: "EXPIRED" }
    }),
    client.idempotencyKey.deleteMany({
      where: {
        expiresAt: {
          lt: now
        }
      }
    }),
    client.apiRateLimit.deleteMany({
      where: {
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
    expiredSessions: sessions.count,
    deletedIdempotencyKeys: idempotencyKeys.count,
    deletedRateLimitBuckets: rateLimits.count
  };
}

async function runWebhookIngestJob(job: BackendJob, payload: BackendJobPayload) {
  const endpointId = typeof payload.endpointId === "string" ? payload.endpointId : null;
  const rawBody = typeof payload.rawBody === "string" ? payload.rawBody : null;
  const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : null;

  if (!endpointId || !rawBody || !idempotencyKey) {
    throw new Error("Для webhook ingest задачи нужны endpointId, rawBody и idempotencyKey.");
  }

  return ingestWebhookEvent({
    endpointId,
    workspaceId: job.workspaceId,
    rawBody,
    idempotencyKey,
    timestamp: typeof payload.timestamp === "string" ? payload.timestamp : null,
    signature: typeof payload.signature === "string" ? payload.signature : null
  });
}

async function executeBackendJob(job: BackendJob) {
  const payload = parsePayload(job);

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

  const result =
    job.type === "INTEGRATION_IMPORT"
      ? await runIntegrationImportJob(job, payload)
      : job.type === "WEBHOOK_INGEST"
        ? await runWebhookIngestJob(job, payload)
        : job.type === "DIRECTORY_SYNC"
          ? await runDirectorySyncJob(prisma, job, payload)
      : await prisma.$transaction(async (tx) =>
          job.type === "REPORT_EXPORT"
            ? runReportExportJob(tx, job, payload)
            : runRetentionCleanupJob(tx, job)
        );

  await prisma.$transaction(async (tx) => {
    await tx.backendJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        resultJson: JSON.stringify(result),
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        errorMessage: null
      }
    });

    await recordJobEvent(tx, job.id, "info", "Задача завершена.", result);

    return result;
  });
}

export async function runDueBackendJobs(input: { workerId?: string; limit?: number; recoverStale?: boolean; staleAfterMs?: number; queueName?: string } = {}) {
  const workerId = input.workerId ?? `worker-${process.pid}`;
  const limit = input.limit ?? 5;
  const results: Array<{ jobId: string; status: "SUCCEEDED" | "FAILED"; result?: unknown; error?: string }> = [];

  if (input.recoverStale ?? true) {
    await recoverStaleBackendJobs({
      workerId,
      staleAfterMs: input.staleAfterMs
    });
  }

  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextBackendJob(workerId, {
      queueName: input.queueName
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
      const message = error instanceof Error ? error.message : "Неизвестная ошибка фоновой задачи.";
      const payload = parsePayload(job);
      const isDisabledIntegrationFailure = job.type === "INTEGRATION_IMPORT" && message === "Интеграция отключена.";
      const shouldRetry = !isDisabledIntegrationFailure && job.attempts < job.maxAttempts;
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

      await prisma.backendJob.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? "QUEUED" : "FAILED",
          errorMessage: message,
          runAfter: shouldRetry ? nextRetryRunAfter({ attempts: job.attempts }) : job.runAfter,
          finishedAt: shouldRetry ? null : new Date(),
          lockedAt: null,
          lockedBy: null
        }
      });
      await prisma.backendJobEvent.create({
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
          await prisma.integration.updateMany({
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
          await prisma.integrationRun.updateMany({
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

      results.push({ jobId: job.id, status: "FAILED", error: message });
    }
  }

  return results;
}
