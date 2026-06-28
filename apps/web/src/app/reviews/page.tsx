import { ArrowRight, CheckCircle2, Clock3, Inbox, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import { OperationalPageFrame } from "@/components/operations/operational-page-frame";
import { PriorityActionPanel } from "@/components/operations/priority-action-panel";
import { QueueFilters } from "@/components/review/queue-filters";
import { QueueSavedViews } from "@/components/review/queue-saved-views";
import { QueueTable } from "@/components/review/queue-table";
import { Chip } from "@/components/ui/chip";
import { StatKpi } from "@/components/ui/stat-kpi";
import { StickyCommandBarShell } from "@/components/reports/sticky-command-bar-shell";
import {
  channelLabels,
  csatBucketLabels,
  externalSourceLabel,
  formatMessageCount,
  qaStatusLabels,
  samplingTypeLabels
} from "@/lib/labels";
import { takeNextReview } from "@/lib/queue-view-actions";
import type { ReviewQueueConversationDto } from "@/lib/contracts/review-queue";
import { getReviewQueuePageData } from "@/lib/review-queue-page-data";
import type { ReviewQueueSearchParams } from "@/lib/review-repository";
import { resolveReviewState, reviewStateLabels } from "@/lib/review-state";
import { formatQualityScore } from "@/lib/score-display";

export const dynamic = "force-dynamic";

type ReviewsPageProps = {
  searchParams: Promise<ReviewQueueSearchParams>;
};

function queuePreviewHref(conversation: ReviewQueueConversationDto, returnTo: string) {
  return `/reviews/${conversation.id}?returnTo=${encodeURIComponent(returnTo)}`;
}

export default function ReviewsPage({ searchParams }: ReviewsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton label="Загрузка очереди проверок" />}>
      <ReviewsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ReviewsPageContent({ searchParams }: ReviewsPageProps) {
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
  const primaryReviewFocus = reviewFocusItems[0];
  const queueActionHref = primaryReviewFocus?.href ?? "/reviews?status=unreviewed";
  const queueActionTone =
    overdue > 0 || visibleCriticalCount > 0
      ? "negative"
      : visibleUnassignedCount > 0 || queued + inWork > 0
        ? "warning"
        : "positive";
  const queuePreview = data.conversations[0];
  const queuePreviewFinalized = queuePreview?.reviews.find(
    (review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN"
  );
  const queuePreviewDraft = queuePreview?.reviews.find((review) => review.status === "DRAFT" && review.reviewSource === "HUMAN");
  const queuePreviewState = queuePreview
    ? resolveReviewState({
        qaStatus: queuePreview.qaStatus,
        hasDraftReview: Boolean(queuePreviewDraft),
        hasFinalizedReview: Boolean(queuePreviewFinalized)
      })
    : null;
  const queuePreviewDueAt = queuePreview?.reviewDueAt ? new Date(queuePreview.reviewDueAt) : null;
  const queuePreviewOverdue =
    Boolean(queuePreviewDueAt && queuePreviewDueAt.getTime() < Date.now()) && queuePreview?.qaStatus !== "FINALIZED";
  const queuePreviewDueLabel = queuePreviewDueAt
    ? queuePreviewDueAt.toLocaleDateString("ru-RU")
    : queuePreview?.qaStatus === "FINALIZED"
      ? "закрыто"
      : "не задан";
  const queuePreviewSignals = queuePreview
    ? [
        {
          label: "SLA",
          value: queuePreviewDueLabel,
          detail: queuePreviewOverdue ? "Просрочено, открыть первым" : "Контрольный срок проверки",
          tone: queuePreviewOverdue ? "danger" : "neutral"
        },
        {
          label: "Риск",
          value: queuePreview.riskHint ?? (queuePreviewFinalized?.criticalError ? "Критический" : "Нет сигнала"),
          detail: queuePreviewFinalized?.needsReanswer ? "Есть переответ клиенту" : "Сигнал из выборки и итогов QA",
          tone: queuePreview.riskHint || queuePreviewFinalized?.criticalError || queuePreviewFinalized?.needsReanswer ? "warning" : "neutral"
        },
        {
          label: "Контекст",
          value: externalSourceLabel(queuePreview.externalSource),
          detail: `${channelLabels[queuePreview.channel]} · ${formatMessageCount(queuePreview.messageCount)}`,
          tone: "neutral"
        },
        {
          label: "Выборка",
          value: samplingTypeLabels[queuePreview.samplingType] ?? queuePreview.samplingType,
          detail: csatBucketLabels[queuePreview.csatBucket] ?? queuePreview.csatBucket,
          tone: queuePreview.csatBucket === "NEGATIVE" ? "warning" : "neutral"
        }
      ]
    : [];

  return (
    <OperationalPageFrame
      title="Очередь проверок"
      className="page-shell workspace-shell"
      signals={
        <div className="command-center command-center--split command-center--metrics review-command-center">
          <div className="min-w-0">
            <p className="page-kicker">Контроль качества</p>
            <h1 className="page-title">Очередь проверок</h1>
            <p className="page-subtitle">
              Найдено {filteredCount} из {total}. Рабочий inbox для ручной проверки: сначала обращения, затем фильтры и массовые действия.
            </p>
            <div className="admin-actions mt-4">
              <form action={takeNextReview}>
                <button type="submit" className="action-button">
                  <ArrowRight size={18} aria-hidden="true" />
                  Взять следующий
                </button>
              </form>
            </div>
          </div>
          <div className="review-queue-kpis" aria-label="Сводка очереди проверок">
            <StatKpi
              label="Ожидают"
              value={queued}
              icon={<Inbox size={16} aria-hidden="true" />}
            />
            <StatKpi
              label="В работе"
              value={inWork}
              icon={<Clock3 size={16} aria-hidden="true" />}
            />
            <StatKpi
              label="Просрочено"
              value={overdue}
              tone={overdue > 0 ? "danger" : "neutral"}
              icon={<TriangleAlert size={16} aria-hidden="true" />}
            />
            <StatKpi
              label="Завершено"
              value={reviewed}
              icon={<CheckCircle2 size={16} aria-hidden="true" />}
            />
          </div>
        </div>
      }
      action={
        <PriorityActionPanel
          title={primaryReviewFocus?.label ?? "Открыть следующую проверку"}
          description={primaryReviewFocus?.description ?? "Критичных действий нет. Продолжайте обычный разбор незавершенной очереди."}
          actionLabel={primaryReviewFocus ? "Перейти к задаче" : "Открыть очередь"}
          href={queueActionHref}
          tone={queueActionTone}
        />
      }
      details={
        <>
          <section className="queue-focus panel" aria-label="Где смотреть в очереди сейчас">
            <div className="queue-focus__head">
              <span className="page-kicker">Фокус очереди</span>
              <strong>{reviewFocusItems.length > 0 ? "Есть действия на сейчас" : "Критичных действий нет"}</strong>
              <small>{reviewFocusItems.length > 0 ? "Открывайте с самого жесткого SLA или риска." : "Можно разбирать очередь по обычному приоритету."}</small>
            </div>
            <div className="queue-focus__items">
              {reviewFocusItems.length > 0 ? (
                reviewFocusItems.map((item) => (
                  <Link key={item.href} href={item.href} className="queue-focus-item">
                    <span className="queue-focus-item__label">{item.label}</span>
                    <strong className="queue-focus-item__value">{item.value}</strong>
                    <small className="queue-focus-item__hint">{item.description}</small>
                    <ArrowRight size={15} aria-hidden="true" className="queue-focus-item__arrow" />
                  </Link>
                ))
              ) : (
                <Link href="/reviews?status=unreviewed" className="queue-focus-item">
                  <span className="queue-focus-item__label">Незавершенные</span>
                  <strong className="queue-focus-item__value">{queued + inWork}</strong>
                  <small className="queue-focus-item__hint">Открыть незавершенные обращения</small>
                  <ArrowRight size={15} aria-hidden="true" className="queue-focus-item__arrow" />
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
          <div className="queue-cockpit-layout">
            <div className="queue-cockpit-layout__list">
              <QueueTable conversations={data.conversations} qaAssignees={data.qaAssignees} returnTo={data.currentHref} />
            </div>
            {queuePreview && queuePreviewState ? (
              <aside className="queue-preview-panel panel" aria-label="Предпросмотр следующего обращения">
                <div className="queue-preview-panel__header">
                  <span className="page-kicker">Следующий кейс</span>
                  <h2>{queuePreview.subject}</h2>
                  <p>
                    {queuePreview.customerName} · {queuePreview.assigneeName ?? "оператор не назначен"} ·{" "}
                    {qaStatusLabels[queuePreview.qaStatus]}
                  </p>
                </div>

                <StatKpi
                  className="queue-preview-panel__score"
                  label="Оценка"
                  value={formatQualityScore(queuePreviewFinalized?.totalScore, queuePreviewDraft ? "Черновик" : "—")}
                  hint={reviewStateLabels[queuePreviewState]}
                />

                <div className="queue-preview-panel__reason">
                  <span className="queue-preview-panel__reason-label">Почему первый</span>
                  <strong className="queue-preview-panel__reason-value">{queuePreview.priorityReason}</strong>
                  <small className="queue-preview-panel__reason-hint">
                    Очередь учитывает SLA, риск, переответ и назначение проверяющего.
                  </small>
                </div>

                <dl className="queue-preview-panel__signals">
                  {queuePreviewSignals.map((signal) => (
                    <div key={signal.label} className="queue-preview-signal">
                      <dt className="queue-preview-signal__label">{signal.label}</dt>
                      <dd className="queue-preview-signal__value">
                        {signal.tone === "neutral" ? (
                          <span className="queue-preview-signal__text">{signal.value}</span>
                        ) : (
                          <Chip tone={signal.tone === "danger" ? "danger" : "warning"} size="sm">
                            {signal.value}
                          </Chip>
                        )}
                      </dd>
                      <dd className="queue-preview-signal__detail">{signal.detail}</dd>
                    </div>
                  ))}
                </dl>

                <Link href={queuePreviewHref(queuePreview, data.currentHref)} className="action-button action-button--primary">
                  Открыть приоритетный кейс
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </aside>
            ) : null}
          </div>
        </>
      }
      evidence={
        <EvidenceDrawer title="Evidence очереди" defaultOpen>
          <div className="operational-evidence-grid">
            <div className="operational-evidence-item">
              <span>Выборка</span>
              <strong>{filteredCount}/{total}</strong>
              <small>Показано с учетом текущих фильтров.</small>
            </div>
            <div className="operational-evidence-item">
              <span>SLA</span>
              <strong>{overdue}</strong>
              <small>{overdue > 0 ? "Просроченные проверки поднимаются в фокус." : "Просроченных проверок нет."}</small>
            </div>
            <div className="operational-evidence-item">
              <span>Риск</span>
              <strong>{visibleCriticalCount + visibleReanswerCount}</strong>
              <small>Критические ошибки и переответы в текущем срезе.</small>
            </div>
            <div className="operational-evidence-item">
              <span>Назначение</span>
              <strong>{visibleUnassignedCount}</strong>
              <small>Незавершенные обращения без проверяющего.</small>
            </div>
          </div>
        </EvidenceDrawer>
      }
    />
  );
}
