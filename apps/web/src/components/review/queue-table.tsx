import type { Conversation, Message, Review } from "@prisma/client";
import Link from "next/link";
import { channelLabels, csatBucketLabels, formatMessageCount, reanswerStatusLabels, samplingTypeLabels } from "@/lib/labels";
import { resolveReviewState, reviewStateBadgeClass, reviewStateLabels } from "@/lib/review-state";

type QueueConversation = Conversation & {
  messages: Message[];
  reviews: Review[];
};

type QueueTableProps = {
  conversations: QueueConversation[];
};

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
    <div className="scroll-area rounded-lg border border-[#d7dce5] bg-white">
      <table className="table-fixed-copy w-full min-w-[1320px] border-collapse text-left text-sm">
        <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
          <tr>
            <th className="px-4 py-3 font-semibold">Диалог</th>
            <th className="px-4 py-3 font-semibold">Состояние проверки</th>
            <th className="px-4 py-3 font-semibold">Канал</th>
            <th className="px-4 py-3 font-semibold">Источник</th>
            <th className="px-4 py-3 font-semibold">Оператор</th>
            <th className="px-4 py-3 font-semibold">Проверяющий</th>
            <th className="px-4 py-3 font-semibold">Выборка</th>
            <th className="px-4 py-3 font-semibold">CSAT</th>
            <th className="px-4 py-3 font-semibold">Срок</th>
            <th className="px-4 py-3 font-semibold">Процесс</th>
            <th className="px-4 py-3 font-semibold">Причина</th>
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

            return (
              <tr key={conversation.id} className="hover:bg-[#f7f8fb]">
                <td className="px-4 py-4 align-top">
                  <Link href={`/reviews/${conversation.id}`} className="font-medium text-[#0b4f52] hover:underline">
                    {conversation.subject}
                  </Link>
                  <div className="mt-1 text-xs text-[#667085]">
                    {conversation.customerName} · {formatMessageCount(conversation.messages.length)}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 align-top">
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      isOverdue && reviewState !== "finalized" ? "bg-[#fff4ed] text-[#b54708]" : reviewStateBadgeClass(reviewState)
                    }`}
                  >
                    {reviewStateLabels[reviewState]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-[#344054]">{channelLabels[conversation.channel]}</td>
                <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-[#344054]">{conversation.externalSource}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[#344054]">{conversation.assigneeName ?? "Не назначен"}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[#344054]">{conversation.qaAssigneeName ?? "Не назначен"}</td>
                <td className="px-4 py-4 text-[#344054]">
                  {samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-[#344054]">
                  {conversation.csatScore ? `${conversation.csatScore} · ` : ""}
                  {csatBucketLabels[conversation.csatBucket] ?? conversation.csatBucket}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-[#344054]">
                  {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"}
                </td>
                <td className="px-4 py-4 text-[#344054]">
                  {latestFinalizedReview?.criticalError ? (
                    <span className="rounded-md bg-[#fff4ed] px-2 py-1 text-xs font-semibold text-[#b54708]">Критическая</span>
                  ) : latestFinalizedReview?.needsReanswer ? (
                    <span className="rounded-md bg-[#fff4ed] px-2 py-1 text-xs font-semibold text-[#b54708]">
                      {reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? "Переответ"}
                    </span>
                  ) : (
                    <span className="text-[#667085]">Без эскалации</span>
                  )}
                </td>
                <td className="px-4 py-4 text-[#344054]">{conversation.samplingReason}</td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-[#17202a]">
                  {latestFinalizedReview ? `${latestFinalizedReview.totalScore}%` : draftReview ? "Черновик" : "Не проверено"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
