import { ArrowRight } from "lucide-react";
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
import { resolveQueueStatusChip } from "@/lib/review-state";
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

export async function ReviewsPageContent({ searchParams }: ReviewsPageProps) {
  const rawParams = await searchParams;
  const queueEmpty = firstParam(rawParams.empty) === "1";
  const savedMarker = firstParam(rawParams.saved);
  const data = await getReviewQueuePageData(rawParams);
  const filteredCount = data.conversations.length;
  const { total } = data.summary;
  // Render-only pagination: the global priority sort already happened in the
  // repository, so this just bounds how many rows hit the DOM per page.
  const queuePage = paginateReviewQueue(
    data.conversations,
    parseReviewQueuePage(rawParams.page),
    reviewQueueDefaultPageSize
  );
  const queuePreview = data.conversations[0];
  const queuePreviewFinalized = queuePreview?.reviews.find(
    (review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN"
  );
  const queuePreviewDraft = queuePreview?.reviews.find((review) => review.status === "DRAFT" && review.reviewSource === "HUMAN");
  const queuePreviewChip = queuePreview ? resolveQueueStatusChip(queuePreview) : null;
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
    queuePreview && queuePreviewChip ? (
      <QueueNextCasePreview
        subject={queuePreview.subject}
        description={`${queuePreview.customerName} · ${queuePreview.assigneeName ?? "оператор не назначен"}`}
        openHref={queuePreviewHref(queuePreview, data.currentHref)}
        statusConversation={queuePreview}
      >
        <StatKpi
          label="Оценка"
          value={formatQualityScore(queuePreviewFinalized?.totalScore, queuePreviewDraft ? "Черновик" : "—")}
          hint={queuePreviewChip.label}
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
      description={
        data.canWriteReviews
          ? `Найдено ${filteredCount} из ${total}. Рабочий inbox для ручной проверки: сначала обращения, затем фильтры и массовые действия.`
          : `Найдено ${filteredCount} из ${total}. Просмотр очереди: обращения и фильтры.`
      }
      actions={
        data.canWriteReviews ? (
          <form action={takeNextReview}>
            <input type="hidden" name="queueHref" value={data.currentHref} />
            <Button type="submit">
              <ArrowRight size={16} aria-hidden="true" data-icon="inline-start" />
              Взять следующий
            </Button>
          </form>
        ) : undefined
      }
    >
      <ReviewSavedToast marker={savedMarker} />
      <WelcomeBackBanner />
      {data.canWriteReviews ? <QueueDay1Tour /> : null}
      {queueEmpty ? <QueueEmptyBanner /> : null}

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
          <QueueTable
            conversations={queuePage.items}
            qaAssignees={data.qaAssignees}
            returnTo={data.currentHref}
            canWriteReviews={data.canWriteReviews}
          />
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
