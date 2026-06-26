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
      where: { workspaceId: string; conversationId: string; toStatus: string };
      orderBy: { createdAt: "desc" };
      select: { createdAt: true };
    }) => Promise<{ createdAt: Date } | null>;
  };
};

const REVIEW_EVENT_ACTION_LABELS: Record<string, string> = {
  "appeal.opened": "Открыта апелляция",
  "appeal.resolved": "Апелляция закрыта",
  "conversation.bulk_workflow_updated": "Очередь проверок обновлена",
  "conversation.workflow_updated": "Маршрут проверки обновлен",
  "feedback.acknowledged": "Обратная связь принята",
  "privacy.conversation_redacted": "Обращение обезличено",
  "qa.reopened": "Проверка возвращена в работу",
  "review.assigned": "Проверка назначена",
  "review.draft_saved": "Черновик проверки",
  "review.feedback.acknowledged": "Обратная связь подтверждена",
  "review.feedback.appeal_confirmed": "Апелляция подтверждена",
  "review.feedback.appeal_opened": "Открыта апелляция",
  "review.feedback.reanswer_completed": "Переответ выполнен",
  "review.feedback.reanswer_requested": "Запрошен переответ",
  "review.finalized": "Проверка завершена",
  "review.reopened": "Проверка переоткрыта",
  "training.assignment_created": "Учебная задача создана"
};

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

  return event?.createdAt ?? null;
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
