"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { decideAiQualityDraft } from "@/lib/ai-quality/drafts";
import type { AiQualityDraftDecision } from "@/lib/ai-quality/types";
import { canSaveReviewDraft, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Form-shell state for the AI "score" draft accept/reject/override controls.
 *
 * `null` is the pre-submit state. On success the conversation page is
 * revalidated (the draft card re-renders with its new human decision) and an
 * `ok: true` signal carries a Russian toast string; failures are reported
 * inline. The decision itself is recorded by `decideAiQualityDraft`, whose
 * human-actor guard is satisfied by the current user's id.
 */
export type AiDraftDecisionState =
  | null
  | { ok: true; decision: AiQualityDraftDecision; message: string }
  | { ok: false; message: string };

const successMessages: Record<AiQualityDraftDecision, string> = {
  approved: "Предложение ИИ принято.",
  rejected: "Предложение ИИ отклонено.",
  changed: "Предложение ИИ изменено."
};

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readDecision(value: string): AiQualityDraftDecision | null {
  if (value === "approved" || value === "rejected" || value === "changed") {
    return value;
  }
  return null;
}

function parseChangedValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Не удалось разобрать изменённое значение предложения.");
  }
}

/**
 * Records a human decision (принять / отклонить / изменить) on an AI quality
 * "score" draft. Gated by the same QA permission that reveals the AI drafts
 * (`canSaveReviewDraft`) and scoped to the actor's workspace before delegating
 * to `decideAiQualityDraft`.
 */
export async function submitAiDraftDecision(
  _state: AiDraftDecisionState,
  formData: FormData
): Promise<AiDraftDecisionState> {
  try {
    const user = await getCurrentUser();

    if (!canSaveReviewDraft(user.role)) {
      throw new Error("Нет прав на решение по предложениям ИИ.");
    }

    const draftId = stringField(formData, "draftId");
    if (!draftId) {
      throw new Error("Не указано предложение ИИ.");
    }

    const decision = readDecision(stringField(formData, "decision"));
    if (!decision) {
      throw new Error("Некорректное решение по предложению ИИ.");
    }

    const draft = await prisma.aiQualityDraft.findFirst({
      where: { id: draftId, workspaceId: user.workspaceId },
      select: { id: true, conversationId: true }
    });

    if (!draft) {
      throw new Error("Предложение ИИ не найдено.");
    }

    const reason = stringField(formData, "reason");

    await decideAiQualityDraft({
      draftId: draft.id,
      decision,
      actorId: user.id,
      reason: reason ? reason : undefined,
      ...(decision === "changed"
        ? { changedValue: parseChangedValue(stringField(formData, "changedValueJson")) }
        : {})
    });

    if (draft.conversationId) {
      revalidatePath(`/reviews/${draft.conversationId}`);
    }

    return { ok: true, decision, message: successMessages[decision] };
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "Не удалось обновить предложение ИИ."
    };
  }
}
