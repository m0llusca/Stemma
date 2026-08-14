import { notFound } from "next/navigation";
import {
  ChevronDown,
  MessageSquareWarning,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { AiDraftDecisionControls } from "@/components/review/ai-draft-decision-controls";
import { ConversationTimeline } from "@/components/review/conversation-timeline";
import { ReviewPanel } from "@/components/review/review-panel";
import { ReviewSavedToast } from "@/components/review/review-saved-toast";
import { WorkbenchPaneToggle } from "@/components/review/workbench-pane-toggle";
import { WorkflowManagementPanel } from "@/components/review/workflow-management-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MasterDetail } from "@/components/ui/master-detail";
import { PageShell } from "@/components/ui/page-shell";
import { Separator } from "@/components/ui/separator";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createTrainingAssignmentFromReview, updateReviewFeedback } from "@/lib/feedback-actions";
import { isDeterministicAiModel } from "@/lib/ai-quality/draft-origin";
import {
  canManageReviewWorkflow,
  canManageTraining,
  canSaveReviewDraft,
  canSelfReview,
  requireCurrentUserPermission
} from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  channelLabels,
  conversationStatusLabel,
  csatBucketLabels,
  appealStatusLabels,
  externalSourceLabel,
  feedbackStatusLabels,
  formatMessageCount,
  ownerTypeLabels,
  reanswerStatusLabels,
  reviewStatusLabels,
  riskLevelLabels,
  samplingTypeLabels
} from "@/lib/labels";
import { russianPlural } from "@/lib/reports/report-format";
import { computeBatchProgress, formatBatchProgress } from "@/lib/review/batch-progress";
import { nextReviewOrderBy, nextReviewWhere } from "@/lib/review/next-review-query";
import { reviewEventActionLabel } from "@/lib/review-events";
import {
  parseConversationScorePrediction,
  type CriterionPrediction
} from "@/lib/ai-quality/scoring/types";
import { getActiveScorecard, getConversationForReview } from "@/lib/review-repository";
import { resolveReviewState, reviewStateLabels, type ReviewState } from "@/lib/review-state";
import { formatQualityScore } from "@/lib/score-display";
import { toneForScore, type StatusTone } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ReviewDetailPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusChipTone: Record<StatusTone, ChipTone> = {
  neutral: "neutral",
  positive: "success",
  negative: "danger",
  warning: "warning",
  info: "info"
};

function reviewStateTone(state: ReviewState): StatusTone {
  if (state === "finalized") {
    return "positive";
  }

  if (state === "reopened") {
    return "warning";
  }

  if (state === "assigned" || state === "in_progress") {
    return "info";
  }

  return "neutral";
}

function dueDateTone(value: Date | null, now: Date, state: ReviewState): StatusTone {
  if (!value) {
    return "neutral";
  }

  if (state === "finalized") {
    return "positive";
  }

  if (value.getTime() < now.getTime()) {
    return "negative";
  }

  return "warning";
}

function StatusChip({
  label,
  value,
  tone = "neutral",
  numeric = false
}: {
  label?: string;
  value: ReactNode;
  tone?: StatusTone;
  numeric?: boolean;
}) {
  return <Chip tone={statusChipTone[tone]} label={label} value={value} numeric={numeric} />;
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{children}</p>
    </div>
  );
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function aiDraftKindLabel(value: string) {
  const labels: Record<string, string> = {
    score: "Оценка",
    risk_tag: "Риск",
    coaching_suggestion: "Коучинг",
    training_recommendation: "Обучение",
    priority_summary: "Приоритет"
  };

  return labels[value] ?? value;
}

function aiDraftStatusLabel(value: string) {
  const labels: Record<string, string> = {
    draft: "Ожидает",
    approved: "Принят",
    rejected: "Отклонен",
    changed: "Изменен"
  };

  return labels[value] ?? value;
}

function aiDraftStatusTone(value: string): StatusTone {
  if (value === "draft") return "warning";
  if (value === "approved") return "positive";
  if (value === "changed") return "info";
  if (value === "rejected") return "neutral";
  return "neutral";
}

function evidenceRefCount(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function suggestedValuePreview(value: string) {
  try {
    const parsed = JSON.parse(value);
    const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    return text.length > 140 ? `${text.slice(0, 140)}...` : text;
  } catch {
    return value.length > 140 ? `${value.slice(0, 140)}...` : value;
  }
}

export default function ReviewDetailPage({ params, searchParams }: ReviewDetailPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" label="Загрузка проверки" />}>
      <ReviewDetailPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export async function ReviewDetailPageContent({ params, searchParams }: ReviewDetailPageProps) {
  const [{ conversationId }, rawSearchParams, user] = await Promise.all([params, searchParams, requireCurrentUserPermission("reviews:read")]);
  const now = new Date();
  const requestedReviewSource = singleParam(rawSearchParams.reviewSource);
  const reviewSource =
    requestedReviewSource === "CALIBRATION" || requestedReviewSource === "SELF_REVIEW" ? requestedReviewSource : "HUMAN";
  const returnTo = singleParam(rawSearchParams.returnTo);
  const savedMarker = singleParam(rawSearchParams.saved);
  const supportAgentScope = user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : undefined;
  const canSaveHumanReviewDraft = canSaveReviewDraft(user.role);
  const canEvaluateReviewPermission = reviewSource === "SELF_REVIEW" ? canSelfReview(user.role) : canSaveHumanReviewDraft;
  const canManageWorkflow = canManageReviewWorkflow(user.role);
  const canCreateTrainingAssignment = canManageTraining(user.role) && user.role !== "SUPPORT_AGENT";
  // Calibration pins are internal alignment notes: visible to QA roles only,
  // and new ones can be added only while evaluating in calibration mode.
  const canSeeCoachingPins = canSaveHumanReviewDraft;
  const canSeeAiQualityDrafts = canSaveHumanReviewDraft;
  const aiDraftPreviewSelect = {
    id: true,
    kind: true,
    status: true,
    modelVersion: true,
    promptVersion: true,
    suggestedValueJson: true,
    evidenceRefsJson: true,
    decisionReason: true,
    finalizedAt: true,
    createdAt: true,
    finalizedBy: {
      select: {
        name: true
      }
    }
  } as const;
  const [
    conversation,
    scorecard,
    qaAssignees,
    pendingAiDrafts,
    decidedAiDrafts,
    aiDraftTotalCount,
    pendingAiDraftCount,
    queueConversations,
    latestScoreDraft
  ] = await Promise.all([
    getConversationForReview(user.workspaceId, conversationId, supportAgentScope),
    canEvaluateReviewPermission ? getActiveScorecard(user.workspaceId) : Promise.resolve(null),
    canManageWorkflow
      ? prisma.user.findMany({
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
      : Promise.resolve([]),
    canSeeAiQualityDrafts
      ? prisma.aiQualityDraft.findMany({
          where: {
            workspaceId: user.workspaceId,
            conversationId,
            status: "draft"
          },
          orderBy: [{ createdAt: "desc" }],
          take: 5,
          select: aiDraftPreviewSelect
        })
      : Promise.resolve([]),
    canSeeAiQualityDrafts
      ? prisma.aiQualityDraft.findMany({
          where: {
            workspaceId: user.workspaceId,
            conversationId,
            status: {
              not: "draft"
            }
          },
          orderBy: [{ finalizedAt: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: aiDraftPreviewSelect
        })
      : Promise.resolve([]),
    canSeeAiQualityDrafts
      ? prisma.aiQualityDraft.count({
          where: {
            workspaceId: user.workspaceId,
            conversationId
          }
        })
      : Promise.resolve(0),
    canSeeAiQualityDrafts
      ? prisma.aiQualityDraft.count({
          where: {
            workspaceId: user.workspaceId,
            conversationId,
            status: "draft"
          }
        })
      : Promise.resolve(0),
    // Priority-ordered ids of the unreviewed queue, for the "N из M" footer
    // counter. Same where/order as "take next" so the position is consistent
    // with the case the reviewer would be sent to. Ids only; bounded.
    prisma.conversation.findMany({
      where: nextReviewWhere(user),
      orderBy: nextReviewOrderBy,
      select: { id: true },
      take: 500
    }),
    // Latest per-criterion AI "score" prediction for the workbench chips. Read
    // only when the reviewer may see AI drafts; one row is enough — the newest
    // score draft drives the AI chips and their confidence labels.
    canSeeAiQualityDrafts
      ? prisma.aiQualityDraft.findFirst({
          where: {
            workspaceId: user.workspaceId,
            conversationId,
            kind: "score"
          },
          orderBy: [{ createdAt: "desc" }],
          select: { suggestedValueJson: true }
        })
      : Promise.resolve(null)
  ]);

  if (!conversation) {
    notFound();
  }

  const batchProgress = computeBatchProgress(
    conversation.id,
    queueConversations.map((item) => item.id)
  );
  const batchProgressLabel = formatBatchProgress(batchProgress);

  const latestFinalizedReview =
    conversation.qaStatus === "FINALIZED"
      ? conversation.reviews.find((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN")
      : undefined;
  const currentDraftReview = conversation.reviews.find(
    (review) => review.status === "DRAFT" && review.reviewerId === user.id && review.reviewSource === reviewSource
  );
  const canShowReviewPanel = canEvaluateReviewPermission && (reviewSource !== "HUMAN" || conversation.qaStatus !== "FINALIZED");
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
  const aiDrafts = [...pendingAiDrafts, ...decidedAiDrafts].slice(0, 5);
  const decidedAiDraftCount = Math.max(aiDraftTotalCount - pendingAiDraftCount, 0);
  // The latest "score" draft is parsed into a per-criterion map the workbench
  // looks up by criterion id. A malformed payload parses to null → no chips.
  const scorePrediction = latestScoreDraft ? parseConversationScorePrediction(latestScoreDraft.suggestedValueJson) : null;
  const aiPredictions: Record<string, CriterionPrediction> = {};
  for (const criterion of scorePrediction?.criteria ?? []) {
    if (criterion.criterionId) {
      aiPredictions[criterion.criterionId] = criterion;
    }
  }
  const scoreLabel = formatQualityScore(scorePreviewReview?.totalScore, "Не проверено");
  const hasAppeal = latestFinalizedReview ? latestFinalizedReview.appealStatus !== "none" : false;
  const hasOpenAppeal = latestFinalizedReview?.appealStatus === "open";
  const appealLabel = latestFinalizedReview
    ? appealStatusLabels[latestFinalizedReview.appealStatus] ?? latestFinalizedReview.appealStatus
    : "Нет";
  const hasReanswer = Boolean(latestFinalizedReview?.needsReanswer);
  const reanswerLabel = latestFinalizedReview
    ? reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? latestFinalizedReview.reanswerStatus
    : "Нет";
  const feedbackClosed =
    latestFinalizedReview?.feedbackStatus === "acknowledged" || latestFinalizedReview?.feedbackStatus === "corrected";
  const canAcknowledgeFeedback = Boolean(latestFinalizedReview && !feedbackClosed && !hasOpenAppeal);
  const canOpenAppeal = Boolean(latestFinalizedReview && !feedbackClosed && latestFinalizedReview.appealStatus === "none");
  const canCompleteReanswer = Boolean(latestFinalizedReview?.needsReanswer && latestFinalizedReview.reanswerStatus === "requested");

  const detailPane = (
    <div id="review-evidence" className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {canSeeAiQualityDrafts ? (
        <Card className="border-(--ai-border) bg-(--ai-soft)" aria-label="ИИ-подсказки проверки">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-border/60 pb-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-(--ai-ink)">ИИ-контроль</p>
              <CardTitle className="mt-1 text-base">ИИ-предложения</CardTitle>
              <CardDescription>
                Подсказки показывают гипотезу и доказательства; решение принимаете вы — примите, отклоните или измените предложение.
              </CardDescription>
            </div>
            <StatusChip
              label="Ожидают"
              value={pendingAiDraftCount}
              numeric
              tone={pendingAiDraftCount > 0 ? "warning" : "neutral"}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-3">
            {aiDrafts.length > 0 ? (
              aiDrafts.map((draft) => (
                <article
                  key={draft.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">{aiDraftKindLabel(draft.kind)}</h3>
                      <p className="text-xs text-muted-foreground">
                        {draft.modelVersion} · {draft.promptVersion} · ссылок на доказательства: {evidenceRefCount(draft.evidenceRefsJson)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {isDeterministicAiModel(draft.modelVersion) ? (
                        <StatusChip label="Движок" value="Эвристика (без AI)" tone="warning" />
                      ) : null}
                      <StatusChip label="Статус" value={aiDraftStatusLabel(draft.status)} tone={aiDraftStatusTone(draft.status)} />
                    </div>
                  </div>
                  <p className="text-sm text-foreground">{suggestedValuePreview(draft.suggestedValueJson)}</p>
                  {draft.finalizedAt || draft.decisionReason ? (
                    <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                      {draft.finalizedBy?.name ?? "Проверяющий"} · {draft.finalizedAt ? draft.finalizedAt.toLocaleString("ru-RU") : "решение зафиксировано"}
                      {draft.decisionReason ? ` · ${draft.decisionReason}` : ""}
                    </p>
                  ) : draft.status === "draft" ? (
                    <AiDraftDecisionControls draftId={draft.id} suggestedValueJson={draft.suggestedValueJson} />
                  ) : (
                    <p className="border-t border-border pt-2 text-xs text-muted-foreground">Решение пока не зафиксировано.</p>
                  )}
                </article>
              ))
            ) : (
              <EmptyState
                size="inline"
                icon={<Sparkles size={20} aria-hidden="true" />}
                title="ИИ-предложений пока нет"
                description="Когда ИИ предложит оценку, её можно будет принять, отклонить или изменить здесь."
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5" aria-label="Сводка доказательств проверки">
        <div className="grid gap-1 rounded-xl border border-border bg-muted/30 p-3">
          <span className="text-xs text-muted-foreground">Доказательства</span>
          <strong className="text-base text-foreground tabular-nums">{evidenceMessageIds.length}</strong>
          <small className="text-xs text-muted-foreground">
            {evidenceMessageIds.length > 0 ? "Подсвечены в таймлайне диалога." : "Пока нет привязанных сообщений."}
          </small>
        </div>
        <div className="grid gap-1 rounded-xl border border-border bg-muted/30 p-3">
          <span className="text-xs text-muted-foreground">Итоговый риск</span>
          <strong className="text-base text-foreground">{latestFinding ? riskLevelLabels[latestFinding.riskLevel] : "Нет"}</strong>
          <small className="text-xs text-muted-foreground">{latestFinding?.category ?? "Категория появится после оценки."}</small>
        </div>
        <div className="grid gap-1 rounded-xl border border-border bg-muted/30 p-3">
          <span className="text-xs text-muted-foreground">Обратная связь</span>
          <strong className="text-base text-foreground">
            {latestFinalizedReview ? feedbackStatusLabels[latestFinalizedReview.feedbackStatus] ?? latestFinalizedReview.feedbackStatus : "Нет"}
          </strong>
          <small className="text-xs text-muted-foreground">
            {hasOpenAppeal ? "Открыта апелляция." : hasReanswer ? "Нужен переответ." : "Без блокирующего процесса."}
          </small>
        </div>
        {canSeeAiQualityDrafts ? (
          <div className="grid gap-1 rounded-xl border border-border bg-muted/30 p-3">
            <span className="text-xs text-muted-foreground">ИИ-подсказки</span>
            <strong className="text-base text-foreground tabular-nums">
              {aiDraftTotalCount > 0 ? `${pendingAiDraftCount}/${aiDraftTotalCount}` : "0"}
            </strong>
            <small className="text-xs text-muted-foreground">
              {decidedAiDraftCount > 0 ? `${decidedAiDraftCount} уже имеют решение человека.` : "Ожидают ручного решения."}
            </small>
          </div>
        ) : null}
      </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 md:grid-cols-2">
      {latestFinalizedReview ? (
        <Collapsible className="group min-w-0 overflow-clip rounded-xl bg-card ring-1 ring-foreground/10 data-open:md:col-span-2">
          <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">Последнее замечание</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">{latestFinalizedReview.summary}</p>
            </div>
            <span
              className="disclosure-chevron flex size-8 shrink-0 items-center justify-center rounded-md text-primary transition-transform group-data-open:rotate-180"
              aria-hidden="true"
            >
              <ChevronDown className="size-4" />
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border p-5">
              <p className="text-sm leading-6 text-foreground">{latestFinalizedReview.summary}</p>
              {latestFinding ? (
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <DetailItem label="Ответственность">{ownerTypeLabels[latestFinding.ownerType]}</DetailItem>
                  <DetailItem label="Риск">{riskLevelLabels[latestFinding.riskLevel]}</DetailItem>
                  <DetailItem label="Категория">{latestFinding.category}</DetailItem>
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <DetailItem label="Критическая ошибка">
                  {latestFinalizedReview.criticalError ? latestFinalizedReview.criticalCategory ?? "Да" : "Нет"}
                </DetailItem>
                <DetailItem label="Апелляция">
                  {appealStatusLabels[latestFinalizedReview.appealStatus] ?? latestFinalizedReview.appealStatus}
                </DetailItem>
                <DetailItem label="Переответ">
                  {reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? latestFinalizedReview.reanswerStatus}
                </DetailItem>
              </div>
            </div>
            {latestFinalizedReview.feedbackComment || latestFinalizedReview.positiveNotes ? (
              <div className="mx-5 mb-5 grid gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                {latestFinalizedReview.feedbackComment ? (
                  <div>
                    <p className="font-semibold text-muted-foreground">Обратная связь</p>
                    <p className="mt-1 text-foreground">{latestFinalizedReview.feedbackComment}</p>
                  </div>
                ) : null}
                {latestFinalizedReview.positiveNotes ? (
                  <div>
                    <p className="font-semibold text-muted-foreground">Положительные моменты</p>
                    <p className="mt-1 text-foreground">{latestFinalizedReview.positiveNotes}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {latestFinding?.coachingAction ? (
              <div className="mx-5 mb-5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="font-semibold text-muted-foreground">Разбор с оператором</p>
                <p className="mt-1 text-foreground">{latestFinding.coachingAction.action}</p>
                <p className="mt-2 text-muted-foreground">
                  {latestFinding.coachingAction.assignee}
                  {latestFinding.coachingAction.dueAt
                    ? ` · до ${latestFinding.coachingAction.dueAt.toLocaleDateString("ru-RU")}`
                    : ""}
                </p>
              </div>
            ) : null}
            {latestFinalizedReview.needsReanswer ? (
              <Alert className="mx-5 mb-5 border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-300">
                <RotateCcw aria-hidden="true" />
                <AlertDescription>
                  Нужен переответ клиенту: проверьте, что руководитель получил сигнал и обращение переоткрыто при необходимости.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="mx-5 mb-5 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Обратная связь и апелляция</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Статус: {feedbackStatusLabels[latestFinalizedReview.feedbackStatus] ?? latestFinalizedReview.feedbackStatus}
                    {latestFinalizedReview.feedbackAckAt
                      ? ` · ознакомлен ${latestFinalizedReview.feedbackAckAt.toLocaleString("ru-RU")}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canAcknowledgeFeedback ? (
                    <form action={updateReviewFeedback}>
                      <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                      <input type="hidden" name="action" value="acknowledged" />
                      <Button type="submit" size="sm" variant="outline">
                        Ознакомлен
                      </Button>
                    </form>
                  ) : null}
                  {canOpenAppeal ? (
                    <form action={updateReviewFeedback}>
                      <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                      <input type="hidden" name="action" value="appeal_opened" />
                      <Button type="submit" size="sm" variant="outline">
                        Открыть апелляцию
                      </Button>
                    </form>
                  ) : null}
                  {canCompleteReanswer ? (
                    <form action={updateReviewFeedback}>
                      <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                      <input type="hidden" name="action" value="reanswer_completed" />
                      <Button type="submit" size="sm">
                        Переответ выполнен
                      </Button>
                    </form>
                  ) : null}
                  {!canAcknowledgeFeedback && !canOpenAppeal && !canCompleteReanswer ? (
                    <StatusChip label="Действия" value="нет" tone="neutral" />
                  ) : null}
                </div>
              </div>
              {canCreateTrainingAssignment ? (
                <form
                  action={createTrainingAssignmentFromReview}
                  className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px_auto] md:items-end"
                >
                  <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                  <input type="hidden" name="assigneeName" value={conversation.assigneeName ?? ""} />
                  <Field>
                    <FieldLabel>Учебная задача</FieldLabel>
                    <Input name="title" required defaultValue={`Разбор: ${latestFinding?.category ?? "итог проверки"}`} />
                  </Field>
                  <Field>
                    <FieldLabel>Описание</FieldLabel>
                    <Input name="description" required defaultValue={latestFinalizedReview.summary} />
                  </Field>
                  <Field>
                    <FieldLabel>Срок</FieldLabel>
                    <Input name="dueAt" type="date" />
                  </Field>
                  <ValidatedSubmitButton className={cn(buttonVariants({ variant: "default" }))}>
                    Создать
                  </ValidatedSubmitButton>
                </form>
              ) : null}
              {latestFinalizedReview.feedbackEvents.length > 0 ? (
                <div className="mt-3 grid gap-2 text-sm">
                  {latestFinalizedReview.feedbackEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="rounded-md border border-border bg-background px-2.5 py-1.5 text-muted-foreground"
                    >
                      {event.createdAt.toLocaleString("ru-RU")} · {event.actor.name} · {reviewEventActionLabel(event.action)}
                      {event.comment ? ` · ${event.comment}` : ""}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {canEvaluateReviewPermission && conversation.reviews.length > 0 ? (
        <Collapsible className="group min-w-0 overflow-clip rounded-xl bg-card ring-1 ring-foreground/10 data-open:md:col-span-2">
          <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">История проверок</h2>
              <p className="mt-1 text-sm text-muted-foreground">{russianPlural(conversation.reviews.length, ["запись", "записи", "записей"])}</p>
            </div>
            <span
              className="disclosure-chevron flex size-8 shrink-0 items-center justify-center rounded-md text-primary transition-transform group-data-open:rotate-180"
              aria-hidden="true"
            >
              <ChevronDown className="size-4" />
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
              {conversation.reviews.map((review) => (
                <article key={review.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">{review.reviewer.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(review.finalizedAt ?? review.createdAt).toLocaleString("ru-RU")}
                      </p>
                    </div>
                    <StatusChip
                      label="Оценка"
                      value={formatQualityScore(review.totalScore)}
                      numeric
                      tone={toneForScore(review.totalScore)}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {reviewStatusLabels[review.status]} · {review.findings[0]?.category ?? "Без замечаний"}
                  </p>
                </article>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      </div>
    </div>
  );

  return (
    <PageShell
      eyebrow="Доска проверки"
      title={conversation.subject}
      description="Диалог, доказательства и форма оценки собраны в одном рабочем экране без лишних служебных таблиц."
    >
      <ReviewSavedToast marker={savedMarker} />
      {latestFinalizedReview && hasOpenAppeal ? (
        <Alert className="flex flex-wrap items-start gap-3 border-amber-500/30 bg-amber-500/10">
          <MessageSquareWarning className="size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <AlertTitle>Открыта апелляция</AlertTitle>
            <AlertDescription>
              Статус: {appealLabel}
              {latestFinalizedReview.appealDueAt ? ` · срок ${latestFinalizedReview.appealDueAt.toLocaleDateString("ru-RU")}` : ""}.
              Руководитель должен принять решение и зафиксировать итог.
            </AlertDescription>
          </div>
          {canManageWorkflow ? (
            <div className="flex flex-wrap gap-2">
              <form action={updateReviewFeedback}>
                <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                <input type="hidden" name="action" value="appeal_confirmed" />
                <Button type="submit" size="sm" variant="outline">
                  Оценка верна
                </Button>
              </form>
              <form action={updateReviewFeedback}>
                <input type="hidden" name="reviewId" value={latestFinalizedReview.id} />
                <input type="hidden" name="action" value="appeal_corrected" />
                <Button type="submit" size="sm">
                  Нужна корректировка
                </Button>
              </form>
            </div>
          ) : null}
        </Alert>
      ) : null}

      <Card className="py-0" aria-label="Контекст обращения">
        <CardHeader className="gap-3 border-b border-border px-4 py-3.5">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">Контекст</CardTitle>
            <CardDescription>
              Клиент {conversation.customerName} · оператор {conversation.assigneeName ?? "не назначен"}
            </CardDescription>
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <StatusChip label="Состояние" value={reviewStateLabels[reviewState]} tone={reviewStateTone(reviewState)} />
            <StatusChip label="Оценка" value={scoreLabel} numeric tone={toneForScore(scorePreviewReview?.totalScore)} />
            <StatusChip label="Источник" value={externalSourceLabel(conversation.externalSource)} />
            {conversation.teamName ? (
              <StatusChip label="Команда" value={conversation.teamName} />
            ) : null}
            <StatusChip
              label="Срок"
              value={conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "Нет"}
              numeric
              tone={dueDateTone(conversation.reviewDueAt, now, reviewState)}
            />
            {conversation.riskHint ? (
              <StatusChip label="Риск" value={conversation.riskHint} tone="warning" />
            ) : null}
            {hasAppeal ? (
              <StatusChip label="Апелляция" value={appealLabel} tone={hasOpenAppeal ? "warning" : "info"} />
            ) : null}
            {hasReanswer ? (
              <StatusChip
                label="Переответ"
                value={reanswerLabel}
                tone={latestFinalizedReview?.reanswerStatus === "completed" ? "positive" : "warning"}
              />
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Канал">{channelLabels[conversation.channel]}</DetailItem>
          <DetailItem label="Тикет">{conversationStatusLabel(conversation.status)}</DetailItem>
          <DetailItem label="Сообщения">{formatMessageCount(conversation.messages.length)}</DetailItem>
          <DetailItem label="Проверяющий">{conversation.qaAssigneeName ?? "Не назначен"}</DetailItem>
          <DetailItem label="Выборка">{samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType}</DetailItem>
          <DetailItem label="CSAT">
            {conversation.csatScore ? `${conversation.csatScore} · ${csatBucketLabels[conversation.csatBucket]}` : csatBucketLabels[conversation.csatBucket]}
          </DetailItem>
        </CardContent>
      </Card>

      <div
        id="review-workspace"
        className={cn(
          "flex min-w-0 flex-col gap-3",
          "max-lg:[&[data-active-pane=dialog]_.master-detail>div:has(>[data-slot=review-score-pane])]:hidden",
          "max-lg:[&[data-active-pane=score]_.master-detail>div:has(>[data-slot=review-dialog-pane])]:hidden"
        )}
        data-active-pane="dialog"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <WorkbenchPaneToggle targetId="review-workspace" />
        </div>
        <MasterDetail
          listWidth="minmax(0, 1fr)"
          list={
            <div data-slot="review-dialog-pane" className="min-w-0">
              <ConversationTimeline
                messages={conversation.messages}
                highlightedMessageIds={evidenceMessageIds}
                conversationId={conversation.id}
                coachingPins={canSeeCoachingPins ? conversation.coachingPins : []}
                canCoach={canSeeCoachingPins && reviewSource === "CALIBRATION"}
                canManagePins={canManageWorkflow}
                currentUserId={user.id}
              />
            </div>
          }
          detail={
            <div data-slot="review-score-pane" className="min-w-0">
              {canShowReviewPanel && scorecard ? (
                <div>
                  <ReviewPanel
                    conversationId={conversation.id}
                    messages={conversation.messages}
                    scorecard={scorecard}
                    draftReview={currentDraftReview}
                    reviewSource={reviewSource}
                    returnTo={returnTo}
                    title={reviewSource === "CALIBRATION" ? "Калибровочная оценка" : reviewSource === "SELF_REVIEW" ? "Комментарий оператора" : "Проверка"}
                    aiPredictions={aiPredictions}
                  />
                </div>
              ) : (
                <aside>
                  <Card className="overflow-clip py-0">
                    <CardHeader className="border-b border-border px-5 py-4">
                      <CardTitle className="text-lg">Итог проверки</CardTitle>
                      <CardDescription>
                        Оператор видит только собственное обращение и финальную обратную связь.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 p-5 text-sm">
                      <DetailItem label="Обратная связь">
                        {latestFinalizedReview
                          ? feedbackStatusLabels[latestFinalizedReview.feedbackStatus] ?? latestFinalizedReview.feedbackStatus
                          : "Пока нет финальной проверки"}
                      </DetailItem>
                      <DetailItem label="Апелляция">{appealLabel}</DetailItem>
                    </CardContent>
                  </Card>
                </aside>
              )}
            </div>
          }
        />
        <footer className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 border-t border-border pt-3">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
            Прогресс по очереди
          </span>
          <strong className="text-sm font-bold tabular-nums text-foreground" aria-live="polite">
            {batchProgressLabel}
          </strong>
          <span className="text-xs text-muted-foreground">
            {batchProgress.position === 0
              ? "Обращение вне активной очереди проверки."
              : batchProgress.isLast
                ? "Это последнее обращение в очереди."
                : `Осталось ещё ${batchProgress.remaining} в очереди.`}
          </span>
        </footer>
      </div>

      {detailPane}

      {canManageWorkflow ? <WorkflowManagementPanel conversation={conversation} assignees={qaAssignees} /> : null}
    </PageShell>
  );
}
