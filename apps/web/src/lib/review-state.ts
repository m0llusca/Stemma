import type { QaStatus } from "@prisma/client";

export type ReviewState = "queued" | "assigned" | "in_progress" | "finalized" | "reopened";

export const reviewStateLabels: Record<ReviewState, string> = {
  queued: "В очереди",
  assigned: "Назначена",
  in_progress: "В работе",
  finalized: "Завершена",
  reopened: "На пересмотре"
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
