import type { BackendJob, BackendJobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type BackendJobPayload = Record<string, unknown>;

type JobClient = Pick<Prisma.TransactionClient, "backendJob" | "backendJobEvent" | "integration" | "integrationRun" | "identityProvider" | "authSession" | "idempotencyKey" | "apiRateLimit" | "reportSnapshot">;

export async function enqueueBackendJob(input: {
  workspaceId: string;
  type: BackendJobType;
  payload?: BackendJobPayload;
  queueName?: string;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  createdById?: string;
}) {
  return prisma.backendJob.create({
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

export async function claimNextBackendJob(workerId: string) {
  const nextJob = await prisma.backendJob.findFirst({
    where: {
      status: "QUEUED",
      runAfter: {
        lte: new Date()
      }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });

  if (!nextJob) {
    return null;
  }

  return prisma.backendJob.update({
    where: { id: nextJob.id },
    data: {
      status: "RUNNING",
      attempts: {
        increment: 1
      },
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date()
    }
  });
}

function parsePayload(job: BackendJob): BackendJobPayload {
  try {
    const parsed = JSON.parse(job.payloadJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function runIntegrationImportJob(client: JobClient, job: BackendJob, payload: BackendJobPayload) {
  const integrationId = typeof payload.integrationId === "string" ? payload.integrationId : null;
  const integrationRunId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;

  if (!integrationId) {
    throw new Error("Для задачи импорта не указан integrationId.");
  }

  await client.integration.update({
    where: { id: integrationId },
    data: {
      status: "active",
      lastSyncedAt: new Date(),
      lastImportAt: new Date(),
      lastError: null
    }
  });

  if (integrationRunId) {
    await client.integrationRun.update({
      where: { id: integrationRunId },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        importedCount: Number(payload.requestedLimit ?? 0)
      }
    });
  }

  await recordJobEvent(client, job.id, "info", "Импорт интеграции завершен в backend-очереди.", {
    integrationId,
    integrationRunId
  });

  return {
    integrationId,
    integrationRunId,
    importedCount: Number(payload.requestedLimit ?? 0)
  };
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

  if (!providerId) {
    throw new Error("Для синхронизации каталога не указан providerId.");
  }

  await client.identityProvider.update({
    where: { id: providerId },
    data: { lastSyncAt: new Date() }
  });

  await recordJobEvent(client, job.id, "info", "Directory sync scaffold выполнен.", { providerId });

  return { providerId };
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

async function executeBackendJob(job: BackendJob) {
  const payload = parsePayload(job);

  return prisma.$transaction(async (tx) => {
    await recordJobEvent(tx, job.id, "info", "Задача запущена.", {
      type: job.type,
      attempt: job.attempts
    });

    const result =
      job.type === "INTEGRATION_IMPORT"
        ? await runIntegrationImportJob(tx, job, payload)
        : job.type === "REPORT_EXPORT"
          ? await runReportExportJob(tx, job, payload)
          : job.type === "DIRECTORY_SYNC"
            ? await runDirectorySyncJob(tx, job, payload)
            : await runRetentionCleanupJob(tx, job);

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

export async function runDueBackendJobs(input: { workerId?: string; limit?: number } = {}) {
  const workerId = input.workerId ?? `worker-${process.pid}`;
  const limit = input.limit ?? 5;
  const results: Array<{ jobId: string; status: "SUCCEEDED" | "FAILED"; result?: unknown; error?: string }> = [];

  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextBackendJob(workerId);

    if (!job) {
      break;
    }

    try {
      const result = await executeBackendJob(job);
      results.push({ jobId: job.id, status: "SUCCEEDED", result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка фоновой задачи.";
      const shouldRetry = job.attempts < job.maxAttempts;

      await prisma.backendJob.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? "QUEUED" : "FAILED",
          errorMessage: message,
          runAfter: shouldRetry ? new Date(Date.now() + 1000 * 60 * Math.max(1, job.attempts)) : job.runAfter,
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
      results.push({ jobId: job.id, status: "FAILED", error: message });
    }
  }

  return results;
}
