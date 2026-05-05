import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  enqueueBackendJob: vi.fn(),
  logBackendEvent: vi.fn(),
  requireSessionApi: vi.fn(),
  runDueBackendJobs: vi.fn()
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
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
    mocks.runDueBackendJobs.mockResolvedValue([{ jobId: "job-1" }, { jobId: "job-2" }]);
  });

  it("audits report export queueing", async () => {
    const { POST } = await import("@/app/api/v1/reports/exports/route");

    const response = await POST(
      jsonRequest("/api/v1/reports/exports", {
        format: "xlsx",
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-05-04T23:59:59.999Z"
      })
    );

    expect(response.status).toBe(202);
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
    });
  });

  it("audits backend job creation", async () => {
    const { POST } = await import("@/app/api/v1/jobs/route");

    const response = await POST(
      jsonRequest("/api/v1/jobs", {
        type: "REPORT_EXPORT",
        payload: { source: "test" }
      })
    );

    expect(response.status).toBe(201);
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
    });
  });

  it("audits manual backend job runner requests", async () => {
    const { POST } = await import("@/app/api/v1/jobs/run/route");

    const response = await POST(
      jsonRequest("/api/v1/jobs/run", {
        limit: 5,
        workerId: "worker-1"
      })
    );

    expect(response.status).toBe(200);
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
  });
});
