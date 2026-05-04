import { QueueFilters } from "@/components/review/queue-filters";
import { QueueSavedViews } from "@/components/review/queue-saved-views";
import { QueueSummary } from "@/components/review/queue-summary";
import { QueueTable } from "@/components/review/queue-table";
import { getReviewQueuePageData } from "@/lib/review-queue-page-data";
import type { ReviewQueueSearchParams } from "@/lib/review-repository";

export const dynamic = "force-dynamic";

type ReviewsPageProps = {
  searchParams: Promise<ReviewQueueSearchParams>;
};

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const data = await getReviewQueuePageData(await searchParams);

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Очередь проверок</h1>
          <p className="page-subtitle">Рабочий inbox для ручной проверки: сначала обращения, затем фильтры и массовые действия по намерению.</p>
        </div>
      </div>
      <QueueSummary {...data.summary} filtered={data.conversations.length} />
      <section className="queue-controls panel">
        <QueueSavedViews currentAssigneeName={data.currentAssigneeName} currentHref={data.currentHref} savedViews={data.savedViews} />
        <QueueFilters
          filters={data.filters}
          sources={data.filterOptions.sources}
          assignees={data.filterOptions.assignees}
          qaAssignees={data.filterOptions.qaAssignees}
          supportLines={data.filterOptions.supportLines}
        />
      </section>
      <div className="grid min-w-0 gap-3">
        <QueueTable conversations={data.conversations} qaAssignees={data.qaAssignees} returnTo={data.currentHref} />
      </div>
    </section>
  );
}
