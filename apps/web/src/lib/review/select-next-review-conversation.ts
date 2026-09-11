import type { ReviewQueueFilters } from "@/lib/contracts/review-queue";
import { prisma } from "@/lib/db";
import { nextReviewOrderBy, nextReviewWhere, type NextReviewUser } from "@/lib/review/next-review-query";
import { buildReviewQueueWhere } from "@/lib/review-repository";

/**
 * Resolves the id of the next conversation to grade, or null when the queue is
 * empty for this user. Only reads — never assigns or mutates — to avoid races
 * during parallel work. Priority order + scope live in the shared pure helper so
 * the queue button and the "finalize & take next" workbench action never drift.
 * Optional filters keep take-next inside the active queue URL view.
 *
 * Not a `"use server"` action — call from authenticated wrappers only.
 */
export async function selectNextReviewConversationId(
  user: NextReviewUser,
  excludeConversationId?: string,
  filters?: ReviewQueueFilters
): Promise<string | null> {
  const base = nextReviewWhere(user, excludeConversationId);
  const where = filters ? { AND: [base, buildReviewQueueWhere(user.workspaceId, filters)] } : base;
  const conversation = await prisma.conversation.findFirst({
    where,
    orderBy: nextReviewOrderBy,
    select: { id: true }
  });

  return conversation?.id ?? null;
}
