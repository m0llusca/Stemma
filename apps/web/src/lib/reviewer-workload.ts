/**
 * Competitive P1 #12 — reviewer assignment workload visibility.
 * Reuses OPEN_LOAD_QA_STATUSES + REVIEWER_ROLES from review-assignment
 * (same load metric as selectLeastLoadedReviewer). Not a full WFM surface.
 */

import type { Prisma } from "@prisma/client";
import {
  accumulateOpenAssignmentLoad,
  loadOpenAssignmentGroups,
  OPEN_LOAD_QA_STATUSES,
  REVIEWER_ROLES,
  type ReviewerCandidate
} from "@/lib/review-assignment";

export type ReviewerWorkloadRow = {
  id: string;
  name: string;
  queuedCount: number;
  inProgressCount: number;
  openCount: number;
};

export type ReviewerWorkloadOpenByName = Record<
  string,
  {
    queued: number;
    inProgress: number;
  }
>;

type ReviewerWorkloadClient = {
  user: Pick<Prisma.TransactionClient["user"], "findMany">;
  conversation: Pick<Prisma.TransactionClient["conversation"], "groupBy">;
};

/**
 * Pure merge of eligible reviewers with open QUEUED / IN_PROGRESS counts.
 * Missing load entries count as zero. Sorted by openCount desc, then name.
 */
export function buildReviewerWorkloadRows(
  reviewers: ReviewerCandidate[],
  openByName: ReviewerWorkloadOpenByName
): ReviewerWorkloadRow[] {
  return reviewers
    .map((reviewer) => {
      const load = openByName[reviewer.name] ?? { queued: 0, inProgress: 0 };
      const queuedCount = load.queued;
      const inProgressCount = load.inProgress;
      return {
        id: reviewer.id,
        name: reviewer.name,
        queuedCount,
        inProgressCount,
        openCount: queuedCount + inProgressCount
      };
    })
    .sort((left, right) => {
      if (right.openCount !== left.openCount) {
        return right.openCount - left.openCount;
      }
      return left.name.localeCompare(right.name, "ru");
    });
}

/**
 * Drill-through into the review queue for a QA assignee.
 * Single qaStatus when provided; otherwise the assignee inbox — a real
 * `qaAssignee` filter, not a fake open-work list dump.
 */
export function reviewerWorkloadHref(
  qaAssigneeName: string,
  qaStatus?: (typeof OPEN_LOAD_QA_STATUSES)[number]
) {
  const search = new URLSearchParams();
  search.set("qaAssignee", qaAssigneeName);
  if (qaStatus) {
    search.set("qaStatus", qaStatus);
  }
  return `/reviews?${search.toString()}`;
}

/**
 * Loads active reviewer-role users and their open assignment load
 * (QUEUED + IN_PROGRESS), matching assignReviewerForConversation.
 */
export async function loadReviewerWorkload(
  workspaceId: string,
  client: ReviewerWorkloadClient
): Promise<ReviewerWorkloadRow[]> {
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
    return [];
  }

  const candidates = users.map((user) => ({ id: user.id, name: user.name }));
  const groups = await loadOpenAssignmentGroups(workspaceId, candidates, client);
  const loads = accumulateOpenAssignmentLoad(candidates, groups);

  return candidates
    .map((reviewer) => {
      const load = loads.get(reviewer.id) ?? { queued: 0, inProgress: 0, open: 0 };
      return {
        id: reviewer.id,
        name: reviewer.name,
        queuedCount: load.queued,
        inProgressCount: load.inProgress,
        openCount: load.open
      };
    })
    .sort((left, right) => {
      if (right.openCount !== left.openCount) {
        return right.openCount - left.openCount;
      }
      return left.name.localeCompare(right.name, "ru");
    });
}
