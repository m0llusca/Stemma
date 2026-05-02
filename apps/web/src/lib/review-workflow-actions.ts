"use server";

import type { QaStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { canManageReviewWorkflow, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const qaStatuses = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const satisfies readonly QaStatus[];

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

  if (!qaStatuses.includes(value as QaStatus)) {
    throw new Error("Некорректное состояние проверки.");
  }

  return value as QaStatus;
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

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: user.workspaceId
    },
    select: {
      id: true
    }
  });

  if (!conversation) {
    throw new Error("Диалог не найден в текущем рабочем пространстве.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.conversation.update({
      where: {
        id: conversationId
      },
      data: {
        qaStatus,
        qaAssigneeId: qaAssignee?.id ?? null,
        qaAssigneeName: qaAssignee?.name ?? null,
        reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00.000Z`) : null
      }
    });

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
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${conversationId}`);
  redirect(`/reviews/${conversationId}`);
}
