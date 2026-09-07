import type { Prisma } from "@prisma/client";
import { outOfSampleSamplingType } from "@/lib/sampling-engine";

/**
 * Shared priority order + scope for "take next" review navigation.
 *
 * Pure (no "use server", no prisma) so both the queue's "Взять следующий" button
 * and the workbench's "Завершить и взять следующий" action select the next case
 * with identical SLA priority and identical support-agent scoping — they can
 * never drift. The order mirrors the review queue (reviewDueAt — SLA urgency,
 * see the due=overdue filter); support agents are scoped to their own cases by
 * unique assigneeId (never the non-unique display name).
 *
 * Unmatched sampling imports persist samplingType OUT_OF_SAMPLE (QaStatus has no
 * SKIPPED/OUT_OF_SAMPLE) and must not be take-next eligible.
 *
 * URL / saved-view filters are not part of this helper. The selector
 * (`selectNextReviewConversationId`) ANDs `buildReviewQueueWhere` on top so
 * Take next / finalize_next stay inside the same view as the queue list.
 */
export type NextReviewUser = { id: string; workspaceId: string; name: string; role: string };

export function nextReviewWhere(user: NextReviewUser, excludeConversationId?: string): Prisma.ConversationWhereInput {
  const supportAgentScope: Prisma.ConversationWhereInput =
    user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {};

  return {
    workspaceId: user.workspaceId,
    qaStatus: { not: "FINALIZED" },
    samplingType: { not: outOfSampleSamplingType },
    ...(excludeConversationId ? { id: { not: excludeConversationId } } : {}),
    ...supportAgentScope
  };
}

export const nextReviewOrderBy: Prisma.ConversationOrderByWithRelationInput[] = [
  { reviewDueAt: { sort: "asc", nulls: "last" } },
  { openedAt: "desc" }
];
