"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { isCoachingPlanStatus } from "@/lib/coaching-plan";
import { canManageTraining, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Server actions for coaching plans (Workstream C1). A coaching plan groups an
 * agent's training assignments under a shared development focus. Mutations are
 * gated behind `canManageTraining` — the same capability that guards training
 * assignment creation in feedback-actions.ts.
 *
 * The result type mirrors `FeedbackActionState` so the coaching page's
 * `ToastActionForm` shells can raise a success toast and surface inline errors
 * with the exact same wiring used by the feedback/training forms.
 */
export type CoachingPlanActionState =
  | null
  | { ok: true; toast: string; nonce: number }
  | { ok: false; message: string };

function coachingPlanActionError(error: unknown): CoachingPlanActionState {
  return {
    ok: false,
    message: error instanceof Error ? error.message : "Не удалось обновить план коучинга."
  };
}

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireTrainingManager() {
  const user = await getCurrentUser();

  if (!canManageTraining(user.role)) {
    throw new Error("Нет прав на управление планами коучинга.");
  }

  return user;
}

/**
 * Creates a coaching plan for a single agent. Requires agent name and title;
 * focus area is optional. Records an audit entry inside the same transaction.
 */
export async function createCoachingPlan(formData: FormData) {
  const user = await requireTrainingManager();

  const agentName = stringField(formData, "agentName");
  const title = stringField(formData, "title");
  const focusArea = stringField(formData, "focusArea");

  if (!agentName || !title) {
    throw new Error("Нужны оператор и название плана.");
  }

  await prisma.$transaction(async (tx) => {
    const plan = await tx.coachingPlan.create({
      data: {
        workspaceId: user.workspaceId,
        agentName,
        title,
        focusArea: focusArea || null,
        createdById: user.id
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "coaching.plan_created",
        targetType: "coaching_plan",
        targetId: plan.id,
        metadata: { agentName, title, focusArea: focusArea || null }
      },
      tx
    );
  });

  revalidatePath("/coaching");
}

/**
 * Flips a plan's status between active and completed. Scoped to the caller's
 * workspace via `updateMany`, so a foreign plan id silently no-ops.
 */
export async function updateCoachingPlanStatus(formData: FormData) {
  const user = await requireTrainingManager();

  const id = stringField(formData, "id");
  const status = stringField(formData, "status");

  if (!id) {
    throw new Error("Не указан план коучинга.");
  }

  if (!isCoachingPlanStatus(status)) {
    throw new Error("Некорректный статус плана коучинга.");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.coachingPlan.updateMany({
      where: { id, workspaceId: user.workspaceId },
      data: { status }
    });

    if (updated.count > 0) {
      await auditLog(
        {
          workspaceId: user.workspaceId,
          actorId: user.id,
          action: "coaching.plan_status_updated",
          targetType: "coaching_plan",
          targetId: id,
          metadata: { status }
        },
        tx
      );
    }
  });

  revalidatePath("/coaching");
}

/**
 * Links an existing training assignment to a plan (or detaches it when
 * `coachingPlanId` is empty). Both the assignment and the target plan must
 * belong to the caller's workspace.
 */
export async function addAssignmentToPlan(formData: FormData) {
  const user = await requireTrainingManager();

  const assignmentId = stringField(formData, "assignmentId");
  const coachingPlanId = stringField(formData, "coachingPlanId");

  if (!assignmentId) {
    throw new Error("Не указана учебная задача.");
  }

  if (coachingPlanId) {
    const plan = await prisma.coachingPlan.findFirst({
      where: { id: coachingPlanId, workspaceId: user.workspaceId },
      select: { id: true }
    });

    if (!plan) {
      throw new Error("План коучинга не найден.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.trainingAssignment.updateMany({
      where: { id: assignmentId, workspaceId: user.workspaceId },
      data: { coachingPlanId: coachingPlanId || null }
    });

    if (updated.count > 0) {
      await auditLog(
        {
          workspaceId: user.workspaceId,
          actorId: user.id,
          action: "coaching.plan_assignment_linked",
          targetType: "training_assignment",
          targetId: assignmentId,
          metadata: { coachingPlanId: coachingPlanId || null }
        },
        tx
      );
    }
  });

  revalidatePath("/coaching");
}

/**
 * `useActionState` wrappers around the plan mutations above. They reuse the
 * exact same logic (including thrown permission/validation errors) and add a
 * success state so the coaching page's client shells can raise a toast.
 */
export async function createCoachingPlanState(
  _state: CoachingPlanActionState,
  formData: FormData
): Promise<CoachingPlanActionState> {
  try {
    await createCoachingPlan(formData);
  } catch (error) {
    return coachingPlanActionError(error);
  }

  return { ok: true, toast: "План коучинга создан.", nonce: Date.now() };
}

export async function updateCoachingPlanStatusState(
  _state: CoachingPlanActionState,
  formData: FormData
): Promise<CoachingPlanActionState> {
  const status = stringField(formData, "status");

  try {
    await updateCoachingPlanStatus(formData);
  } catch (error) {
    return coachingPlanActionError(error);
  }

  const toast = status === "completed" ? "План коучинга завершён." : "План коучинга возобновлён.";
  return { ok: true, toast, nonce: Date.now() };
}
