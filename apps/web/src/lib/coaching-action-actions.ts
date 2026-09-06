"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { isCoachingActionStatus } from "@/lib/coaching-action";
import { canManageTraining, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { recordReviewEvent } from "@/lib/review-events";

/**
 * Server actions for CoachingAction lifecycle. Create stays on the review
 * draft/finalize path; this module closes the loop (complete / cancel /
 * reopen) so reports no longer count every action as open forever.
 */
export type CoachingActionActionState =
  | null
  | { ok: true; toast: string; nonce: number }
  | { ok: false; message: string };

function coachingActionError(error: unknown): CoachingActionActionState {
  return {
    ok: false,
    message: error instanceof Error ? error.message : "Не удалось обновить разбор."
  };
}

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireCoachingActionManager() {
  const user = await getCurrentUser();

  // Same gate as training assignment creation: managers/leads only.
  if (!canManageTraining(user.role) || user.role === "SUPPORT_AGENT") {
    throw new Error("Нет прав на закрытие разборов.");
  }

  return user;
}

/**
 * Updates CoachingAction.status (open | completed | cancelled). Scoped through
 * Finding → Review.workspaceId so foreign ids silently no-op. Audits and
 * records a ReviewEvent when a row actually changes.
 */
export async function updateCoachingActionStatus(formData: FormData) {
  const user = await requireCoachingActionManager();

  const id = stringField(formData, "id");
  const status = stringField(formData, "status");

  if (!id) {
    throw new Error("Не указан разбор.");
  }

  if (!isCoachingActionStatus(status)) {
    throw new Error("Некорректный статус разбора.");
  }

  let conversationId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.coachingAction.findFirst({
      where: {
        id,
        finding: {
          review: {
            workspaceId: user.workspaceId
          }
        }
      },
      select: {
        id: true,
        status: true,
        finding: {
          select: {
            reviewId: true,
            review: {
              select: {
                conversationId: true
              }
            }
          }
        }
      }
    });

    if (!existing) {
      return;
    }

    conversationId = existing.finding.review.conversationId;

    if (existing.status === status) {
      return;
    }

    await tx.coachingAction.update({
      where: { id: existing.id },
      data: { status }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "coaching.action_status_updated",
        targetType: "coaching_action",
        targetId: existing.id,
        metadata: {
          status,
          fromStatus: existing.status,
          reviewId: existing.finding.reviewId
        }
      },
      tx
    );

    await recordReviewEvent(tx, {
      workspaceId: user.workspaceId,
      reviewId: existing.finding.reviewId,
      conversationId: existing.finding.review.conversationId,
      actorId: user.id,
      action: "coaching.action_status_updated",
      fromStatus: existing.status,
      toStatus: status,
      metadata: {
        coachingActionId: existing.id
      }
    });
  });

  revalidatePath("/coaching");
  revalidatePath("/reports");
  if (conversationId) {
    revalidatePath(`/reviews/${conversationId}`);
  }
}

export async function updateCoachingActionStatusState(
  _state: CoachingActionActionState,
  formData: FormData
): Promise<CoachingActionActionState> {
  const status = stringField(formData, "status");

  try {
    await updateCoachingActionStatus(formData);
  } catch (error) {
    return coachingActionError(error);
  }

  const toast =
    status === "completed"
      ? "Разбор отмечен выполненным."
      : status === "cancelled"
        ? "Разбор отменён."
        : "Разбор снова открыт.";

  return { ok: true, toast, nonce: Date.now() };
}
