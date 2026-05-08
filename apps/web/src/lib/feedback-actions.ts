"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { canAcknowledgeFeedback, canManageTraining, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { recordReviewEvent } from "@/lib/review-events";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function loadReviewForAction(reviewId: string, workspaceId: string) {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, workspaceId },
    select: {
      id: true,
      conversationId: true,
      conversation: {
        select: {
          assigneeName: true
        }
      }
    }
  });

  if (!review) {
    throw new Error("Проверка не найдена.");
  }

  return review;
}

function assertFeedbackScope(input: {
  userRole: string;
  userName: string;
  conversationAssigneeName: string | null;
}) {
  if (input.userRole === "SUPPORT_AGENT" && input.conversationAssigneeName !== input.userName) {
    throw new Error("Нет прав на работу с обратной связью по чужому обращению.");
  }
}

export async function updateReviewFeedback(formData: FormData) {
  const user = await getCurrentUser();

  if (!canAcknowledgeFeedback(user.role)) {
    throw new Error("Нет прав на работу с обратной связью.");
  }

  const reviewId = stringField(formData, "reviewId");
  const action = stringField(formData, "action");
  const comment = stringField(formData, "comment");
  const review = await loadReviewForAction(reviewId, user.workspaceId);
  assertFeedbackScope({
    userRole: user.role,
    userName: user.name,
    conversationAssigneeName: review.conversation.assigneeName
  });
  const now = new Date();

  const patches: Record<string, Prisma.ReviewUpdateInput> = {
    acknowledged: { feedbackStatus: "acknowledged", feedbackAckAt: now, feedbackAckBy: user.name },
    appeal_opened: { feedbackStatus: "appeal", appealStatus: "open", appealDueAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000) },
    appeal_confirmed: { appealStatus: "confirmed", feedbackStatus: "acknowledged", appealResolvedAt: now },
    appeal_corrected: { appealStatus: "corrected", feedbackStatus: "corrected", appealResolvedAt: now },
    reanswer_requested: { needsReanswer: true, reanswerStatus: "requested" },
    reanswer_completed: { needsReanswer: true, reanswerStatus: "completed" }
  };
  const data = patches[action];

  if (!data) {
    throw new Error("Некорректное действие обратной связи.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { id: review.id },
      data
    });

    await tx.reviewFeedbackEvent.create({
      data: {
        reviewId: review.id,
        actorId: user.id,
        action,
        comment
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: `review.feedback.${action}`,
        targetType: "review",
        targetId: review.id,
        metadata: { comment }
      },
      tx
    );

    await recordReviewEvent(tx, {
      workspaceId: user.workspaceId,
      reviewId: review.id,
      conversationId: review.conversationId,
      actorId: user.id,
      action: `review.feedback.${action}`,
      metadata: { comment }
    });
  });

  revalidatePath(`/reviews/${review.conversationId}`);
  revalidatePath("/coaching");
  revalidatePath("/self-review");
}

export async function createTrainingAssignmentFromReview(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageTraining(user.role) || user.role === "SUPPORT_AGENT") {
    throw new Error("Нет прав на создание учебных задач.");
  }

  const reviewId = stringField(formData, "reviewId");
  const title = stringField(formData, "title");
  const description = stringField(formData, "description");
  const assigneeName = stringField(formData, "assigneeName");
  const dueAt = stringField(formData, "dueAt");
  const review = await loadReviewForAction(reviewId, user.workspaceId);

  if (!title || !description || !assigneeName) {
    throw new Error("Нужны название, описание и оператор.");
  }

  const assignee = await prisma.user.findFirst({
    where: { workspaceId: user.workspaceId, name: assigneeName },
    select: { id: true }
  });

  await prisma.$transaction(async (tx) => {
    const assignment = await tx.trainingAssignment.create({
      data: {
        workspaceId: user.workspaceId,
        reviewId: review.id,
        assigneeId: assignee?.id,
        assignedById: user.id,
        assigneeName,
        title,
        description,
        dueAt: dueAt ? new Date(`${dueAt}T12:00:00.000Z`) : undefined
      }
    });

    await recordReviewEvent(tx, {
      workspaceId: user.workspaceId,
      reviewId: review.id,
      conversationId: review.conversationId,
      actorId: user.id,
      action: "training.assignment_created",
      metadata: {
        assignmentId: assignment.id,
        assigneeName
      }
    });
  });

  revalidatePath(`/reviews/${review.conversationId}`);
  revalidatePath("/coaching");
}

export async function createTrainingAssignment(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageTraining(user.role)) {
    throw new Error("Нет прав на создание учебных задач.");
  }

  const reviewId = stringField(formData, "reviewId");
  const assigneeId = stringField(formData, "assigneeId");
  const fallbackAssigneeName = stringField(formData, "assigneeName");
  const title = stringField(formData, "title");
  const description = stringField(formData, "description");
  const dueAt = stringField(formData, "dueAt");

  if (!title || !description || (!assigneeId && !fallbackAssigneeName)) {
    throw new Error("Нужны название, описание и исполнитель.");
  }

  const [assignee, review] = await Promise.all([
    assigneeId
      ? prisma.user.findFirst({
          where: { id: assigneeId, workspaceId: user.workspaceId },
          select: { id: true, name: true }
        })
      : null,
    reviewId
      ? prisma.review.findFirst({
          where: { id: reviewId, workspaceId: user.workspaceId },
          select: { id: true, conversationId: true }
        })
      : null
  ]);

  if (assigneeId && !assignee) {
    throw new Error("Исполнитель не найден.");
  }

  if (reviewId && !review) {
    throw new Error("Проверка не найдена.");
  }

  await prisma.$transaction(async (tx) => {
    const assignment = await tx.trainingAssignment.create({
      data: {
        workspaceId: user.workspaceId,
        reviewId: review?.id,
        assigneeId: assignee?.id,
        assignedById: user.id,
        assigneeName: assignee?.name ?? fallbackAssigneeName,
        title,
        description,
        dueAt: dueAt ? new Date(`${dueAt}T12:00:00.000Z`) : undefined
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "training.assignment_created",
        targetType: "training_assignment",
        targetId: assignment.id,
        metadata: {
          reviewId: review?.id,
          assigneeName: assignee?.name ?? fallbackAssigneeName
        }
      },
      tx
    );

    if (review) {
      await recordReviewEvent(tx, {
        workspaceId: user.workspaceId,
        reviewId: review.id,
        conversationId: review.conversationId,
        actorId: user.id,
        action: "training.assignment_created",
        metadata: {
          assignmentId: assignment.id,
          assigneeName: assignee?.name ?? fallbackAssigneeName
        }
      });
    }
  });

  revalidatePath("/coaching");
  if (review) {
    revalidatePath(`/reviews/${review.conversationId}`);
  }
}

export async function updateTrainingAssignmentStatus(formData: FormData) {
  const user = await getCurrentUser();
  const id = stringField(formData, "id");
  const status = stringField(formData, "status");

  if (!["open", "in_progress", "done"].includes(status)) {
    throw new Error("Некорректный статус учебной задачи.");
  }

  const where =
    canManageTraining(user.role)
      ? { id, workspaceId: user.workspaceId }
      : { id, workspaceId: user.workspaceId, assigneeId: user.id };

  await prisma.trainingAssignment.updateMany({
    where,
    data: { status }
  });

  revalidatePath("/coaching");
}
