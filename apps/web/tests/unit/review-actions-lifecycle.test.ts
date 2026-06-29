import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    conversation: {
      findFirst: vi.fn(),
      updateMany: vi.fn()
    },
    criterionScore: {
      deleteMany: vi.fn()
    },
    finding: {
      deleteMany: vi.fn()
    },
    review: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    reviewEvent: {
      findFirst: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    canFinalizeReview: vi.fn(),
    canSaveReviewDraft: vi.fn(),
    canSelfReview: vi.fn(),
    getCurrentUser: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      conversation: {
        findFirst: vi.fn()
      },
      scorecard: {
        findFirst: vi.fn()
      },
      user: {
        count: vi.fn()
      }
    },
    recordReviewEvent: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn(),
    selectNextReviewConversationId: vi.fn(),
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
  canFinalizeReview: mocks.canFinalizeReview,
  canSaveReviewDraft: mocks.canSaveReviewDraft,
  canSelfReview: mocks.canSelfReview,
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

vi.mock("@/lib/queue-view-actions", () => ({
  selectNextReviewConversationId: mocks.selectNextReviewConversationId
}));

function reviewerUser() {
  return {
    id: "reviewer-1",
    workspaceId: "workspace-1",
    role: "QA_ANALYST",
    name: "Проверяющий"
  };
}

function baseFinalizeForm() {
  const formData = new FormData();
  formData.set("conversationId", "conversation-1");
  formData.set("scorecardId", "scorecard-1");
  formData.set("summary", "Итог проверки");
  formData.set("ownerType", "AGENT");
  formData.set("riskLevel", "LOW");
  formData.set("category", "Полнота ответа");
  return formData;
}

describe("review action lifecycle guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.getCurrentUser.mockResolvedValue(reviewerUser());
    mocks.canFinalizeReview.mockReturnValue(true);
    mocks.canSaveReviewDraft.mockReturnValue(true);
    mocks.canSelfReview.mockReturnValue(true);
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      assigneeName: "Оператор",
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: null,
      qaAssigneeName: null,
      messages: []
    });
    mocks.prisma.scorecard.findFirst.mockResolvedValue({
      id: "scorecard-1",
      version: 3,
      criteria: []
    });
    mocks.prisma.user.count.mockResolvedValue(1);
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: null,
      qaAssigneeName: null
    });
    mocks.tx.conversation.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.reviewEvent.findFirst.mockResolvedValue(null);
    mocks.tx.review.findFirst.mockResolvedValue(null);
    mocks.tx.review.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.review.create.mockResolvedValue({ id: "review-new" });
    mocks.tx.review.update.mockResolvedValue({ id: "review-existing" });
    mocks.auditLog.mockResolvedValue({});
    mocks.recordReviewEvent.mockResolvedValue({});
  });

  it("blocks HUMAN finalization when the conversation is already FINALIZED", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "FINALIZED",
      qaAssigneeId: "reviewer-old",
      qaAssigneeName: "Другой проверяющий"
    });

    await expect(finalizeReview(baseFinalizeForm())).rejects.toThrow(
      "Завершенный диалог нужно сначала переоткрыть для нового цикла проверки."
    );

    expect(mocks.tx.review.create).not.toHaveBeenCalled();
    expect(mocks.tx.review.update).not.toHaveBeenCalled();
    expect(mocks.tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("blocks HUMAN draft saves when the conversation is already FINALIZED", async () => {
    const { saveReviewDraft } = await import("@/lib/review-actions");
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "FINALIZED",
      qaAssigneeId: "reviewer-old",
      qaAssigneeName: "Другой проверяющий"
    });

    await expect(saveReviewDraft(baseFinalizeForm())).rejects.toThrow(
      "Завершенный диалог нужно сначала переоткрыть для нового цикла проверки."
    );

    expect(mocks.tx.review.create).not.toHaveBeenCalled();
    expect(mocks.tx.review.update).not.toHaveBeenCalled();
    expect(mocks.tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("creates a new HUMAN review after REOPENED instead of reusing a finalized review from the previous cycle", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    const latestReopenedAt = new Date("2026-05-09T12:00:00.000Z");
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "REOPENED",
      qaAssigneeId: null,
      qaAssigneeName: null
    });
    mocks.tx.reviewEvent.findFirst.mockResolvedValue({ createdAt: latestReopenedAt });
    mocks.tx.review.findFirst.mockResolvedValue(null);

    await finalizeReview(baseFinalizeForm());

    expect(mocks.tx.review.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: "conversation-1",
          reviewerId: "reviewer-1",
          reviewSource: "HUMAN",
          OR: [
            { createdAt: { gt: latestReopenedAt } },
            { finalizedAt: { gt: latestReopenedAt } }
          ]
        })
      })
    );
    expect(mocks.tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conversation-1",
          reviewerId: "reviewer-1",
          status: "FINALIZED"
        })
      })
    );
    expect(mocks.tx.review.update).not.toHaveBeenCalled();
    expect(mocks.tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "conversation-1",
          workspaceId: "workspace-1",
          qaStatus: "REOPENED"
        })
      })
    );
  });

  it("rejects self-review when several active users share the reviewer's name", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      assigneeName: "Проверяющий",
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: null,
      qaAssigneeName: null,
      messages: []
    });
    mocks.prisma.user.count.mockResolvedValue(2);
    const formData = baseFinalizeForm();
    formData.set("reviewSource", "SELF_REVIEW");

    await expect(finalizeReview(formData)).rejects.toThrow(
      "В рабочем пространстве несколько активных пользователей с вашим именем"
    );

    expect(mocks.prisma.user.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        name: "Проверяющий",
        lifecycleStatus: "ACTIVE"
      }
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.review.create).not.toHaveBeenCalled();
  });

  it("allows self-review when the reviewer's name is unique among active users", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      assigneeName: "Проверяющий",
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: null,
      qaAssigneeName: null,
      messages: []
    });
    mocks.prisma.user.count.mockResolvedValue(1);
    const formData = baseFinalizeForm();
    formData.set("reviewSource", "SELF_REVIEW");

    await finalizeReview(formData);

    expect(mocks.tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewSource: "SELF_REVIEW",
          status: "FINALIZED"
        })
      })
    );
  });

  it("finalizes then redirects to the next queued conversation", async () => {
    const { finalizeReviewAndTakeNext } = await import("@/lib/review-actions");
    mocks.selectNextReviewConversationId.mockResolvedValue("conversation-next");

    await finalizeReviewAndTakeNext(baseFinalizeForm());

    expect(mocks.tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FINALIZED" })
      })
    );
    expect(mocks.selectNextReviewConversationId).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
      "conversation-1"
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/reviews/conversation-next?saved=final");
  });

  it("redirects to the empty-queue marker when nothing remains after finalizing", async () => {
    const { finalizeReviewAndTakeNext } = await import("@/lib/review-actions");
    mocks.selectNextReviewConversationId.mockResolvedValue(null);

    await finalizeReviewAndTakeNext(baseFinalizeForm());

    expect(mocks.tx.review.create).toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/reviews?empty=1&saved=final");
  });

  it("does not advance to the next conversation when finalization fails", async () => {
    const { finalizeReviewAndTakeNext } = await import("@/lib/review-actions");
    mocks.tx.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "FINALIZED",
      qaAssigneeId: "reviewer-old",
      qaAssigneeName: "Другой проверяющий"
    });

    await expect(finalizeReviewAndTakeNext(baseFinalizeForm())).rejects.toThrow();

    expect(mocks.selectNextReviewConversationId).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("ignores forged process status fields during finalization", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    const formData = baseFinalizeForm();
    formData.set("feedbackStatus", "acknowledged");
    formData.set("appealStatus", "calibration");
    formData.set("reanswerStatus", "completed");
    formData.set("needsReanswer", "on");

    await finalizeReview(formData);

    expect(mocks.tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feedbackStatus: "new",
          appealStatus: "none",
          appealDueAt: null,
          reanswerStatus: "required",
          calibrationStatus: "none"
        })
      })
    );
  });
});
