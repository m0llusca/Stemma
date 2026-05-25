import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  enqueueBackendJob: vi.fn(),
  logBackendEvent: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    integration: {
      findFirst: vi.fn()
    }
  },
  requireSessionApi: vi.fn(),
  runDueBackendJobs: vi.fn()
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueBackendJob: mocks.enqueueBackendJob,
  runDueBackendJobs: mocks.runDueBackendJobs
}));

vi.mock("@/lib/observability", () => ({
  logBackendEvent: mocks.logBackendEvent
}));

const job = {
  id: "job-1",
  type: "REPORT_EXPORT",
  status: "QUEUED"
};

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://qc.example.com${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://qc.example.com",
      "x-request-id": "req-1"
    },
    body: JSON.stringify(body)
  });
}

describe("admin backend mutation audit logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: {
        id: "user-1",
        workspaceId: "workspace-1"
      }
    });
    mocks.auditLog.mockResolvedValue({});
    mocks.enqueueBackendJob.mockResolvedValue(job);
    mocks.prisma.integration.findFirst.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback("tx-client"));
    mocks.runDueBackendJobs.mockResolvedValue([{ jobId: "job-1" }, { jobId: "job-2" }]);
  });

  it("audits report export queueing after enqueueing in the transaction", async () => {
    const { POST } = await import("@/app/api/v1/reports/exports/route");

    const response = await POST(
      jsonRequest("/api/v1/reports/exports", {
        format: "xlsx",
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-05-04T23:59:59.999Z"
      })
    );

    expect(response.status).toBe(202);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        type: "REPORT_EXPORT"
      }),
      "tx-client"
    );
    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      action: "report_export.queued",
      targetType: "backend_job",
      targetId: "job-1",
      metadata: {
        format: "xlsx",
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-05-04T23:59:59.999Z"
      }
    }, "tx-client");
    expect(mocks.enqueueBackendJob.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.auditLog.mock.invocationCallOrder[0]
    );
  });

  it("does not audit report export queueing if enqueueing fails", async () => {
    const { POST } = await import("@/app/api/v1/reports/exports/route");
    mocks.enqueueBackendJob.mockRejectedValue(new Error("queue unavailable"));

    await expect(
      POST(
        jsonRequest("/api/v1/reports/exports", {
          periodStart: "2026-05-01T00:00:00.000Z",
          periodEnd: "2026-05-04T23:59:59.999Z"
        })
      )
    ).rejects.toThrow("queue unavailable");

    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("audits backend job creation after enqueueing in the transaction", async () => {
    const { POST } = await import("@/app/api/v1/jobs/route");

    const response = await POST(
      jsonRequest("/api/v1/jobs", {
        type: "REPORT_EXPORT",
        payload: { source: "test" }
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        type: "REPORT_EXPORT"
      }),
      "tx-client"
    );
    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      action: "backend_job.created",
      targetType: "backend_job",
      targetId: "job-1",
      metadata: {
        type: job.type,
        status: job.status
      }
    }, "tx-client");
    expect(mocks.enqueueBackendJob.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.auditLog.mock.invocationCallOrder[0]
    );
  });

  it("does not audit backend job creation if enqueueing fails", async () => {
    const { POST } = await import("@/app/api/v1/jobs/route");
    mocks.enqueueBackendJob.mockRejectedValue(new Error("queue unavailable"));

    await expect(
      POST(
        jsonRequest("/api/v1/jobs", {
          type: "REPORT_EXPORT"
        })
      )
    ).rejects.toThrow("queue unavailable");

    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("rejects manual integration import jobs that bypass source-contract guards", async () => {
    const { POST } = await import("@/app/api/v1/jobs/route");
    mocks.prisma.integration.findFirst.mockResolvedValue({
      id: "integration-enterprise",
      workspaceId: "workspace-1",
      source: "salesforce",
      type: "enterprise",
      status: "ready"
    });

    const response = await POST(
      jsonRequest("/api/v1/jobs", {
        type: "INTEGRATION_IMPORT",
        payload: { integrationId: "integration-enterprise" }
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "conflict",
        message: "Корпоративные источники требуют защищенной настройки OAuth-доступов.",
        requestId: "req-1"
      }
    });
    expect(mocks.enqueueBackendJob).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("audits manual backend job runner requests after running jobs and preserves backend logging", async () => {
    const { POST } = await import("@/app/api/v1/jobs/run/route");

    const response = await POST(
      jsonRequest("/api/v1/jobs/run", {
        limit: 5,
        workerId: "worker-1"
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.runDueBackendJobs).toHaveBeenCalledWith({
      limit: 5,
      workerId: "worker-1",
      workspaceId: "workspace-1"
    });
    expect(mocks.runDueBackendJobs.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.auditLog.mock.invocationCallOrder[0]
    );
    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      action: "backend_jobs.run_requested",
      targetType: "backend_jobs",
      targetId: "worker-1",
      metadata: {
        processed: 2,
        workerId: "worker-1"
      }
    });
    expect(mocks.logBackendEvent).toHaveBeenCalledWith({
      requestId: "req-1",
      event: "backend_jobs.run_requested",
      workspaceId: "workspace-1",
      actorId: "user-1",
      metadata: {
        processed: 2
      }
    });
  });

  it("audits manual backend job runner requests without a workerId as manual", async () => {
    const { POST } = await import("@/app/api/v1/jobs/run/route");

    const response = await POST(
      jsonRequest("/api/v1/jobs/run", {
        limit: 5
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      action: "backend_jobs.run_requested",
      targetType: "backend_jobs",
      targetId: "manual",
      metadata: {
        processed: 2,
        workerId: null
      }
    });
  });

  it("does not audit manual backend job runner requests if running jobs fails", async () => {
    const { POST } = await import("@/app/api/v1/jobs/run/route");
    mocks.runDueBackendJobs.mockRejectedValue(new Error("worker failed"));

    await expect(POST(jsonRequest("/api/v1/jobs/run", {}))).rejects.toThrow("worker failed");

    expect(mocks.auditLog).not.toHaveBeenCalled();
    expect(mocks.logBackendEvent).not.toHaveBeenCalled();
  });

  it("keeps manual runner responses and backend logging when persistent audit fails", async () => {
    const { POST } = await import("@/app/api/v1/jobs/run/route");
    mocks.auditLog.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(
      jsonRequest("/api/v1/jobs/run", {
        workerId: "worker-1"
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      processed: 2
    });
    expect(mocks.logBackendEvent).toHaveBeenCalledWith({
      requestId: "req-1",
      event: "backend_jobs.run_requested",
      workspaceId: "workspace-1",
      actorId: "user-1",
      metadata: {
        processed: 2
      }
    });
    expect(mocks.logBackendEvent).toHaveBeenCalledWith({
      level: "error",
      requestId: "req-1",
      event: "backend_jobs.run_audit_failed",
      workspaceId: "workspace-1",
      actorId: "user-1",
      metadata: {
        message: "audit unavailable"
      }
    });
  });
});
