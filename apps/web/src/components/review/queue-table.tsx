import { Inbox } from "lucide-react";
import Link from "next/link";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
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
import { formatQualityScore } from "@/lib/score-display";
import { resolveReviewState, reviewStateLabels, type ReviewState } from "@/lib/review-state";

type QueueTableProps = {
  conversations: ReviewQueueConversationDto[];
  qaAssignees: ReviewQueueAssigneeDto[];
  returnTo: string;
};

/**
 * Status of the review state, mapped to the single colored chip on each row.
 * Color is rationed: only the highest-priority signal per row earns a hue, and
 * "finalized" stays neutral (done is not an alert), per the clean-product ramp.
 */
function reviewStateTone(state: ReviewState): ChipTone {
  if (state === "reopened") return "warning";
  if (state === "assigned" || state === "in_progress") return "accent";
  return "neutral";
}

function samplingIsSignal(samplingType: string) {
  return samplingType === "DSAT" || samplingType === "LEAD_SIGNAL" || samplingType === "LOW_SCORE";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "—";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toLocaleUpperCase("ru-RU");
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase("ru-RU");
}

export function QueueTable({ conversations, qaAssignees, returnTo }: QueueTableProps) {
  if (conversations.length === 0) {
    return (
      <div className="panel queue-empty-state">
        <EmptyState
          icon={<Inbox size={26} aria-hidden="true" />}
          title="Очередь пуста"
          description="Новые диалоги появятся после импорта, API-загрузки или изменения фильтров отбора."
          action={
            <Link href="/reviews" className="action-button action-button--primary">
              Сбросить фильтры
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <form action={bulkUpdateReviewQueue} className="panel queue-board overflow-clip">
      <input type="hidden" name="returnTo" value={returnTo} />

      <details className="queue-bulk-actions">
        <summary className="queue-bulk-actions__summary">
          <span>Массовые действия</span>
          <span className="queue-filterbar__summary-action">
            <span className="queue-filterbar__summary-closed">Раскрыть</span>
            <span className="queue-filterbar__summary-open">Скрыть</span>
            <span className="queue-bulk-actions__count">{conversations.length}</span>
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

      <div className="queue-list" role="list">
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
          const hasCritical = Boolean(latestFinalizedReview?.criticalError);
          const appealLabel = latestFinalizedReview
            ? appealStatusLabels[latestFinalizedReview.appealStatus] ?? latestFinalizedReview.appealStatus
            : "";
          const reanswerLabel = latestFinalizedReview
            ? reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? "Переответ"
            : "Переответ";
          const dueLabel = reviewDueAt
            ? reviewDueAt.toLocaleDateString("ru-RU")
            : conversation.qaStatus === "FINALIZED"
              ? "закрыто"
              : "не задан";

          // ONE colored chip per row: pick the single most urgent signal. SLA
          // breach and critical risk fire the semantic ramp; otherwise the chip
          // describes the review state with a rationed accent for active work.
          const statusChipTone: ChipTone = isOverdue || hasCritical
            ? "danger"
            : hasReanswer || hasAppeal || reviewState === "reopened"
              ? "warning"
              : reviewStateTone(reviewState);
          const statusChipLabel = isOverdue
            ? "Просрочено"
            : hasCritical
              ? "Критическая ошибка"
              : hasReanswer
                ? reanswerLabel
                : hasAppeal
                  ? `Апелляция: ${appealLabel}`
                  : reviewStateLabels[reviewState];

          // Secondary signals stay monochrome (neutral) — the row keeps a single
          // hue. They live in the meta line, not as rainbow chips.
          const signalItems = [
            conversation.csatBucket === "NEGATIVE"
              ? csatBucketLabels[conversation.csatBucket] ?? conversation.csatBucket
              : null,
            samplingIsSignal(conversation.samplingType) ? samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType : null,
            conversation.riskHint ? "риск" : null
          ].filter((signal): signal is string => Boolean(signal));

          return (
            <div key={conversation.id} className="queue-row" role="listitem">
              <input
                type="checkbox"
                name="conversationId"
                value={conversation.id}
                aria-label={`Выбрать ${conversation.subject}`}
                className="queue-row__checkbox"
              />

              <span className="queue-row__avatar" aria-hidden="true">
                {initials(conversation.assigneeName ?? conversation.customerName)}
              </span>

              <span className="queue-row__status">
                <Chip tone={statusChipTone} size="sm">
                  {statusChipLabel}
                </Chip>
              </span>

              <span className="queue-row__main">
                <Link href={`/reviews/${conversation.id}`} className="queue-row__title">
                  {conversation.subject}
                </Link>
                <span className="queue-row__reason">{conversation.priorityReason}</span>
                <span className="queue-row__meta">
                  {conversation.customerName} · {conversation.assigneeName ?? "оператор не назначен"} ·{" "}
                  {channelLabels[conversation.channel]} · {formatMessageCount(conversation.messageCount)} ·{" "}
                  {externalSourceLabel(conversation.externalSource)}
                  {signalItems.length > 0 ? ` · ${signalItems.join(", ")}` : ""}
                </span>
              </span>

              <span className="queue-row__assignee">
                <span className="queue-row__assignee-label">Проверяющий</span>
                <span className="queue-row__assignee-name">{conversation.qaAssigneeName ?? "Не назначен"}</span>
              </span>

              <span className={`queue-row__sla${isOverdue ? " queue-row__sla--overdue" : ""}`}>
                <span className="queue-row__sla-label">SLA</span>
                <span className="queue-row__sla-value">{dueLabel}</span>
              </span>

              <span className="queue-row__score">
                {formatQualityScore(latestFinalizedReview?.totalScore, draftReview ? "Черновик" : "—")}
              </span>

              <Link href={`/reviews/${conversation.id}`} className="action-button queue-row__open">
                Открыть
              </Link>
            </div>
          );
        })}
      </div>
    </form>
  );
}
