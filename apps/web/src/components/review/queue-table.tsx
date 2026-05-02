import type { Conversation, Message, Review } from "@prisma/client";
import Link from "next/link";
import { ScoreBar } from "@/components/ui/score-bar";
import { StatusChip } from "@/components/ui/status-chip";
import { channelLabels, csatBucketLabels, formatMessageCount, reanswerStatusLabels, samplingTypeLabels } from "@/lib/labels";
import { resolveReviewState, reviewStateLabels, type ReviewState } from "@/lib/review-state";

type QueueConversation = Conversation & {
  messages: Message[];
  reviews: Review[];
};

type QueueTableProps = {
  conversations: QueueConversation[];
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

export function QueueTable({ conversations }: QueueTableProps) {
  if (conversations.length === 0) {
    return (
      <div className="panel px-5 py-10 text-center">
        <h2 className="text-base font-semibold text-[#17202a]">Очередь пуста</h2>
        <p className="mt-2 text-sm text-[#667085]">Новые диалоги появятся после импорта или ручной загрузки через API.</p>
      </div>
    );
  }

  return (
    <div className="scroll-area rounded-md border border-[#d7dce5] bg-white">
      <table className="table-fixed-copy w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
          <tr>
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
            const latestFinalizedReview = conversation.reviews.find((review) => review.status === "FINALIZED");
            const draftReview = conversation.reviews.find((review) => review.status === "DRAFT");
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
  );
}
