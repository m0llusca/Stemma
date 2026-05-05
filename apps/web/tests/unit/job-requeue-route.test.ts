import { beforeEach, describe, expect, it, vi } from "vitest";

const conflictMessage = "Можно вернуть в очередь только ошибочную задачу текущего рабочего пространства.";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  requeueBackendJob: vi.fn(),
  BackendJobRequeueConflictError: class BackendJobRequeueConflictError extends Error {}
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/jobs/queue", () => ({
  BackendJobRequeueConflictError: mocks.BackendJobRequeueConflictError,
  requeueBackendJob: mocks.requeueBackendJob
}));

function request() {
  return new Request("https://qc.example.com/api/v1/jobs/job-1/requeue", {
    method: "POST",
    headers: {
      origin: "https://qc.example.com",
      "x-request-id": "req-requeue-1"
    }
  });
}

describe("job requeue API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: {
        id: "user-1",
        workspaceId: "workspace-1"
      }
    });
  });

  it("returns the legacy successful response shape", async () => {
    const { POST } = await import("@/app/api/v1/jobs/[jobId]/requeue/route");
    mocks.requeueBackendJob.mockResolvedValue({
      id: "job-1",
      status: "QUEUED"
    });

    const response = await POST(request(), { params: Promise.resolve({ jobId: "job-1" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: {
        id: "job-1",
        status: "QUEUED"
      }
    });
  });

  it("maps requeue conflict errors to 409", async () => {
    const { POST } = await import("@/app/api/v1/jobs/[jobId]/requeue/route");
    mocks.requeueBackendJob.mockRejectedValue(new mocks.BackendJobRequeueConflictError(conflictMessage));

    const response = await POST(request(), { params: Promise.resolve({ jobId: "job-1" }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "conflict",
        message: conflictMessage,
        requestId: "req-requeue-1"
      }
    });
  });

  it("maps unexpected requeue errors to a generic 500", async () => {
    const { POST } = await import("@/app/api/v1/jobs/[jobId]/requeue/route");
    mocks.requeueBackendJob.mockRejectedValue(new Error("database password leaked"));

    const response = await POST(request(), { params: Promise.resolve({ jobId: "job-1" }) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "internal_error",
        message: "Внутренняя ошибка сервера.",
        requestId: "req-requeue-1"
      }
    });
  });
});
