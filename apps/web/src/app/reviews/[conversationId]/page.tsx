import { notFound } from "next/navigation";
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  Gauge,
  Headset,
  MessageSquareText,
  Radio,
  ShieldAlert,
  TicketCheck,
  UserRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { resolveReviewState, reviewStateLabels, type ReviewState } from "@/lib/review-state";

export const dynamic = "force-dynamic";

type ReviewDetailPageProps = {
  params: Promise<{ conversationId: string }>;
};

function reviewStateTone(state: ReviewState) {
  if (state === "finalized") {
    return "success";
  }

  if (state === "reopened") {
    return "warning";
  }

  if (state === "assigned" || state === "in_progress") {
    return "active";
  }

  return "neutral";
}

function HeaderChip({
  label,
  children,
  icon: Icon,
  tone = "neutral",
  wide = false
}: {
  label: string;
  children: ReactNode;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "active";
  wide?: boolean;
}) {
  return (
    <span className={`meta-chip meta-chip--${tone} ${wide ? "meta-chip--wide" : ""}`}>
      <span className="meta-chip__icon" aria-hidden="true">
        <Icon size={13} />
      </span>
      <span className="meta-chip__label">{label}</span>
      <span className="meta-chip__value">{children}</span>
    </span>
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
  const scoreLabel = scorePreviewReview ? `${Math.round(scorePreviewReview.totalScore)}%` : "Не проверено";

  return (
    <section className="page-shell">
      <div className="mb-5">
        <p className="text-sm font-medium text-[#667085]">Доска проверки</p>
        <h1 className="mt-1 text-2xl font-semibold">{conversation.subject}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <HeaderChip label="Состояние" icon={BadgeCheck} tone={reviewStateTone(reviewState)}>
            {reviewStateLabels[reviewState]}
          </HeaderChip>
          <HeaderChip label="Оценка" icon={Gauge}>{scoreLabel}</HeaderChip>
          <HeaderChip label="Клиент" icon={UserRound}>{conversation.customerName}</HeaderChip>
          <HeaderChip label="Канал" icon={Radio}>{channelLabels[conversation.channel]}</HeaderChip>
          <HeaderChip label="Тикет" icon={TicketCheck}>{conversationStatusLabel(conversation.status)}</HeaderChip>
          <HeaderChip label="Сообщения" icon={MessageSquareText}>{formatMessageCount(conversation.messages.length)}</HeaderChip>
          <HeaderChip label="Проверяющий" icon={Headset}>{conversation.qaAssigneeName ?? "Не назначен"}</HeaderChip>
          <HeaderChip label="Срок" icon={CalendarClock}>
            {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"}
          </HeaderChip>
          {conversation.riskHint ? (
            <HeaderChip label="Риск" icon={ShieldAlert} tone="warning" wide>
              {conversation.riskHint}
            </HeaderChip>
          ) : null}
        </div>
      </div>

      <ReviewWorkflow
        isReviewed={Boolean(latestFinalizedReview)}
        hasDraftReview={Boolean(currentDraftReview)}
        scorecardName={`${scorecard.name} v${scorecard.version}`}
      />

      {canManageWorkflow ? <WorkflowManagementPanel conversation={conversation} assignees={qaAssignees} /> : null}

      {latestFinalizedReview ? (
        <details className="panel disclosure-panel mb-6 overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Последнее замечание</h2>
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
              <p className="font-semibold text-[#667085]">Разбор с оператором</p>
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
            <table className="table-fixed-copy w-full min-w-[760px] border-collapse text-left text-sm">
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
                    <td className="px-5 py-4 text-[#344054]">{review.findings[0]?.category ?? "Без замечаний"}</td>
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
