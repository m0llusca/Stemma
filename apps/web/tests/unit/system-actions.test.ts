import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanPersistSettings: vi.fn(),
  auditLog: vi.fn(),
  logBackendEvent: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  revalidatePath: vi.fn(),
  runDueBackendJobs: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: {}
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueBackendJob: vi.fn(),
  runDueBackendJobs: mocks.runDueBackendJobs
}));

vi.mock("@/lib/observability", () => ({
  logBackendEvent: mocks.logBackendEvent
}));

describe("system actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "user-1234567890",
      workspaceId: "workspace-1"
    });
    mocks.runDueBackendJobs.mockResolvedValue([{ jobId: "job-1" }, { jobId: "job-2" }]);
    mocks.auditLog.mockResolvedValue({});
  });

  it("keeps UI backend job runs successful when persistent audit logging fails", async () => {
    const { runQueuedBackendJobs } = await import("@/lib/system-actions");
    const formData = new FormData();
    formData.set("limit", "9");
    mocks.auditLog.mockRejectedValue(new Error("audit unavailable"));

    await expect(runQueuedBackendJobs(formData)).resolves.toBeUndefined();

    expect(mocks.runDueBackendJobs).toHaveBeenCalledWith({
      limit: 9,
      workerId: "ui-user-123"
    });
    expect(mocks.runDueBackendJobs.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.logBackendEvent.mock.invocationCallOrder[0]
    );
    expect(mocks.logBackendEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.auditLog.mock.invocationCallOrder[0]
    );
    expect(mocks.logBackendEvent).toHaveBeenCalledWith({
      event: "backend_jobs.run_from_ui",
      workspaceId: "workspace-1",
      actorId: "user-1234567890",
      metadata: {
        limit: 9,
        processed: 2
      }
    });
    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1234567890",
      action: "backend_jobs.run_from_ui",
      targetType: "backend_job",
      targetId: "batch",
      metadata: {
        limit: 9,
        processed: 2
      }
    });
    expect(mocks.logBackendEvent).toHaveBeenCalledWith({
      level: "error",
      event: "backend_jobs.run_from_ui_audit_failed",
      workspaceId: "workspace-1",
      actorId: "user-1234567890",
      metadata: {
        message: "audit unavailable"
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/system");
  });
});
