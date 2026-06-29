import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canManageReviewWorkflow: vi.fn(),
  canManageTraining: vi.fn(),
  canSaveReviewDraft: vi.fn(),
  canSelfReview: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  getActiveScorecard: vi.fn(),
  getConversationForReview: vi.fn(),
  notFound: vi.fn(),
  prisma: {
    user: {
      findMany: vi.fn()
    },
    aiQualityDraft: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn()
    },
    conversation: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound
}));

vi.mock("@/components/review/conversation-timeline", () => ({
  ConversationTimeline: () => <div data-testid="timeline" />
}));

vi.mock("@/components/review/ai-draft-decision-controls", () => ({
  AiDraftDecisionControls: ({ draftId }: { draftId: string }) => (
    <div data-testid="ai-draft-decision" data-draft-id={draftId} />
  )
}));

vi.mock("@/components/review/review-panel", () => ({
  ReviewPanel: ({ title, aiPredictions }: { title?: string; aiPredictions?: Record<string, unknown> }) => (
    <div data-testid="review-panel" data-ai-predictions={Object.keys(aiPredictions ?? {}).length}>
      {title}
    </div>
  )
}));

vi.mock("@/components/review/workflow-management-panel", () => ({
  WorkflowManagementPanel: () => <div data-testid="workflow-panel" />
}));

vi.mock("@/components/review/review-saved-toast", () => ({
  ReviewSavedToast: () => null
}));

vi.mock("@/components/ui/validated-submit-button", () => ({
  ValidatedSubmitButton: ({ children }: { children: ReactNode }) => <button>{children}</button>
}));

vi.mock("@/lib/current-user", () => ({
  canManageReviewWorkflow: mocks.canManageReviewWorkflow,
  canManageTraining: mocks.canManageTraining,
  canSaveReviewDraft: mocks.canSaveReviewDraft,
  canSelfReview: mocks.canSelfReview,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/feedback-actions", () => ({
  createTrainingAssignmentFromReview: vi.fn(),
  updateReviewFeedback: vi.fn()
}));

vi.mock("@/lib/review-repository", () => ({
  getActiveScorecard: mocks.getActiveScorecard,
  getConversationForReview: mocks.getConversationForReview
}));

function conversation() {
  return {
    id: "conversation-1",
    subject: "Диалог оператора",
    customerName: "Клиент",
    assigneeName: "Оператор",
    channel: "CHAT",
    status: "closed",
    messages: [],
    coachingPins: [],
    reviews: [],
    reviewDueAt: null,
    qaStatus: "IN_PROGRESS",
    qaAssigneeName: null,
    riskHint: null,
    samplingType: "MANUAL",
    csatScore: null,
    csatBucket: "NO_SCORE"
  };
}

describe("review detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "support-1",
      workspaceId: "workspace-1",
      role: "SUPPORT_AGENT",
      name: "Оператор"
    });
    mocks.canSaveReviewDraft.mockReturnValue(false);
    mocks.canSelfReview.mockReturnValue(true);
    mocks.canManageReviewWorkflow.mockReturnValue(false);
    mocks.canManageTraining.mockReturnValue(false);
    mocks.getConversationForReview.mockResolvedValue(conversation());
    mocks.getActiveScorecard.mockResolvedValue({
      id: "scorecard-1",
      version: 1,
      criteria: []
    });
    mocks.prisma.aiQualityDraft.findMany.mockResolvedValue([]);
    mocks.prisma.aiQualityDraft.findFirst.mockResolvedValue(null);
    mocks.prisma.aiQualityDraft.count.mockResolvedValue(0);
    // The workbench footer's "N из M" batch counter queries the priority-ordered
    // queue ids; an empty queue renders the neutral "Вне очереди" hint.
    mocks.prisma.conversation.findMany.mockResolvedValue([]);
  });

  it("renders the self-review form for support agents with self-review permission", async () => {
    const { ReviewDetailPageContent } = await import("@/app/reviews/[conversationId]/page");
    const page = await ReviewDetailPageContent({
      params: Promise.resolve({ conversationId: "conversation-1" }),
      searchParams: Promise.resolve({ reviewSource: "SELF_REVIEW" })
    });

    render(page);
    const reviewPanel = screen.getByTestId("review-panel");

    // canSaveReviewDraft gates calibration-pin visibility; for a support agent it
    // returns false, so pins stay hidden. The self-review permission path itself
    // still flows through canSelfReview.
    expect(mocks.canSaveReviewDraft).toHaveBeenCalledWith("SUPPORT_AGENT");
    expect(mocks.canSelfReview).toHaveBeenCalledWith("SUPPORT_AGENT");
    expect(mocks.getActiveScorecard).toHaveBeenCalledWith("workspace-1");
    expect(mocks.prisma.aiQualityDraft.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.aiQualityDraft.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.aiQualityDraft.count).not.toHaveBeenCalled();
    expect(screen.queryByText("ИИ-предложения")).toBeNull();
    expect(reviewPanel.textContent).toBe("Комментарий оператора");
    expect(reviewPanel.dataset.aiPredictions).toBe("0");
  });

  it("shows pending-first AI suggestions with full counts for QA roles", async () => {
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "qa-1",
      workspaceId: "workspace-1",
      role: "QA_ANALYST",
      name: "Проверяющий"
    });
    mocks.canSaveReviewDraft.mockReturnValue(true);
    mocks.canSelfReview.mockReturnValue(false);
    mocks.getActiveScorecard.mockResolvedValue({
      id: "scorecard-1",
      version: 1,
      criteria: []
    });
    mocks.prisma.aiQualityDraft.findMany
      .mockResolvedValueOnce([
        {
          id: "pending-1",
          kind: "coaching_suggestion",
          status: "draft",
          modelVersion: "quality-v2",
          promptVersion: "review-v4",
          suggestedValueJson: JSON.stringify({ summary: "Проверить тон ответа" }),
          evidenceRefsJson: JSON.stringify(["message-1"]),
          decisionReason: null,
          finalizedAt: null,
          createdAt: new Date("2026-06-01T10:00:00Z"),
          finalizedBy: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "decided-1",
          kind: "risk_tag",
          status: "approved",
          modelVersion: "quality-v2",
          promptVersion: "review-v4",
          suggestedValueJson: JSON.stringify({ risk: "medium" }),
          evidenceRefsJson: JSON.stringify(["message-2"]),
          decisionReason: "Совпадает с оценкой",
          finalizedAt: new Date("2026-06-01T11:00:00Z"),
          createdAt: new Date("2026-06-01T09:00:00Z"),
          finalizedBy: { name: "Проверяющий" }
        }
      ]);
    mocks.prisma.aiQualityDraft.count.mockResolvedValueOnce(9).mockResolvedValueOnce(3);

    const { ReviewDetailPageContent } = await import("@/app/reviews/[conversationId]/page");
    const page = await ReviewDetailPageContent({
      params: Promise.resolve({ conversationId: "conversation-1" }),
      searchParams: Promise.resolve({})
    });

    render(page);

    expect(mocks.prisma.aiQualityDraft.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: "conversation-1",
          status: "draft"
        })
      })
    );
    expect(mocks.prisma.aiQualityDraft.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: "conversation-1",
          status: { not: "draft" }
        })
      })
    );
    expect(screen.getByText("ИИ-предложения").textContent).toBe("ИИ-предложения");
    expect(screen.getAllByText("3/9").length).toBeGreaterThan(0);
    expect(screen.getByText(/Проверить тон ответа/).textContent).toContain("Проверить тон ответа");
    // The pending draft exposes accept/reject/override controls; the decided one does not.
    const decisionControls = screen.getAllByTestId("ai-draft-decision");
    expect(decisionControls).toHaveLength(1);
    expect(decisionControls[0].dataset.draftId).toBe("pending-1");
  });

  it("parses the latest score draft into per-criterion predictions for the panel", async () => {
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "qa-1",
      workspaceId: "workspace-1",
      role: "QA_ANALYST",
      name: "Проверяющий"
    });
    mocks.canSaveReviewDraft.mockReturnValue(true);
    mocks.canSelfReview.mockReturnValue(false);
    mocks.getActiveScorecard.mockResolvedValue({
      id: "scorecard-1",
      version: 1,
      criteria: []
    });
    mocks.prisma.aiQualityDraft.findMany.mockResolvedValue([]);
    mocks.prisma.aiQualityDraft.count.mockResolvedValue(0);
    mocks.prisma.aiQualityDraft.findFirst.mockResolvedValue({
      suggestedValueJson: JSON.stringify({
        overallConfidence: 0.82,
        summary: "Оценка ИИ",
        criteria: [
          { criterionId: "criterion-1", criterionKey: "tone", value: 2, confidence: 0.86, rationale: "Тон" },
          { criterionId: "criterion-2", criterionKey: "policy", passed: false, confidence: 0.7, rationale: "Регламент" }
        ]
      })
    });

    const { ReviewDetailPageContent } = await import("@/app/reviews/[conversationId]/page");
    const page = await ReviewDetailPageContent({
      params: Promise.resolve({ conversationId: "conversation-1" }),
      searchParams: Promise.resolve({})
    });

    render(page);

    expect(mocks.prisma.aiQualityDraft.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: "conversation-1",
          kind: "score"
        })
      })
    );
    expect(screen.getByTestId("review-panel").dataset.aiPredictions).toBe("2");
  });
});
