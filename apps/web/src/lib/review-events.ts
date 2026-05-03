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
