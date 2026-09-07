import type { QaStatus } from "@prisma/client";

export type ReviewState = "queued" | "assigned" | "in_progress" | "finalized" | "reopened";

/** Chip tone for the shared queue/preview status chip (subset of UI ChipTone). */
export type ReviewStatusChipTone = "warning" | "accent" | "neutral";

export const reviewStateLabels: Record<ReviewState, string> = {
  queued: "В очереди",
  assigned: "Назначена",
  in_progress: "В работе",
  finalized: "Завершена",
  reopened: "На пересмотре"
};

export const pendingReopenLabel = "Ожидает подтверждения";

export const qaStatusToReviewState: Record<QaStatus, ReviewState> = {
  QUEUED: "queued",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  FINALIZED: "finalized",
  REOPENED: "reopened"
};

export function resolveReviewState({
  qaStatus,
  hasDraftReview,
  hasFinalizedReview
}: {
  qaStatus: QaStatus;
  hasDraftReview: boolean;
  hasFinalizedReview: boolean;
}): ReviewState {
  if (qaStatus === "REOPENED") {
    return "reopened";
  }

  if (hasFinalizedReview || qaStatus === "FINALIZED") {
    return "finalized";
  }

  if (hasDraftReview || qaStatus === "IN_PROGRESS") {
    return "in_progress";
  }

  if (qaStatus === "ASSIGNED") {
    return "assigned";
  }

  return "queued";
}

export function reviewStateChipTone(state: ReviewState): ReviewStatusChipTone {
  if (state === "reopened") {
    return "warning";
  }

  if (state === "assigned" || state === "in_progress") {
    return "accent";
  }

  return "neutral";
}

type QueueStatusConversation = {
  qaStatus: QaStatus;
  pendingReopen?: unknown;
  reviews: Array<{ status: string; reviewSource: string }>;
};

export function queueConversationReviewFlags(conversation: QueueStatusConversation) {
  const hasDraftReview = conversation.reviews.some(
    (review) => review.status === "DRAFT" && review.reviewSource === "HUMAN"
  );
  const hasFinalizedReview =
    conversation.qaStatus === "FINALIZED" &&
    conversation.reviews.some((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN");

  return { hasDraftReview, hasFinalizedReview };
}

/**
 * Single status chip for the queue row and next-case preview.
 * Pending reopen overrides the derived review state, matching the inbox chip.
 */
export function resolveQueueStatusChip(conversation: QueueStatusConversation): {
  state: ReviewState;
  label: string;
  tone: ReviewStatusChipTone;
} {
  const flags = queueConversationReviewFlags(conversation);
  const state = resolveReviewState({
    qaStatus: conversation.qaStatus,
    ...flags
  });

  if (conversation.pendingReopen) {
    return { state, label: pendingReopenLabel, tone: "warning" };
  }

  return { state, label: reviewStateLabels[state], tone: reviewStateChipTone(state) };
}

export function reviewStateBadgeClass(state: ReviewState) {
  if (state === "finalized") {
    return "bg-[#e8f3ef] text-[#116466]";
  }

  if (state === "reopened") {
    return "bg-[#fff4ed] text-[#b54708]";
  }

  if (state === "in_progress" || state === "assigned") {
    return "bg-[#eef4f4] text-[#0b4f52]";
  }

  return "bg-[#f7f8fb] text-[#667085]";
}
