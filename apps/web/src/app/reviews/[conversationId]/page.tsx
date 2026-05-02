import { notFound } from "next/navigation";
import { ConversationTimeline } from "@/components/review/conversation-timeline";
import { ReviewPanel } from "@/components/review/review-panel";
import { getCurrentUser } from "@/lib/current-user";
import {
  channelLabels,
  conversationStatusLabel,
  formatMessageCount,
  ownerTypeLabels,
  reviewStatusLabels,
  riskLevelLabels
} from "@/lib/labels";
import { getActiveScorecard, getConversationForReview } from "@/lib/review-repository";

export const dynamic = "force-dynamic";

type ReviewDetailPageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const [{ conversationId }, user] = await Promise.all([params, getCurrentUser()]);
  const [conversation, scorecard] = await Promise.all([
    getConversationForReview(user.workspaceId, conversationId),
    getActiveScorecard(user.workspaceId)
  ]);

  if (!conversation) {
    notFound();
  }

  const latestReview = conversation.reviews[0];

  return (
    <section className="px-8 py-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#667085]">Доска проверки</p>
          <h1 className="mt-1 text-2xl font-semibold">{conversation.subject}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#667085]">
            <span>{conversation.customerName}</span>
            <span>{channelLabels[conversation.channel]}</span>
            <span>{conversationStatusLabel(conversation.status)}</span>
            <span>{formatMessageCount(conversation.messages.length)}</span>
          </div>
        </div>

        <div className="panel min-w-[220px] p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Последняя оценка</p>
          <p className="mt-2 text-3xl font-semibold text-[#17202a]">
            {latestReview ? `${latestReview.totalScore}%` : "Не проверено"}
          </p>
          {latestReview ? (
            <p className="mt-1 text-sm text-[#667085]">
              {reviewStatusLabels[latestReview.status]}: {latestReview.reviewer.name}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Ответственный</p>
          <p className="mt-2 text-sm font-medium">{conversation.assigneeName ?? "Не назначен"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Причина выборки</p>
          <p className="mt-2 text-sm font-medium">{conversation.samplingReason}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Подсказка риска</p>
          <p className="mt-2 text-sm font-medium">{conversation.riskHint ?? "Нет"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Открыто</p>
          <p className="mt-2 text-sm font-medium">{conversation.openedAt.toLocaleString("ru-RU")}</p>
        </div>
      </div>

      {latestReview ? (
        <section className="panel mb-6 p-5">
          <h2 className="text-lg font-semibold">Последняя находка</h2>
          <p className="mt-2 text-sm leading-6 text-[#344054]">{latestReview.summary}</p>
          {latestReview.findings[0] ? (
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="font-semibold text-[#667085]">Ответственность</p>
                <p className="mt-1">{ownerTypeLabels[latestReview.findings[0].ownerType]}</p>
              </div>
              <div>
                <p className="font-semibold text-[#667085]">Риск</p>
                <p className="mt-1">{riskLevelLabels[latestReview.findings[0].riskLevel]}</p>
              </div>
              <div>
                <p className="font-semibold text-[#667085]">Категория</p>
                <p className="mt-1">{latestReview.findings[0].category}</p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
        <ConversationTimeline messages={conversation.messages} />
        <ReviewPanel conversationId={conversation.id} messages={conversation.messages} scorecard={scorecard} />
      </div>
    </section>
  );
}
