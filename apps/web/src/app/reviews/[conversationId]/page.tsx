import { notFound } from "next/navigation";
import {
  ChevronDown,
  MessageSquareWarning,
  RotateCcw
} from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { ConversationTimeline } from "@/components/review/conversation-timeline";
import { ReviewPanel } from "@/components/review/review-panel";
import { WorkflowManagementPanel } from "@/components/review/workflow-management-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createTrainingAssignmentFromReview, updateReviewFeedback } from "@/lib/feedback-actions";
import {
  canManageReviewWorkflow,
  canManageTraining,
  canSaveReviewDraft,
  canSelfReview,
  requireCurrentUserPermission
} from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  channelLabels,
  conversationStatusLabel,
  csatBucketLabels,
  appealStatusLabels,
  feedbackStatusLabels,
  formatMessageCount,
  ownerTypeLabels,
  reanswerStatusLabels,
  reviewStatusLabels,
  riskLevelLabels,
  samplingTypeLabels
} from "@/lib/labels";
import { getActiveScorecard, getConversationForReview } from "@/lib/review-repository";
import { resolveReviewState, reviewStateLabels, type ReviewState } from "@/lib/review-state";
import { formatQualityScore } from "@/lib/score-display";
import { toneForScore, type StatusTone } from "@/lib/ui/status-tone";

export const dynamic = "force-dynamic";

type ReviewDetailPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function reviewStateTone(state: ReviewState): StatusTone {
  if (state === "finalized") {
    return "positive";
  }

  if (state === "reopened") {
    return "warning";
  }

  if (state === "assigned" || state === "in_progress") {
    return "info";
  }

  return "neutral";
}

function dueDateTone(value: Date | null, now: Date): StatusTone {
  if (!value) {
    return "neutral";
  }

  return value.getTime() < now.getTime() ? "negative" : "positive";
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="review-detail-item">
      <p className="review-detail-item__label">{label}</p>
      <p className="review-detail-item__value">{children}</p>
    </div>
  );
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ReviewDetailPage({ params, searchParams }: ReviewDetailPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" label="Загрузка проверки" />}>
      <ReviewDetailPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ReviewDetailPageContent({ params, searchParams }: ReviewDetailPageProps) {
  const [{ conversationId }, rawSearchParams, user] = await Promise.all([params, searchParams, requireCurrentUserPermission("reviews:read")]);
  const now = new Date();
  const requestedReviewSource = singleParam(rawSearchParams.reviewSource);
  const reviewSource =
    requestedReviewSource === "CALIBRATION" || requestedReviewSource === "SELF_REVIEW" ? requestedReviewSource : "HUMAN";
  const returnTo = singleParam(rawSearchParams.returnTo);
  const supportAgentScope = user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : undefined;
  const canEvaluateReviewPermission = reviewSource === "SELF_REVIEW" ? canSelfReview(user.role) : canSaveReviewDraft(user.role);
  const canManageWorkflow = canManageReviewWorkflow(user.role);
  const canCreateTrainingAssignment = canManageTraining(user.role) && user.role !== "SUPPORT_AGENT";
  // Calibration pins are internal alignment notes: visible to QA roles only,
  // and new ones can be added only while evaluating in calibration mode.
  const canSeeCoachingPins = canSaveReviewDraft(user.role);
  const [conversation, scorecard, qaAssignees] = await Promise.all([
    getConversationForReview(user.workspaceId, conversationId, supportAgentScope),
    canEvaluateReviewPermission ? getActiveScorecard(user.workspaceId) : Promise.resolve(null),
    canManageWorkflow
      ? prisma.user.findMany({
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
            name: true,
            role: true
          }
        })
      : Promise.resolve([])
  ]);

  if (!conversation) {
    notFound();
  }

  const latestFinalizedReview =
    conversation.qaStatus === "FINALIZED"
      ? conversation.reviews.find((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN")
      : undefined;
  const currentDraftReview = conversation.reviews.find(
    (review) => review.status === "DRAFT" && review.reviewerId === user.id && review.reviewSource === reviewSource
  );
  const canShowReviewPanel = canEvaluateReviewPermission && (reviewSource !== "HUMAN" || conversation.qaStatus !== "FINALIZED");
  const scorePreviewReview = latestFinalizedReview ?? currentDraftReview;
  const latestFinding = latestFinalizedReview?.findings[0];
  const reviewState = resolveReviewState({
    qaStatus: conversation.qaStatus,
    hasDraftReview: Boolean(currentDraftReview),
    hasFinalizedReview: Boolean(latestFinalizedReview)
  });
  const evidenceMessageIds = Array.from(
    new Set(
      scorePreviewReview?.scores
        .map((score) => score.evidenceMessageId)
        .filter((messageId): messageId is string => Boolean(messageId)) ?? []
    )
  );
  const scoreLabel = formatQualityScore(scorePreviewReview?.totalScore, "Не проверено");
  const hasAppeal = latestFinalizedReview ? latestFinalizedReview.appealStatus !== "none" : false;
  const hasOpenAppeal = latestFinalizedReview?.appealStatus === "open";
  const appealLabel = latestFinalizedReview
    ? appealStatusLabels[latestFinalizedReview.appealStatus] ?? latestFinalizedReview.appealStatus
    : "Нет";
  const hasReanswer = Boolean(latestFinalizedReview?.needsReanswer);
  const reanswerLabel = latestFinalizedReview
    ? reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? latestFinalizedReview.reanswerStatus
    : "Нет";
  const feedbackClosed =
    latestFinalizedReview?.feedbackStatus === "acknowledged" || latestFinalizedReview?.feedbackStatus === "corrected";
  const canAcknowledgeFeedback = Boolean(latestFinalizedReview && !feedbackClosed && !hasOpenAppeal);
  const canOpenAppeal = Boolean(latestFinalizedReview && !feedbackClosed && latestFinalizedReview.appealStatus === "none");
  const canCompleteReanswer = Boolean(latestFinalizedReview?.needsReanswer && latestFinalizedReview.reanswerStatus === "requested");

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Доска проверки</p>
          <h1 className="page-title">{conversation.subject}</h1>
          <p className="page-subtitle">
            Диалог, доказательства и форма оценки собраны в одном рабочем экране без лишних служебных таблиц.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge className="meta-chip" label={`Состояние${reviewStateLabels[reviewState]}`} value={null} tone={reviewStateTone(reviewState)} />
          <StatusBadge className="meta-chip" label="Оценка" value={scoreLabel} tone={toneForScore(scorePreviewReview?.totalScore)} />
          <StatusBadge className="meta-chip" label="Клиент" value={conversation.customerName} tone="neutral" />
          <StatusBadge
            className="meta-chip"
            label="Срок"
            value={conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"}
            tone={dueDateTone(conversation.reviewDueAt, now)}
          />
          {conversation.riskHint ? (
            <StatusBadge className="meta-chip" label="Риск" value={conversation.riskHint} tone="warning" />
          ) : null}
          {hasAppeal ? (
            <StatusBadge className="meta-chip" label="Апелляция" value={appealLabel} tone={hasOpenAppeal ? "warning" : "info"} />
          ) : null}
          {hasReanswer ? (
            <StatusBadge
              className="meta-chip"
              label="Переответ"
              value={reanswerLabel}
              tone={latestFinalizedReview?.reanswerStatus === "completed" ? "positive" : "warning"}
            />
          ) : null}
        </div>
      </div>

      <section className="review-context-panel panel" aria-label="Контекст обращения">
        <div className="review-context-panel__details">
          <div className="review-context-panel__header">
            <h2>Контекст обращения</h2>
            <p>
              {channelLabels[conversation.channel]} · {formatMessageCount(conversation.messages.length)} · {conversation.qaAssigneeName ?? "не назначен"}
            </p>
          </div>
          <div className="review-detail-grid">
            <DetailItem label="Канал">{channelLabels[conversation.channel]}</DetailItem>
            <DetailItem label="Тикет">{conversationStatusLabel(conversation.status)}</DetailItem>
            <DetailItem label="Сообщения">{formatMessageCount(conversation.messages.length)}</DetailItem>
            <DetailItem label="Проверяющий">{conversation.qaAssigneeName ?? "Не назначен"}</DetailItem>
            <DetailItem label="Выборка">{samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType}</DetailItem>
            <DetailItem label="CSAT">
              {conversation.csatScore ? `${conversation.csatScore} · ${csatBucketLabels[conversation.csatBucket]}` : csatBucketLabels[conversation.csatBucket]}
            </DetailItem>
          </div>
        </div>
      </section>

      {latestFinalizedReview && hasOpenAppeal ? (
        <section className="appeal-alert">
          <div className="appeal-alert__icon" aria-hidden="true">
            <MessageSquareWarning size={18} />
          </div>
          <div className="appeal-alert__body">
            <h2>Открыта апелляция</h2>
            <p>
              Статус: {appealLabel}
              {latestFinalizedReview.appealDueAt ? ` · срок ${latestFinalizedReview.appealDueAt.toLocaleDateString("ru-RU")}` : ""}.
              Руководитель должен принять решение и зафиксировать итог.
            </p>
          </div>
          {canManageWorkflow ? (
            <div className="appeal-alert__actions">
              <form action={updateReviewFeedback}>
                <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                <input type="hidden" name="action" value="appeal_confirmed" />
                <button type="submit" className="action-button">Оценка верна</button>
              </form>
              <form action={updateReviewFeedback}>
                <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                <input type="hidden" name="action" value="appeal_corrected" />
                <button type="submit" className="action-button action-button--primary">Нужна корректировка</button>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="review-main">
        <ConversationTimeline
          messages={conversation.messages}
          highlightedMessageIds={evidenceMessageIds}
          conversationId={conversation.id}
          coachingPins={canSeeCoachingPins ? conversation.coachingPins : []}
          canCoach={canSeeCoachingPins && reviewSource === "CALIBRATION"}
          canManagePins={canManageWorkflow}
          currentUserId={user.id}
        />
        {canShowReviewPanel && scorecard ? (
          <div className="review-panel-column">
            <ReviewPanel
              conversationId={conversation.id}
              messages={conversation.messages}
              scorecard={scorecard}
              draftReview={currentDraftReview}
              reviewSource={reviewSource}
              returnTo={returnTo}
              title={reviewSource === "CALIBRATION" ? "Калибровочная оценка" : reviewSource === "SELF_REVIEW" ? "Комментарий оператора" : "Проверка"}
            />
          </div>
        ) : (
          <aside className="review-panel-column">
            <section className="panel overflow-clip">
              <div className="border-b border-[var(--border)] px-5 py-4">
                <h2 className="text-lg font-semibold">Итог проверки</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Оператор видит только собственное обращение и финальную обратную связь.</p>
              </div>
              <div className="grid gap-3 p-5 text-sm">
                <DetailItem label="Оценка">{scoreLabel}</DetailItem>
                <DetailItem label="Обратная связь">
                  {latestFinalizedReview
                    ? feedbackStatusLabels[latestFinalizedReview.feedbackStatus] ?? latestFinalizedReview.feedbackStatus
                    : "Пока нет финальной проверки"}
                </DetailItem>
                <DetailItem label="Апелляция">{appealLabel}</DetailItem>
              </div>
            </section>
          </aside>
        )}
      </div>

      {latestFinalizedReview ? (
        <details className="review-secondary panel disclosure-panel overflow-clip">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Последнее замечание</h2>
              <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{latestFinalizedReview.summary}</p>
            </div>
            <span
              className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]"
              aria-hidden="true"
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="border-t border-[var(--border)] p-5">
            <p className="text-sm leading-6 text-[var(--text-body)]">{latestFinalizedReview.summary}</p>
            {latestFinding ? (
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <p className="font-semibold text-[var(--text-muted)]">Ответственность</p>
                  <p className="mt-1">{ownerTypeLabels[latestFinding.ownerType]}</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--text-muted)]">Риск</p>
                  <p className="mt-1">{riskLevelLabels[latestFinding.riskLevel]}</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--text-muted)]">Категория</p>
                  <p className="mt-1">{latestFinding.category}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="font-semibold text-[var(--text-muted)]">Критическая ошибка</p>
                <p className="mt-1">{latestFinalizedReview.criticalError ? latestFinalizedReview.criticalCategory ?? "Да" : "Нет"}</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-muted)]">Апелляция</p>
                <p className="mt-1">{appealStatusLabels[latestFinalizedReview.appealStatus] ?? latestFinalizedReview.appealStatus}</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-muted)]">Переответ</p>
                <p className="mt-1">{reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? latestFinalizedReview.reanswerStatus}</p>
              </div>
            </div>
          </div>
          {latestFinalizedReview.feedbackComment || latestFinalizedReview.positiveNotes ? (
            <div className="soft-callout mx-5 mb-5 text-sm">
              {latestFinalizedReview.feedbackComment ? (
                <div>
                  <p className="font-semibold text-[var(--text-muted)]">Обратная связь</p>
                  <p className="mt-1 text-[var(--foreground)]">{latestFinalizedReview.feedbackComment}</p>
                </div>
              ) : null}
              {latestFinalizedReview.positiveNotes ? (
                <div>
                  <p className="font-semibold text-[var(--text-muted)]">Положительные моменты</p>
                  <p className="mt-1 text-[var(--foreground)]">{latestFinalizedReview.positiveNotes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {latestFinding?.coachingAction ? (
            <div className="soft-callout mx-5 mb-5 text-sm">
              <p className="font-semibold text-[var(--text-muted)]">Разбор с оператором</p>
              <p className="mt-1 text-[var(--foreground)]">{latestFinding.coachingAction.action}</p>
              <p className="mt-2 text-[var(--text-muted)]">
                {latestFinding.coachingAction.assignee}
                {latestFinding.coachingAction.dueAt
                  ? ` · до ${latestFinding.coachingAction.dueAt.toLocaleDateString("ru-RU")}`
                  : ""}
              </p>
            </div>
          ) : null}
          {latestFinalizedReview.needsReanswer ? (
            <div className="soft-callout soft-callout--warn mx-5 mb-5 grid-cols-[auto_minmax(0,1fr)] text-sm text-[var(--warning)]">
              <RotateCcw className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <p>Нужен переответ клиенту: проверьте, что руководитель получил сигнал и обращение переоткрыто при необходимости.</p>
            </div>
          ) : null}
          <div className="soft-callout mx-5 mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">Обратная связь и апелляция</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Статус: {feedbackStatusLabels[latestFinalizedReview.feedbackStatus] ?? latestFinalizedReview.feedbackStatus}
                  {latestFinalizedReview.feedbackAckAt
                    ? ` · ознакомлен ${latestFinalizedReview.feedbackAckAt.toLocaleString("ru-RU")}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAcknowledgeFeedback ? (
                  <form action={updateReviewFeedback}>
                    <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                    <input type="hidden" name="action" value="acknowledged" />
                    <button type="submit" className="action-button min-h-[36px] px-3 py-2 text-sm">
                      Ознакомлен
                    </button>
                  </form>
                ) : null}
                {canOpenAppeal ? (
                  <form action={updateReviewFeedback}>
                    <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                    <input type="hidden" name="action" value="appeal_opened" />
                    <button type="submit" className="action-button min-h-[36px] px-3 py-2 text-sm">
                      Открыть апелляцию
                    </button>
                  </form>
                ) : null}
                {canCompleteReanswer ? (
                  <form action={updateReviewFeedback}>
                    <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                    <input type="hidden" name="action" value="reanswer_completed" />
                    <button type="submit" className="action-button action-button--primary min-h-[36px] px-3 py-2 text-sm">
                      Переответ выполнен
                    </button>
                  </form>
                ) : null}
                {!canAcknowledgeFeedback && !canOpenAppeal && !canCompleteReanswer ? (
                  <StatusBadge label="Действия" value="нет" tone="neutral" />
                ) : null}
              </div>
            </div>
            {canCreateTrainingAssignment ? (
              <form action={createTrainingAssignmentFromReview} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px_auto] md:items-end">
                <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                <input type="hidden" name="assigneeName" value={conversation.assigneeName ?? ""} />
                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Учебная задача
                  <input name="title" required defaultValue={`Разбор: ${latestFinding?.category ?? "итог проверки"}`} className="form-control" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Описание
                  <input name="description" required defaultValue={latestFinalizedReview.summary} className="form-control" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Срок
                  <input name="dueAt" type="date" className="form-control" />
                </label>
                <ValidatedSubmitButton className="action-button">Создать</ValidatedSubmitButton>
              </form>
            ) : null}
            {latestFinalizedReview.feedbackEvents.length > 0 ? (
              <div className="grid gap-2 text-sm">
                {latestFinalizedReview.feedbackEvents.slice(0, 3).map((event) => (
                  <div key={event.id} className="inline-code-box text-[var(--text-body)]">
                    {event.createdAt.toLocaleString("ru-RU")} · {event.actor.name} · {event.action}
                    {event.comment ? ` · ${event.comment}` : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {canManageWorkflow ? <WorkflowManagementPanel conversation={conversation} assignees={qaAssignees} /> : null}

      {canEvaluateReviewPermission && conversation.reviews.length > 0 ? (
        <details className="review-secondary panel disclosure-panel overflow-clip">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">История проверок</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{conversation.reviews.length} записей</p>
            </div>
            <span
              className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]"
              aria-hidden="true"
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="record-list border-t border-[var(--border)] px-5">
            {conversation.reviews.map((review) => (
              <article key={review.id} className="record-card">
                <div className="record-row">
                  <div className="min-w-0">
                    <h3 className="record-title">{review.reviewer.name}</h3>
                    <p className="record-meta mt-1">{(review.finalizedAt ?? review.createdAt).toLocaleString("ru-RU")}</p>
                  </div>
                  <StatusBadge label="Оценка" value={formatQualityScore(review.totalScore)} tone={toneForScore(review.totalScore)} />
                </div>
                <p className="record-meta">
                  {reviewStatusLabels[review.status]} · {review.findings[0]?.category ?? "Без замечаний"}
                </p>
              </article>
            ))}
          </div>
        </details>
      ) : null}

    </section>
  );
}
