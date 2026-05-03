import type { Conversation, Message, Review } from "@prisma/client";
import Link from "next/link";
import { ScoreBar } from "@/components/ui/score-bar";
import { StatusChip } from "@/components/ui/status-chip";
import {
  channelLabels,
  csatBucketLabels,
  formatMessageCount,
  qaStatusLabels,
  reanswerStatusLabels,
  samplingTypeLabels
} from "@/lib/labels";
import { bulkUpdateReviewQueue } from "@/lib/review-workflow-actions";
import { resolveReviewState, reviewStateLabels, type ReviewState } from "@/lib/review-state";

type QueueConversation = Conversation & {
  messages: Message[];
  reviews: Review[];
};

type QueueTableProps = {
  conversations: QueueConversation[];
  qaAssignees: Array<{ id: string; name: string }>;
  returnTo: string;
};

function reviewStateTone(state: ReviewState) {
  if (state === "finalized") return "success";
  if (state === "reopened") return "warning";
  if (state === "assigned" || state === "in_progress") return "info";
  return "neutral";
}

function samplingTone(samplingType: string) {
  if (samplingType === "DSAT" || samplingType === "LEAD_SIGNAL" || samplingType === "LOW_SCORE") return "warning";
  if (samplingType === "RANDOM") return "neutral";
  return "info";
}

function csatTone(csatBucket: string) {
  if (csatBucket === "NEGATIVE") return "danger";
  if (csatBucket === "POSITIVE") return "success";
  return "neutral";
}

export function QueueTable({ conversations, qaAssignees, returnTo }: QueueTableProps) {
  if (conversations.length === 0) {
    return (
      <div className="panel px-5 py-10 text-center">
        <h2 className="text-base font-semibold text-[#17202a]">Очередь пуста</h2>
        <p className="mt-2 text-sm text-[#667085]">Новые диалоги появятся после импорта или ручной загрузки через API.</p>
      </div>
    );
  }

  return (
    <form action={bulkUpdateReviewQueue} className="panel overflow-hidden">
      <input type="hidden" name="returnTo" value={returnTo} />

      <details className="disclosure-panel border-b border-[#d7dce5]">
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#17202a]">Массовые действия</h2>
            <p className="mt-1 text-sm text-[#667085]">Отметьте обращения и примените назначение, срок или состояние.</p>
          </div>
          <span className="pill pill--neutral">{conversations.length}</span>
        </summary>
        <div className="grid gap-3 border-t border-[#d7dce5] bg-[#fafbf8] p-4 lg:grid-cols-[170px_220px_160px_auto] lg:items-end">
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Состояние
            <select name="qaStatus" defaultValue="" className="form-control">
              <option value="">Не менять</option>
              {Object.entries(qaStatusLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Проверяющий
            <select name="qaAssigneeId" defaultValue="" className="form-control">
              <option value="">Не менять</option>
              {qaAssignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Срок
            <input name="reviewDueAt" type="date" className="form-control" />
          </label>
          <button type="submit" className="action-button action-button--primary">
            Обновить выбранные
          </button>
        </div>
      </details>

      <div className="record-list p-5">
        {conversations.map((conversation) => {
          const latestFinalizedReview = conversation.reviews.find((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN");
          const draftReview = conversation.reviews.find((review) => review.status === "DRAFT" && review.reviewSource === "HUMAN");
          const isOverdue =
            conversation.reviewDueAt !== null &&
            conversation.reviewDueAt < new Date() &&
            conversation.qaStatus !== "FINALIZED";
          const reviewState = resolveReviewState({
            qaStatus: conversation.qaStatus,
            hasDraftReview: Boolean(draftReview),
            hasFinalizedReview: Boolean(latestFinalizedReview)
          });
          const hasAppeal = latestFinalizedReview?.appealStatus && latestFinalizedReview.appealStatus !== "none";

          return (
            <article key={conversation.id} className="record-card record-card--interactive">
              <div className="record-row">
                <label className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    name="conversationId"
                    value={conversation.id}
                    aria-label={`Выбрать ${conversation.subject}`}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[#d7dce5]"
                  />
                  <span className="min-w-0">
                    <Link href={`/reviews/${conversation.id}`} className="record-title text-[#0b4f52] hover:underline">
                      {conversation.subject}
                    </Link>
                    <span className="record-meta mt-1 block">
                      {conversation.customerName} · {formatMessageCount(conversation.messages.length)} · {conversation.assigneeName ?? "Не назначен"}
                    </span>
                  </span>
                </label>
                <StatusChip tone={isOverdue && reviewState !== "finalized" ? "danger" : reviewStateTone(reviewState)}>
                  {reviewStateLabels[reviewState]}
                </StatusChip>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <StatusChip size="xs">{channelLabels[conversation.channel]}</StatusChip>
                <StatusChip size="xs">{conversation.externalSource}</StatusChip>
                <StatusChip size="xs" tone={csatTone(conversation.csatBucket)}>
                  {conversation.csatScore ? `${conversation.csatScore} · ` : ""}
                  {csatBucketLabels[conversation.csatBucket] ?? conversation.csatBucket}
                </StatusChip>
                <StatusChip size="xs" tone={samplingTone(conversation.samplingType)}>
                  {samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType}
                </StatusChip>
                {isOverdue && reviewState !== "finalized" ? <StatusChip size="xs" tone="danger">Просрочено</StatusChip> : null}
                {conversation.riskHint ? <StatusChip size="xs" tone="warning" title={conversation.riskHint}>Риск</StatusChip> : null}
              </div>

              <div className="record-row">
                <p className="record-meta compact-text">
                  Проверяющий: {conversation.qaAssigneeName ?? "Не назначен"} · срок:{" "}
                  {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"} · {conversation.samplingReason}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {latestFinalizedReview?.criticalError ? (
                    <StatusChip tone="danger">Критическая</StatusChip>
                  ) : latestFinalizedReview?.needsReanswer ? (
                    <StatusChip tone="warning">
                      {reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? "Переответ"}
                    </StatusChip>
                  ) : hasAppeal ? (
                    <StatusChip tone="warning">Апелляция</StatusChip>
                  ) : (
                    <span className="record-meta">Без эскалации</span>
                  )}
                  <ScoreBar value={latestFinalizedReview?.totalScore} emptyLabel={draftReview ? "Черновик" : "Нет оценки"} compact />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </form>
  );
}
