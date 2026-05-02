import { notFound } from "next/navigation";
import { ConversationTimeline } from "@/components/review/conversation-timeline";
import { ReviewPanel } from "@/components/review/review-panel";
import { ReviewWorkflow } from "@/components/review/review-workflow";
import { WorkflowManagementPanel } from "@/components/review/workflow-management-panel";
import { canManageReviewWorkflow, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  channelLabels,
  conversationStatusLabel,
  formatMessageCount,
  ownerTypeLabels,
  qaStatusLabels,
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

  const latestFinalizedReview = conversation.reviews.find((review) => review.status === "FINALIZED");
  const currentDraftReview = conversation.reviews.find(
    (review) => review.status === "DRAFT" && review.reviewerId === user.id
  );
  const scorePreviewReview = latestFinalizedReview ?? currentDraftReview;
  const latestFinding = latestFinalizedReview?.findings[0];
  const evidenceMessageIds = Array.from(
    new Set(
      scorePreviewReview?.scores
        .map((score) => score.evidenceMessageId)
        .filter((messageId): messageId is string => Boolean(messageId)) ?? []
    )
  );
  const canManageWorkflow = canManageReviewWorkflow(user.role);

  return (
    <section className="page-shell">
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
            {scorePreviewReview ? `${Math.round(scorePreviewReview.totalScore)}%` : "Не проверено"}
          </p>
          {scorePreviewReview ? (
            <p className="mt-1 text-sm text-[#667085]">
              {reviewStatusLabels[scorePreviewReview.status]}: {scorePreviewReview.reviewer.name}
            </p>
          ) : null}
        </div>
      </div>

      <ReviewWorkflow
        isReviewed={Boolean(latestFinalizedReview)}
        scorecardName={`${scorecard.name} v${scorecard.version}`}
        hasFinding={Boolean(latestFinding)}
        hasCoachingAction={Boolean(latestFinding?.coachingAction)}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Оператор</p>
          <p className="mt-2 text-sm font-medium">{conversation.assigneeName ?? "Не назначен"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">QA</p>
          <p className="mt-2 text-sm font-medium">{conversation.qaAssigneeName ?? "Не назначен"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Workflow</p>
          <p className="mt-2 text-sm font-medium">{qaStatusLabels[conversation.qaStatus]}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Дедлайн</p>
          <p className="mt-2 text-sm font-medium">
            {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"}
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Причина выборки</p>
          <p className="mt-2 text-sm font-medium">{conversation.samplingReason}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Открыто</p>
          <p className="mt-2 text-sm font-medium">{conversation.openedAt.toLocaleString("ru-RU")}</p>
        </div>
      </div>

      {conversation.riskHint ? (
        <section className="panel mb-6 p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Подсказка риска</p>
          <p className="mt-2 text-sm font-medium">{conversation.riskHint}</p>
        </section>
      ) : null}

      {canManageWorkflow ? <WorkflowManagementPanel conversation={conversation} assignees={qaAssignees} /> : null}

      {latestFinalizedReview ? (
        <section className="panel mb-6 p-5">
          <h2 className="text-lg font-semibold">Последняя находка</h2>
          <p className="mt-2 text-sm leading-6 text-[#344054]">{latestFinalizedReview.summary}</p>
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
          {latestFinding?.coachingAction ? (
            <div className="mt-4 rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4 text-sm">
              <p className="font-semibold text-[#667085]">Коучинг</p>
              <p className="mt-1 text-[#17202a]">{latestFinding.coachingAction.action}</p>
              <p className="mt-2 text-[#667085]">
                {latestFinding.coachingAction.assignee}
                {latestFinding.coachingAction.dueAt
                  ? ` · до ${latestFinding.coachingAction.dueAt.toLocaleDateString("ru-RU")}`
                  : ""}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {conversation.reviews.length > 0 ? (
        <section className="panel mb-6 overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">История проверок</h2>
          </div>
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
              <tr>
                <th className="px-5 py-3 font-semibold">Дата</th>
                <th className="px-5 py-3 font-semibold">Проверяющий</th>
                <th className="px-5 py-3 font-semibold">Статус</th>
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
                  <td className="px-5 py-4 text-[#344054]">{review.findings[0]?.category ?? "Без находки"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
        <ConversationTimeline messages={conversation.messages} highlightedMessageIds={evidenceMessageIds} />
        <ReviewPanel
          conversationId={conversation.id}
          messages={conversation.messages}
          scorecard={scorecard}
          draftReview={currentDraftReview}
        />
      </div>
    </section>
  );
}
