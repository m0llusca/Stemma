export type ReviewLifecycleReviewStatus = "DRAFT" | "FINALIZED";

export type ReviewFeedbackTransitionInput = {
  action: string;
  reviewStatus: ReviewLifecycleReviewStatus;
  feedbackStatus: string;
  appealStatus: string;
  reanswerStatus: string;
};

export class ReviewLifecycleTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewLifecycleTransitionError";
  }
}

export function assertSelfReviewScope(input: {
  reviewSource: string;
  userRole: string;
  userName: string;
  conversationAssigneeName: string | null;
}) {
  if (input.reviewSource !== "SELF_REVIEW") {
    return;
  }

  const assigneeName = input.conversationAssigneeName?.trim() ?? null;
  const userName = input.userName.trim();

  if (assigneeName === null || assigneeName !== userName) {
    throw new ReviewLifecycleTransitionError("Оператор может отправить самопроверку только по своему диалогу.");
  }
}

export function assertReviewCanFinalize(fromStatus: ReviewLifecycleReviewStatus | null) {
  if (fromStatus === "FINALIZED") {
    throw new ReviewLifecycleTransitionError("Завершенную проверку нельзя завершить повторно без пересмотра.");
  }
}

export function assertReviewCanSaveDraft(fromStatus: ReviewLifecycleReviewStatus | null) {
  if (fromStatus === "FINALIZED") {
    throw new ReviewLifecycleTransitionError("Завершенную проверку нельзя перезаписать как черновик.");
  }
}

export function assertFeedbackTransition(input: ReviewFeedbackTransitionInput) {
  if (input.reviewStatus !== "FINALIZED") {
    throw new ReviewLifecycleTransitionError("Обратная связь доступна только для завершенной проверки.");
  }

  switch (input.action) {
    case "acknowledged":
      if (input.appealStatus === "open") {
        throw new ReviewLifecycleTransitionError("Нельзя подтвердить обратную связь, пока апелляция открыта.");
      }

      if (["acknowledged", "corrected"].includes(input.feedbackStatus)) {
        throw new ReviewLifecycleTransitionError("Обратная связь уже закрыта.");
      }
      return;

    case "appeal_opened":
      if (["acknowledged", "corrected"].includes(input.feedbackStatus)) {
        throw new ReviewLifecycleTransitionError("Нельзя открыть апелляцию по закрытой обратной связи.");
      }

      if (input.appealStatus !== "none") {
        throw new ReviewLifecycleTransitionError("Апелляция по этой проверке уже создана или закрыта.");
      }
      return;

    case "appeal_confirmed":
    case "appeal_corrected":
      if (input.appealStatus !== "open") {
        throw new ReviewLifecycleTransitionError("Закрыть можно только открытую апелляцию.");
      }
      return;

    case "reanswer_requested":
      if (!["not_needed", "required"].includes(input.reanswerStatus)) {
        throw new ReviewLifecycleTransitionError("Переответ уже запрошен или завершен.");
      }
      return;

    case "reanswer_completed":
      if (input.reanswerStatus !== "requested") {
        throw new ReviewLifecycleTransitionError("Переответ можно закрыть только после запроса.");
      }
      return;

    default:
      throw new ReviewLifecycleTransitionError("Некорректное действие обратной связи.");
  }
}

export function reviewFeedbackTransitionStatuses(input: ReviewFeedbackTransitionInput) {
  if (input.action === "acknowledged") {
    return { fromStatus: input.feedbackStatus, toStatus: "acknowledged" };
  }

  if (input.action === "appeal_opened") {
    return { fromStatus: input.appealStatus, toStatus: "open" };
  }

  if (input.action === "appeal_confirmed") {
    return { fromStatus: input.appealStatus, toStatus: "confirmed" };
  }

  if (input.action === "appeal_corrected") {
    return { fromStatus: input.appealStatus, toStatus: "corrected" };
  }

  if (input.action === "reanswer_requested") {
    return { fromStatus: input.reanswerStatus, toStatus: "requested" };
  }

  if (input.action === "reanswer_completed") {
    return { fromStatus: input.reanswerStatus, toStatus: "completed" };
  }

  return { fromStatus: null, toStatus: null };
}
