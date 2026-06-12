import { ArrowRight, CheckCircle2, Clock3, Inbox, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { QueueFilters } from "@/components/review/queue-filters";
import { QueueSavedViews } from "@/components/review/queue-saved-views";
import { QueueTable } from "@/components/review/queue-table";
import { StickyCommandBarShell } from "@/components/reports/sticky-command-bar-shell";
import { takeNextReview } from "@/lib/queue-view-actions";
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
  const visibleCriticalCount = data.conversations.filter((conversation) =>
    conversation.reviews.some((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN" && review.criticalError)
  ).length;
  const visibleReanswerCount = data.conversations.filter((conversation) =>
    conversation.reviews.some((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN" && review.needsReanswer)
  ).length;
  const visibleUnassignedCount = data.conversations.filter(
    (conversation) => conversation.qaStatus !== "FINALIZED" && !conversation.qaAssigneeName
  ).length;
  const reviewFocusItems = [
    overdue > 0
      ? {
          href: "/reviews?due=overdue",
          label: "Просроченные SLA",
          value: overdue,
          description: "Сначала закрыть или переназначить"
        }
      : null,
    visibleCriticalCount > 0
      ? {
          href: "/reviews?process=critical",
          label: "Критический риск",
          value: visibleCriticalCount,
          description: "Проверить переответ и обучение"
        }
      : null,
    visibleUnassignedCount > 0
      ? {
          href: "/reviews?qaStatus=QUEUED",
          label: "Без проверяющего",
          value: visibleUnassignedCount,
          description: "Назначить владельца проверки"
        }
      : null,
    visibleReanswerCount > 0
      ? {
          href: "/reviews?process=reanswer",
          label: "Нужен переответ",
          value: visibleReanswerCount,
          description: "Сверить текст до отправки"
        }
      : null
  ].filter((item): item is { href: string; label: string; value: number; description: string } => Boolean(item)).slice(0, 3);

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center command-center--split command-center--metrics review-command-center">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Очередь проверок</h1>
          <p className="page-subtitle">
            Найдено {filteredCount} из {total}. Рабочий inbox для ручной проверки: сначала обращения, затем фильтры и массовые действия.
          </p>
          <div className="admin-actions mt-4">
            <form action={takeNextReview}>
              <button type="submit" className="action-button action-button--primary">
                <ArrowRight size={18} aria-hidden="true" />
                Взять следующий
              </button>
            </form>
          </div>
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

      <section className="workflow-focus-strip" aria-label="Где смотреть в очереди сейчас">
        <div className="workflow-focus-strip__lead">
          <span className="page-kicker">Фокус очереди</span>
          <strong>{reviewFocusItems.length > 0 ? "Есть действия на сейчас" : "Критичных действий нет"}</strong>
          <small>{reviewFocusItems.length > 0 ? "Открывайте с самого жесткого SLA или риска." : "Можно разбирать очередь по обычному приоритету."}</small>
        </div>
        <div className="workflow-focus-strip__items">
          {reviewFocusItems.length > 0 ? (
            reviewFocusItems.map((item) => (
              <Link key={item.href} href={item.href} className="workflow-focus-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.description}</small>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))
          ) : (
            <Link href="/reviews?status=unreviewed" className="workflow-focus-card">
              <span>Следующая проверка</span>
              <strong>{queued + inWork}</strong>
              <small>Открыть незавершенные обращения</small>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>
      <StickyCommandBarShell className="queue-controls-bar" ariaLabel="Фильтры и виды очереди">
        <div className="queue-sticky-metrics" aria-label="Сводка очереди">
          <span className="sticky-metric">
            <Inbox size={14} aria-hidden="true" />
            <strong>{queued}</strong>ожидают
          </span>
          <span className="sticky-metric">
            <Clock3 size={14} aria-hidden="true" />
            <strong>{inWork}</strong>в работе
          </span>
          <span className="sticky-metric sticky-metric--danger">
            <TriangleAlert size={14} aria-hidden="true" />
            <strong>{overdue}</strong>просрочено
          </span>
          <span className="sticky-metric sticky-metric--success">
            <CheckCircle2 size={14} aria-hidden="true" />
            <strong>{reviewed}</strong>завершено
          </span>
        </div>
        <QueueSavedViews currentAssigneeName={data.currentAssigneeName} currentHref={data.currentHref} savedViews={data.savedViews} />
        <QueueFilters
          filters={data.filters}
          sources={data.filterOptions.sources}
          assignees={data.filterOptions.assignees}
          qaAssignees={data.filterOptions.qaAssignees}
          supportLines={data.filterOptions.supportLines}
          teamNames={data.filterOptions.teamNames}
        />
      </StickyCommandBarShell>
      <div className="grid min-w-0 gap-3">
        <QueueTable conversations={data.conversations} qaAssignees={data.qaAssignees} returnTo={data.currentHref} />
      </div>
    </section>
  );
}
