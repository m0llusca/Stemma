"use server";

import type { Prisma, QaStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { sanitizeReturnTo } from "@/lib/auth/role-home";
import { canManageReviewWorkflow, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  findLatestReopenedAt,
  findPendingFinalizedReopenRequest,
  QA_REOPEN_REQUESTED_ACTION,
  QA_REOPENED_ACTION,
  recordReviewEvent
} from "@/lib/review-events";
import {
  assertCanConfirmFinalizedReopen,
  assertConditionalWorkflowWrite,
  assertFinalizedReopenReason,
  assertQaWorkflowTransition,
  CONFIRM_REOPEN_WORKFLOW_ACTION,
  isFinalizedReopenTransition,
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

/** Accepts either `reason` or `comment` FormData for FINALIZED→REOPENED audit. */
function reopenReasonField(formData: FormData) {
  return optionalStringField(formData, "reason") ?? optionalStringField(formData, "comment");
}

function statusField(formData: FormData): QaStatus {
  const value = stringField(formData, "qaStatus");

  if (!qaWorkflowStatuses.includes(value as QaStatus)) {
    throw new Error("Некорректное состояние проверки.");
  }

  return value as QaStatus;
}

function isConfirmReopenAction(formData: FormData) {
  return stringField(formData, "workflowAction") === CONFIRM_REOPEN_WORKFLOW_ACTION;
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

async function requestFinalizedReopen(input: {
  tx: Prisma.TransactionClient;
  workspaceId: string;
  conversationId: string;
  actorId: string;
  reason: string;
  qaAssigneeId?: string | null;
  qaAssigneeName?: string | null;
  reviewDueAt?: string | undefined;
  updateAssigneeAndDue: boolean;
}) {
  const data: Prisma.ConversationUpdateManyMutationInput = {};
  if (input.updateAssigneeAndDue) {
    data.qaAssigneeId = input.qaAssigneeId ?? null;
    data.qaAssigneeName = input.qaAssigneeName ?? null;
    data.reviewDueAt = input.reviewDueAt ? new Date(`${input.reviewDueAt}T00:00:00.000Z`) : null;
  }

  if (Object.keys(data).length > 0) {
    const updateResult = await input.tx.conversation.updateMany({
      where: {
        id: input.conversationId,
        workspaceId: input.workspaceId,
        qaStatus: "FINALIZED"
      },
      data
    });
    assertConditionalWorkflowWrite(updateResult.count);
  }

  const metadata = {
    reason: input.reason,
    requestedById: input.actorId
  };

  await auditLog(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: QA_REOPEN_REQUESTED_ACTION,
      targetType: "conversation",
      targetId: input.conversationId,
      metadata: {
        qaStatus: "FINALIZED",
        ...metadata
      }
    },
    input.tx
  );

  await recordReviewEvent(input.tx, {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    actorId: input.actorId,
    action: QA_REOPEN_REQUESTED_ACTION,
    fromStatus: "FINALIZED",
    toStatus: "FINALIZED",
    metadata
  });
}

async function confirmFinalizedReopen(input: {
  tx: Prisma.TransactionClient;
  workspaceId: string;
  conversationId: string;
  confirmerId: string;
  qaAssigneeId?: string | null;
  qaAssigneeName?: string | null;
  reviewDueAt?: string | undefined;
  updateAssigneeAndDue: boolean;
}) {
  const pending = await findPendingFinalizedReopenRequest(input.tx, input.workspaceId, input.conversationId);
  assertCanConfirmFinalizedReopen({
    confirmerId: input.confirmerId,
    pending
  });

  const data: Prisma.ConversationUpdateManyMutationInput = {
    qaStatus: "REOPENED"
  };
  if (input.updateAssigneeAndDue) {
    data.qaAssigneeId = input.qaAssigneeId ?? null;
    data.qaAssigneeName = input.qaAssigneeName ?? null;
    data.reviewDueAt = input.reviewDueAt ? new Date(`${input.reviewDueAt}T00:00:00.000Z`) : null;
  }

  const updateResult = await input.tx.conversation.updateMany({
    where: {
      id: input.conversationId,
      workspaceId: input.workspaceId,
      qaStatus: "FINALIZED"
    },
    data
  });
  assertConditionalWorkflowWrite(updateResult.count);

  const metadata = {
    reason: pending!.reason,
    requestedById: pending!.requestedById,
    confirmedById: input.confirmerId
  };

  await auditLog(
    {
      workspaceId: input.workspaceId,
      actorId: input.confirmerId,
      action: QA_REOPENED_ACTION,
      targetType: "conversation",
      targetId: input.conversationId,
      metadata: {
        qaStatus: "REOPENED",
        ...metadata
      }
    },
    input.tx
  );

  await recordReviewEvent(input.tx, {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    actorId: input.confirmerId,
    action: QA_REOPENED_ACTION,
    fromStatus: "FINALIZED",
    toStatus: "REOPENED",
    metadata
  });
}

export async function updateConversationWorkflow(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageReviewWorkflow(user.role)) {
    throw new Error("Нет прав на изменение состояния проверки.");
  }

  const conversationId = stringField(formData, "conversationId");
  const confirmReopen = isConfirmReopenAction(formData);
  const qaAssigneeId = optionalStringField(formData, "qaAssigneeId");
  const reviewDueAt = optionalStringField(formData, "reviewDueAt");
  const reopenReason = reopenReasonField(formData);

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

    if (confirmReopen) {
      if (conversation.qaStatus !== "FINALIZED") {
        throw new Error("Подтвердить переоткрытие можно только для завершенной проверки.");
      }

      await confirmFinalizedReopen({
        tx,
        workspaceId: user.workspaceId,
        conversationId,
        confirmerId: user.id,
        qaAssigneeId: qaAssignee?.id,
        qaAssigneeName: qaAssignee?.name,
        reviewDueAt,
        updateAssigneeAndDue: true
      });
      return;
    }

    const qaStatus = statusField(formData);
    const hasFinalizedReview =
      qaStatus === "FINALIZED" ? await hasCurrentCycleFinalizedHumanReview(tx, user.workspaceId, conversationId) : false;

    assertQaWorkflowTransition({
      fromStatus: conversation.qaStatus,
      toStatus: qaStatus,
      hasFinalizedReview
    });
    assertFinalizedReopenReason({
      fromStatus: conversation.qaStatus,
      toStatus: qaStatus,
      reason: reopenReason
    });

    if (isFinalizedReopenTransition(conversation.qaStatus, qaStatus)) {
      await requestFinalizedReopen({
        tx,
        workspaceId: user.workspaceId,
        conversationId,
        actorId: user.id,
        reason: reopenReason!.trim(),
        qaAssigneeId: qaAssignee?.id,
        qaAssigneeName: qaAssignee?.name,
        reviewDueAt,
        updateAssigneeAndDue: true
      });
      return;
    }

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
  const confirmReopen = isConfirmReopenAction(formData);
  const qaStatusValue = optionalStringField(formData, "qaStatus");
  const qaAssigneeId = optionalStringField(formData, "qaAssigneeId");
  const reviewDueAt = optionalStringField(formData, "reviewDueAt");
  const reopenReason = reopenReasonField(formData);
  const returnTo = sanitizeReturnTo(stringField(formData, "returnTo") || "/reviews");

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

  const updateAssigneeAndDue = qaAssignee !== undefined || reviewDueAt !== undefined;
  const assigneeDueData = {
    ...(qaAssignee !== undefined
      ? {
          qaAssigneeId: qaAssignee?.id ?? null,
          qaAssigneeName: qaAssignee?.name ?? null
        }
      : {}),
    ...(reviewDueAt !== undefined ? { reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00.000Z`) : null } : {})
  };

  if (!confirmReopen && !qaStatus && Object.keys(assigneeDueData).length === 0) {
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

    if (confirmReopen) {
      const confirmedIds: string[] = [];

      for (const conversation of currentConversations) {
        if (conversation.qaStatus !== "FINALIZED") {
          continue;
        }

        const pending = await findPendingFinalizedReopenRequest(tx, user.workspaceId, conversation.id);
        if (!pending) {
          continue;
        }

        assertCanConfirmFinalizedReopen({
          confirmerId: user.id,
          pending
        });

        await confirmFinalizedReopen({
          tx,
          workspaceId: user.workspaceId,
          conversationId: conversation.id,
          confirmerId: user.id,
          qaAssigneeId: qaAssignee?.id,
          qaAssigneeName: qaAssignee?.name,
          reviewDueAt,
          updateAssigneeAndDue
        });
        confirmedIds.push(conversation.id);
      }

      if (confirmedIds.length === 0) {
        throw new Error("Нет ожидающего запроса на переоткрытие.");
      }

      await auditLog(
        {
          workspaceId: user.workspaceId,
          actorId: user.id,
          action: QA_REOPENED_ACTION,
          targetType: "conversation",
          targetId: "bulk",
          metadata: {
            count: confirmedIds.length,
            conversationIds: confirmedIds,
            confirmedById: user.id
          }
        },
        tx
      );
      return;
    }

    const requestedReopenIds: string[] = [];
    const updatedIds: string[] = [];

    for (const conversation of currentConversations) {
      if (qaStatus && isFinalizedReopenTransition(conversation.qaStatus, qaStatus)) {
        assertFinalizedReopenReason({
          fromStatus: conversation.qaStatus,
          toStatus: qaStatus,
          reason: reopenReason
        });
        await requestFinalizedReopen({
          tx,
          workspaceId: user.workspaceId,
          conversationId: conversation.id,
          actorId: user.id,
          reason: reopenReason!.trim(),
          qaAssigneeId: qaAssignee?.id,
          qaAssigneeName: qaAssignee?.name,
          reviewDueAt,
          updateAssigneeAndDue
        });
        requestedReopenIds.push(conversation.id);
        continue;
      }

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

      const data = {
        ...(qaStatus ? { qaStatus } : {}),
        ...assigneeDueData
      };

      if (Object.keys(data).length === 0) {
        continue;
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
      updatedIds.push(conversation.id);

      if (qaStatus && conversation.qaStatus !== qaStatus) {
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

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: requestedReopenIds.length > 0 ? QA_REOPEN_REQUESTED_ACTION : "conversation.bulk_workflow_updated",
        targetType: "conversation",
        targetId: "bulk",
        metadata: {
          count: currentConversations.length,
          conversationIds: currentConversations.map((conversation) => conversation.id),
          qaStatus,
          qaAssigneeId: qaAssignee?.id,
          reviewDueAt,
          ...(requestedReopenIds.length > 0
            ? {
                reopenRequestedConversationIds: requestedReopenIds,
                reason: reopenReason,
                requestedById: user.id
              }
            : {}),
          ...(updatedIds.length > 0 ? { updatedConversationIds: updatedIds } : {})
        }
      },
      tx
    );
  });

  revalidatePath("/reviews");
  redirect(returnTo);
}
