import { beforeEach, describe, expect, it, vi } from "vitest";

const draftCreateMock = vi.fn();
const draftUpdateManyMock = vi.fn();
const draftFindUniqueOrThrowMock = vi.fn();
const draftUpdateMock = vi.fn();
const auditLogMock = vi.fn();
const transactionMock = vi.fn();
const scorecardFindFirstMock = vi.fn();
const messageFindManyMock = vi.fn();
const conversationFindFirstMock = vi.fn();
const conversationUpdateManyMock = vi.fn();
const reviewFindFirstMock = vi.fn();
const reviewCreateMock = vi.fn();
const reviewUpdateMock = vi.fn();
const criterionScoreDeleteManyMock = vi.fn();
const reviewEventCreateMock = vi.fn();
const userFindFirstMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: transactionMock,
    aiQualityDraft: {
      create: draftCreateMock,
      updateMany: draftUpdateManyMock,
      findUniqueOrThrow: draftFindUniqueOrThrowMock,
      update: draftUpdateMock
    }
  }
}));

vi.mock("@/lib/audit", () => ({
  auditLog: auditLogMock
}));

function txClient() {
  return {
    aiQualityDraft: {
      updateMany: draftUpdateManyMock,
      findUniqueOrThrow: draftFindUniqueOrThrowMock,
      update: draftUpdateMock
    },
    scorecard: { findFirst: scorecardFindFirstMock },
    message: { findMany: messageFindManyMock },
    conversation: {
      findFirst: conversationFindFirstMock,
      updateMany: conversationUpdateManyMock
    },
    review: {
      findFirst: reviewFindFirstMock,
      create: reviewCreateMock,
      update: reviewUpdateMock
    },
    criterionScore: { deleteMany: criterionScoreDeleteManyMock },
    reviewEvent: { findFirst: vi.fn().mockResolvedValue(null), create: reviewEventCreateMock },
    user: { findFirst: userFindFirstMock }
  };
}

const scorePrediction = {
  overallConfidence: 0.91,
  summary: "AI summary",
  criteria: [
    {
      criterionId: "crit-1",
      criterionKey: "tone",
      value: 3,
      confidence: 0.9,
      rationale: "Вежливо",
      evidenceRef: "msg-1"
    },
    {
      criterionId: "crit-2",
      criterionKey: "policy",
      passed: true,
      confidence: 0.85,
      rationale: "По политике"
    }
  ]
};

describe("AI Quality Ops drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback) => callback(txClient()));
    userFindFirstMock.mockResolvedValue({ name: "Аналитик" });
  });

  it("creates advisory drafts that are not final decisions", async () => {
    const { createAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftCreateMock.mockResolvedValue({
      id: "draft-1",
      status: "draft",
      kind: "risk_tag",
      suggestedValueJson: JSON.stringify({ risk: "HIGH" }),
      evidenceRefsJson: JSON.stringify(["message-1"])
    });

    await createAiQualityDraft({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      kind: "risk_tag",
      modelVersion: "ai-quality-v1",
      promptVersion: "risk-v1",
      suggestedValue: { risk: "HIGH" },
      evidenceRefs: ["message-1"]
    });

    expect(draftCreateMock.mock.calls[0][0].data.status).toBe("draft");
    expect(draftCreateMock.mock.calls[0][0].data.finalizedById).toBeNull();
    expect(draftCreateMock.mock.calls[0][0].data.suggestedValueJson).toBe(JSON.stringify({ risk: "HIGH" }));
    expect(draftCreateMock.mock.calls[0][0].data.evidenceRefsJson).toBe(JSON.stringify(["message-1"]));
  });

  it("requires a human actor to approve or reject a draft", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    await expect(
      decideAiQualityDraft({
        draftId: "draft-1",
        decision: "approved",
        actorId: "",
        workspaceId: "workspace-1",
        reason: "Looks right"
      })
    ).rejects.toThrow("Решение по AI-черновику требует участия человека.");
  });

  it("persists changed AI suggestions as a human decision with audit and draft-only guard", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    const now = new Date("2026-06-28T09:45:00.000Z");
    draftUpdateManyMock.mockResolvedValue({ count: 1 });
    draftFindUniqueOrThrowMock.mockResolvedValue({
      id: "draft-1",
      conversationId: "conversation-1",
      reviewId: null,
      kind: "risk_tag",
      status: "changed",
      suggestedValueJson: JSON.stringify({ risk: "MEDIUM" })
    });

    await decideAiQualityDraft({
      draftId: "draft-1",
      decision: "changed",
      actorId: "user-1",
      workspaceId: "workspace-1",
      reason: "Evidence says medium risk.",
      changedValue: { risk: "MEDIUM" },
      decidedAt: now
    });

    expect(draftUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "draft-1", status: "draft" },
      data: {
        status: "changed",
        finalizedById: "user-1",
        finalizedAt: now,
        decisionReason: "Evidence says medium risk.",
        suggestedValueJson: JSON.stringify({ risk: "MEDIUM" })
      }
    });
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_quality.draft.decided",
        targetId: "draft-1",
        metadata: expect.objectContaining({ decision: "changed" })
      }),
      expect.anything()
    );
    expect(reviewCreateMock).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an already-decided draft", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftUpdateManyMock.mockResolvedValue({ count: 0 });

    await expect(
      decideAiQualityDraft({
        draftId: "draft-1",
        decision: "approved",
        actorId: "user-1",
        workspaceId: "workspace-1"
      })
    ).rejects.toThrow("Предложение ИИ уже решено или не найдено.");
  });

  it("on score approve creates a DRAFT Review with CriterionScores and does not finalize", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftUpdateManyMock.mockResolvedValue({ count: 1 });
    draftFindUniqueOrThrowMock
      .mockResolvedValueOnce({
        id: "draft-score",
        conversationId: "conversation-1",
        reviewId: null,
        kind: "score",
        status: "approved",
        suggestedValueJson: JSON.stringify(scorePrediction)
      })
      .mockResolvedValueOnce({
        id: "draft-score",
        conversationId: "conversation-1",
        reviewId: "review-1",
        kind: "score",
        status: "approved",
        suggestedValueJson: JSON.stringify(scorePrediction)
      });
    scorecardFindFirstMock.mockResolvedValue({
      id: "scorecard-1",
      version: 2,
      criteria: [
        { id: "crit-1", key: "tone", kind: "SCALE_1_3", label: "Тон", weight: 50 },
        { id: "crit-2", key: "policy", kind: "PASS_FAIL", label: "Политика", weight: 50 }
      ]
    });
    messageFindManyMock.mockResolvedValue([{ id: "msg-1" }]);
    conversationFindFirstMock.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "ASSIGNED",
      qaAssigneeId: null,
      qaAssigneeName: null
    });
    reviewFindFirstMock.mockResolvedValue(null);
    reviewCreateMock.mockResolvedValue({ id: "review-1" });
    draftUpdateMock.mockResolvedValue({ id: "draft-score", reviewId: "review-1" });
    conversationUpdateManyMock.mockResolvedValue({ count: 1 });

    await decideAiQualityDraft({
      draftId: "draft-score",
      decision: "approved",
      actorId: "user-1",
      workspaceId: "workspace-1"
    });

    expect(reviewCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          reviewSource: "HUMAN",
          reviewerId: "user-1",
          totalScore: 100,
          scores: {
            create: expect.arrayContaining([
              expect.objectContaining({ criterionId: "crit-1", value: 3 }),
              expect.objectContaining({ criterionId: "crit-2", passed: true })
            ])
          }
        })
      })
    );
    expect(reviewCreateMock.mock.calls[0][0].data).not.toHaveProperty("finalizedAt");
    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft-score" },
      data: { reviewId: "review-1" }
    });
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_quality.draft.scores_applied", targetId: "review-1" }),
      expect.anything()
    );
    expect(reviewEventCreateMock).toHaveBeenCalled();
  });

  it("on score reject does not write Review or CriterionScore rows", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftUpdateManyMock.mockResolvedValue({ count: 1 });
    draftFindUniqueOrThrowMock.mockResolvedValue({
      id: "draft-score",
      conversationId: "conversation-1",
      reviewId: null,
      kind: "score",
      status: "rejected",
      suggestedValueJson: JSON.stringify(scorePrediction)
    });

    await decideAiQualityDraft({
      draftId: "draft-score",
      decision: "rejected",
      actorId: "user-1",
      workspaceId: "workspace-1",
      reason: "Нет"
    });

    expect(reviewCreateMock).not.toHaveBeenCalled();
    expect(reviewUpdateMock).not.toHaveBeenCalled();
    expect(criterionScoreDeleteManyMock).not.toHaveBeenCalled();
    expect(auditLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_quality.draft.scores_applied" }),
      expect.anything()
    );
  });

  it("replaces scores on an existing DRAFT review with previous-score audit trail", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftUpdateManyMock.mockResolvedValue({ count: 1 });
    draftFindUniqueOrThrowMock.mockResolvedValue({
      id: "draft-score",
      conversationId: "conversation-1",
      reviewId: "review-existing",
      kind: "score",
      status: "approved",
      suggestedValueJson: JSON.stringify(scorePrediction)
    });
    scorecardFindFirstMock.mockResolvedValue({
      id: "scorecard-1",
      version: 2,
      criteria: [
        { id: "crit-1", key: "tone", kind: "SCALE_1_3", label: "Тон", weight: 50 },
        { id: "crit-2", key: "policy", kind: "PASS_FAIL", label: "Политика", weight: 50 }
      ]
    });
    messageFindManyMock.mockResolvedValue([{ id: "msg-1" }]);
    conversationFindFirstMock.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: "user-1",
      qaAssigneeName: "Аналитик"
    });
    reviewFindFirstMock.mockResolvedValue({
      id: "review-existing",
      status: "DRAFT",
      reviewerId: "user-1",
      reviewSource: "HUMAN",
      totalScore: 50,
      scores: [{ criterionId: "crit-1", value: 1, passed: null, isNotApplicable: false }]
    });
    reviewUpdateMock.mockResolvedValue({ id: "review-existing" });
    criterionScoreDeleteManyMock.mockResolvedValue({ count: 1 });

    await decideAiQualityDraft({
      draftId: "draft-score",
      decision: "approved",
      actorId: "user-1",
      workspaceId: "workspace-1"
    });

    expect(criterionScoreDeleteManyMock).toHaveBeenCalledWith({ where: { reviewId: "review-existing" } });
    expect(reviewUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "review-existing" },
        data: expect.objectContaining({ status: "DRAFT", finalizedAt: null })
      })
    );
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_quality.draft.scores_applied",
        metadata: expect.objectContaining({
          previousTotalScore: 50,
          previousScores: [{ criterionId: "crit-1", value: 1, passed: null, isNotApplicable: false }]
        })
      }),
      expect.anything()
    );
  });

  it("is idempotent when draft scores are already applied on the linked DRAFT review", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftUpdateManyMock.mockResolvedValue({ count: 1 });
    draftFindUniqueOrThrowMock.mockResolvedValue({
      id: "draft-score",
      conversationId: "conversation-1",
      reviewId: "review-existing",
      kind: "score",
      status: "approved",
      suggestedValueJson: JSON.stringify(scorePrediction)
    });
    scorecardFindFirstMock.mockResolvedValue({
      id: "scorecard-1",
      version: 2,
      criteria: [
        { id: "crit-1", key: "tone", kind: "SCALE_1_3", label: "Тон", weight: 50 },
        { id: "crit-2", key: "policy", kind: "PASS_FAIL", label: "Политика", weight: 50 }
      ]
    });
    messageFindManyMock.mockResolvedValue([{ id: "msg-1" }]);
    conversationFindFirstMock.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: "user-1",
      qaAssigneeName: "Аналитик"
    });
    reviewFindFirstMock.mockResolvedValue({
      id: "review-existing",
      status: "DRAFT",
      reviewerId: "user-1",
      reviewSource: "HUMAN",
      totalScore: 100,
      scores: [
        { criterionId: "crit-1", value: 3, passed: null, isNotApplicable: false },
        { criterionId: "crit-2", value: null, passed: true, isNotApplicable: false }
      ]
    });

    await decideAiQualityDraft({
      draftId: "draft-score",
      decision: "approved",
      actorId: "user-1",
      workspaceId: "workspace-1"
    });

    expect(criterionScoreDeleteManyMock).not.toHaveBeenCalled();
    expect(reviewUpdateMock).not.toHaveBeenCalled();
    expect(reviewCreateMock).not.toHaveBeenCalled();
    expect(reviewEventCreateMock).not.toHaveBeenCalled();
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_quality.draft.scores_applied",
        metadata: expect.objectContaining({ scoresIdentical: true })
      }),
      expect.anything()
    );
  });

  it("fails closed when score payload cannot align to the active scorecard", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftUpdateManyMock.mockResolvedValue({ count: 1 });
    draftFindUniqueOrThrowMock.mockResolvedValue({
      id: "draft-score",
      conversationId: "conversation-1",
      reviewId: null,
      kind: "score",
      status: "approved",
      suggestedValueJson: JSON.stringify({
        overallConfidence: 0.2,
        summary: "mismatch",
        criteria: [{ criterionId: "other", criterionKey: "other", value: 2, confidence: 0.2, rationale: "" }]
      })
    });
    scorecardFindFirstMock.mockResolvedValue({
      id: "scorecard-1",
      version: 2,
      criteria: [{ id: "crit-1", key: "tone", kind: "SCALE_1_3", label: "Тон", weight: 50 }]
    });
    messageFindManyMock.mockResolvedValue([]);
    conversationFindFirstMock.mockResolvedValue({
      id: "conversation-1",
      qaStatus: "QUEUED",
      qaAssigneeId: null,
      qaAssigneeName: null
    });

    await expect(
      decideAiQualityDraft({
        draftId: "draft-score",
        decision: "approved",
        actorId: "user-1",
        workspaceId: "workspace-1"
      })
    ).rejects.toThrow(/не совпала с критериями/i);

    expect(reviewCreateMock).not.toHaveBeenCalled();
  });
});
