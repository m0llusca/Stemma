import type { Conversation, Message, Review } from "@prisma/client";
import Link from "next/link";
import { ScoreBar } from "@/components/ui/score-bar";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import {
  channelLabels,
  csatBucketLabels,
  appealStatusLabels,
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

function ticketClassName(tone: "neutral" | "good" | "warning" | "danger") {
  if (tone === "good") return "queue-ticket queue-ticket--good";
  if (tone === "warning") return "queue-ticket queue-ticket--warning";
  if (tone === "danger") return "queue-ticket queue-ticket--danger";
  return "queue-ticket";
}

function samplingIsSignal(samplingType: string) {
  return samplingType === "DSAT" || samplingType === "LEAD_SIGNAL" || samplingType === "LOW_SCORE";
}

export function QueueTable({ conversations, qaAssignees, returnTo }: QueueTableProps) {
  if (conversations.length === 0) {
    return (
      <div className="panel px-5 py-10 text-center">
        <h2 className="text-base font-semibold text-[#111827]">Очередь пуста</h2>
        <p className="mt-2 text-sm text-[#64748b]">Новые диалоги появятся после импорта или ручной загрузки через API.</p>
      </div>
    );
  }

  return (
    <form action={bulkUpdateReviewQueue} className="panel overflow-hidden">
      <input type="hidden" name="returnTo" value={returnTo} />

      <details className="queue-bulk-actions">
        <summary className="queue-bulk-actions__summary">
          <span>Массовые действия</span>
          <span className="queue-filterbar__summary-action">
            <span className="queue-filterbar__summary-closed">Раскрыть</span>
            <span className="queue-filterbar__summary-open">Скрыть</span>
            <span className="text-[#64748b]">{conversations.length}</span>
          </span>
        </summary>
        <div className="queue-bulk-actions__body">
          <label className="queue-bulk-actions__field">
            <span>Состояние</span>
            <select name="qaStatus" defaultValue="" className="form-control">
              <option value="">Не менять</option>
              {Object.entries(qaStatusLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="queue-bulk-actions__field">
            <span>Проверяющий</span>
            <select name="qaAssigneeId" defaultValue="" className="form-control">
              <option value="">Не менять</option>
              {qaAssignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="queue-bulk-actions__field">
            <span>Срок</span>
            <input name="reviewDueAt" type="date" className="form-control" />
          </label>
          <ValidatedSubmitButton
            minCheckedNames={["conversationId"]}
            requireAnyValueNames={["qaStatus", "qaAssigneeId", "reviewDueAt"]}
            className="action-button action-button--primary queue-bulk-actions__submit"
          >
            Обновить
          </ValidatedSubmitButton>
        </div>
      </details>

      <div className="queue-list">
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
          const hasReanswer = Boolean(latestFinalizedReview?.needsReanswer);
          const appealLabel = latestFinalizedReview
            ? appealStatusLabels[latestFinalizedReview.appealStatus] ?? latestFinalizedReview.appealStatus
            : "";
          const reanswerLabel = latestFinalizedReview
            ? reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? "Переответ"
            : "Переответ";
          const stateTone = isOverdue && reviewState !== "finalized" ? "danger" : reviewStateTone(reviewState);

          return (
            <article key={conversation.id} className={ticketClassName(stateTone)}>
              <input
                type="checkbox"
                name="conversationId"
                value={conversation.id}
                aria-label={`Выбрать ${conversation.subject}`}
                className="mt-1 h-6 w-6 shrink-0 rounded border-[#d9e0ea]"
              />

              <div className="queue-ticket__main">
                <div className="queue-ticket__headline">
                  <Link href={`/reviews/${conversation.id}`} className="queue-ticket__title">
                    {conversation.subject}
                  </Link>
                  <span className={signalClassName(stateTone)}>{reviewStateLabels[reviewState]}</span>
                </div>
                <p className="queue-ticket__meta">
                  {conversation.customerName} · {conversation.assigneeName ?? "Не назначен"} · {formatMessageCount(conversation.messages.length)}
                </p>
                <div className="queue-ticket__chips">
                  <span className="pill pill--neutral">
                    {channelLabels[conversation.channel]} · {externalSourceLabel(conversation.externalSource)}
                  </span>
                  <span className={`pill ${isOverdue ? "pill--warn" : "pill--neutral"}`}>
                    Срок: {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "нет"}
                  </span>
                  <span className="pill pill--neutral">
                    Проверяющий: {conversation.qaAssigneeName ?? "не назначен"}
                  </span>
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
                  {latestFinalizedReview?.criticalError ? (
                    <span className="inbox-signal inbox-signal--danger">Критическая ошибка</span>
                  ) : null}
                  {hasReanswer ? (
                    <span className="inbox-signal inbox-signal--warn queue-ticket__process">
                      {reanswerLabel}
                    </span>
                  ) : null}
                  {hasAppeal ? (
                    <span className="inbox-signal inbox-signal--warn queue-ticket__process">
                      Апелляция: {appealLabel}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="queue-ticket__aside">
                <ScoreBar value={latestFinalizedReview?.totalScore} emptyLabel={draftReview ? "Черновик" : "Нет оценки"} compact label="Оценка" />
                <Link href={`/reviews/${conversation.id}`} className="action-button min-h-[36px] px-3 py-2 text-sm">
                  Открыть
                </Link>
              </div>
            </article>
          );
        })}
      </div>

    </form>
  );
}
