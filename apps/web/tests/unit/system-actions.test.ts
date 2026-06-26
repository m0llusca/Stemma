import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanPersistSettings: vi.fn(),
  auditLog: vi.fn(),
  logBackendEvent: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  revalidatePath: vi.fn(),
  enqueueBackendJob: vi.fn(),
  cancelBackendJob: vi.fn(),
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

vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueBackendJob: mocks.enqueueBackendJob
}));

vi.mock("@/lib/jobs/queue", () => ({
  cancelBackendJob: mocks.cancelBackendJob,
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
    mocks.cancelBackendJob.mockResolvedValue({ id: "job-1" });
    mocks.enqueueBackendJob.mockResolvedValue({
      id: "job-queued",
      queueName: "directory",
      type: "DIRECTORY_SYNC",
      status: "QUEUED"
    });
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
      workerId: "ui-user-123",
      workspaceId: "workspace-1"
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

  it("cancels queued backend jobs through the guarded queue helper", async () => {
    const { cancelQueuedBackendJob } = await import("@/lib/system-actions");
    const formData = new FormData();
    formData.set("jobId", "job-1");

    await expect(cancelQueuedBackendJob(formData)).resolves.toBeUndefined();

    expect(mocks.cancelBackendJob).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      jobId: "job-1",
      actorId: "user-1234567890",
      eventMessage: "Задача отменена администратором из интерфейса."
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/system");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/system/jobs/job-1");
  });

  it("queues directory sync through the enqueue-only action module", async () => {
    const { queueDirectorySync } = await import("@/lib/system-enqueue-actions");
    const formData = new FormData();
    formData.set("providerId", "provider-1");
    formData.set("dryRun", "true");

    await expect(queueDirectorySync(formData)).resolves.toBeUndefined();

    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      type: "DIRECTORY_SYNC",
      queueName: "directory",
      priority: 70,
      createdById: "user-1234567890",
      payload: {
        providerId: "provider-1",
        dryRun: true
      }
    });
    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1234567890",
      action: "auth.directory_sync_queued",
      targetType: "identity_provider",
      targetId: "provider-1",
      metadata: {
        jobId: "job-queued",
        dryRun: true
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/system");
  });
});
