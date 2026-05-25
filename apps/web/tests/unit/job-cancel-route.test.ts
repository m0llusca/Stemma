import { beforeEach, describe, expect, it, vi } from "vitest";

const conflictMessage = "Можно отменить только задачу в очереди.";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  cancelBackendJob: vi.fn(),
  BackendJobCancelConflictError: class BackendJobCancelConflictError extends Error {},
  BackendJobNotFoundError: class BackendJobNotFoundError extends Error {}
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/jobs/queue", () => ({
  BackendJobCancelConflictError: mocks.BackendJobCancelConflictError,
  BackendJobNotFoundError: mocks.BackendJobNotFoundError,
  cancelBackendJob: mocks.cancelBackendJob
}));

function request() {
  return new Request("https://qc.example.com/api/v1/jobs/job-1/cancel", {
    method: "POST",
    headers: {
      origin: "https://qc.example.com",
      "x-request-id": "req-cancel-1"
    }
  });
}

describe("job cancel API", () => {
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

  it("uses the guarded cancel helper and returns the legacy successful response shape", async () => {
    const { POST } = await import("@/app/api/v1/jobs/[jobId]/cancel/route");
    mocks.cancelBackendJob.mockResolvedValue({
      id: "job-1",
      status: "CANCELLED"
    });

    const response = await POST(request(), { params: Promise.resolve({ jobId: "job-1" }) });

    expect(mocks.cancelBackendJob).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      jobId: "job-1",
      actorId: "user-1"
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: {
        id: "job-1",
        status: "CANCELLED"
      }
    });
  });

  it("maps claim/cancel races to 409", async () => {
    const { POST } = await import("@/app/api/v1/jobs/[jobId]/cancel/route");
    mocks.cancelBackendJob.mockRejectedValue(new mocks.BackendJobCancelConflictError(conflictMessage));

    const response = await POST(request(), { params: Promise.resolve({ jobId: "job-1" }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "conflict",
        message: conflictMessage,
        requestId: "req-cancel-1"
      }
    });
  });

  it("preserves 404 for missing jobs", async () => {
    const { POST } = await import("@/app/api/v1/jobs/[jobId]/cancel/route");
    mocks.cancelBackendJob.mockRejectedValue(new mocks.BackendJobNotFoundError("Фоновая задача не найдена."));

    const response = await POST(request(), { params: Promise.resolve({ jobId: "job-1" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "not_found",
        message: "Фоновая задача не найдена.",
        requestId: "req-cancel-1"
      }
    });
  });
});
