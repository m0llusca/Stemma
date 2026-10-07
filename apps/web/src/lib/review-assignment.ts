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
  loadById: Record<string, number>
): ReviewerCandidate | null {
  let chosen: ReviewerCandidate | null = null;
  let chosenLoad = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const load = loadById[candidate.id] ?? 0;

    if (
      chosen === null ||
      load < chosenLoad ||
      (load === chosenLoad && (candidate.name < chosen.name || (candidate.name === chosen.name && candidate.id < chosen.id)))
    ) {
      chosen = candidate;
      chosenLoad = load;
    }
  }

  return chosen;
}

export type OpenAssignmentGroup = {
  qaAssigneeId?: string | null;
  qaAssigneeName?: string | null;
  qaStatus?: string | null;
  _count: { _all: number };
};

export type OpenAssignmentLoad = {
  queued: number;
  inProgress: number;
  open: number;
};

/**
 * Open load is id ∪ name-only.
 * A row with `qaAssigneeId` counts only for that user (the id is authoritative).
 * A row with a null id counts for every active reviewer whose name matches.
 * Status-less aggregates (assignment picker) add to `open` only.
 */
export function accumulateOpenAssignmentLoad(
  users: ReviewerCandidate[],
  groups: OpenAssignmentGroup[]
): Map<string, OpenAssignmentLoad> {
  const byId = new Map<string, OpenAssignmentLoad>();
  const usersByName = new Map<string, ReviewerCandidate[]>();

  for (const user of users) {
    byId.set(user.id, { queued: 0, inProgress: 0, open: 0 });
    const named = usersByName.get(user.name) ?? [];
    named.push(user);
    usersByName.set(user.name, named);
  }

  for (const group of groups) {
    const count = group._count._all;
    const targets = group.qaAssigneeId
      ? users.filter((user) => user.id === group.qaAssigneeId)
      : group.qaAssigneeName
        ? (usersByName.get(group.qaAssigneeName) ?? [])
        : [];

    for (const user of targets) {
      const bucket = byId.get(user.id);
      if (!bucket) {
        continue;
      }
      if (group.qaStatus === "QUEUED") {
        bucket.queued += count;
        bucket.open += count;
      } else if (group.qaStatus === "IN_PROGRESS") {
        bucket.inProgress += count;
        bucket.open += count;
      } else {
        bucket.open += count;
      }
    }
  }

  return byId;
}

type ReviewAssignmentClient = {
  user: Pick<Prisma.TransactionClient["user"], "findMany">;
  conversation: Pick<Prisma.TransactionClient["conversation"], "groupBy">;
};

export async function loadOpenAssignmentGroups(
  workspaceId: string,
  users: ReviewerCandidate[],
  client: Pick<ReviewAssignmentClient, "conversation">
) {
  return client.conversation.groupBy({
    by: ["qaAssigneeId", "qaAssigneeName", "qaStatus"],
    where: {
      workspaceId,
      qaStatus: { in: [...OPEN_LOAD_QA_STATUSES] },
      OR: [
        { qaAssigneeId: { in: users.map((user) => user.id) } },
        { qaAssigneeId: null, qaAssigneeName: { in: users.map((user) => user.name) } }
      ]
    },
    _count: { _all: true }
  });
}

/**
 * Selects the least-loaded eligible reviewer for a workspace.
 *
 * Candidate query: active users (lifecycleStatus = ACTIVE) in the workspace
 * whose role is one of REVIEWER_ROLES (QA_ANALYST, ADMIN, TEAM_LEAD).
 *
 * One aggregate query counts all candidates by their unique user ID, so equal
 * display names have separate loads and reviewer count does not add queries.
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

  const candidates = users.map((user) => ({ id: user.id, name: user.name }));
  const groups = await loadOpenAssignmentGroups(workspaceId, candidates, client);
  const loads = accumulateOpenAssignmentLoad(candidates, groups);
  const loadById = Object.fromEntries(candidates.map((user) => [user.id, loads.get(user.id)?.open ?? 0]));

  return selectLeastLoadedReviewer(candidates, loadById);
}
