"use server";

import type { Prisma, QaStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { canManageReviewWorkflow, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { recordReviewEvent } from "@/lib/review-events";
import {
  assertConditionalWorkflowWrite,
  assertQaWorkflowTransition,
  qaWorkflowStatuses
} from "@/lib/review-workflow-policy";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalStringField(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value ? value : undefined;
}

function statusField(formData: FormData): QaStatus {
  const value = stringField(formData, "qaStatus");

  if (!qaWorkflowStatuses.includes(value as QaStatus)) {
    throw new Error("Некорректное состояние проверки.");
  }

  return value as QaStatus;
}

async function findLatestReopenedAt(tx: Prisma.TransactionClient, workspaceId: string, conversationId: string) {
  const event = await tx.reviewEvent.findFirst({
    where: {
      workspaceId,
      conversationId,
      toStatus: "REOPENED"
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });

  return event?.createdAt ?? null;
}

async function hasCurrentCycleFinalizedHumanReview(tx: Prisma.TransactionClient, workspaceId: string, conversationId: string) {
  const latestReopenedAt = await findLatestReopenedAt(tx, workspaceId, conversationId);
  const review = await tx.review.findFirst({
    where: {
      workspaceId,
      conversationId,
      reviewSource: "HUMAN",
      status: "FINALIZED",
      finalizedAt: latestReopenedAt ? { gt: latestReopenedAt } : { not: null }
    },
    select: {
      id: true
    }
  });

  return Boolean(review);
}

export async function updateConversationWorkflow(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageReviewWorkflow(user.role)) {
    throw new Error("Нет прав на изменение состояния проверки.");
  }

  const conversationId = stringField(formData, "conversationId");
  const qaStatus = statusField(formData);
  const qaAssigneeId = optionalStringField(formData, "qaAssigneeId");
  const reviewDueAt = optionalStringField(formData, "reviewDueAt");

  if (!conversationId) {
    throw new Error("Диалог не найден.");
  }

  const qaAssignee = qaAssigneeId
    ? await prisma.user.findFirst({
        where: {
          id: qaAssigneeId,
          workspaceId: user.workspaceId,
          role: {
            in: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"]
          }
        },
        select: {
          id: true,
          name: true
        }
      })
    : null;

  if (qaAssigneeId && !qaAssignee) {
    throw new Error("Проверяющий не найден.");
  }

  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: user.workspaceId
      },
      select: {
        id: true,
        qaStatus: true
      }
    });

    if (!conversation) {
      throw new Error("Диалог не найден в текущем рабочем пространстве.");
    }

    const hasFinalizedReview =
      qaStatus === "FINALIZED" ? await hasCurrentCycleFinalizedHumanReview(tx, user.workspaceId, conversationId) : false;

    assertQaWorkflowTransition({
      fromStatus: conversation.qaStatus,
      toStatus: qaStatus,
      hasFinalizedReview
    });

    const updateResult = await tx.conversation.updateMany({
      where: {
        id: conversationId,
        workspaceId: user.workspaceId,
        qaStatus: conversation.qaStatus
      },
      data: {
        qaStatus,
        qaAssigneeId: qaAssignee?.id ?? null,
        qaAssigneeName: qaAssignee?.name ?? null,
        reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00.000Z`) : null
      }
    });
    assertConditionalWorkflowWrite(updateResult.count);

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "conversation.workflow_updated",
        targetType: "conversation",
        targetId: conversationId,
        metadata: {
          qaStatus,
          qaAssigneeId: qaAssignee?.id,
          reviewDueAt
        }
      },
      tx
    );

    await recordReviewEvent(tx, {
      workspaceId: user.workspaceId,
      conversationId,
      actorId: user.id,
      action: "conversation.workflow_updated",
      fromStatus: conversation.qaStatus,
      toStatus: qaStatus,
      metadata: {
        qaAssigneeId: qaAssignee?.id,
        reviewDueAt
      }
    });
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${conversationId}`);
  redirect(`/reviews/${conversationId}`);
}

export async function bulkUpdateReviewQueue(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageReviewWorkflow(user.role)) {
    throw new Error("Нет прав на массовое изменение очереди.");
  }

  const conversationIds = formData
    .getAll("conversationId")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const qaStatusValue = optionalStringField(formData, "qaStatus");
  const qaAssigneeId = optionalStringField(formData, "qaAssigneeId");
  const reviewDueAt = optionalStringField(formData, "reviewDueAt");
  const returnTo = stringField(formData, "returnTo") || "/reviews";

  if (conversationIds.length === 0) {
    redirect(returnTo);
  }

  const qaStatus = qaStatusValue
    ? (() => {
        if (!qaWorkflowStatuses.includes(qaStatusValue as QaStatus)) {
          throw new Error("Некорректное состояние проверки.");
        }

        return qaStatusValue as QaStatus;
      })()
    : undefined;
  const qaAssignee = qaAssigneeId
    ? await prisma.user.findFirst({
        where: {
          id: qaAssigneeId,
          workspaceId: user.workspaceId,
          role: {
            in: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"]
          }
        },
        select: {
          id: true,
          name: true
        }
      })
    : undefined;

  if (qaAssigneeId && !qaAssignee) {
    throw new Error("Проверяющий не найден.");
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      id: {
        in: conversationIds
      },
      workspaceId: user.workspaceId
    },
    select: {
      id: true,
      qaStatus: true
    }
  });
  const safeIds = conversations.map((conversation) => conversation.id);

  if (safeIds.length === 0) {
    redirect(returnTo);
  }

  const data = {
    ...(qaStatus ? { qaStatus } : {}),
    ...(qaAssignee !== undefined
      ? {
          qaAssigneeId: qaAssignee?.id ?? null,
          qaAssigneeName: qaAssignee?.name ?? null
        }
      : {}),
    ...(reviewDueAt !== undefined ? { reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00.000Z`) : null } : {})
  };

  if (Object.keys(data).length === 0) {
    redirect(returnTo);
  }

  await prisma.$transaction(async (tx) => {
    const currentConversations = await tx.conversation.findMany({
      where: {
        id: {
          in: safeIds
        },
        workspaceId: user.workspaceId
      },
      select: {
        id: true,
        qaStatus: true
      }
    });

    if (currentConversations.length === 0) {
      throw new Error("Диалоги не найдены в текущем рабочем пространстве.");
    }

    for (const conversation of currentConversations) {
      if (qaStatus) {
        const hasFinalizedReview =
          qaStatus === "FINALIZED"
            ? await hasCurrentCycleFinalizedHumanReview(tx, user.workspaceId, conversation.id)
            : false;

        assertQaWorkflowTransition({
          fromStatus: conversation.qaStatus,
          toStatus: qaStatus,
          hasFinalizedReview
        });
      }

      const updateResult = await tx.conversation.updateMany({
        where: {
          id: conversation.id,
          workspaceId: user.workspaceId,
          ...(qaStatus ? { qaStatus: conversation.qaStatus } : {})
        },
        data
      });
      assertConditionalWorkflowWrite(updateResult.count);
    }

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "conversation.bulk_workflow_updated",
        targetType: "conversation",
        targetId: "bulk",
        metadata: {
          count: currentConversations.length,
          conversationIds: currentConversations.map((conversation) => conversation.id),
          qaStatus,
          qaAssigneeId: qaAssignee?.id,
          reviewDueAt
        }
      },
      tx
    );

    if (qaStatus) {
      for (const conversation of currentConversations.filter((item) => item.qaStatus !== qaStatus)) {
        await recordReviewEvent(tx, {
          workspaceId: user.workspaceId,
          conversationId: conversation.id,
          actorId: user.id,
          action: "conversation.bulk_workflow_updated",
          fromStatus: conversation.qaStatus,
          toStatus: qaStatus,
          metadata: {
            qaAssigneeId: qaAssignee?.id,
            reviewDueAt
          }
        });
      }
    }
  });

  revalidatePath("/reviews");
  redirect(returnTo);
}
