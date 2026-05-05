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
    }
  },
  logBackendEvent: vi.fn(),
  runIntegrationConnector: vi.fn(),
  syncDirectoryProvider: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/observability", () => ({
  logBackendEvent: mocks.logBackendEvent
}));

vi.mock("@/lib/integrations/runner", () => ({
  runIntegrationConnector: mocks.runIntegrationConnector
}));

vi.mock("@/lib/auth/directory-sync", () => ({
  syncDirectoryProvider: mocks.syncDirectoryProvider
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

  it("does not return a job if another worker wins the claim race", async () => {
    mocks.prisma.backendJob.findFirst.mockResolvedValueOnce(backendJob()).mockResolvedValueOnce(null);
    mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 0 });

    const { claimNextBackendJob } = await import("@/lib/jobs/queue");
    const claimed = await claimNextBackendJob("worker-b");

    expect(claimed).toBeNull();
    expect(mocks.prisma.backendJob.updateMany).toHaveBeenCalledTimes(1);
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
});
