import { describe, expect, it } from "vitest";
import {
  ReviewLifecycleTransitionError,
  assertFeedbackTransition,
  assertReviewCanFinalize,
  assertReviewCanSaveDraft,
  assertSelfReviewScope,
  reviewFeedbackTransitionStatuses
} from "@/lib/review-lifecycle";

describe("review lifecycle policy", () => {
  it("blocks duplicate finalization and finalized draft rewrites", () => {
    expect(() => assertReviewCanFinalize("DRAFT")).not.toThrow();
    expect(() => assertReviewCanFinalize(null)).not.toThrow();
    expect(() => assertReviewCanFinalize("FINALIZED")).toThrow(ReviewLifecycleTransitionError);
    expect(() => assertReviewCanSaveDraft("FINALIZED")).toThrow("Завершенную проверку нельзя перезаписать как черновик.");
  });

  it("allows only valid feedback and appeal transitions from finalized reviews", () => {
    expect(() =>
      assertFeedbackTransition({
        action: "appeal_opened",
        reviewStatus: "FINALIZED",
        feedbackStatus: "new",
        appealStatus: "none",
        reanswerStatus: "not_needed"
      })
    ).not.toThrow();
    expect(() =>
      assertFeedbackTransition({
        action: "appeal_confirmed",
        reviewStatus: "FINALIZED",
        feedbackStatus: "appeal",
        appealStatus: "none",
        reanswerStatus: "not_needed"
      })
    ).toThrow("Закрыть можно только открытую апелляцию.");
    expect(() =>
      assertFeedbackTransition({
        action: "acknowledged",
        reviewStatus: "DRAFT",
        feedbackStatus: "new",
        appealStatus: "none",
        reanswerStatus: "not_needed"
      })
    ).toThrow("Обратная связь доступна только для завершенной проверки.");
  });

  it("keeps feedback acknowledgement and reanswer transitions explicit", () => {
    expect(() =>
      assertFeedbackTransition({
        action: "acknowledged",
        reviewStatus: "FINALIZED",
        feedbackStatus: "appeal",
        appealStatus: "open",
        reanswerStatus: "not_needed"
      })
    ).toThrow("Нельзя подтвердить обратную связь, пока апелляция открыта.");

    expect(() =>
      assertFeedbackTransition({
        action: "reanswer_requested",
        reviewStatus: "FINALIZED",
        feedbackStatus: "new",
        appealStatus: "none",
        reanswerStatus: "required"
      })
    ).not.toThrow();

    expect(() =>
      assertFeedbackTransition({
        action: "reanswer_requested",
        reviewStatus: "FINALIZED",
        feedbackStatus: "new",
        appealStatus: "none",
        reanswerStatus: "completed"
      })
    ).toThrow("Переответ уже запрошен или завершен.");

    expect(() =>
      assertFeedbackTransition({
        action: "reanswer_requested",
        reviewStatus: "FINALIZED",
        feedbackStatus: "new",
        appealStatus: "none",
        reanswerStatus: "requested"
      })
    ).toThrow("Переответ уже запрошен или завершен.");
  });

  it("restricts self-review to owned conversations for every role", () => {
    expect(() =>
      assertSelfReviewScope({
        reviewSource: "SELF_REVIEW",
        userRole: "SUPPORT_AGENT",
        userName: "Анна",
        conversationAssigneeName: "Иван"
      })
    ).toThrow("Оператор может отправить самопроверку только по своему диалогу.");

    expect(() =>
      assertSelfReviewScope({
        reviewSource: "SELF_REVIEW",
        userRole: "QA_ANALYST",
        userName: "Мария",
        conversationAssigneeName: "Иван"
      })
    ).toThrow("Оператор может отправить самопроверку только по своему диалогу.");

    expect(() =>
      assertSelfReviewScope({
        reviewSource: "SELF_REVIEW",
        userRole: "SUPPORT_AGENT",
        userName: "Анна",
        conversationAssigneeName: "Анна"
      })
    ).not.toThrow();
  });

  it("normalizes whitespace and rejects unassigned conversations in self-review scope", () => {
    expect(() =>
      assertSelfReviewScope({
        reviewSource: "SELF_REVIEW",
        userRole: "SUPPORT_AGENT",
        userName: "Анна ",
        conversationAssigneeName: " Анна"
      })
    ).not.toThrow();

    expect(() =>
      assertSelfReviewScope({
        reviewSource: "SELF_REVIEW",
        userRole: "SUPPORT_AGENT",
        userName: "Анна",
        conversationAssigneeName: null
      })
    ).toThrow("Оператор может отправить самопроверку только по своему диалогу.");

    expect(() =>
      assertSelfReviewScope({
        reviewSource: "HUMAN",
        userRole: "QA_ANALYST",
        userName: "Мария",
        conversationAssigneeName: null
      })
    ).not.toThrow();
  });

  it("maps feedback transitions into event status changes", () => {
    expect(
      reviewFeedbackTransitionStatuses({
        action: "reanswer_completed",
        reviewStatus: "FINALIZED",
        feedbackStatus: "new",
        appealStatus: "none",
        reanswerStatus: "requested"
      })
    ).toEqual({
      fromStatus: "requested",
      toStatus: "completed"
    });
  });
});
