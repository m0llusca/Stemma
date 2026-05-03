import type { Conversation, Message, Review } from "@prisma/client";
import Link from "next/link";
import { ScoreBar } from "@/components/ui/score-bar";
import {
  channelLabels,
  csatBucketLabels,
  externalSourceLabel,
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
  if (state === "finalized") return "good";
  if (state === "reopened") return "warning";
  if (state === "assigned" || state === "in_progress") return "warning";
  return "neutral";
}

function signalClassName(tone: "neutral" | "good" | "warning" | "danger") {
  if (tone === "good") return "inbox-signal inbox-signal--good";
  if (tone === "warning") return "inbox-signal inbox-signal--warn";
  if (tone === "danger") return "inbox-signal inbox-signal--danger";
  return "inbox-signal";
}

function samplingIsSignal(samplingType: string) {
  return samplingType === "DSAT" || samplingType === "LEAD_SIGNAL" || samplingType === "LOW_SCORE";
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

      <div className="inbox-list">
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
          const stateTone = isOverdue && reviewState !== "finalized" ? "danger" : reviewStateTone(reviewState);

          return (
            <article key={conversation.id} className="inbox-row">
              <input
                type="checkbox"
                name="conversationId"
                value={conversation.id}
                aria-label={`Выбрать ${conversation.subject}`}
                className="h-4 w-4 shrink-0 rounded border-[#d7dce5]"
              />

              <div className="min-w-0">
                <Link href={`/reviews/${conversation.id}`} className="inbox-title text-[#0b4f52] hover:underline">
                  {conversation.subject}
                </Link>
                <p className="inbox-meta mt-1">
                  {conversation.customerName} · {conversation.assigneeName ?? "Не назначен"} · {formatMessageCount(conversation.messages.length)}
                </p>
                <div className="signal-row mt-2">
                  {conversation.csatBucket === "NEGATIVE" ? (
                    <span className="inbox-signal inbox-signal--warn">
                      {conversation.csatScore ? `${conversation.csatScore} · ` : ""}
                      {csatBucketLabels[conversation.csatBucket] ?? conversation.csatBucket}
                    </span>
                  ) : null}
                  {samplingIsSignal(conversation.samplingType) ? (
                    <span className="inbox-signal inbox-signal--warn">
                      {samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType}
                    </span>
                  ) : null}
                  {conversation.riskHint ? <span className="inbox-signal inbox-signal--warn">Риск</span> : null}
                </div>
              </div>

              <div className="inbox-row__meta min-w-0">
                <p className="inbox-meta">
                  {channelLabels[conversation.channel]} · {externalSourceLabel(conversation.externalSource)}
                </p>
                <p className="inbox-meta mt-1">
                  Проверяющий: {conversation.qaAssigneeName ?? "не назначен"}
                </p>
                <p className="inbox-meta mt-1">
                  Срок: {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "нет"}
                </p>
              </div>

              <div className="inbox-row__score grid justify-items-end gap-2">
                <span className={signalClassName(stateTone)}>{reviewStateLabels[reviewState]}</span>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {latestFinalizedReview?.criticalError ? (
                    <span className="inbox-signal inbox-signal--danger">Критическая</span>
                  ) : latestFinalizedReview?.needsReanswer ? (
                    <span className="inbox-signal inbox-signal--warn">
                      {reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? "Переответ"}
                    </span>
                  ) : hasAppeal ? (
                    <span className="inbox-signal inbox-signal--warn">Апелляция</span>
                  ) : (
                    <span className="inbox-meta">Без эскалации</span>
                  )}
                  <ScoreBar value={latestFinalizedReview?.totalScore} emptyLabel={draftReview ? "Черновик" : "Нет оценки"} compact />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <details className="disclosure-panel border-t border-[#d7dce5]">
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#17202a]">Массовые действия</h2>
            <p className="mt-1 text-sm text-[#667085]">Назначение, срок или состояние для отмеченных обращений.</p>
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
    </form>
  );
}
