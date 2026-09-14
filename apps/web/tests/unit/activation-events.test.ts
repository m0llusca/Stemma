import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  logBackendEvent: vi.fn(),
  findFirst: vi.fn()
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/observability", () => ({
  logBackendEvent: mocks.logBackendEvent
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: {
      findFirst: mocks.findFirst
    }
  }
}));

describe("emitActivationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
  });

  it("logs and audits activation funnel events without throwing on audit failure", async () => {
    mocks.auditLog.mockRejectedValueOnce(new Error("audit down"));

    const { emitActivationEvent } = await import("@/lib/activation-events");
    await emitActivationEvent({
      event: "activation.first_review_finalized",
      workspaceId: "workspace-1",
      actorId: "user-1",
      targetType: "review",
      targetId: "review-1",
      metadata: { conversationId: "c-1" }
    });

    expect(mocks.logBackendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "activation.first_review_finalized",
        workspaceId: "workspace-1"
      })
    );
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it("skips first_* events when already audited for the workspace", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "existing" });

    const { emitActivationEvent } = await import("@/lib/activation-events");
    const result = await emitActivationEvent({
      event: "activation.first_import_completed",
      workspaceId: "workspace-1",
      targetType: "integration_run",
      targetId: "run-1"
    });

    expect(result).toEqual({ emitted: false });
    expect(mocks.logBackendEvent).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});
