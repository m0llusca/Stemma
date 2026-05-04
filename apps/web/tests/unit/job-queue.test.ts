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
      update: vi.fn(),
      updateMany: vi.fn()
    },
    backendJobEvent: {
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
});
