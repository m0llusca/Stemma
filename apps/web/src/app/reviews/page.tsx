import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { QueueDay1Tour } from "@/components/guidance/queue-day1-tour";
import { WelcomeBackBanner } from "@/components/guidance/welcome-back-banner";
import { PageSkeleton } from "@/components/loading-states";
import { QueueEmptyBanner } from "@/components/review/queue-empty-banner";
import { QueueFilters } from "@/components/review/queue-filters";
import { QueueNextCasePreview } from "@/components/review/queue-next-case-preview";
import { QueueSavedViews } from "@/components/review/queue-saved-views";
import { QueueTable } from "@/components/review/queue-table";
import { QueueWorkspace } from "@/components/review/queue-workspace";
import { ReviewSavedToast } from "@/components/review/review-saved-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from "@/components/ui/pagination";
import { StatKpi } from "@/components/ui/stat-kpi";
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
import {
  paginateReviewQueue,
  parseReviewQueuePage,
  reviewQueueDefaultPageSize,
  type ReviewQueueSearchParams
} from "@/lib/review-repository";
import { resolveReviewState, reviewStateLabels } from "@/lib/review-state";
import { formatQualityScore } from "@/lib/score-display";

export const dynamic = "force-dynamic";

type ReviewsPageProps = {
  searchParams: Promise<ReviewQueueSearchParams>;
};

function queuePreviewHref(conversation: ReviewQueueConversationDto, returnTo: string) {
  return `/reviews/${conversation.id}?returnTo=${encodeURIComponent(returnTo)}`;
}

// Build a queue href for a given page while preserving every other active
// search param (filters, saved view, etc.). Page 1 drops the param entirely so
// the canonical first-page URL stays clean.
function queuePageHref(rawParams: ReviewQueueSearchParams, page: number) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(rawParams)) {
    if (key === "page") {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item) {
        params.append(key, item);
      }
    }
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/reviews?${query}` : "/reviews";
}

export default function ReviewsPage({ searchParams }: ReviewsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton label="Загрузка очереди проверок" />}>
      <ReviewsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function ReviewsPageContent({ searchParams }: ReviewsPageProps) {
  const rawParams = await searchParams;
  const queueEmpty = firstParam(rawParams.empty) === "1";
  const savedMarker = firstParam(rawParams.saved);
  const data = await getReviewQueuePageData(rawParams);
  const filteredCount = data.conversations.length;
  const { total, queued, inWork, overdue } = data.summary;
  // Render-only pagination: the global priority sort already happened in the
  // repository, so this just bounds how many rows hit the DOM per page. Focus
  // strip still reads the full filtered set.
  const queuePage = paginateReviewQueue(
    data.conversations,
    parseReviewQueuePage(rawParams.page),
    reviewQueueDefaultPageSize
  );
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
  ]
    .filter((item): item is { href: string; label: string; value: number; description: string } => Boolean(item))
    .slice(0, 3);
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
          tone:
            queuePreview.riskHint || queuePreviewFinalized?.criticalError || queuePreviewFinalized?.needsReanswer
              ? "warning"
              : "neutral"
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
  const queuePreviewCard =
    queuePreview && queuePreviewState ? (
      <QueueNextCasePreview
        subject={queuePreview.subject}
        description={`${queuePreview.customerName} · ${queuePreview.assigneeName ?? "оператор не назначен"} · ${qaStatusLabels[queuePreview.qaStatus]}`}
        openHref={queuePreviewHref(queuePreview, data.currentHref)}
      >
        <StatKpi
          label="Оценка"
          value={formatQualityScore(queuePreviewFinalized?.totalScore, queuePreviewDraft ? "Черновик" : "—")}
          hint={reviewStateLabels[queuePreviewState]}
        />

        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Почему первый</span>
          <strong className="text-sm font-semibold text-foreground">{queuePreview.priorityReason}</strong>
          <small className="text-xs text-muted-foreground">
            Очередь учитывает SLA, риск, переответ и назначение проверяющего.
          </small>
        </div>

        <dl className="grid gap-2">
          {queuePreviewSignals.map((signal) => (
            <div
              key={signal.label}
              className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-b border-border pb-2 last:border-b-0 last:pb-0"
            >
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {signal.label}
              </dt>
              <dd className="min-w-0">
                {signal.tone === "neutral" ? (
                  <span className="text-sm font-medium text-foreground">{signal.value}</span>
                ) : (
                  <Chip tone={signal.tone === "danger" ? "danger" : "warning"}>{signal.value}</Chip>
                )}
              </dd>
              <dd className="col-start-2 text-xs text-muted-foreground">{signal.detail}</dd>
            </div>
          ))}
        </dl>
      </QueueNextCasePreview>
    ) : undefined;

  return (
    <QueueWorkspace
      description={`Найдено ${filteredCount} из ${total}. Рабочий inbox для ручной проверки: сначала обращения, затем фильтры и массовые действия.`}
      actions={
        <form action={takeNextReview}>
          <Button type="submit">
            <ArrowRight size={16} aria-hidden="true" data-icon="inline-start" />
            Взять следующий
          </Button>
        </form>
      }
    >
      <ReviewSavedToast marker={savedMarker} />
      <WelcomeBackBanner />
      <QueueDay1Tour />
      {queueEmpty ? <QueueEmptyBanner /> : null}

      <section aria-label="Где смотреть в очереди сейчас">
        <Card size="sm" className="overflow-clip py-0">
          <div className="grid min-w-0 md:grid-cols-[minmax(200px,0.7fr)_minmax(0,2fr)]">
            <div className="flex flex-col justify-center gap-1 border-b border-border bg-muted/40 p-4 md:border-r md:border-b-0">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Фокус очереди</span>
              <strong className="text-sm font-semibold text-foreground">
                {reviewFocusItems.length > 0 ? "Есть действия на сейчас" : "Критичных действий нет"}
              </strong>
              <small className="text-xs text-muted-foreground">
                {reviewFocusItems.length > 0
                  ? "Открывайте с самого жесткого SLA или риска."
                  : "Можно разбирать очередь по обычному приоритету."}
              </small>
            </div>
            <div className="grid min-w-0 sm:grid-flow-col sm:auto-cols-fr">
              {reviewFocusItems.length > 0 ? (
                reviewFocusItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col gap-0.5 border-b border-border p-3.5 transition-colors last:border-b-0 hover:bg-muted/40 sm:border-b-0 sm:border-r sm:last:border-r-0"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </span>
                    <strong className="text-xl font-semibold tabular-nums text-foreground">
                      {item.value}
                    </strong>
                    <small className="text-xs text-muted-foreground">{item.description}</small>
                    <ArrowRight size={15} aria-hidden="true" className="mt-1 text-muted-foreground" />
                  </Link>
                ))
              ) : (
                <Link
                  href="/reviews?status=unreviewed"
                  className="flex flex-col gap-0.5 p-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Незавершенные
                  </span>
                  <strong className="text-xl font-semibold tabular-nums text-foreground">
                    {queued + inWork}
                  </strong>
                  <small className="text-xs text-muted-foreground">
                    Открыть незавершенные обращения
                  </small>
                  <ArrowRight size={15} aria-hidden="true" className="mt-1 text-muted-foreground" />
                </Link>
              )}
            </div>
          </div>
        </Card>
      </section>

      <QueueWorkspace.CommandBar
        aria-label="Фильтры и виды очереди"
        expandedOnly={
          <QueueSavedViews
            currentAssigneeName={data.currentAssigneeName}
            currentHref={data.currentHref}
            savedViews={data.savedViews}
          />
        }
      >
        <QueueFilters
          filters={data.filters}
          sources={data.filterOptions.sources}
          assignees={data.filterOptions.assignees}
          qaAssignees={data.filterOptions.qaAssignees}
          supportLines={data.filterOptions.supportLines}
          teamNames={data.filterOptions.teamNames}
          resultCount={filteredCount}
        />
      </QueueWorkspace.CommandBar>

      <QueueWorkspace.Main
        aria-label="Рабочая область очереди"
        preview={queuePreviewCard}
        previewLabel="Предпросмотр следующего обращения"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <QueueTable conversations={queuePage.items} qaAssignees={data.qaAssignees} returnTo={data.currentHref} />
          {queuePage.pageCount > 1 ? (
            <Pagination className="mx-0 w-full flex-wrap justify-between gap-3" aria-label="Страницы очереди">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground" aria-live="polite">
                Стр. {queuePage.page} из {queuePage.pageCount} · показано {queuePage.items.length} из {queuePage.total}
              </span>
              <PaginationContent className="gap-2">
                {queuePage.page > 1 ? (
                  <PaginationItem>
                    <PaginationPrevious
                      href={queuePageHref(rawParams, queuePage.page - 1)}
                      text="Назад"
                      rel="prev"
                      aria-label="Перейти на предыдущую страницу очереди"
                      className="[&>span]:block"
                    />
                  </PaginationItem>
                ) : null}
                {queuePage.hasMore ? (
                  <PaginationItem>
                    <PaginationNext
                      href={queuePageHref(rawParams, queuePage.page + 1)}
                      text="Показать ещё"
                      rel="next"
                      aria-label="Перейти на следующую страницу очереди"
                      className="[&>span]:block"
                    />
                  </PaginationItem>
                ) : null}
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>
      </QueueWorkspace.Main>
    </QueueWorkspace>
  );
}
