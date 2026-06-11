"use server";

import { unstable_rethrow } from "next/navigation";
import { finalizeReview, saveReviewDraft } from "@/lib/review-actions";

export type ReviewPanelActionState = {
  ok: false;
  message: string;
} | null;

const fallbackMessages = {
  save: "Не удалось сохранить черновик проверки.",
  finalize: "Не удалось завершить проверку."
} as const;

export async function submitReviewState(_state: ReviewPanelActionState, formData: FormData): Promise<ReviewPanelActionState> {
  const intent = formData.get("intent") === "finalize" ? "finalize" : "save";

  try {
    if (intent === "finalize") {
      await finalizeReview(formData);
    } else {
      await saveReviewDraft(formData);
    }

    return null;
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : fallbackMessages[intent]
    };
  }
}
