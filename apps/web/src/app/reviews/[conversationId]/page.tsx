import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
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
  reviewStatusLabels,
  riskLevelLabels
} from "@/lib/labels";
import { getActiveScorecard, getConversationForReview } from "@/lib/review-repository";
import { resolveReviewState, reviewStateBadgeClass, reviewStateLabels } from "@/lib/review-state";

export const dynamic = "force-dynamic";

type ReviewDetailPageProps = {
  params: Promise<{ conversationId: string }>;
};

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-[#667085]">{label}</p>
      <div className="mt-1 min-w-0 break-words text-sm font-medium text-[#17202a]">{children}</div>
    </div>
  );
}

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
  const reviewState = resolveReviewState({
    qaStatus: conversation.qaStatus,
    hasDraftReview: Boolean(currentDraftReview),
    hasFinalizedReview: Boolean(latestFinalizedReview)
  });
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
            <span>Статус тикета: {conversationStatusLabel(conversation.status)}</span>
            <span>{formatMessageCount(conversation.messages.length)}</span>
          </div>
        </div>

        <div className="panel min-w-[220px] p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">Последняя оценка</p>
          <p className="mt-2 text-3xl font-semibold text-[#17202a]">
            {scorePreviewReview ? `${Math.round(scorePreviewReview.totalScore)}%` : "Не проверено"}
          </p>
          {scorePreviewReview ? (
            <p className="mt-1 text-sm leading-5 text-[#667085]">
              {reviewStateLabels[reviewState]} · {scorePreviewReview.reviewer.name}
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

      <section className="panel mb-6 overflow-hidden">
        <div className="border-b border-[#d7dce5] bg-white px-5 py-4">
          <h2 className="text-lg font-semibold">Контекст проверки</h2>
          <p className="mt-1 text-sm text-[#667085]">Состояние QA-задачи, участники, сроки и причина выборки.</p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Состояние проверки">
            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${reviewStateBadgeClass(reviewState)}`}>
              {reviewStateLabels[reviewState]}
            </span>
          </DetailItem>
          <DetailItem label="QA">{conversation.qaAssigneeName ?? "Не назначен"}</DetailItem>
          <DetailItem label="Оператор">{conversation.assigneeName ?? "Не назначен"}</DetailItem>
          <DetailItem label="Дедлайн">
            {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"}
          </DetailItem>
          <DetailItem label="Причина выборки">{conversation.samplingReason}</DetailItem>
          <DetailItem label="Риск">{conversation.riskHint ?? "Без отдельной подсказки"}</DetailItem>
          <DetailItem label="Статус тикета">{conversationStatusLabel(conversation.status)}</DetailItem>
          <DetailItem label="Открыто">{conversation.openedAt.toLocaleString("ru-RU")}</DetailItem>
        </div>
      </section>

      {canManageWorkflow ? <WorkflowManagementPanel conversation={conversation} assignees={qaAssignees} /> : null}

      {latestFinalizedReview ? (
        <details className="panel disclosure-panel mb-6 overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Последняя находка</h2>
              <p className="mt-1 truncate text-sm text-[#667085]">{latestFinalizedReview.summary}</p>
            </div>
            <span
              className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#0b4f52]"
              aria-hidden="true"
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="border-t border-[#d7dce5] p-5">
            <p className="text-sm leading-6 text-[#344054]">{latestFinalizedReview.summary}</p>
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
          </div>
          {latestFinding?.coachingAction ? (
            <div className="mx-5 mb-5 rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4 text-sm">
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
        </details>
      ) : null}

      {conversation.reviews.length > 0 ? (
        <details className="panel disclosure-panel mb-6 overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">История проверок</h2>
              <p className="mt-1 text-sm text-[#667085]">{conversation.reviews.length} записей</p>
            </div>
            <span
              className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#0b4f52]"
              aria-hidden="true"
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="scroll-area border-t border-[#d7dce5]">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Дата</th>
                  <th className="px-5 py-3 font-semibold">Проверяющий</th>
                  <th className="px-5 py-3 font-semibold">Статус записи</th>
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
          </div>
        </details>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <ConversationTimeline messages={conversation.messages} highlightedMessageIds={evidenceMessageIds} />
        <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:overflow-auto">
          <ReviewPanel
            conversationId={conversation.id}
            messages={conversation.messages}
            scorecard={scorecard}
            draftReview={currentDraftReview}
          />
        </div>
      </div>
    </section>
  );
}
