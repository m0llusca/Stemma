import { QueueFilters } from "@/components/review/queue-filters";
import { QueueSavedViews } from "@/components/review/queue-saved-views";
import { QueueSummary } from "@/components/review/queue-summary";
import { QueueTable } from "@/components/review/queue-table";
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
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Очередь проверок</h1>
          <p className="page-subtitle">Рабочий inbox для ручной проверки: сначала обращения, затем фильтры и массовые действия по намерению.</p>
        </div>
      </div>
      <QueueSummary {...summary} filtered={conversations.length} />
      <div className="ops-layout ops-layout--queue">
        <div className="grid min-w-0 gap-3">
          <QueueFilters
            filters={filters}
            sources={filterOptions.sources}
            assignees={filterOptions.assignees}
            qaAssignees={filterOptions.qaAssignees}
            supportLines={filterOptions.supportLines}
          />
          <QueueTable conversations={conversations} qaAssignees={qaAssignees} returnTo={currentHref} />
        </div>
        <aside className="ops-rail">
          <QueueSavedViews currentAssigneeName={user.name} currentHref={currentHref} savedViews={savedViews} />
          <section className="ops-focus">
            <h2 className="ops-heading">Фокус смены</h2>
            <p className="ops-copy">Сначала просрочки и обращения с риском, затем плановая очередь.</p>
            <div className="ops-section mt-4 grid gap-3">
              <div>
                <p className="metric-strip__label">Просрочено</p>
                <p className="metric-strip__value">{summary.overdue}</p>
              </div>
              <div>
                <p className="metric-strip__label">В работе</p>
                <p className="metric-strip__value">{summary.inWork}</p>
              </div>
              <div>
                <p className="metric-strip__label">В фильтре</p>
                <p className="metric-strip__value">{conversations.length}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
