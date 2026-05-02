import { QueueFilters } from "@/components/review/queue-filters";
import { QueueSummary } from "@/components/review/queue-summary";
import { QueueTable } from "@/components/review/queue-table";
import { getCurrentUser } from "@/lib/current-user";
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

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const user = await getCurrentUser();
  const filters = parseReviewQueueFilters(await searchParams);
  const [conversations, summary, filterOptions] = await Promise.all([
    getReviewQueue(user.workspaceId, filters),
    getReviewQueueSummary(user.workspaceId),
    getReviewQueueFilterOptions(user.workspaceId)
  ]);

  return (
    <section className="px-8 py-7">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Очередь проверок</h1>
        <p className="mt-1 text-sm text-[#667085]">Рабочая очередь QA с фильтрами по статусу, каналу и источнику.</p>
      </div>
      <QueueSummary {...summary} filtered={conversations.length} />
      <QueueFilters filters={filters} sources={filterOptions.sources} assignees={filterOptions.assignees} />
      <QueueTable conversations={conversations} />
    </section>
  );
}
