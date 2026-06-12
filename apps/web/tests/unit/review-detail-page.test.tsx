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
    }
  }
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound
}));

vi.mock("@/components/review/conversation-timeline", () => ({
  ConversationTimeline: () => <div data-testid="timeline" />
}));

vi.mock("@/components/review/review-panel", () => ({
  ReviewPanel: ({ title }: { title?: string }) => <div data-testid="review-panel">{title}</div>
}));

vi.mock("@/components/review/workflow-management-panel", () => ({
  WorkflowManagementPanel: () => <div data-testid="workflow-panel" />
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
  });

  it("renders the self-review form for support agents with self-review permission", async () => {
    const { default: ReviewDetailPage } = await import("@/app/reviews/[conversationId]/page");
    const page = await ReviewDetailPage({
      params: Promise.resolve({ conversationId: "conversation-1" }),
      searchParams: Promise.resolve({ reviewSource: "SELF_REVIEW" })
    });

    render(page);

    // canSaveReviewDraft gates calibration-pin visibility; for a support agent it
    // returns false, so pins stay hidden. The self-review permission path itself
    // still flows through canSelfReview.
    expect(mocks.canSaveReviewDraft).toHaveBeenCalledWith("SUPPORT_AGENT");
    expect(mocks.canSelfReview).toHaveBeenCalledWith("SUPPORT_AGENT");
    expect(mocks.getActiveScorecard).toHaveBeenCalledWith("workspace-1");
    expect(screen.getByTestId("review-panel").textContent).toBe("Комментарий оператора");
  });
});
