import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn()
    },
    review: {
      findFirst: vi.fn()
    },
    reviewEvent: {
      findFirst: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    canManageReviewWorkflow: vi.fn(),
    getCurrentUser: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      conversation: {
        findMany: vi.fn()
      },
      user: {
        findFirst: vi.fn()
      }
    },
    recordReviewEvent: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn(),
    tx
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  canManageReviewWorkflow: mocks.canManageReviewWorkflow,
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/review-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/review-events")>();
  return {
    ...actual,
    recordReviewEvent: mocks.recordReviewEvent
  };
});

function managerUser() {
  return {
    id: "manager-1",
    workspaceId: "workspace-1",
    role: "QA_ANALYST",
    name: "Менеджер"
  };
}

function workflowForm(status: string) {
  const formData = new FormData();
  formData.set("conversationId", "conversation-1");
  formData.set("qaStatus", status);
  return formData;
}

describe("review workflow actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.getCurrentUser.mockResolvedValue(managerUser());
    mocks.canManageReviewWorkflow.mockReturnValue(true);
    mocks.prisma.conversation.findMany.mockResolvedValue([
      { id: "conversation-1", qaStatus: "REOPENED" },
      { id: "conversation-2", qaStatus: "ASSIGNED" }
    ]);
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "REOPENED"
    });
    mocks.tx.conversation.findMany.mockResolvedValue([
      { id: "conversation-1", qaStatus: "REOPENED" },
      { id: "conversation-2", qaStatus: "ASSIGNED" }
    ]);
    mocks.tx.conversation.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.reviewEvent.findFirst.mockResolvedValue(null);
    mocks.tx.review.findFirst.mockResolvedValue({ id: "review-1" });
    mocks.auditLog.mockResolvedValue({});
    mocks.recordReviewEvent.mockResolvedValue({});
  });

  it("does not use a pre-reopen HUMAN finalized review as manual FINALIZED evidence", async () => {
    const { updateConversationWorkflow } = await import("@/lib/review-workflow-actions");
    const latestReopenedAt = new Date("2026-05-09T12:00:00.000Z");
    mocks.tx.reviewEvent.findFirst.mockResolvedValue({ createdAt: latestReopenedAt });
    mocks.tx.review.findFirst.mockResolvedValue(null);

    await expect(updateConversationWorkflow(workflowForm("FINALIZED"))).rejects.toThrow(
      "Нельзя вручную завершить проверку без завершенного ревью."
    );

    expect(mocks.tx.review.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: "conversation-1",
          reviewSource: "HUMAN",
          status: "FINALIZED",
          finalizedAt: { gt: latestReopenedAt }
        })
      })
    );
    expect(mocks.tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("guards workflow writes with the previously asserted qaStatus", async () => {
    const { updateConversationWorkflow } = await import("@/lib/review-workflow-actions");
    mocks.tx.conversation.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateConversationWorkflow(workflowForm("IN_PROGRESS"))).rejects.toThrow(
      "Статус проверки изменился. Обновите страницу и повторите действие."
    );

    expect(mocks.tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "conversation-1",
          workspaceId: "workspace-1",
          qaStatus: "REOPENED"
        }
      })
    );
    expect(mocks.auditLog).not.toHaveBeenCalled();
    expect(mocks.recordReviewEvent).not.toHaveBeenCalled();
  });

  it("bulk workflow updates use per-conversation qaStatus guards", async () => {
    const { bulkUpdateReviewQueue } = await import("@/lib/review-workflow-actions");
    const formData = new FormData();
    formData.append("conversationId", "conversation-1");
    formData.append("conversationId", "conversation-2");
    formData.set("qaStatus", "IN_PROGRESS");

    await bulkUpdateReviewQueue(formData);

    expect(mocks.tx.conversation.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "conversation-1",
          workspaceId: "workspace-1",
          qaStatus: "REOPENED"
        }
      })
    );
    expect(mocks.tx.conversation.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "conversation-2",
          workspaceId: "workspace-1",
          qaStatus: "ASSIGNED"
        }
      })
    );
  });

  it("rejects FINALIZED → REOPENED without a reason", async () => {
    const { updateConversationWorkflow } = await import("@/lib/review-workflow-actions");
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "FINALIZED"
    });

    await expect(updateConversationWorkflow(workflowForm("REOPENED"))).rejects.toThrow(
      "Укажите причину переоткрытия завершенной проверки."
    );

    expect(mocks.tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
    expect(mocks.recordReviewEvent).not.toHaveBeenCalled();
  });

  it("rejects FINALIZED → REOPENED when reason is only whitespace", async () => {
    const { updateConversationWorkflow } = await import("@/lib/review-workflow-actions");
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "FINALIZED"
    });
    const formData = workflowForm("REOPENED");
    formData.set("reason", "   ");

    await expect(updateConversationWorkflow(formData)).rejects.toThrow(
      "Укажите причину переоткрытия завершенной проверки."
    );
  });

  it("accepts FINALIZED → REOPENED with a reason and audits it", async () => {
    const { updateConversationWorkflow } = await import("@/lib/review-workflow-actions");
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "FINALIZED"
    });
    const formData = workflowForm("REOPENED");
    formData.set("reason", "Калибровка: ошибка критерия");

    await updateConversationWorkflow(formData);

    expect(mocks.tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "conversation-1",
          workspaceId: "workspace-1",
          qaStatus: "FINALIZED"
        },
        data: expect.objectContaining({
          qaStatus: "REOPENED"
        })
      })
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "qa.reopened",
        targetId: "conversation-1",
        metadata: expect.objectContaining({
          qaStatus: "REOPENED",
          reason: "Калибровка: ошибка критерия"
        })
      }),
      mocks.tx
    );
    expect(mocks.recordReviewEvent).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        action: "qa.reopened",
        fromStatus: "FINALIZED",
        toStatus: "REOPENED",
        metadata: expect.objectContaining({
          reason: "Калибровка: ошибка критерия"
        })
      })
    );
  });

  it("accepts comment FormData as the reopen reason", async () => {
    const { updateConversationWorkflow } = await import("@/lib/review-workflow-actions");
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "FINALIZED"
    });
    const formData = workflowForm("REOPENED");
    formData.set("comment", "Апелляция подтверждена");

    await updateConversationWorkflow(formData);

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: "Апелляция подтверждена"
        })
      }),
      mocks.tx
    );
  });

  it("rejects bulk FINALIZED → REOPENED without a reason", async () => {
    const { bulkUpdateReviewQueue } = await import("@/lib/review-workflow-actions");
    mocks.prisma.conversation.findMany.mockResolvedValue([{ id: "conversation-1", qaStatus: "FINALIZED" }]);
    mocks.tx.conversation.findMany.mockResolvedValue([{ id: "conversation-1", qaStatus: "FINALIZED" }]);
    const formData = new FormData();
    formData.append("conversationId", "conversation-1");
    formData.set("qaStatus", "REOPENED");

    await expect(bulkUpdateReviewQueue(formData)).rejects.toThrow(
      "Укажите причину переоткрытия завершенной проверки."
    );

    expect(mocks.tx.conversation.updateMany).not.toHaveBeenCalled();
  });
});
