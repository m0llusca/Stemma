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
  const effectiveFilters = user.role === "SUPPORT_AGENT" ? { ...filters, assignee: user.name } : filters;
  const currentHref = reviewQueueHref(rawParams);

  const [conversations, summary, filterOptions, qaAssignees, savedViews] = await Promise.all([
    getReviewQueue(user.workspaceId, effectiveFilters),
    getReviewQueueSummary(user.workspaceId),
    getReviewQueueFilterOptions(user.workspaceId),
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
