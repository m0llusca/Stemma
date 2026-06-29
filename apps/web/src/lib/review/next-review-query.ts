import type { Prisma } from "@prisma/client";

/**
 * Shared priority order + scope for "take next" review navigation.
 *
 * Pure (no "use server", no prisma) so both the queue's "Взять следующий" button
 * and the workbench's "Завершить и взять следующий" action select the next case
 * with identical SLA priority and identical support-agent scoping — they can
 * never drift. The order mirrors the review queue (reviewDueAt — SLA urgency,
 * see the due=overdue filter); support agents are scoped to their own cases.
 */
export type NextReviewUser = { workspaceId: string; name: string; role: string };

export function nextReviewWhere(user: NextReviewUser, excludeConversationId?: string): Prisma.ConversationWhereInput {
  const supportAgentScope: Prisma.ConversationWhereInput =
    user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : {};

  return {
    workspaceId: user.workspaceId,
    qaStatus: { not: "FINALIZED" },
    ...(excludeConversationId ? { id: { not: excludeConversationId } } : {}),
    ...supportAgentScope
  };
}

export const nextReviewOrderBy: Prisma.ConversationOrderByWithRelationInput[] = [
  { reviewDueAt: { sort: "asc", nulls: "last" } },
  { openedAt: "desc" }
];
