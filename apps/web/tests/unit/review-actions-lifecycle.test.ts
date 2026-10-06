import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    scorecard: { findFirst: vi.fn() },
    calibrationSession: { findFirst: vi.fn() },
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
    enqueueBackendJob: vi.fn(),
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

vi.mock("@/lib/activation-events", () => ({
  emitActivationEvent: vi.fn(async () => ({ emitted: true }))
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

vi.mock("@/lib/review/select-next-review-conversation", () => ({
  selectNextReviewConversationId: mocks.selectNextReviewConversationId
}));

vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueBackendJob: mocks.enqueueBackendJob
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
  formData.set("criterion.crit-a.passed", "true");
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
      assigneeId: null,
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: null,
      qaAssigneeName: null,
      messages: []
    });
    mocks.prisma.scorecard.findFirst.mockResolvedValue({
      id: "scorecard-1",
      version: 3,
      criteria: [{ id: "crit-a", label: "Точность", kind: "PASS_FAIL", weight: 100 }]
    });
    mocks.tx.scorecard.findFirst.mockImplementation((args) => mocks.prisma.scorecard.findFirst(args));
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
    mocks.tx.calibrationSession.findFirst.mockResolvedValue({ id: "session-2" });
    mocks.tx.review.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.review.create.mockResolvedValue({ id: "review-new" });
    mocks.tx.review.update.mockResolvedValue({ id: "review-existing" });
    mocks.auditLog.mockResolvedValue({});
    mocks.recordReviewEvent.mockResolvedValue({});
    mocks.enqueueBackendJob.mockResolvedValue({ id: "job-1" });
  });

  it("keeps a new calibration session independent of prior grades and HUMAN reopen cycles", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    const form = baseFinalizeForm();
    form.set("reviewSource", "CALIBRATION");
    form.set("calibrationSessionId", "session-2");
    mocks.tx.reviewEvent.findFirst.mockResolvedValue({ createdAt: new Date("2026-10-05T10:00:00Z") });
    mocks.tx.review.findFirst.mockImplementation(async ({ where }) => where.calibrationSessionId === "session-1"
      ? { id: "old-grade", status: "FINALIZED" } : null);

    await finalizeReview(form);

    expect(mocks.tx.calibrationSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "session-2", workspaceId: "workspace-1", status: "active", scorecardId: "scorecard-1",
      items: { some: { conversationId: "conversation-1" } }, participants: { some: { userId: "reviewer-1" } }
    } }));
    expect(mocks.tx.review.findFirst.mock.calls[0][0].where).toEqual({
      workspaceId: "workspace-1", conversationId: "conversation-1", reviewerId: "reviewer-1",
      reviewSource: "CALIBRATION", calibrationSessionId: "session-2"
    });
    expect(mocks.tx.review.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ calibrationSessionId: "session-2" }) }));
    expect(mocks.tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it.each(["missing-id", "denied-session", "human-with-session"])("rejects invalid calibration context %s before writing", async (scenario) => {
    const { finalizeReview } = await import("@/lib/review-actions");
    const form = baseFinalizeForm();
    if (scenario !== "human-with-session") form.set("reviewSource", "CALIBRATION");
    if (scenario !== "missing-id") form.set("calibrationSessionId", "session-2");
    mocks.tx.calibrationSession.findFirst.mockResolvedValue(null);

    await expect(finalizeReview(form)).rejects.toThrow();
    expect(mocks.tx.review.create).not.toHaveBeenCalled();
    expect(mocks.tx.review.update).not.toHaveBeenCalled();
  });

  it("rejects calibration take-next before finalizing or leaving its session", async () => {
    const { finalizeReviewAndTakeNext } = await import("@/lib/review-actions");
    const form = baseFinalizeForm();
    form.set("reviewSource", "CALIBRATION");
    form.set("calibrationSessionId", "session-1");
    await expect(finalizeReviewAndTakeNext(form)).rejects.toThrow("QA-очереди");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("saves an incomplete draft without inventing a failed criterion score", async () => {
    const { saveReviewDraft, finalizeReview } = await import("@/lib/review-actions");
    const form = baseFinalizeForm();
    form.delete("criterion.crit-a.passed");
    await saveReviewDraft(form);
    expect(mocks.tx.review.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      totalScore: 0, status: "DRAFT", scores: { create: [expect.objectContaining({ passed: null, value: null, isNotApplicable: false })] }
    }) }));
    await expect(finalizeReview(form)).rejects.toThrow("Missing pass/fail score");
  });

  it("rejects stale rubric inputs before creating a review", async () => {
    const { saveReviewDraft } = await import("@/lib/review-actions");
    mocks.tx.scorecard.findFirst.mockResolvedValue({ id: "scorecard-1", version: 4, criteria: [] });
    await expect(saveReviewDraft(baseFinalizeForm())).rejects.toThrow("Форма оценки изменилась");
    expect(mocks.tx.review.create).not.toHaveBeenCalled();
  });

  it("enqueues a MESSAGING_DELIVERY job for the manager when a review is finalized", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    const formData = baseFinalizeForm();

    await finalizeReview(formData);

    expect(mocks.enqueueBackendJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        type: "MESSAGING_DELIVERY",
        payload: expect.objectContaining({
          eventType: "review.finalized",
          recipientType: "manager",
          context: expect.objectContaining({
            title: "Проверка завершена",
            body: "Оператор · 100 баллов",
            href: "/reviews/conversation-1"
          })
        })
      },
      mocks.tx
    );
  });

  it("pluralizes the score word in the manager notification", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    mocks.prisma.scorecard.findFirst.mockResolvedValue({
      id: "scorecard-1",
      version: 3,
      criteria: [
        { id: "crit-a", label: "Точность", kind: "PASS_FAIL", weight: 21 },
        { id: "crit-b", label: "Тон", kind: "PASS_FAIL", weight: 79 }
      ]
    });
    const formData = baseFinalizeForm();
    formData.set("criterion.crit-a.passed", "true");
    formData.set("criterion.crit-b.passed", "false");

    await finalizeReview(formData);

    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          context: expect.objectContaining({
            body: "Оператор · 21 балл"
          })
        })
      }),
      mocks.tx
    );
  });

  it("enqueues the finalize messaging job inside the same transaction client", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");

    await finalizeReview(baseFinalizeForm());

    const [, txClient] = mocks.enqueueBackendJob.mock.calls[0];
    expect(txClient).toBe(mocks.tx);
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

  it("rejects self-review when the conversation is not assigned to the reviewer", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      assigneeName: "Проверяющий",
      assigneeId: "other-agent",
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: null,
      qaAssigneeName: null,
      messages: []
    });
    const formData = baseFinalizeForm();
    formData.set("reviewSource", "SELF_REVIEW");

    await expect(finalizeReview(formData)).rejects.toThrow(
      "Оператор может отправить самопроверку только по своему диалогу."
    );

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.review.create).not.toHaveBeenCalled();
  });

  it("allows self-review when the conversation assigneeId matches the reviewer", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      assigneeName: "Проверяющий",
      assigneeId: "reviewer-1",
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: null,
      qaAssigneeName: null,
      messages: []
    });
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
      "conversation-1",
      undefined
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/reviews/conversation-next?saved=final");
  });

  it("passes returnTo queue filters into take-next after finalize", async () => {
    const { finalizeReviewAndTakeNext } = await import("@/lib/review-actions");
    const { filtersFromReviewsHref } = await import("@/lib/review/queue-href-filters");
    mocks.selectNextReviewConversationId.mockResolvedValue("conversation-next");

    const formData = baseFinalizeForm();
    formData.set("returnTo", "/reviews?due=overdue&process=ai_exception");

    await finalizeReviewAndTakeNext(formData);

    const filters = filtersFromReviewsHref("/reviews?due=overdue&process=ai_exception");
    expect(filters).toEqual(expect.objectContaining({ due: "overdue", process: "ai_exception" }));
    expect(mocks.selectNextReviewConversationId).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
      "conversation-1",
      filters
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/reviews/conversation-next?saved=final&returnTo=%2Freviews%3Fdue%3Doverdue%26process%3Dai_exception"
    );
  });

  it("refuses to finalize when every criterion is N/A (zero applicable weight)", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    mocks.prisma.scorecard.findFirst.mockResolvedValue({
      id: "scorecard-1",
      version: 3,
      criteria: [
        { id: "crit-a", label: "Точность", kind: "PASS_FAIL", weight: 50 },
        { id: "crit-b", label: "Тон", kind: "PASS_FAIL", weight: 50 }
      ]
    });
    const formData = baseFinalizeForm();
    formData.set("criterion.crit-a.notApplicable", "on");
    formData.set("criterion.crit-b.notApplicable", "on");

    await expect(finalizeReview(formData)).rejects.toThrow(
      "Нельзя завершить проверку без оценок по применимым критериям."
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to finalize an empty scorecard with no criteria", async () => {
    const { finalizeReview } = await import("@/lib/review-actions");
    mocks.prisma.scorecard.findFirst.mockResolvedValue({
      id: "scorecard-1",
      version: 3,
      criteria: []
    });

    await expect(finalizeReview(baseFinalizeForm())).rejects.toThrow(
      "Нельзя завершить проверку без оценок по применимым критериям."
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
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
