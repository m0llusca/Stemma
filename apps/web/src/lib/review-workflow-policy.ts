import type { QaStatus } from "@prisma/client";

export const qaWorkflowStatuses = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const satisfies readonly QaStatus[];

const allowedTransitions = {
  QUEUED: ["ASSIGNED", "IN_PROGRESS"],
  ASSIGNED: ["IN_PROGRESS", "QUEUED"],
  IN_PROGRESS: ["FINALIZED", "REOPENED", "QUEUED"],
  FINALIZED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "FINALIZED"]
} as const satisfies Record<QaStatus, readonly QaStatus[]>;

export class QaWorkflowTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaWorkflowTransitionError";
  }
}

export function isCurrentCycleFinalizedReview(input: {
  status: string;
  reviewSource: string;
  finalizedAt: Date | null;
  latestReopenedAt: Date | null;
}) {
  if (input.status !== "FINALIZED" || input.reviewSource !== "HUMAN" || !input.finalizedAt) {
    return false;
  }

  return input.latestReopenedAt === null || input.finalizedAt > input.latestReopenedAt;
}

export function hasCurrentCycleFinalizedReview(
  reviews: Array<{ status: string; reviewSource: string; finalizedAt: Date | null }>,
  latestReopenedAt: Date | null
) {
  return reviews.some((review) => isCurrentCycleFinalizedReview({ ...review, latestReopenedAt }));
}

export function assertQaWorkflowTransition(input: {
  fromStatus: QaStatus;
  toStatus: QaStatus;
  hasFinalizedReview?: boolean;
}) {
  if (!qaWorkflowStatuses.includes(input.fromStatus) || !qaWorkflowStatuses.includes(input.toStatus)) {
    throw new QaWorkflowTransitionError("Некорректное состояние проверки.");
  }

  if (input.toStatus === "FINALIZED" && !input.hasFinalizedReview) {
    throw new QaWorkflowTransitionError("Нельзя вручную завершить проверку без завершенного ревью.");
  }

  if (input.fromStatus === input.toStatus) {
    return;
  }

  if (!(allowedTransitions[input.fromStatus] as readonly QaStatus[]).includes(input.toStatus)) {
    throw new QaWorkflowTransitionError(`Недопустимый переход состояния проверки: ${input.fromStatus} -> ${input.toStatus}.`);
  }
}

export function assertHumanReviewFinalizeTransition(input: { fromStatus: QaStatus }) {
  if (input.fromStatus === "FINALIZED") {
    throw new QaWorkflowTransitionError("Завершенный диалог нужно сначала переоткрыть для нового цикла проверки.");
  }

  assertQaWorkflowTransition({
    fromStatus: input.fromStatus,
    toStatus: "FINALIZED",
    hasFinalizedReview: true
  });
}

export function assertConditionalWorkflowWrite(count: number) {
  if (count !== 1) {
    throw new QaWorkflowTransitionError("Статус проверки изменился. Обновите страницу и повторите действие.");
  }
}
