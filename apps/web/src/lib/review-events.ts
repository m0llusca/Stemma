import type { PendingFinalizedReopenRequest } from "@/lib/review-workflow-policy";

type ReviewEventClient = {
  reviewEvent: {
    create: (args: {
      data: {
        workspaceId: string;
        reviewId: string | null;
        conversationId: string | null;
        actorId: string | null;
        action: string;
        fromStatus: string | null;
        toStatus: string | null;
        metadata: string;
      };
    }) => Promise<unknown>;
  };
};

type ReviewEventReaderClient = {
  reviewEvent: {
    findFirst: (args: {
      where: Record<string, unknown>;
      orderBy: { createdAt: "desc" };
      select: Record<string, true>;
    }) => Promise<Record<string, unknown> | null>;
  };
};

export const QA_REOPEN_REQUESTED_ACTION = "qa.reopen_requested";
export const QA_REOPENED_ACTION = "qa.reopened";

const REVIEW_EVENT_ACTION_LABELS: Record<string, string> = {
  "appeal.opened": "Открыта апелляция",
  "appeal.resolved": "Апелляция закрыта",
  "conversation.bulk_workflow_updated": "Очередь проверок обновлена",
  "conversation.workflow_updated": "Маршрут проверки обновлен",
  "feedback.acknowledged": "Обратная связь принята",
  "privacy.conversation_redacted": "Обращение обезличено",
  [QA_REOPEN_REQUESTED_ACTION]: "Запрошено переоткрытие проверки",
  [QA_REOPENED_ACTION]: "Проверка возвращена в работу",
  "review.assigned": "Проверка назначена",
  "review.draft_saved": "Черновик проверки",
  "review.feedback.acknowledged": "Обратная связь подтверждена",
  "review.feedback.appeal_confirmed": "Апелляция подтверждена",
  "review.feedback.appeal_corrected": "Апелляция скорректирована",
  "review.feedback.appeal_opened": "Открыта апелляция",
  "review.feedback.reanswer_completed": "Переответ выполнен",
  "review.feedback.reanswer_requested": "Запрошен переответ",
  "review.finalized": "Проверка завершена",
  "review.reopened": "Проверка переоткрыта",
  "calibration.appeal_signal": "Сигнал калибровки по апелляции",
  "coaching.action_status_updated": "Статус разбора обновлён",
  "training.assignment_created": "Учебная задача создана"
};

/** Dedicated ReviewEvent action written when an appeal is confirmed or corrected. */
export const CALIBRATION_APPEAL_SIGNAL_ACTION = "calibration.appeal_signal";

export function reviewEventActionLabel(action: string) {
  return REVIEW_EVENT_ACTION_LABELS[action] ?? action;
}

export async function findLatestReopenedAt(client: ReviewEventReaderClient, workspaceId: string, conversationId: string) {
  const event = await client.reviewEvent.findFirst({
    where: {
      workspaceId,
      conversationId,
      toStatus: "REOPENED"
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });

  return (event?.createdAt as Date | undefined) ?? null;
}

function parsePendingReopenFromEvent(event: {
  actorId: string | null;
  metadata: string;
  createdAt: Date;
}): PendingFinalizedReopenRequest | null {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(event.metadata) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  const requestedById =
    (typeof parsed.requestedById === "string" && parsed.requestedById.trim()) || event.actorId?.trim() || "";

  if (!reason || !requestedById) {
    return null;
  }

  return {
    reason,
    requestedById,
    requestedAt: event.createdAt
  };
}

/** Latest `qa.reopen_requested` that is still pending (after the last applied `qa.reopened`). */
export async function findPendingFinalizedReopenRequest(
  client: ReviewEventReaderClient,
  workspaceId: string,
  conversationId: string
): Promise<PendingFinalizedReopenRequest | null> {
  const request = await client.reviewEvent.findFirst({
    where: {
      workspaceId,
      conversationId,
      action: QA_REOPEN_REQUESTED_ACTION
    },
    orderBy: { createdAt: "desc" },
    select: {
      actorId: true,
      metadata: true,
      createdAt: true
    }
  });

  if (!request || !(request.createdAt instanceof Date) || typeof request.metadata !== "string") {
    return null;
  }

  const latestReopenedAt = await findLatestReopenedAt(client, workspaceId, conversationId);
  if (latestReopenedAt && request.createdAt <= latestReopenedAt) {
    return null;
  }

  return parsePendingReopenFromEvent({
    actorId: typeof request.actorId === "string" ? request.actorId : null,
    metadata: request.metadata,
    createdAt: request.createdAt
  });
}

type ReviewEventBatchReaderClient = {
  reviewEvent: {
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy: { createdAt: "desc" };
      select: Record<string, true>;
    }) => Promise<Array<Record<string, unknown>>>;
  };
};

type ReviewEventBatchRow = {
  conversationId: string | null;
  action: string;
  actorId: string | null;
  metadata: string;
  createdAt: Date;
  toStatus: string | null;
};

function asReviewEventBatchRow(event: Record<string, unknown>): ReviewEventBatchRow | null {
  if (!(event.createdAt instanceof Date) || typeof event.metadata !== "string" || typeof event.action !== "string") {
    return null;
  }

  return {
    conversationId: typeof event.conversationId === "string" ? event.conversationId : null,
    action: event.action,
    actorId: typeof event.actorId === "string" ? event.actorId : null,
    metadata: event.metadata,
    createdAt: event.createdAt,
    toStatus: typeof event.toStatus === "string" ? event.toStatus : null
  };
}

/** Batch pending reopen lookup for queue rows (event-sourced, no Conversation column). */
export async function findPendingFinalizedReopenRequestsByConversationIds(
  client: ReviewEventBatchReaderClient,
  workspaceId: string,
  conversationIds: string[]
): Promise<Map<string, PendingFinalizedReopenRequest>> {
  const pendingByConversationId = new Map<string, PendingFinalizedReopenRequest>();
  if (conversationIds.length === 0) {
    return pendingByConversationId;
  }

  const rawEvents = await client.reviewEvent.findMany({
    where: {
      workspaceId,
      conversationId: { in: conversationIds },
      OR: [{ action: QA_REOPEN_REQUESTED_ACTION }, { toStatus: "REOPENED" }]
    },
    orderBy: { createdAt: "desc" },
    select: {
      conversationId: true,
      action: true,
      actorId: true,
      metadata: true,
      createdAt: true,
      toStatus: true
    }
  });

  const latestRequest = new Map<string, ReviewEventBatchRow>();
  const latestReopenedAt = new Map<string, Date>();

  for (const raw of rawEvents) {
    const event = asReviewEventBatchRow(raw);
    if (!event?.conversationId) {
      continue;
    }

    if (event.action === QA_REOPEN_REQUESTED_ACTION && !latestRequest.has(event.conversationId)) {
      latestRequest.set(event.conversationId, event);
    }

    if (event.toStatus === "REOPENED" && !latestReopenedAt.has(event.conversationId)) {
      latestReopenedAt.set(event.conversationId, event.createdAt);
    }
  }

  for (const [conversationId, request] of latestRequest) {
    const reopenedAt = latestReopenedAt.get(conversationId);
    if (reopenedAt && request.createdAt <= reopenedAt) {
      continue;
    }

    const pending = parsePendingReopenFromEvent(request);
    if (pending) {
      pendingByConversationId.set(conversationId, pending);
    }
  }

  return pendingByConversationId;
}

export async function recordReviewEvent(
  client: ReviewEventClient,
  input: {
    workspaceId: string;
    reviewId?: string | null;
    conversationId?: string | null;
    actorId?: string | null;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: unknown;
  }
) {
  return client.reviewEvent.create({
    data: {
      workspaceId: input.workspaceId,
      reviewId: input.reviewId ?? null,
      conversationId: input.conversationId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      metadata: JSON.stringify(input.metadata ?? {})
    }
  });
}
