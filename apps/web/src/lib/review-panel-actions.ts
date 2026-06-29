"use server";

import { unstable_rethrow } from "next/navigation";
import { finalizeReview, finalizeReviewAndTakeNext, saveReviewDraft } from "@/lib/review-actions";

export type ReviewPanelIntent = "save" | "finalize" | "finalize_next";

/**
 * Form-shell state for the grading panel.
 *
 * On the happy path `saveReviewDraft` / `finalizeReview` redirect, so the
 * success toast normally rides the destination URL (see `?saved=...`). The
 * `ok: true` branch here is the fallback the form shell surfaces as a toast when
 * the action returns WITHOUT redirecting — keeping a single success path for the
 * UI regardless of whether navigation happened.
 */
export type ReviewPanelActionState =
  | {
      ok: true;
      intent: ReviewPanelIntent;
      message: string;
    }
  | {
      ok: false;
      message: string;
    }
  | null;

const fallbackMessages: Record<ReviewPanelIntent, string> = {
  save: "Не удалось сохранить черновик проверки.",
  finalize: "Не удалось завершить проверку.",
  finalize_next: "Не удалось завершить проверку."
};

const successMessages: Record<ReviewPanelIntent, string> = {
  save: "Черновик проверки сохранён.",
  finalize: "Проверка завершена.",
  finalize_next: "Проверка завершена."
};

function readIntent(value: FormDataEntryValue | null): ReviewPanelIntent {
  if (value === "finalize") {
    return "finalize";
  }

  if (value === "finalize_next") {
    return "finalize_next";
  }

  return "save";
}

export async function submitReviewState(_state: ReviewPanelActionState, formData: FormData): Promise<ReviewPanelActionState> {
  const intent = readIntent(formData.get("intent"));

  try {
    if (intent === "finalize_next") {
      await finalizeReviewAndTakeNext(formData);
    } else if (intent === "finalize") {
      await finalizeReview(formData);
    } else {
      await saveReviewDraft(formData);
    }

    return { ok: true, intent, message: successMessages[intent] };
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : fallbackMessages[intent]
    };
  }
}
