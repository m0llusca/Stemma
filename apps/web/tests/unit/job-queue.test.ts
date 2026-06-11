import type { BackendJob } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    backendJob: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    backendJobEvent: {
      create: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    },
    integration: {
      updateMany: vi.fn()
    },
    integrationRun: {
      updateMany: vi.fn()
    },
    authSession: {
      updateMany: vi.fn()
    },
    idempotencyKey: {
      deleteMany: vi.fn()
    },
    apiRateLimit: {
      deleteMany: vi.fn()
    },
    reportSnapshot: {
      create: vi.fn()
    }
  },
  logBackendEvent: vi.fn(),
  runIntegrationConnector: vi.fn(),
  runSelectedOtrsImportConnector: vi.fn(),
  syncDirectoryProvider: vi.fn(),
  ingestWebhookEvent: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/observability", () => ({
  logBackendEvent: mocks.logBackendEvent
}));

vi.mock("@/lib/integrations/runner", () => ({
  runIntegrationConnector: mocks.runIntegrationConnector,
  runSelectedOtrsImportConnector: mocks.runSelectedOtrsImportConnector
}));

vi.mock("@/lib/auth/directory-sync", () => ({
  syncDirectoryProvider: mocks.syncDirectoryProvider
}));

vi.mock("@/lib/webhooks/inbound", () => ({
  ingestWebhookEvent: mocks.ingestWebhookEvent
}));

function backendJob(overrides: Partial<BackendJob> = {}): BackendJob {
  const now = new Date("2026-05-04T08:00:00.000Z");

  return {
    id: "job-1",
    workspaceId: "workspace-1",
    type: "REPORT_EXPORT",
    status: "QUEUED",
    queueName: "default",
    priority: 100,
    payloadJson: "{}",
    resultJson: "{}",
    errorMessage: null,
    attempts: 0,
    maxAttempts: 3,
    runAfter: now,
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    finishedAt: null,
    createdById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("backend job queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("enqueues jobs through a provided transaction client", async () => {
    const { enqueueBackendJob } = await import("@/lib/jobs/queue");
    const tx = {
      backendJob: {
        create: vi.fn().mockResolvedValue(backendJob())
      }
    } as unknown as NonNullable<Parameters<typeof enqueueBackendJob>[1]>;

    await expect(
      enqueueBackendJob(
        {
          workspaceId: "workspace-1",
          type: "REPORT_EXPORT",
          payload: { reportId: "report-1" },
          createdById: "user-1"
        },
        tx
      )
    ).resolves.toEqual(backendJob());

    expect(tx.backendJob.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        type: "REPORT_EXPORT",
        payloadJson: JSON.stringify({ reportId: "report-1" }),
        queueName: "default",
        priority: 100,
        runAfter: expect.any(Date),
        maxAttempts: 3,
        createdById: "user-1"
      }
    });
    expect(mocks.prisma.backendJob.create).not.toHaveBeenCalled();
  });

  it("claims the next queued job with a guarded update", async () => {
    const queuedJob = backendJob();
    const runningJob = backendJob({
      status: "RUNNING",
      attempts: 1,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockResolvedValue(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);

    const { claimNextBackendJob } = await import("@/lib/jobs/queue");
    const claimed = await claimNextBackendJob("worker-a");

    expect(claimed).toEqual(runningJob);
    expect(mocks.prisma.backendJob.findFirst).toHaveBeenCalledWith({
      where: {
        status: "QUEUED",
        lockedAt: null,
        runAfter: {
          lte: expect.any(Date)
        }
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        status: "QUEUED",
        lockedAt: null,
        runAfter: {
          lte: expect.any(Date)
        }
      },
      data: {
        status: "RUNNING",
        attempts: {
          increment: 1
        },
        lockedAt: expect.any(Date),
        lockedBy: "worker-a",
        startedAt: expect.any(Date),
        finishedAt: null,
        errorMessage: null
      }
    });
  });

  it("claims jobs from a requested queue", async () => {
    const queuedJob = backendJob({
      id: "job-integrations",
      queueName: "integrations"
    });
    const runningJob = backendJob({
      id: "job-integrations",
      status: "RUNNING",
      queueName: "integrations",
      attempts: 1,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockResolvedValue(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);

    const { claimNextBackendJob } = await import("@/lib/jobs/queue");
    const claimed = await claimNextBackendJob("worker-a", { queueName: "integrations" });

    expect(claimed).toEqual(runningJob);
    expect(mocks.prisma.backendJob.findFirst).toHaveBeenCalledWith({
      where: {
        status: "QUEUED",
        lockedAt: null,
        queueName: "integrations",
        runAfter: {
          lte: expect.any(Date)
        }
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });
  });

  it("claims jobs only from a requested workspace when a workspace filter is provided", async () => {
    const queuedJob = backendJob({
      workspaceId: "workspace-1"
    });
    const runningJob = backendJob({
      workspaceId: "workspace-1",
      status: "RUNNING",
      attempts: 1,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockResolvedValue(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);

    const { claimNextBackendJob } = await import("@/lib/jobs/queue");
    const claimed = await claimNextBackendJob("worker-a", { workspaceId: "workspace-1" });

    expect(claimed).toEqual(runningJob);
    expect(mocks.prisma.backendJob.findFirst).toHaveBeenCalledWith({
      where: {
        status: "QUEUED",
        lockedAt: null,
        workspaceId: "workspace-1",
        runAfter: {
          lte: expect.any(Date)
        }
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        status: "QUEUED",
        lockedAt: null,
        workspaceId: "workspace-1",
        runAfter: {
          lte: expect.any(Date)
        }
      },
      data: expect.objectContaining({
        status: "RUNNING",
        lockedBy: "worker-a"
      })
    });
  });

  it("does not return a job if another worker wins the claim race", async () => {
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(backendJob()).mockResolvedValueOnce(null);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 0 });

    const { claimNextBackendJob } = await import("@/lib/jobs/queue");
    const claimed = await claimNextBackendJob("worker-b");

    expect(claimed).toBeNull();
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.backendJob.findUnique).not.toHaveBeenCalled();
  });

  it("claims the next candidate when another worker steals the first contested job", async () => {
    const contestedJob = backendJob({ id: "job-contested" });
    const nextCandidate = backendJob({ id: "job-next" });
    const runningNextJob = backendJob({
      id: "job-next",
      status: "RUNNING",
      attempts: 1,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-b",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(contestedJob).mockResolvedValueOnce(nextCandidate);
    mocks.prisma.backendJob.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningNextJob);

    const { claimNextBackendJob } = await import("@/lib/jobs/queue");
    const claimed = await claimNextBackendJob("worker-b");

    expect(claimed).toEqual(runningNextJob);
    expect(mocks.prisma.backendJob.findFirst).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "job-contested",
          status: "QUEUED",
          lockedAt: null
        })
      })
    );
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "job-next",
          status: "QUEUED",
          lockedAt: null
        })
      })
    );
    expect(mocks.prisma.backendJob.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.backendJob.findUnique).toHaveBeenCalledWith({ where: { id: "job-next" } });
  });

  it("stops claiming after exhausting claim retries when every candidate is contested", async () => {
    mocks.prisma.backendJob.findFirst
      .mockResolvedValueOnce(backendJob({ id: "job-a" }))
      .mockResolvedValueOnce(backendJob({ id: "job-b" }))
      .mockResolvedValueOnce(backendJob({ id: "job-c" }));
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 0 });

    const { claimNextBackendJob } = await import("@/lib/jobs/queue");
    const claimed = await claimNextBackendJob("worker-b");

    expect(claimed).toBeNull();
    expect(mocks.prisma.backendJob.findFirst).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({ id: "job-c" })
      })
    );
    expect(mocks.prisma.backendJob.findUnique).not.toHaveBeenCalled();
  });

  it("recovers stale running jobs and fails exhausted stale jobs", async () => {
    const staleRetryable = backendJob({
      id: "job-retry",
      status: "RUNNING",
      attempts: 1,
      maxAttempts: 3,
      lockedAt: new Date("2026-05-04T07:00:00.000Z"),
      lockedBy: "worker-old"
    });
    const staleExhausted = backendJob({
      id: "job-failed",
      status: "RUNNING",
      attempts: 3,
      maxAttempts: 3,
      lockedAt: new Date("2026-05-04T07:10:00.000Z"),
      lockedBy: "worker-old"
    });
    mocks.prisma.backendJob.findMany.mockResolvedValue([staleRetryable, staleExhausted]);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });

    const { recoverStaleBackendJobs } = await import("@/lib/jobs/queue");
    const result = await recoverStaleBackendJobs({
      workerId: "worker-new",
      now: new Date("2026-05-04T08:00:00.000Z"),
      staleAfterMs: 30 * 60_000
    });

    expect(result).toEqual({ recoveredCount: 2 });
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: "job-retry", status: "RUNNING" }),
        data: expect.objectContaining({
          status: "QUEUED",
          lockedAt: null,
          lockedBy: null,
          finishedAt: null
        })
      })
    );
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: "job-failed", status: "RUNNING" }),
        data: expect.objectContaining({
          status: "FAILED",
          lockedAt: null,
          lockedBy: null,
          finishedAt: new Date("2026-05-04T08:00:00.000Z")
        })
      })
    );
    expect(mocks.prisma.backendJobEvent.create).toHaveBeenCalledTimes(2);
  });

  it("recovers stale running jobs only from a requested workspace", async () => {
    const staleRetryable = backendJob({
      id: "job-retry",
      workspaceId: "workspace-1",
      status: "RUNNING",
      attempts: 1,
      maxAttempts: 3,
      lockedAt: new Date("2026-05-04T07:00:00.000Z"),
      lockedBy: "worker-old"
    });
    mocks.prisma.backendJob.findMany.mockResolvedValue([staleRetryable]);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });

    const { recoverStaleBackendJobs } = await import("@/lib/jobs/queue");
    await expect(
      recoverStaleBackendJobs({
        workspaceId: "workspace-1",
        workerId: "worker-new",
        now: new Date("2026-05-04T08:00:00.000Z"),
        staleAfterMs: 30 * 60_000
      })
    ).resolves.toEqual({ recoveredCount: 1 });

    expect(mocks.prisma.backendJob.findMany).toHaveBeenCalledWith({
      where: {
        status: "RUNNING",
        workspaceId: "workspace-1",
        lockedAt: {
          lte: new Date("2026-05-04T07:30:00.000Z")
        }
      },
      orderBy: [{ lockedAt: "asc" }, { createdAt: "asc" }],
      take: 20
    });
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "job-retry",
          status: "RUNNING",
          workspaceId: "workspace-1",
          lockedAt: {
            lte: new Date("2026-05-04T07:30:00.000Z")
          }
        }
      })
    );
  });

  it("calculates retry runAfter from the current attempt count", async () => {
    const { nextRetryRunAfter } = await import("@/lib/jobs/queue");

    expect(
      nextRetryRunAfter({
        attempts: 3,
        now: new Date("2026-05-04T08:00:00.000Z"),
        baseDelayMs: 60_000
      }).toISOString()
    ).toBe("2026-05-04T08:03:00.000Z");
  });

  it("summarizes queue metrics by status", async () => {
    const { getBackendQueueMetrics } = await import("@/lib/jobs/queue");
    mocks.prisma.backendJob.groupBy.mockResolvedValue([
      { queueName: "integrations", status: "QUEUED", _count: { _all: 2 } },
      { queueName: "integrations", status: "FAILED", _count: { _all: 1 } }
    ]);

    await expect(getBackendQueueMetrics("workspace-1")).resolves.toEqual([
      { queueName: "integrations", status: "QUEUED", count: 2 },
      { queueName: "integrations", status: "FAILED", count: 1 }
    ]);
  });

  it("requeues failed jobs and records an event", async () => {
    const { requeueBackendJob } = await import("@/lib/jobs/queue");
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue({ id: "job-1", type: "REPORT_EXPORT", status: "QUEUED" });
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});
    mocks.prisma.auditLog.create.mockResolvedValue({});

    await expect(
      requeueBackendJob({
        workspaceId: "workspace-1",
        jobId: "job-1",
        actorId: "user-1"
      })
    ).resolves.toEqual({ id: "job-1", type: "REPORT_EXPORT", status: "QUEUED" });

    expect(mocks.prisma.backendJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        workspaceId: "workspace-1",
        status: "FAILED"
      },
      data: {
        status: "QUEUED",
        attempts: 0,
        runAfter: expect.any(Date),
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        finishedAt: null,
        errorMessage: null
      }
    });
    expect(mocks.prisma.backendJob.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.auditLog.create.mock.invocationCallOrder[0]
    );
    expect(mocks.prisma.backendJobEvent.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.auditLog.create.mock.invocationCallOrder[0]
    );
    expect(mocks.prisma.backendJobEvent.create).toHaveBeenCalledWith({
      data: {
        jobId: "job-1",
        level: "warn",
        message: "Задача возвращена в очередь администратором.",
        metadata: JSON.stringify({ actorId: "user-1" })
      }
    });
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        actorId: "user-1",
        action: "backend_job.requeued",
        targetType: "backend_job",
        targetId: "job-1",
        metadata: JSON.stringify({
          type: "REPORT_EXPORT",
          status: "QUEUED"
        })
      }
    });
  });

  it("does not record a requeue event or audit log when the guarded update does not change a job", async () => {
    const { requeueBackendJob } = await import("@/lib/jobs/queue");
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      requeueBackendJob({
        workspaceId: "workspace-1",
        jobId: "job-1",
        actorId: "user-1"
      })
    ).rejects.toThrow("Можно вернуть в очередь только ошибочную задачу текущего рабочего пространства.");

    expect(mocks.prisma.backendJob.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJobEvent.create).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("cancels queued jobs with a guarded update before events and audit logs", async () => {
    const { cancelBackendJob } = await import("@/lib/jobs/queue");
    const cancelledJob = backendJob({
      status: "CANCELLED",
      finishedAt: new Date("2026-05-04T08:05:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockResolvedValue(backendJob());
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(cancelledJob);
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});
    mocks.prisma.auditLog.create.mockResolvedValue({});

    await expect(
      cancelBackendJob({
        workspaceId: "workspace-1",
        jobId: "job-1",
        actorId: "user-1",
        eventMessage: "Задача отменена администратором."
      })
    ).resolves.toEqual(cancelledJob);

    expect(mocks.prisma.backendJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        workspaceId: "workspace-1",
        status: "QUEUED"
      },
      data: {
        status: "CANCELLED",
        finishedAt: expect.any(Date),
        lockedAt: null,
        lockedBy: null
      }
    });
    expect(mocks.prisma.backendJobEvent.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.prisma.backendJob.updateMany.mock.invocationCallOrder[0]
    );
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        actorId: "user-1",
        action: "backend_job.cancelled",
        targetType: "backend_job",
        targetId: "job-1",
        metadata: JSON.stringify({
          type: "REPORT_EXPORT"
        })
      }
    });
  });

  it("cancels queued integration imports and restores run and integration state in the same transaction", async () => {
    const { cancelBackendJob } = await import("@/lib/jobs/queue");
    const queuedIntegrationJob = backendJob({
      type: "INTEGRATION_IMPORT",
      queueName: "integrations",
      payloadJson: JSON.stringify({
        integrationId: "integration-1",
        integrationRunId: "run-1",
        previousStatus: "ready"
      })
    });
    const cancelledJob = backendJob({
      ...queuedIntegrationJob,
      status: "CANCELLED",
      finishedAt: new Date("2026-05-04T08:05:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockResolvedValue(queuedIntegrationJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(cancelledJob);
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});
    mocks.prisma.auditLog.create.mockResolvedValue({});
    mocks.prisma.integrationRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.integration.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      cancelBackendJob({
        workspaceId: "workspace-1",
        jobId: "job-1",
        actorId: "user-1"
      })
    ).resolves.toEqual(cancelledJob);

    expect(mocks.prisma.integrationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        workspaceId: "workspace-1",
        status: {
          in: ["queued", "dry_run_queued"]
        }
      },
      data: {
        status: "cancelled",
        errorMessage: "Задача импорта отменена.",
        finishedAt: expect.any(Date)
      }
    });
    expect(mocks.prisma.integration.updateMany).toHaveBeenCalledWith({
      where: {
        id: "integration-1",
        workspaceId: "workspace-1",
        status: "queued"
      },
      data: {
        status: "ready",
        lastError: null
      }
    });
  });

  it("does not record cancel events or audit logs when a worker wins the claim race", async () => {
    const { cancelBackendJob } = await import("@/lib/jobs/queue");
    mocks.prisma.backendJob.findFirst.mockResolvedValue(backendJob());
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      cancelBackendJob({
        workspaceId: "workspace-1",
        jobId: "job-1",
        actorId: "user-1"
      })
    ).rejects.toThrow("Можно отменить только задачу в очереди.");

    expect(mocks.prisma.backendJob.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJobEvent.create).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not persist a success result when the worker lost the job lock", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const lockedAt = new Date("2026-05-04T08:01:00.000Z");
    const queuedJob = backendJob({
      type: "REPORT_EXPORT",
      payloadJson: JSON.stringify({ name: "Daily quality report" })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      lockedAt,
      lockedBy: "worker-old",
      startedAt: lockedAt
    });
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.prisma.reportSnapshot.create.mockResolvedValue({ id: "snapshot-1" });
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});

    await expect(runDueBackendJobs({ workerId: "worker-old", limit: 1 })).resolves.toEqual([
      {
        jobId: "job-1",
        status: "FAILED",
        error: "Задача уже перехвачена другим worker."
      }
    ]);

    expect(mocks.prisma.backendJob.update).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "job-1",
        status: "RUNNING",
        lockedAt,
        lockedBy: "worker-old"
      },
      data: {
        lockedAt: expect.any(Date),
        lockedBy: "worker-old"
      }
    });
    expect(mocks.prisma.reportSnapshot.create).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJobEvent.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        message: "Задача завершена."
      })
    });
  });

  it("does not persist a failure result when the worker lost the job lock", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const lockedAt = new Date("2026-05-04T08:01:00.000Z");
    const queuedJob = backendJob({
      type: "INTEGRATION_IMPORT",
      queueName: "integrations",
      payloadJson: JSON.stringify({
        integrationId: "integration-1",
        integrationRunId: "run-1"
      })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      maxAttempts: 3,
      lockedAt,
      lockedBy: "worker-old",
      startedAt: lockedAt
    });
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.runIntegrationConnector.mockRejectedValue(new Error("Upstream timeout"));
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});

    await expect(runDueBackendJobs({ workerId: "worker-old", queueName: "integrations", limit: 1 })).resolves.toEqual([
      {
        jobId: "job-1",
        status: "FAILED",
        error: "Задача уже перехвачена другим worker."
      }
    ]);

    expect(mocks.prisma.backendJob.update).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: "job-1",
        status: "RUNNING",
        lockedBy: "worker-old"
      }),
      data: expect.objectContaining({
        status: "QUEUED",
        lockedAt: null,
        lockedBy: null
      })
    });
    expect(mocks.prisma.backendJobEvent.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        level: "error",
        message: "Upstream timeout"
      })
    });
    expect(mocks.prisma.integration.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.integrationRun.updateMany).not.toHaveBeenCalled();
  });

  it("does not run integration connector side effects when the worker already lost the job lock", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const lockedAt = new Date("2026-05-04T08:01:00.000Z");
    const queuedJob = backendJob({
      type: "INTEGRATION_IMPORT",
      queueName: "integrations",
      payloadJson: JSON.stringify({
        integrationId: "integration-1",
        integrationRunId: "run-1",
        requestedLimit: 10,
        dryRun: false
      })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      lockedAt,
      lockedBy: "worker-old",
      startedAt: lockedAt
    });
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.runIntegrationConnector.mockResolvedValue({
      source: "zendesk",
      mode: "native_helpdesk",
      dryRun: false,
      importedCount: 1,
      checkedCount: 1,
      externalIds: ["ticket-1"]
    });

    await expect(runDueBackendJobs({ workerId: "worker-old", queueName: "integrations", limit: 1 })).resolves.toEqual([
      {
        jobId: "job-1",
        status: "FAILED",
        error: "Задача уже перехвачена другим worker."
      }
    ]);

    expect(mocks.runIntegrationConnector).not.toHaveBeenCalled();
    expect(mocks.runSelectedOtrsImportConnector).not.toHaveBeenCalled();
    expect(mocks.prisma.integration.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.integrationRun.updateMany).not.toHaveBeenCalled();
  });

  it("renews the job lock before integration connector side effects", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const lockedAt = new Date("2026-05-04T08:01:00.000Z");
    const queuedJob = backendJob({
      type: "INTEGRATION_IMPORT",
      queueName: "integrations",
      payloadJson: JSON.stringify({
        integrationId: "integration-1",
        integrationRunId: "run-1",
        requestedLimit: 10,
        dryRun: true
      })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      lockedAt,
      lockedBy: "worker-a",
      startedAt: lockedAt
    });
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.runIntegrationConnector.mockImplementation(async ({ beforeWrite }) => {
      await beforeWrite?.(mocks.prisma);
      return {
        source: "zendesk",
        mode: "native_helpdesk",
        dryRun: true,
        importedCount: 0,
        checkedCount: 1,
        externalIds: ["ticket-1"]
      };
    });
    mocks.prisma.backendJob.update.mockResolvedValue({});

    await runDueBackendJobs({ workerId: "worker-a", queueName: "integrations", limit: 1 });

    expect(mocks.prisma.backendJob.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "job-1",
        status: "RUNNING",
        lockedAt,
        lockedBy: "worker-a"
      },
      data: {
        lockedAt: expect.any(Date),
        lockedBy: "worker-a"
      }
    });
  });

  it("finalizes transaction failures with the last committed job lock", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T08:01:10.000Z"));
    const lockedAt = new Date("2026-05-04T08:01:00.000Z");
    const queuedJob = backendJob({
      type: "REPORT_EXPORT",
      payloadJson: JSON.stringify({ name: "Daily quality report" })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      maxAttempts: 3,
      lockedAt,
      lockedBy: "worker-a",
      startedAt: lockedAt
    });
    let updateManyCalls = 0;
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockImplementation(async () => {
      updateManyCalls += 1;
      if (updateManyCalls === 1) {
        vi.setSystemTime(new Date("2026-05-04T08:01:20.000Z"));
      }
      if (updateManyCalls === 2) {
        vi.setSystemTime(new Date("2026-05-04T08:01:30.000Z"));
      }
      if (updateManyCalls === 3) {
        vi.setSystemTime(new Date("2026-05-04T08:01:40.000Z"));
      }
      return { count: 1 };
    });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.prisma.reportSnapshot.create.mockRejectedValue(new Error("Snapshot write failed"));
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});

    try {
      await expect(runDueBackendJobs({ workerId: "worker-a", limit: 1 })).resolves.toEqual([
        {
          jobId: "job-1",
          status: "FAILED",
          error: "Snapshot write failed"
        }
      ]);

      const initialRenewal = mocks.prisma.backendJob.updateMany.mock.calls[1]?.[0];
      const transactionRenewal = mocks.prisma.backendJob.updateMany.mock.calls[2]?.[0];
      const failureFinalizer = mocks.prisma.backendJob.updateMany.mock.calls.at(-1)?.[0];

      expect(initialRenewal).toEqual({
        where: {
          id: "job-1",
          status: "RUNNING",
          lockedAt,
          lockedBy: "worker-a"
        },
        data: {
          lockedAt: new Date("2026-05-04T08:01:20.000Z"),
          lockedBy: "worker-a"
        }
      });
      expect(transactionRenewal).toEqual({
        where: {
          id: "job-1",
          status: "RUNNING",
          lockedAt: new Date("2026-05-04T08:01:20.000Z"),
          lockedBy: "worker-a"
        },
        data: {
          lockedAt: new Date("2026-05-04T08:01:30.000Z"),
          lockedBy: "worker-a"
        }
      });
      expect(failureFinalizer.where.lockedAt).toEqual(new Date("2026-05-04T08:01:20.000Z"));
      expect(failureFinalizer.where.lockedAt).not.toEqual(new Date("2026-05-04T08:01:30.000Z"));
      expect(failureFinalizer.data).toEqual(
        expect.objectContaining({
          status: "QUEUED",
          errorMessage: "Snapshot write failed",
          lockedAt: null,
          lockedBy: null
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispatches explicit selected OTRS imports to the OTRS selected import service", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const queuedJob = backendJob({
      type: "INTEGRATION_IMPORT",
      queueName: "integrations",
      payloadJson: JSON.stringify({
        operation: "otrs_selected_import",
        integrationId: "integration-1",
        integrationRunId: "run-1",
        integrationRunItemIds: ["item-1"]
      })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockReset();
    mocks.prisma.backendJob.findUnique.mockReset();
    mocks.prisma.backendJob.updateMany.mockReset();
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.runSelectedOtrsImportConnector.mockResolvedValue({
      importedCount: 1,
      errorCount: 0
    });
    mocks.prisma.backendJob.update.mockResolvedValue({});

    await expect(runDueBackendJobs({ workerId: "worker-a", queueName: "integrations", limit: 1 })).resolves.toEqual([
      {
        jobId: "job-1",
        status: "SUCCEEDED",
        result: {
          integrationId: "integration-1",
          integrationRunId: "run-1",
          selectedCount: 1,
          importedCount: 1,
          errorCount: 0
        }
      }
    ]);

    expect(mocks.runSelectedOtrsImportConnector).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      selectedItemIds: ["item-1"],
      beforeWrite: expect.any(Function)
    });
    expect(mocks.runIntegrationConnector).not.toHaveBeenCalled();
  });

  it("propagates a workspace filter to stale recovery and job claiming", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValue(null);

    await expect(
      runDueBackendJobs({
        workerId: "worker-a",
        workspaceId: "workspace-1",
        queueName: "integrations",
        staleAfterMs: 60_000,
        limit: 1
      })
    ).resolves.toEqual([]);

    expect(mocks.prisma.backendJob.findMany).toHaveBeenCalledWith({
      where: {
        status: "RUNNING",
        workspaceId: "workspace-1",
        lockedAt: {
          lte: expect.any(Date)
        }
      },
      orderBy: [{ lockedAt: "asc" }, { createdAt: "asc" }],
      take: 20
    });
    expect(mocks.prisma.backendJob.findFirst).toHaveBeenCalledWith({
      where: {
        status: "QUEUED",
        lockedAt: null,
        queueName: "integrations",
        workspaceId: "workspace-1",
        runAfter: {
          lte: expect.any(Date)
        }
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });
  });

  it("cleans up only expired operational data from the job workspace", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const queuedJob = backendJob({
      type: "RETENTION_CLEANUP",
      queueName: "maintenance"
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    mocks.prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 3 });
    mocks.prisma.apiRateLimit.deleteMany.mockResolvedValue({ count: 4 });
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});

    await runDueBackendJobs({ workerId: "worker-a", queueName: "maintenance", workspaceId: "workspace-1", limit: 1 });

    expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        status: "ACTIVE",
        expiresAt: {
          lt: expect.any(Date)
        }
      },
      data: { status: "EXPIRED" }
    });
    expect(mocks.prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        expiresAt: {
          lt: expect.any(Date)
        }
      }
    });
    expect(mocks.prisma.apiRateLimit.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        windowStart: {
          lt: expect.any(Date)
        }
      }
    });
  });

  it("keeps old INTEGRATION_IMPORT payloads on the legacy connector runner", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const queuedJob = backendJob({
      type: "INTEGRATION_IMPORT",
      queueName: "integrations",
      payloadJson: JSON.stringify({
        integrationId: "native-integration",
        integrationRunId: "native-run",
        requestedLimit: 10,
        dryRun: true
      })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockReset();
    mocks.prisma.backendJob.findUnique.mockReset();
    mocks.prisma.backendJob.updateMany.mockReset();
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.runIntegrationConnector.mockResolvedValue({
      source: "zendesk",
      mode: "native_helpdesk",
      dryRun: true,
      importedCount: 0,
      checkedCount: 1,
      externalIds: ["ticket-1"]
    });
    mocks.prisma.backendJob.update.mockResolvedValue({});

    await runDueBackendJobs({ workerId: "worker-a", queueName: "integrations", limit: 1 });

    expect(mocks.runIntegrationConnector).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "native-integration",
      integrationRunId: "native-run",
      requestedLimit: 10,
      dryRun: true,
      beforeWrite: expect.any(Function)
    });
    expect(mocks.runSelectedOtrsImportConnector).not.toHaveBeenCalled();
  });

  it("does not retry or overwrite disabled integrations after import runner rejects them", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const queuedJob = backendJob({
      type: "INTEGRATION_IMPORT",
      queueName: "integrations",
      payloadJson: JSON.stringify({
        integrationId: "disabled-integration",
        integrationRunId: "run-1"
      })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      maxAttempts: 3,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockReset();
    mocks.prisma.backendJob.findUnique.mockReset();
    mocks.prisma.backendJob.updateMany.mockReset();
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.runIntegrationConnector.mockRejectedValue(new Error("Интеграция отключена."));
    mocks.prisma.backendJob.update.mockResolvedValue({});
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});
    mocks.prisma.integration.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.integrationRun.updateMany.mockResolvedValue({ count: 1 });

    await expect(runDueBackendJobs({ workerId: "worker-a", queueName: "integrations", limit: 1 })).resolves.toEqual([
      {
        jobId: "job-1",
        status: "FAILED",
        error: "Интеграция отключена."
      }
    ]);

    expect(mocks.prisma.backendJob.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "job-1",
        status: "RUNNING",
        lockedAt: expect.any(Date),
        lockedBy: "worker-a"
      },
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: "Интеграция отключена.",
        finishedAt: expect.any(Date)
      })
    });
    expect(mocks.prisma.integration.updateMany).toHaveBeenCalledWith({
      where: {
        id: "disabled-integration",
        workspaceId: "workspace-1",
        status: { not: "disabled" }
      },
      data: {
        status: "error",
        lastError: "Интеграция отключена."
      }
    });
    expect(mocks.prisma.backendJobEvent.create).toHaveBeenCalledWith({
      data: {
        jobId: "job-1",
        level: "error",
        message: "Интеграция отключена.",
        metadata: JSON.stringify({ shouldRetry: false })
      }
    });
  });

  it("writes integration failure side effects in the same transaction that releases the job lock", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const queuedJob = backendJob({
      type: "INTEGRATION_IMPORT",
      queueName: "integrations",
      payloadJson: JSON.stringify({
        integrationId: "integration-1",
        integrationRunId: "run-1"
      })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      maxAttempts: 3,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    const tx = {
      backendJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      backendJobEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      integration: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      integrationRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.runIntegrationConnector.mockRejectedValue(new Error("Upstream timeout"));
    mocks.prisma.backendJobEvent.create.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(runDueBackendJobs({ workerId: "worker-a", queueName: "integrations", limit: 1 })).resolves.toEqual([
      {
        jobId: "job-1",
        status: "FAILED",
        error: "Upstream timeout"
      }
    ]);

    expect(tx.backendJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        status: "RUNNING",
        lockedAt: expect.any(Date),
        lockedBy: "worker-a"
      },
      data: expect.objectContaining({
        status: "QUEUED",
        lockedAt: null,
        lockedBy: null
      })
    });
    expect(tx.backendJobEvent.create).toHaveBeenCalledWith({
      data: {
        jobId: "job-1",
        level: "error",
        message: "Upstream timeout",
        metadata: JSON.stringify({ shouldRetry: true })
      }
    });
    expect(tx.integration.updateMany).toHaveBeenCalledWith({
      where: {
        id: "integration-1",
        workspaceId: "workspace-1",
        status: { not: "disabled" }
      },
      data: {
        status: "queued",
        lastError: "Upstream timeout"
      }
    });
    expect(tx.integrationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        workspaceId: "workspace-1"
      },
      data: expect.objectContaining({
        status: "retry_scheduled",
        errorMessage: "Upstream timeout"
      })
    });
    expect(mocks.prisma.integration.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.integrationRun.updateMany).not.toHaveBeenCalled();
  });

  it("dispatches WEBHOOK_INGEST jobs to the signed webhook ingest service", async () => {
    const { runDueBackendJobs } = await import("@/lib/jobs/queue");
    const queuedJob = backendJob({
      type: "WEBHOOK_INGEST",
      queueName: "webhooks",
      payloadJson: JSON.stringify({
        endpointId: "endpoint-1",
        rawBody: "{\"eventType\":\"conversation.upsert\"}",
        idempotencyKey: "idem-1",
        timestamp: "1778323200000",
        signature: "sha256=test"
      })
    });
    const runningJob = backendJob({
      ...queuedJob,
      status: "RUNNING",
      attempts: 1,
      lockedAt: new Date("2026-05-04T08:01:00.000Z"),
      lockedBy: "worker-a",
      startedAt: new Date("2026-05-04T08:01:00.000Z")
    });
    mocks.prisma.backendJob.findFirst.mockReset();
    mocks.prisma.backendJob.findUnique.mockReset();
    mocks.prisma.backendJob.updateMany.mockReset();
    mocks.prisma.backendJob.findMany.mockResolvedValue([]);
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(queuedJob);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.backendJob.findUnique.mockResolvedValue(runningJob);
    mocks.ingestWebhookEvent.mockResolvedValue({
      status: "processed",
      eventId: "event-1",
      conversationId: "conversation-1"
    });
    mocks.prisma.backendJob.update.mockResolvedValue({});

    await runDueBackendJobs({ workerId: "worker-a", queueName: "webhooks", limit: 1 });

    expect(mocks.ingestWebhookEvent).toHaveBeenCalledWith({
      endpointId: "endpoint-1",
      workspaceId: "workspace-1",
      rawBody: "{\"eventType\":\"conversation.upsert\"}",
      idempotencyKey: "idem-1",
      timestamp: "1778323200000",
      signature: "sha256=test",
      beforeWrite: expect.any(Function)
    });
  });
});
