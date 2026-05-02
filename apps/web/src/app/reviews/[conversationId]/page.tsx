import { notFound } from "next/navigation";
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  Gauge,
  RotateCcw,
  ShieldAlert,
  UserRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ConversationTimeline } from "@/components/review/conversation-timeline";
import { ReviewPanel } from "@/components/review/review-panel";
import { ReviewWorkflow } from "@/components/review/review-workflow";
import { WorkflowManagementPanel } from "@/components/review/workflow-management-panel";
import { createTrainingAssignmentFromReview, updateReviewFeedback } from "@/lib/feedback-actions";
import { canManageReviewWorkflow, getCurrentUser } from "@/lib/current-user";
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

export const dynamic = "force-dynamic";

type ReviewDetailPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function reviewStateTone(state: ReviewState) {
  if (state === "finalized") {
    return "success";
  }

  if (state === "reopened") {
    return "warning";
  }

  if (state === "assigned" || state === "in_progress") {
    return "active";
  }

  return "neutral";
}

function HeaderChip({
  label,
  children,
  icon: Icon,
  tone = "neutral",
  wide = false
}: {
  label: string;
  children: ReactNode;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "active";
  wide?: boolean;
}) {
  return (
    <span className={`meta-chip meta-chip--${tone} ${wide ? "meta-chip--wide" : ""}`}>
      <span className="meta-chip__icon" aria-hidden="true">
        <Icon size={13} />
      </span>
      <span className="meta-chip__label">{label}</span>
      <span className="meta-chip__value">{children}</span>
    </span>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-[#667085]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#17202a]">{children}</p>
    </div>
  );
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReviewDetailPage({ params, searchParams }: ReviewDetailPageProps) {
  const [{ conversationId }, rawSearchParams, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  const requestedReviewSource = singleParam(rawSearchParams.reviewSource);
  const reviewSource =
    requestedReviewSource === "CALIBRATION" || requestedReviewSource === "SELF_REVIEW" ? requestedReviewSource : "HUMAN";
  const returnTo = singleParam(rawSearchParams.returnTo);
  const [conversation, scorecard, qaAssignees] = await Promise.all([
    getConversationForReview(user.workspaceId, conversationId),
    getActiveScorecard(user.workspaceId),
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
        name: true,
        role: true
      }
    })
  ]);

  if (!conversation) {
    notFound();
  }

  const latestFinalizedReview = conversation.reviews.find((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN");
  const currentDraftReview = conversation.reviews.find(
    (review) => review.status === "DRAFT" && review.reviewerId === user.id && review.reviewSource === reviewSource
  );
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
  const canManageWorkflow = canManageReviewWorkflow(user.role);
  const scoreLabel = scorePreviewReview ? `${Math.round(scorePreviewReview.totalScore)}%` : "Не проверено";

  return (
    <section className="page-shell">
      <div className="mb-5">
        <p className="text-sm font-medium text-[#667085]">Доска проверки</p>
        <h1 className="mt-1 text-2xl font-semibold">{conversation.subject}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <HeaderChip label="Состояние" icon={BadgeCheck} tone={reviewStateTone(reviewState)}>
            {reviewStateLabels[reviewState]}
          </HeaderChip>
          <HeaderChip label="Оценка" icon={Gauge}>{scoreLabel}</HeaderChip>
          <HeaderChip label="Клиент" icon={UserRound}>{conversation.customerName}</HeaderChip>
          <HeaderChip label="Срок" icon={CalendarClock}>
            {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"}
          </HeaderChip>
          {conversation.riskHint ? (
            <HeaderChip label="Риск" icon={ShieldAlert} tone="warning" wide>
              {conversation.riskHint}
            </HeaderChip>
          ) : null}
        </div>
      </div>

      <details className="disclosure-panel mb-5">
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-[#d7dce5] bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Детали обращения</h2>
            <p className="mt-1 text-sm text-[#667085]">Источник, канал, выборка, CSAT и назначение проверки.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase text-[#667085]">Показать</span>
        </summary>
        <div className="mt-3 grid gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4 md:grid-cols-3 xl:grid-cols-6">
          <DetailItem label="Канал">{channelLabels[conversation.channel]}</DetailItem>
          <DetailItem label="Тикет">{conversationStatusLabel(conversation.status)}</DetailItem>
          <DetailItem label="Сообщения">{formatMessageCount(conversation.messages.length)}</DetailItem>
          <DetailItem label="Проверяющий">{conversation.qaAssigneeName ?? "Не назначен"}</DetailItem>
          <DetailItem label="Выборка">{samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType}</DetailItem>
          <DetailItem label="CSAT">
            {conversation.csatScore ? `${conversation.csatScore} · ${csatBucketLabels[conversation.csatBucket]}` : csatBucketLabels[conversation.csatBucket]}
          </DetailItem>
        </div>
      </details>

      <ReviewWorkflow
        isReviewed={Boolean(latestFinalizedReview)}
        hasDraftReview={Boolean(currentDraftReview)}
        scorecardName={`${scorecard.name} v${scorecard.version}`}
      />

      {canManageWorkflow ? <WorkflowManagementPanel conversation={conversation} assignees={qaAssignees} /> : null}

      {latestFinalizedReview ? (
        <details className="panel disclosure-panel mb-6 overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Последнее замечание</h2>
              <p className="mt-1 truncate text-sm text-[#667085]">{latestFinalizedReview.summary}</p>
            </div>
            <span
              className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#0b4f52]"
              aria-hidden="true"
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="border-t border-[#d7dce5] p-5">
            <p className="text-sm leading-6 text-[#344054]">{latestFinalizedReview.summary}</p>
            {latestFinding ? (
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <p className="font-semibold text-[#667085]">Ответственность</p>
                  <p className="mt-1">{ownerTypeLabels[latestFinding.ownerType]}</p>
                </div>
                <div>
                  <p className="font-semibold text-[#667085]">Риск</p>
                  <p className="mt-1">{riskLevelLabels[latestFinding.riskLevel]}</p>
                </div>
                <div>
                  <p className="font-semibold text-[#667085]">Категория</p>
                  <p className="mt-1">{latestFinding.category}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="font-semibold text-[#667085]">Критическая ошибка</p>
                <p className="mt-1">{latestFinalizedReview.criticalError ? latestFinalizedReview.criticalCategory ?? "Да" : "Нет"}</p>
              </div>
              <div>
                <p className="font-semibold text-[#667085]">Апелляция</p>
                <p className="mt-1">{appealStatusLabels[latestFinalizedReview.appealStatus] ?? latestFinalizedReview.appealStatus}</p>
              </div>
              <div>
                <p className="font-semibold text-[#667085]">Переответ</p>
                <p className="mt-1">{reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? latestFinalizedReview.reanswerStatus}</p>
              </div>
            </div>
          </div>
          {latestFinalizedReview.feedbackComment || latestFinalizedReview.positiveNotes ? (
            <div className="mx-5 mb-5 grid gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4 text-sm">
              {latestFinalizedReview.feedbackComment ? (
                <div>
                  <p className="font-semibold text-[#667085]">Обратная связь</p>
                  <p className="mt-1 text-[#17202a]">{latestFinalizedReview.feedbackComment}</p>
                </div>
              ) : null}
              {latestFinalizedReview.positiveNotes ? (
                <div>
                  <p className="font-semibold text-[#667085]">Положительные моменты</p>
                  <p className="mt-1 text-[#17202a]">{latestFinalizedReview.positiveNotes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {latestFinding?.coachingAction ? (
            <div className="mx-5 mb-5 rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4 text-sm">
              <p className="font-semibold text-[#667085]">Разбор с оператором</p>
              <p className="mt-1 text-[#17202a]">{latestFinding.coachingAction.action}</p>
              <p className="mt-2 text-[#667085]">
                {latestFinding.coachingAction.assignee}
                {latestFinding.coachingAction.dueAt
                  ? ` · до ${latestFinding.coachingAction.dueAt.toLocaleDateString("ru-RU")}`
                  : ""}
              </p>
            </div>
          ) : null}
          {latestFinalizedReview.needsReanswer ? (
            <div className="mx-5 mb-5 flex items-start gap-3 rounded-md border border-[#fed7aa] bg-[#fffaf5] p-4 text-sm text-[#b54708]">
              <RotateCcw className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <p>Нужен переответ клиенту: проверьте, что руководитель получил сигнал и обращение переоткрыто при необходимости.</p>
            </div>
          ) : null}
          <div className="mx-5 mb-5 grid gap-4 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#17202a]">Обратная связь и апелляция</p>
                <p className="mt-1 text-sm text-[#667085]">
                  Статус: {feedbackStatusLabels[latestFinalizedReview.feedbackStatus] ?? latestFinalizedReview.feedbackStatus}
                  {latestFinalizedReview.feedbackAckAt
                    ? ` · ознакомлен ${latestFinalizedReview.feedbackAckAt.toLocaleString("ru-RU")}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={updateReviewFeedback}>
                  <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                  <input type="hidden" name="action" value="acknowledged" />
                  <button type="submit" className="rounded border border-[#116466] bg-white px-3 py-2 text-sm font-semibold text-[#0b4f52] hover:bg-[#eef4f4]">
                    Ознакомлен
                  </button>
                </form>
                <form action={updateReviewFeedback}>
                  <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                  <input type="hidden" name="action" value="appeal_opened" />
                  <button type="submit" className="rounded border border-[#d7dce5] bg-white px-3 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]">
                    Открыть апелляцию
                  </button>
                </form>
                {latestFinalizedReview.needsReanswer ? (
                  <form action={updateReviewFeedback}>
                    <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                    <input type="hidden" name="action" value="reanswer_completed" />
                    <button type="submit" className="rounded bg-[#116466] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
                      Переответ выполнен
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
            <form action={createTrainingAssignmentFromReview} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px_auto] md:items-end">
              <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
              <input type="hidden" name="assigneeName" value={conversation.assigneeName ?? ""} />
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Учебная задача
                <input name="title" defaultValue={`Разбор: ${latestFinding?.category ?? "итог проверки"}`} className="rounded border border-[#d7dce5] bg-white px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Описание
                <input name="description" defaultValue={latestFinalizedReview.summary} className="rounded border border-[#d7dce5] bg-white px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Срок
                <input name="dueAt" type="date" className="rounded border border-[#d7dce5] bg-white px-3 py-2" />
              </label>
              <button type="submit" className="rounded border border-[#116466] bg-white px-3 py-2 text-sm font-semibold text-[#0b4f52] hover:bg-[#eef4f4]">
                Создать
              </button>
            </form>
            {latestFinalizedReview.feedbackEvents.length > 0 ? (
              <div className="grid gap-2 text-sm">
                {latestFinalizedReview.feedbackEvents.slice(0, 3).map((event) => (
                  <div key={event.id} className="rounded-md bg-white px-3 py-2 text-[#344054]">
                    {event.createdAt.toLocaleString("ru-RU")} · {event.actor.name} · {event.action}
                    {event.comment ? ` · ${event.comment}` : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {conversation.reviews.length > 0 ? (
        <details className="panel disclosure-panel mb-6 overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">История проверок</h2>
              <p className="mt-1 text-sm text-[#667085]">{conversation.reviews.length} записей</p>
            </div>
            <span
              className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#0b4f52]"
              aria-hidden="true"
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="scroll-area border-t border-[#d7dce5]">
            <table className="table-fixed-copy w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Дата</th>
                  <th className="px-5 py-3 font-semibold">Проверяющий</th>
                  <th className="px-5 py-3 font-semibold">Статус записи</th>
                  <th className="px-5 py-3 font-semibold">Оценка</th>
                  <th className="px-5 py-3 font-semibold">Категория</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dce5]">
                {conversation.reviews.map((review) => (
                  <tr key={review.id}>
                    <td className="px-5 py-4 text-[#344054]">
                      {(review.finalizedAt ?? review.createdAt).toLocaleString("ru-RU")}
                    </td>
                    <td className="px-5 py-4 text-[#344054]">{review.reviewer.name}</td>
                    <td className="px-5 py-4 text-[#344054]">{reviewStatusLabels[review.status]}</td>
                    <td className="px-5 py-4 font-semibold text-[#17202a]">{Math.round(review.totalScore)}%</td>
                    <td className="px-5 py-4 text-[#344054]">{review.findings[0]?.category ?? "Без замечаний"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <ConversationTimeline messages={conversation.messages} highlightedMessageIds={evidenceMessageIds} />
        <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:overflow-auto">
          <ReviewPanel
            conversationId={conversation.id}
            messages={conversation.messages}
            scorecard={scorecard}
            draftReview={currentDraftReview}
            reviewSource={reviewSource}
            returnTo={returnTo}
            title={reviewSource === "CALIBRATION" ? "Калибровочная оценка" : reviewSource === "SELF_REVIEW" ? "Самооценка" : "Проверка"}
          />
        </div>
      </div>
    </section>
  );
}
