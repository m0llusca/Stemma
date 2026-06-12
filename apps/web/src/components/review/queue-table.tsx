import Link from "next/link";
import { ScoreBar } from "@/components/ui/score-bar";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import type { ReviewQueueAssigneeDto, ReviewQueueConversationDto } from "@/lib/contracts/review-queue";
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

type QueueTableProps = {
  conversations: ReviewQueueConversationDto[];
  qaAssignees: ReviewQueueAssigneeDto[];
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

function dueTone(isOverdue: boolean, hasDueDate: boolean, isFinalized: boolean) {
  if (isFinalized) return "good";
  if (isOverdue) return "danger";
  if (hasDueDate) return "warning";
  return "neutral";
}

export function QueueTable({ conversations, qaAssignees, returnTo }: QueueTableProps) {
  if (conversations.length === 0) {
    return (
      <div className="panel queue-empty-state">
        <div className="queue-empty-state__mark">0</div>
        <div>
          <h2>Очередь пуста</h2>
          <p>Новые диалоги появятся после импорта, API-загрузки или изменения фильтров отбора.</p>
        </div>
        <Link href="/reviews" className="action-button action-button--primary">
          Сбросить фильтры
        </Link>
      </div>
    );
  }

  return (
    <form action={bulkUpdateReviewQueue} className="panel overflow-clip">
      <input type="hidden" name="returnTo" value={returnTo} />

      <details className="queue-bulk-actions">
        <summary className="queue-bulk-actions__summary">
          <span>Массовые действия</span>
          <span className="queue-filterbar__summary-action">
            <span className="queue-filterbar__summary-closed">Раскрыть</span>
            <span className="queue-filterbar__summary-open">Скрыть</span>
            <span className="text-[var(--text-muted)]">{conversations.length}</span>
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
          const latestFinalizedReview =
            conversation.qaStatus === "FINALIZED"
              ? conversation.reviews.find((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN")
              : undefined;
          const draftReview = conversation.reviews.find((review) => review.status === "DRAFT" && review.reviewSource === "HUMAN");
          const reviewDueAt = conversation.reviewDueAt ? new Date(conversation.reviewDueAt) : null;
          const isOverdue =
            reviewDueAt !== null &&
            reviewDueAt < new Date() &&
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
          const dueLabel = reviewDueAt
            ? reviewDueAt.toLocaleDateString("ru-RU")
            : conversation.qaStatus === "FINALIZED"
              ? "закрыто"
              : "не задан";
          const dueSignalTone = dueTone(isOverdue, Boolean(reviewDueAt), conversation.qaStatus === "FINALIZED");
          const signalItems = [
            conversation.csatBucket === "NEGATIVE"
              ? csatBucketLabels[conversation.csatBucket] ?? conversation.csatBucket
              : null,
            samplingIsSignal(conversation.samplingType) ? samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType : null,
            conversation.riskHint ? "риск" : null
          ].filter((signal): signal is string => Boolean(signal));
          const hasFlags = signalItems.length > 0 || Boolean(latestFinalizedReview?.criticalError) || hasReanswer || Boolean(hasAppeal);

          return (
            <article key={conversation.id} className={ticketClassName(stateTone)}>
              <input
                type="checkbox"
                name="conversationId"
                value={conversation.id}
                aria-label={`Выбрать ${conversation.subject}`}
                className="queue-ticket__checkbox h-6 w-6 shrink-0 rounded border-[var(--border)]"
              />

              <div className="queue-ticket__main">
                <div className="queue-ticket__headline">
                  <Link href={`/reviews/${conversation.id}`} className="queue-ticket__title">
                    {conversation.subject}
                  </Link>
                  <span className={signalClassName(stateTone)}>{reviewStateLabels[reviewState]}</span>
                </div>
                <div className="queue-ticket__meta-row">
                  <p className="queue-ticket__meta">
                    {conversation.customerName} · {conversation.assigneeName ?? "оператор не назначен"} ·{" "}
                    {channelLabels[conversation.channel]} · {formatMessageCount(conversation.messageCount)}
                  </p>
                </div>
                <ul className="queue-ticket__detail-chips" aria-label="Рабочий контекст обращения">
                  <li>
                    <span>Источник</span>
                    <strong>{externalSourceLabel(conversation.externalSource)}</strong>
                  </li>
                  <li>
                    <span>Команда</span>
                    <strong>{conversation.teamName ?? "Не указана"}</strong>
                  </li>
                  <li>
                    <span>Проверяющий</span>
                    <strong>{conversation.qaAssigneeName ?? "Не назначен"}</strong>
                  </li>
                  <li className={`queue-ticket__due queue-ticket__due--${dueSignalTone}`}>
                    <span>SLA</span>
                    <strong>{dueLabel}</strong>
                  </li>
                </ul>
                {hasFlags ? (
                  <div className="queue-ticket__signals">
                    {signalItems.length > 0 ? (
                      <span className={`queue-ticket__signal-group ${isOverdue ? "queue-ticket__signal-group--warn" : ""}`}>
                        Сигналы: {signalItems.join(", ")}
                      </span>
                    ) : null}
                    {latestFinalizedReview?.criticalError ? (
                      <span className="queue-ticket__priority queue-ticket__priority--danger">Критическая ошибка</span>
                    ) : null}
                    {hasReanswer ? (
                      <span className="queue-ticket__priority queue-ticket__priority--warn">{reanswerLabel}</span>
                    ) : null}
                    {hasAppeal ? (
                      <span className="queue-ticket__priority queue-ticket__priority--warn">Апелляция: {appealLabel}</span>
                    ) : null}
                  </div>
                ) : null}
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
