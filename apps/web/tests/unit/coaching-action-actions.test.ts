import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    coachingAction: {
      findFirst: vi.fn(),
      update: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    canManageTraining: vi.fn(),
    getCurrentUser: vi.fn(),
    recordReviewEvent: vi.fn(),
    revalidatePath: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      coachingAction: {
        findFirst: vi.fn()
      }
    },
    tx
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  canManageTraining: mocks.canManageTraining,
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/review-events", () => ({
  recordReviewEvent: mocks.recordReviewEvent
}));

function managerUser() {
  return {
    id: "manager-1",
    workspaceId: "workspace-1",
    role: "TEAM_LEAD",
    name: "Тимлид"
  };
}

function openActionRow() {
  return {
    id: "action-1",
    status: "open",
    finding: {
      reviewId: "review-1",
      review: {
        conversationId: "conversation-1"
      }
    }
  };
}

describe("coaching action status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.getCurrentUser.mockResolvedValue(managerUser());
    mocks.canManageTraining.mockReturnValue(true);
    mocks.tx.coachingAction.findFirst.mockResolvedValue(openActionRow());
    mocks.tx.coachingAction.update.mockResolvedValue({ id: "action-1", status: "completed" });
    mocks.auditLog.mockResolvedValue({});
    mocks.recordReviewEvent.mockResolvedValue({});
  });

  describe("updateCoachingActionStatus", () => {
    it("completes a workspace-scoped action and audits + records a review event", async () => {
      const { updateCoachingActionStatus } = await import("@/lib/coaching-action-actions");
      const formData = new FormData();
      formData.set("id", "action-1");
      formData.set("status", "completed");

      await updateCoachingActionStatus(formData);

      expect(mocks.tx.coachingAction.findFirst).toHaveBeenCalledWith({
        where: {
          id: "action-1",
          finding: {
            review: {
              workspaceId: "workspace-1"
            }
          }
        },
        select: expect.any(Object)
      });
      expect(mocks.tx.coachingAction.update).toHaveBeenCalledWith({
        where: { id: "action-1" },
        data: { status: "completed" }
      });
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "coaching.action_status_updated",
          targetType: "coaching_action",
          targetId: "action-1",
          metadata: expect.objectContaining({
            status: "completed",
            fromStatus: "open",
            reviewId: "review-1"
          })
        }),
        mocks.tx
      );
      expect(mocks.recordReviewEvent).toHaveBeenCalledWith(
        mocks.tx,
        expect.objectContaining({
          action: "coaching.action_status_updated",
          reviewId: "review-1",
          conversationId: "conversation-1",
          fromStatus: "open",
          toStatus: "completed"
        })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/coaching");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/reports");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/reviews/conversation-1");
    });

    it("cancels an open action", async () => {
      const { updateCoachingActionStatus } = await import("@/lib/coaching-action-actions");
      const formData = new FormData();
      formData.set("id", "action-1");
      formData.set("status", "cancelled");

      await updateCoachingActionStatus(formData);

      expect(mocks.tx.coachingAction.update).toHaveBeenCalledWith({
        where: { id: "action-1" },
        data: { status: "cancelled" }
      });
    });

    it("rejects invalid status", async () => {
      const { updateCoachingActionStatus } = await import("@/lib/coaching-action-actions");
      const formData = new FormData();
      formData.set("id", "action-1");
      formData.set("status", "done");

      await expect(updateCoachingActionStatus(formData)).rejects.toThrow("Некорректный статус");
      expect(mocks.tx.coachingAction.update).not.toHaveBeenCalled();
    });

    it("rejects support agents even when training:manage is present", async () => {
      mocks.getCurrentUser.mockResolvedValue({
        ...managerUser(),
        role: "SUPPORT_AGENT",
        name: "Оператор"
      });
      mocks.canManageTraining.mockReturnValue(true);

      const { updateCoachingActionStatus } = await import("@/lib/coaching-action-actions");
      const formData = new FormData();
      formData.set("id", "action-1");
      formData.set("status", "completed");

      await expect(updateCoachingActionStatus(formData)).rejects.toThrow("Нет прав");
    });

    it("no-ops when the action is outside the workspace", async () => {
      mocks.tx.coachingAction.findFirst.mockResolvedValue(null);

      const { updateCoachingActionStatus } = await import("@/lib/coaching-action-actions");
      const formData = new FormData();
      formData.set("id", "foreign-action");
      formData.set("status", "completed");

      await updateCoachingActionStatus(formData);

      expect(mocks.tx.coachingAction.update).not.toHaveBeenCalled();
      expect(mocks.auditLog).not.toHaveBeenCalled();
      expect(mocks.recordReviewEvent).not.toHaveBeenCalled();
    });

    it("skips write when status is unchanged", async () => {
      mocks.tx.coachingAction.findFirst.mockResolvedValue({
        ...openActionRow(),
        status: "completed"
      });

      const { updateCoachingActionStatus } = await import("@/lib/coaching-action-actions");
      const formData = new FormData();
      formData.set("id", "action-1");
      formData.set("status", "completed");

      await updateCoachingActionStatus(formData);

      expect(mocks.tx.coachingAction.update).not.toHaveBeenCalled();
      expect(mocks.auditLog).not.toHaveBeenCalled();
    });
  });

  describe("updateCoachingActionStatusState", () => {
    it("returns a Russian success toast for completed", async () => {
      const { updateCoachingActionStatusState } = await import("@/lib/coaching-action-actions");
      const formData = new FormData();
      formData.set("id", "action-1");
      formData.set("status", "completed");

      const result = await updateCoachingActionStatusState(null, formData);

      expect(result).toEqual({
        ok: true,
        toast: "Разбор отмечен выполненным.",
        nonce: expect.any(Number)
      });
    });

    it("returns a permission error as action state", async () => {
      mocks.canManageTraining.mockReturnValue(false);

      const { updateCoachingActionStatusState } = await import("@/lib/coaching-action-actions");
      const formData = new FormData();
      formData.set("id", "action-1");
      formData.set("status", "completed");

      const result = await updateCoachingActionStatusState(null, formData);

      expect(result).toEqual({
        ok: false,
        message: "Нет прав на закрытие разборов."
      });
    });
  });
});

describe("coaching action status helpers", () => {
  it("exposes open/completed/cancelled with Russian labels", async () => {
    const { COACHING_ACTION_STATUSES, coachingActionStatusLabels, isCoachingActionStatus, isOpenCoachingActionStatus } =
      await import("@/lib/coaching-action");

    expect(COACHING_ACTION_STATUSES).toEqual(["open", "completed", "cancelled"]);
    expect(coachingActionStatusLabels.open).toBe("Открыт");
    expect(coachingActionStatusLabels.completed).toBe("Разбор выполнен");
    expect(coachingActionStatusLabels.cancelled).toBe("Отменён");
    expect(isCoachingActionStatus("open")).toBe(true);
    expect(isCoachingActionStatus("done")).toBe(false);
    expect(isOpenCoachingActionStatus("open")).toBe(true);
    expect(isOpenCoachingActionStatus("completed")).toBe(false);
  });
});
