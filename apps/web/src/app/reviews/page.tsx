import { CheckCircle2, Clock3, Inbox, TriangleAlert } from "lucide-react";
import { QueueFilters } from "@/components/review/queue-filters";
import { QueueSavedViews } from "@/components/review/queue-saved-views";
import { QueueTable } from "@/components/review/queue-table";
import { getReviewQueuePageData } from "@/lib/review-queue-page-data";
import type { ReviewQueueSearchParams } from "@/lib/review-repository";

export const dynamic = "force-dynamic";

type ReviewsPageProps = {
  searchParams: Promise<ReviewQueueSearchParams>;
};

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const data = await getReviewQueuePageData(await searchParams);
  const filteredCount = data.conversations.length;
  const { total, queued, inWork, reviewed, overdue } = data.summary;

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center command-center--split command-center--metrics review-command-center">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Очередь проверок</h1>
          <p className="page-subtitle">
            Найдено {filteredCount} из {total}. Рабочий inbox для ручной проверки: сначала обращения, затем фильтры и массовые действия.
          </p>
        </div>
        <div className="learning-metrics review-queue-metrics" aria-label="Сводка очереди проверок">
          <div className="learning-metric">
            <Inbox size={16} aria-hidden="true" />
            <span>{queued}</span>
            <small>ожидают</small>
          </div>
          <div className="learning-metric">
            <Clock3 size={16} aria-hidden="true" />
            <span>{inWork}</span>
            <small>в работе</small>
          </div>
          <div className="learning-metric learning-metric--danger">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{overdue}</span>
            <small>просрочено</small>
          </div>
          <div className="learning-metric learning-metric--success">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{reviewed}</span>
            <small>завершено</small>
          </div>
        </div>
      </div>
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
