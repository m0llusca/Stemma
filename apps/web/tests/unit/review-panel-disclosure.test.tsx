import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CoachingAction, CriterionScore, Finding, Message, Review, Scorecard, ScorecardCriterion } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetReviewDisclosureMemory } from "@/components/review/review-disclosure";
import { ReviewPanel } from "@/components/review/review-panel";
import { ToastProvider } from "@/components/ui/toast";
import { submitReviewState } from "@/lib/review-panel-actions";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() })
}));

vi.mock("@/lib/review-panel-actions", () => ({
  submitReviewState: vi.fn(async () => null)
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
});

const scorecard: Scorecard & { criteria: ScorecardCriterion[] } = {
  id: "scorecard-1",
  workspaceId: "workspace-1",
  name: "Основная форма",
  version: 1,
  isActive: true,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  criteria: [
    {
      id: "criterion-1",
      scorecardId: "scorecard-1",
      key: "resolution",
      label: "Решение",
      block: "Результат",
      kind: "PASS_FAIL",
      weight: 60,
      required: true,
      order: 1
    },
    {
      id: "criterion-2",
      scorecardId: "scorecard-1",
      key: "tone",
      label: "Тон",
      block: "Результат",
      kind: "SCALE_1_3",
      weight: 40,
      required: true,
      order: 2
    }
  ]
};

const messages: Message[] = [
  {
    id: "message-1",
    conversationId: "conversation-1",
    externalId: "external-message-1",
    participantType: "HUMAN_AGENT",
    authorName: "Оператор",
    body: "Предложил клиенту корректный вариант решения.",
    sentAt: new Date("2026-07-01T10:00:00.000Z"),
    isPrivate: false,
    createdAt: new Date("2026-07-01T10:00:00.000Z")
  }
];

const draftScore: CriterionScore = {
  id: "score-2",
  reviewId: "review-1",
  criterionId: "criterion-2",
  value: 3,
  passed: true,
  isNotApplicable: false,
  comment: "",
  evidenceMessageId: "message-1"
};

const draftReview: Review & {
  scores: CriterionScore[];
  findings: (Finding & { coachingAction: CoachingAction | null })[];
} = {
  id: "review-1",
  conversationId: "conversation-1",
  workspaceId: "workspace-1",
  reviewerId: "qa-1",
  scorecardId: "scorecard-1",
  status: "DRAFT",
  reviewSource: "HUMAN",
  rubricVersion: 1,
  totalScore: 100,
  confidence: null,
  summary: "",
  criticalError: false,
  criticalCategory: null,
  needsReanswer: false,
  reanswerStatus: "not_needed",
  feedbackStatus: "new",
  feedbackComment: "",
  positiveNotes: "",
  instructionLinks: "",
  feedbackAckAt: null,
  feedbackAckBy: null,
  appealStatus: "none",
  appealDueAt: null,
  appealResolvedAt: null,
  calibrationStatus: "none",
  calibrationNotes: "",
  selfReviewNotes: "",
  createdAt: new Date("2026-07-01T10:00:00.000Z"),
  updatedAt: new Date("2026-07-01T10:00:00.000Z"),
  finalizedAt: null,
  scores: [draftScore],
  findings: []
};

function renderPanel(
  props?: Partial<Parameters<typeof ReviewPanel>[0]>
) {
  return render(
    <ToastProvider>
      <ReviewPanel
        conversationId="conversation-1"
        messages={messages}
        scorecard={scorecard}
        {...props}
      />
    </ToastProvider>
  );
}

describe("ReviewPanel criterion disclosures", () => {
  beforeEach(() => {
    resetReviewDisclosureMemory();
    vi.mocked(submitReviewState).mockClear();
  });

  it("expands and collapses score modules without submitting the review form", () => {
    renderPanel();

    const first = screen.getByRole("button", { name: /Решение/ });
    const second = screen.getByRole("button", { name: /Тон/ });

    expect(first).toHaveAttribute("type", "button");
    expect(second).toHaveAttribute("type", "button");
    expect(first.className).toContain("min-h-[52px]");
    expect(second.className).toContain("min-h-[52px]");
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radiogroup", { name: "Оценка" })).toBeVisible();

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "false");

    expect(submitReviewState).not.toHaveBeenCalled();
  });

  it("expands a closed score module with Enter and collapses with Escape", () => {
    renderPanel();

    const second = screen.getByRole("button", { name: /Тон/ });
    expect(second).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radiogroup", { name: "Оценка" })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(second).toHaveAttribute("aria-expanded", "false");
    expect(submitReviewState).not.toHaveBeenCalled();
  });

  it("keeps the evidence jump link out of the criterion trigger", () => {
    renderPanel({ draftReview });

    const trigger = screen.getByRole("button", { name: /Тон/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger.querySelector("a")).toBeNull();
    expect(trigger).toHaveTextContent("доказательство");

    const jump = screen.getByRole("link", { name: /Перейти к сообщению-доказательству/ });
    expect(jump).toBeInTheDocument();
    expect(trigger.contains(jump)).toBe(false);

    fireEvent.click(jump);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(submitReviewState).not.toHaveBeenCalled();
  });

  it("collapses the step disclosure and keeps it closed after remount", () => {
    const { unmount } = renderPanel();

    const step = screen.getByRole("button", { name: /Оценка по критериям/ });
    expect(step).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(step);
    expect(step).toHaveAttribute("aria-expanded", "false");

    unmount();
    renderPanel();

    expect(screen.getByRole("button", { name: /Оценка по критериям/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(submitReviewState).not.toHaveBeenCalled();
  });

  it("collapses an initially open issue criterion and survives remount", () => {
    const failingScore: CriterionScore = {
      ...draftScore,
      criterionId: "criterion-1",
      passed: false,
      value: 2,
      comment: "неверная маршрутизация"
    };
    const issueReview = {
      ...draftReview,
      scores: [failingScore]
    };

    const { unmount } = renderPanel({ draftReview: issueReview });
    const trigger = screen.getByRole("button", { name: /Решение/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    unmount();
    renderPanel({ draftReview: issueReview });

    expect(screen.getByRole("button", { name: /Решение/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});
