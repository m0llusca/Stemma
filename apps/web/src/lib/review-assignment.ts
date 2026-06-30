import type { Prisma, RoleName } from "@prisma/client";

export type ReviewerCandidate = { id: string; name: string };

/**
 * Roles eligible to act as QA reviewers (matches the reviewer gate used across
 * the app, see src/lib/current-user.ts). Workspace members with these roles can
 * be auto-assigned conversations selected for QA.
 */
export const REVIEWER_ROLES: RoleName[] = ["QA_ANALYST", "ADMIN", "TEAM_LEAD"];

/**
 * QA statuses that count as an open, in-flight review load for a reviewer.
 * A conversation already finalized (or never queued) does not add to the load
 * we balance against.
 */
export const OPEN_LOAD_QA_STATUSES = ["QUEUED", "IN_PROGRESS"] as const;

/**
 * Pure, deterministic least-loaded selection.
 *
 * Picks the candidate with the smallest current load (missing entries count as
 * 0). Ties are broken by name using locale-independent ordering so the result
 * is stable regardless of input order. Returns null when there are no
 * candidates.
 */
export function selectLeastLoadedReviewer(
  candidates: ReviewerCandidate[],
  loadByName: Record<string, number>
): ReviewerCandidate | null {
  let chosen: ReviewerCandidate | null = null;
  let chosenLoad = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const load = loadByName[candidate.name] ?? 0;

    if (
      chosen === null ||
      load < chosenLoad ||
      (load === chosenLoad && candidate.name < chosen.name)
    ) {
      chosen = candidate;
      chosenLoad = load;
    }
  }

  return chosen;
}

type ReviewAssignmentClient = {
  user: Pick<Prisma.TransactionClient["user"], "findMany">;
  conversation: Pick<Prisma.TransactionClient["conversation"], "count">;
};

/**
 * Selects the least-loaded eligible reviewer for a workspace.
 *
 * Candidate query: active users (lifecycleStatus = ACTIVE) in the workspace
 * whose role is one of REVIEWER_ROLES (QA_ANALYST, ADMIN, TEAM_LEAD).
 *
 * Load metric: per candidate, the count of conversations in the same workspace
 * where qaAssigneeName = candidate.name AND qaStatus in (QUEUED, IN_PROGRESS).
 *
 * Returns the chosen reviewer, or null when there are no eligible candidates.
 * Uses the passed prisma / transaction client so it composes inside an import
 * transaction.
 */
export async function assignReviewerForConversation(
  workspaceId: string,
  client: ReviewAssignmentClient
): Promise<ReviewerCandidate | null> {
  const users = await client.user.findMany({
    where: {
      workspaceId,
      lifecycleStatus: "ACTIVE",
      role: { in: REVIEWER_ROLES }
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  if (users.length === 0) {
    return null;
  }

  const loadByName: Record<string, number> = {};

  for (const user of users) {
    loadByName[user.name] = await client.conversation.count({
      where: {
        workspaceId,
        qaAssigneeName: user.name,
        qaStatus: { in: [...OPEN_LOAD_QA_STATUSES] }
      }
    });
  }

  return selectLeastLoadedReviewer(
    users.map((user) => ({ id: user.id, name: user.name })),
    loadByName
  );
}
