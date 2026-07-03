import type { ReviewQueuePageData } from "@/lib/contracts/review-queue";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  getReviewQueue,
  getReviewQueueFilterOptions,
  getReviewQueueSummary,
  parseReviewQueueFilters,
  type ReviewQueueSearchParams
} from "@/lib/review-repository";

function reviewQueueHref(params: ReviewQueueSearchParams) {
  const urlSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (item) {
        urlSearchParams.append(key, item);
      }
    }
  }

  const query = urlSearchParams.toString();

  return query ? `/reviews?${query}` : "/reviews";
}

export async function getReviewQueuePageData(rawParams: ReviewQueueSearchParams): Promise<ReviewQueuePageData> {
  const user = await requireCurrentUserPermission("reviews:read");
  const filters = parseReviewQueueFilters(rawParams);
  // Scope operators by their unique assigneeId, never the non-unique display
  // name. The id-keyed scope is the authoritative fail-closed pin applied to
  // every queue query below.
  // NOTE: ReviewQueueScope (src/lib/review-repository.ts, owned by a parallel
  // agent) must gain `assigneeId?: string` and honor it in scopedConversationWhere
  // / buildReviewQueueWhere for this to compile and scope summary/filter-options.
  const supportAgentScope = user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : undefined;
  const effectiveFilters = supportAgentScope ? { ...filters, assignee: user.name } : filters;
  const currentHref = reviewQueueHref(rawParams);

  const [conversations, summary, filterOptions, qaAssignees, savedViews] = await Promise.all([
    getReviewQueue(user.workspaceId, effectiveFilters, supportAgentScope),
    getReviewQueueSummary(user.workspaceId, supportAgentScope),
    getReviewQueueFilterOptions(user.workspaceId, supportAgentScope),
    prisma.user.findMany({
      where: {
        workspaceId: user.workspaceId,
        role: {
          in: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"]
        }
      },
      orderBy: {
        name: "asc"
      },
      select: {
        id: true,
        name: true
      }
    }),
    prisma.savedQueueView.findMany({
      where: {
        workspaceId: user.workspaceId,
        OR: [{ userId: user.id }, { scope: "workspace" }]
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        href: true,
        scope: true
      }
    })
  ]);

  return {
    filters,
    currentHref,
    currentAssigneeName: user.name,
    conversations,
    summary,
    filterOptions,
    qaAssignees,
    savedViews
  };
}
