import { QueueFilters } from "@/components/review/queue-filters";
import { QueueSavedViews } from "@/components/review/queue-saved-views";
import { QueueSummary } from "@/components/review/queue-summary";
import { QueueTable } from "@/components/review/queue-table";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  getReviewQueue,
  getReviewQueueFilterOptions,
  getReviewQueueSummary,
  parseReviewQueueFilters,
  type ReviewQueueSearchParams
} from "@/lib/review-repository";

export const dynamic = "force-dynamic";

type ReviewsPageProps = {
  searchParams: Promise<ReviewQueueSearchParams>;
};

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

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const user = await getCurrentUser();
  const rawParams = await searchParams;
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

  return (
    <section className="page-shell">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Очередь проверок</h1>
        <p className="mt-1 text-sm text-[#667085]">Рабочая очередь проверок с фильтрами по состоянию, каналу и источнику.</p>
      </div>
      <QueueSummary {...summary} filtered={conversations.length} />
      <QueueSavedViews currentAssigneeName={user.name} currentHref={currentHref} savedViews={savedViews} />
      <QueueFilters
        filters={filters}
        sources={filterOptions.sources}
        assignees={filterOptions.assignees}
        qaAssignees={filterOptions.qaAssignees}
        supportLines={filterOptions.supportLines}
      />
      <QueueTable conversations={conversations} qaAssignees={qaAssignees} returnTo={currentHref} />
    </section>
  );
}
