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
  if (state === "finalized") {
    return "success";
  }

  if (state === "reopened") {
    return "warning";
  }

  if (state === "assigned" || state === "in_progress") {
    return "info";
  }

  return "neutral";
}

function samplingTone(samplingType: string) {
  if (samplingType === "DSAT" || samplingType === "LEAD_SIGNAL" || samplingType === "LOW_SCORE") {
    return "warning";
  }

  if (samplingType === "RANDOM") {
    return "neutral";
  }

  return "info";
}

function csatTone(csatBucket: string) {
  if (csatBucket === "NEGATIVE") {
    return "danger";
  }

  if (csatBucket === "POSITIVE") {
    return "success";
  }

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
      <div className="grid gap-3 border-b border-[#d7dce5] bg-white p-4 lg:grid-cols-[minmax(0,1fr)_170px_220px_160px_auto] lg:items-end">
        <div>
          <h2 className="text-base font-semibold text-[#17202a]">Массовые действия</h2>
          <p className="mt-1 text-sm text-[#667085]">Отметьте обращения в таблице и примените назначение, срок или состояние.</p>
        </div>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Состояние
          <select name="qaStatus" defaultValue="" className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
          <select name="qaAssigneeId" defaultValue="" className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
          <input name="reviewDueAt" type="date" className="rounded border border-[#d7dce5] bg-white px-3 py-2" />
        </label>
        <button type="submit" className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
          Обновить выбранные
        </button>
      </div>
      <div className="scroll-area">
        <table className="table-fixed-copy w-full min-w-[1040px] border-collapse text-left text-sm">
          <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
            <tr>
              <th className="w-[48px] px-4 py-3 font-semibold">Выбор</th>
              <th className="px-4 py-3 font-semibold">Диалог</th>
              <th className="px-4 py-3 font-semibold">Состояние проверки</th>
              <th className="px-4 py-3 font-semibold">Оператор</th>
              <th className="px-4 py-3 font-semibold">Проверяющий</th>
              <th className="px-4 py-3 font-semibold">Выборка</th>
              <th className="px-4 py-3 font-semibold">Срок</th>
              <th className="px-4 py-3 font-semibold">Процесс</th>
              <th className="px-4 py-3 font-semibold">Оценка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d7dce5]">
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
                <tr key={conversation.id} className="transition-colors hover:bg-[#f7f8fb]">
                  <td className="px-4 py-4 align-top">
                    <input
                      type="checkbox"
                      name="conversationId"
                      value={conversation.id}
                      aria-label={`Выбрать ${conversation.subject}`}
                      className="h-4 w-4 rounded border-[#d7dce5]"
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Link href={`/reviews/${conversation.id}`} className="font-medium text-[#0b4f52] hover:underline">
                      {conversation.subject}
                    </Link>
                    <div className="mt-1 text-xs text-[#667085]">
                      {conversation.customerName} · {formatMessageCount(conversation.messages.length)}
                    </div>
                    <div className="mt-2 flex max-w-[430px] flex-wrap gap-1.5">
                      <StatusChip size="xs">{channelLabels[conversation.channel]}</StatusChip>
                      <StatusChip size="xs">{conversation.externalSource}</StatusChip>
                      <StatusChip size="xs" tone={csatTone(conversation.csatBucket)}>
                        {conversation.csatScore ? `${conversation.csatScore} · ` : ""}
                        {csatBucketLabels[conversation.csatBucket] ?? conversation.csatBucket}
                      </StatusChip>
                      <StatusChip size="xs" tone={samplingTone(conversation.samplingType)}>
                        {samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType}
                      </StatusChip>
                      {isOverdue && reviewState !== "finalized" ? (
                        <StatusChip size="xs" tone="danger">
                          Просрочено
                        </StatusChip>
                      ) : null}
                      {conversation.riskHint ? (
                        <StatusChip size="xs" tone="warning" title={conversation.riskHint}>
                          Риск
                        </StatusChip>
                      ) : null}
                    </div>
                    <div className="mt-1 max-w-[360px] text-xs leading-4 text-[#667085]">
                      {conversation.samplingReason}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-top">
                    <StatusChip tone={isOverdue && reviewState !== "finalized" ? "danger" : reviewStateTone(reviewState)}>
                      {reviewStateLabels[reviewState]}
                    </StatusChip>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#344054]">{conversation.assigneeName ?? "Не назначен"}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#344054]">{conversation.qaAssigneeName ?? "Не назначен"}</td>
                  <td className="px-4 py-4 text-[#344054]">
                    <StatusChip tone={samplingTone(conversation.samplingType)}>
                      {samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType}
                    </StatusChip>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#344054]">
                    {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"}
                  </td>
                  <td className="px-4 py-4 text-[#344054]">
                    {latestFinalizedReview?.criticalError ? (
                      <StatusChip tone="danger">Критическая</StatusChip>
                    ) : latestFinalizedReview?.needsReanswer ? (
                      <StatusChip tone="warning">
                        {reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? "Переответ"}
                      </StatusChip>
                    ) : hasAppeal ? (
                      <StatusChip tone="warning">Апелляция</StatusChip>
                    ) : (
                      <span className="text-[#667085]">Без эскалации</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 font-medium text-[#17202a]">
                    <ScoreBar value={latestFinalizedReview?.totalScore} emptyLabel={draftReview ? "Черновик" : "Нет оценки"} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
