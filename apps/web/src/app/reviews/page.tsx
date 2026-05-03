import { QueueFilters } from "@/components/review/queue-filters";
import { QueueSavedViews } from "@/components/review/queue-saved-views";
import { QueueSummary } from "@/components/review/queue-summary";
import { QueueTable } from "@/components/review/queue-table";
import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
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
  const user = await requireCurrentUserPermission("reviews:read");
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
    <section className="page-shell workspace-shell">
      <div className="workspace-hero workspace-hero--split">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Очередь проверок</h1>
          <p className="page-subtitle">Рабочая очередь проверок с быстрым поиском, сохраненными представлениями и компактными карточками обращений.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <Link href="/reviews?status=unreviewed" className="record-card record-card--interactive">
            <p className="record-meta">В очереди</p>
            <p className="record-title">{summary.queued}</p>
          </Link>
          <Link href="/reviews?due=overdue" className="record-card record-card--interactive">
            <p className="record-meta">Просрочено</p>
            <p className="record-title">{summary.overdue}</p>
          </Link>
          <Link href="/reviews?status=reviewed" className="record-card record-card--interactive">
            <p className="record-meta">Завершено</p>
            <p className="record-title">{summary.reviewed}</p>
          </Link>
        </div>
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
