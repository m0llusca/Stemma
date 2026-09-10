import Link from "next/link";
import { ArrowRight, BookOpenCheck, MessageSquareText, ShieldQuestion } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { AgentAppealForm } from "@/components/feedback/agent-appeal-form";
import { AgentCriterionFeedbackList } from "@/components/feedback/agent-criterion-feedback-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { ScoreSparkline } from "@/components/ui/score-sparkline";
import { Separator } from "@/components/ui/separator";
import { TriageStrip } from "@/components/ui/triage-strip";
import { ToastActionForm } from "@/app/coaching/toast-action-form";
import { updateReviewFeedbackState, updateTrainingAssignmentStatusState } from "@/lib/feedback-actions";
import {
  agentAppealDisabledReason,
  agentAppealNextSteps,
  canAgentOpenAppeal,
  toAgentAppealPhase
} from "@/lib/feedback/agent-appeal";
import { toAgentCriterionFeedbackItems } from "@/lib/feedback/agent-criterion-feedback";
import { coachingPlanFocusHref } from "@/lib/coaching-follow-up";
import { buildSelfReviewTriage, trainingAssignmentEmptyCopy } from "@/lib/self-review/empty-honesty";
import { roleHomePath } from "@/lib/auth/role-home";

import { prisma } from "@/lib/db";
import {
  appealStatusLabels,
  feedbackStatusLabels,
  externalSourceLabel,
  riskLevelLabels
} from "@/lib/labels";
import { criterionEarnedPercent } from "@/lib/reports/report-aggregation";
import { formatReviewCount } from "@/lib/reports/report-format";
import { clampQualityScore, formatQualityScoreDelta } from "@/lib/score-display";
import { requirePagePermission } from "@/lib/page-permission";

export const dynamic = "force-dynamic";

function feedbackTone(status: string): ChipTone {
  if (status === "acknowledged" || status === "corrected") {
    return "success";
  }

  if (status === "appeal") {
    return "warning";
  }

  return "neutral";
}

export default function SelfReviewPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Загрузка обратной связи" />}>
      <SelfReviewPageContent />
    </Suspense>
  );
}

async function SelfReviewPageContent() {
  const user = await requirePagePermission("feedback:acknowledge");
  // Nav is agent-only; deep links from other roles must not land here.
  if (user.role !== "SUPPORT_AGENT") {
    redirect(roleHomePath(user.role, { name: user.name }));
  }
  const scopedToAgent = true;
  const [conversations, assignments, assignedTrainingCount] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        workspaceId: user.workspaceId,
        // Scope operators by their unique assigneeId (never the non-unique
        // display name); assignments below already scope by assigneeId.
        assigneeId: scopedToAgent ? user.id : undefined,
        qaStatus: "FINALIZED",
        reviews: { some: { reviewSource: "HUMAN", status: "FINALIZED" } }
      },
      include: {
        coachingPins: {
          where: { resolvedAt: null },
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5
        },
        reviews: {
          where: { reviewSource: "HUMAN", status: "FINALIZED" },
          include: {
            findings: {
              include: { coachingAction: true }
            },
            reviewer: true,
            scores: {
              include: {
                criterion: true,
                evidenceMessage: { select: { id: true, body: true } }
              }
            },
            trainingAssignments: {
              where: { status: { not: "done" } },
              include: {
                coachingPlan: { select: { id: true, title: true, status: true } }
              },
              take: 3
            }
          },
          orderBy: [{ finalizedAt: "desc" }, { createdAt: "desc" }],
          take: 1
        }
      },
      orderBy: [{ closedAt: "desc" }, { updatedAt: "desc" }],
      take: 20
    }),
    prisma.trainingAssignment.findMany({
      where: {
        workspaceId: user.workspaceId,
        assigneeId: scopedToAgent ? user.id : undefined,
        status: { not: "done" }
      },
      include: {
        review: { include: { conversation: true } }
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 6
    }),
    prisma.trainingAssignment.count({
      where: {
        workspaceId: user.workspaceId,
        assigneeId: scopedToAgent ? user.id : undefined
      }
    })
  ]);
  // Personal score trend: the agent's finalized review scores oldest -> newest.
  const myReviewScores = conversations
    .map((conversation) => conversation.reviews[0])
    .filter((review): review is NonNullable<typeof review> => Boolean(review))
    .slice()
    .reverse()
    .map((review) => review.totalScore);
  const myAverage = myReviewScores.length > 0 ? myReviewScores.reduce((sum, value) => sum + value, 0) / myReviewScores.length : null;
  const recentHalf = myReviewScores.slice(Math.ceil(myReviewScores.length / 2));
  const earlierHalf = myReviewScores.slice(0, Math.floor(myReviewScores.length / 2));
  const recentAverage = recentHalf.length > 0 ? recentHalf.reduce((sum, value) => sum + value, 0) / recentHalf.length : null;
  const earlierAverage = earlierHalf.length > 0 ? earlierHalf.reduce((sum, value) => sum + value, 0) / earlierHalf.length : null;
  // Per-criterion strengths and focus areas from the agent's finalized reviews.
  const criterionGroups = new Map<string, { label: string; percents: number[] }>();
  for (const conversation of conversations) {
    for (const score of conversation.reviews[0]?.scores ?? []) {
      const percent = criterionEarnedPercent(score);
      if (percent == null) {
        continue;
      }
      const group = criterionGroups.get(score.criterionId);
      if (group) {
        group.percents.push(percent);
      } else {
        criterionGroups.set(score.criterionId, { label: score.criterion.label, percents: [percent] });
      }
    }
  }
  const criterionStats = [...criterionGroups.values()]
    .filter((group) => group.percents.length >= 3)
    .map((group) => ({
      label: group.label,
      count: group.percents.length,
      averagePercent: Math.round(group.percents.reduce((sum, value) => sum + value, 0) / group.percents.length)
    }))
    .sort((a, b) => b.averagePercent - a.averagePercent);
  // Head and tail never overlap: together they take at most criterionStats.length entries.
  const strengthCriteria = criterionStats.slice(0, Math.min(3, Math.floor(criterionStats.length / 2)));
  const focusCriteria = criterionStats.slice(-Math.min(3, criterionStats.length - strengthCriteria.length)).reverse();
  const appealCount = conversations.filter((conversation) => conversation.reviews[0]?.appealStatus === "open").length;
  const actionConversations = conversations.filter((conversation) => {
    const review = conversation.reviews[0];
    const feedbackClosed = review && (review.feedbackStatus === "acknowledged" || review.feedbackStatus === "corrected");
    const feedbackRequiresResponse = review && !feedbackClosed;
    const reanswerRequiresResponse =
      review?.needsReanswer &&
      review.reanswerStatus !== "completed" &&
      review.reanswerStatus !== "not_needed";

    return review && (feedbackRequiresResponse || review.appealStatus === "open" || reanswerRequiresResponse);
  });
  const historyConversations = conversations.filter((conversation) => !actionConversations.some((action) => action.id === conversation.id));
  const nextConversation = actionConversations[0];

  const renderFeedbackCard = (conversation: (typeof conversations)[number], mode: "action" | "history" = "action") => {
    const review = conversation.reviews[0];
    const findings = review?.findings ?? [];
    const visibleFindings = findings.slice(0, 2);

    if (!review) {
      return null;
    }

    const deductionItems = toAgentCriterionFeedbackItems(review.scores, {
      trainingAssignments: (review.trainingAssignments ?? []).map((assignment) => ({
        title: assignment.title,
        coachingPlanId: assignment.coachingPlan?.id
      })),
      coachingActions: findings
        .map((finding) => finding.coachingAction)
        .filter((action): action is NonNullable<typeof action> => Boolean(action))
        .map((action) => ({ action: action.action }))
    });
    const appealAvailability = {
      appealStatus: review.appealStatus,
      feedbackStatus: review.feedbackStatus
    };
    const appealPhase = toAgentAppealPhase(review.appealStatus);
    const appealAllowed = canAgentOpenAppeal(appealAvailability);
    const appealDisabledReason = agentAppealDisabledReason(appealAvailability);
    const feedbackClosed = review.feedbackStatus === "acknowledged" || review.feedbackStatus === "corrected";
    const hasOpenAppeal = review.appealStatus === "open";
    const canAcknowledge = !feedbackClosed && !hasOpenAppeal;
    const canOpenAppeal = appealAllowed;
    const canCompleteReanswer = review.needsReanswer && review.reanswerStatus === "requested";
    const needsReviewLink =
      hasOpenAppeal ||
      (review.needsReanswer && review.reanswerStatus === "required") ||
      (!canAcknowledge && !canOpenAppeal && !canCompleteReanswer);
    const nextStep = canCompleteReanswer
      ? "Закройте переответ после отправки клиенту."
      : hasOpenAppeal
        ? "Дождитесь решения по апелляции или откройте детали проверки."
        : canAcknowledge
          ? "Примите оценку, если замечания понятны. Спорный пункт можно оспорить с обоснованием."
          : "Откройте детали, чтобы сверить цитату и комментарий проверяющего.";

    return (
      <Card key={conversation.id} size="sm" className="gap-0">
        <CardHeader className="border-b pb-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <CardTitle className="min-w-0">
                <Link
                  href={`/reviews/${conversation.id}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {conversation.subject}
                </Link>
              </CardTitle>
              <span className="shrink-0 text-lg font-semibold tabular-nums tracking-tight text-foreground">
                {clampQualityScore(review.totalScore)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone={feedbackTone(review.feedbackStatus)}>
                {feedbackStatusLabels[review.feedbackStatus] ?? review.feedbackStatus}
              </Chip>
              {review.appealStatus !== "none" ? (
                <Chip tone={review.appealStatus === "open" ? "warning" : "neutral"}>
                  {appealStatusLabels[review.appealStatus] ?? review.appealStatus}
                </Chip>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 pt-3">
          <p className="text-sm text-foreground">{review.summary}</p>
          {review.feedbackComment?.trim() ? (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Комментарий проверяющего</p>
              <p className="mt-1 text-foreground">{review.feedbackComment}</p>
            </div>
          ) : null}
          {review.positiveNotes?.trim() ? (
            <div className="text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Что сделано хорошо</p>
              <p className="mt-1 text-foreground">{review.positiveNotes}</p>
            </div>
          ) : null}
          {deductionItems.length > 0 ? (
            <AgentCriterionFeedbackList
              items={deductionItems}
              conversationId={conversation.id}
              dense
              appeal={{
                reviewId: review.id,
                allowed: appealAllowed,
                disabledReason: appealDisabledReason,
                phase: appealPhase,
                dueAt: review.appealDueAt
              }}
            />
          ) : null}
          {review.instructionLinks?.trim() ? (
            <div className="text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Материалы</p>
              <p className="mt-1 whitespace-pre-wrap text-foreground">{review.instructionLinks}</p>
            </div>
          ) : null}
          <p className="text-sm font-medium text-muted-foreground">{nextStep}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {externalSourceLabel(conversation.externalSource)} · {conversation.externalId}
            </span>
            <span>{review.reviewer.name}</span>
            <span>{(review.finalizedAt ?? review.createdAt).toLocaleDateString("ru-RU")}</span>
          </div>
          {visibleFindings.length > 0 ? (
            <div className="flex flex-col gap-2" aria-label="Замечания">
              {visibleFindings.map((finding) => (
                <div key={finding.id} className="rounded-md border border-border/80 px-2.5 py-2 text-xs">
                  <p className="font-medium text-foreground">
                    {finding.category} · {riskLevelLabels[finding.riskLevel]}
                  </p>
                  {finding.evidenceSummary?.trim() ? (
                    <p className="mt-1 text-muted-foreground">{finding.evidenceSummary}</p>
                  ) : null}
                  {finding.rootCause?.trim() ? (
                    <p className="mt-1 text-foreground">
                      <span className="text-muted-foreground">Причина: </span>
                      {finding.rootCause}
                    </p>
                  ) : null}
                  {finding.coachingAction ? (
                    <p className="mt-1.5 text-foreground">
                      <span className="text-muted-foreground">Разбор: </span>
                      {finding.coachingAction.action}
                      {finding.coachingAction.dueAt
                        ? ` · до ${finding.coachingAction.dueAt.toLocaleDateString("ru-RU")}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {conversation.coachingPins.length > 0 ? (
            <div className="flex flex-col gap-2" aria-label="Заметки коучинга">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Заметки коучинга</p>
              {conversation.coachingPins.map((pin) => (
                <div key={pin.id} className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs">
                  <p className="text-foreground">{pin.body}</p>
                  <p className="mt-1 text-muted-foreground">
                    {pin.author.name} · {pin.createdAt.toLocaleDateString("ru-RU")}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {(review.trainingAssignments?.length ?? 0) > 0 ? (
            <div className="flex flex-col gap-1.5 text-xs" aria-label="Учебные задачи по проверке">
              <p className="font-medium uppercase tracking-wide text-muted-foreground">Учебные задачи</p>
              {review.trainingAssignments.map((assignment) => (
                <p key={assignment.id} className="text-foreground">
                  <Link
                    href={
                      assignment.coachingPlan
                        ? coachingPlanFocusHref({ planId: assignment.coachingPlan.id })
                        : "/coaching"
                    }
                    className="underline-offset-4 hover:underline"
                  >
                    {assignment.title}
                  </Link>
                  {assignment.coachingPlan ? ` · план «${assignment.coachingPlan.title}»` : ""}
                  {assignment.dueAt ? ` · до ${assignment.dueAt.toLocaleDateString("ru-RU")}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex flex-wrap items-start gap-2">
          {mode === "action" ? (
            <>
              {canAcknowledge ? (
                <ToastActionForm action={updateReviewFeedbackState} className="inline-flex">
                  <input type="hidden" name="reviewId" value={review.id} />
                  <input type="hidden" name="action" value="acknowledged" />
                  <Button type="submit">Принять оценку</Button>
                </ToastActionForm>
              ) : null}
              {mode === "action" && appealPhase !== "none" ? (
                <p className="basis-full text-xs text-muted-foreground">
                  {agentAppealNextSteps({ phase: appealPhase, dueAt: review.appealDueAt })}
                </p>
              ) : null}
              <div className="min-w-[min(100%,16rem)] flex-1">
                <AgentAppealForm
                  reviewId={review.id}
                  allowed={canOpenAppeal}
                  disabledReason={appealDisabledReason}
                  phase={appealPhase}
                  dueAt={review.appealDueAt}
                  triggerLabel="Оспорить оценку"
                  formIdPrefix={`footer-${review.id}`}
                />
              </div>
              {canCompleteReanswer ? (
                <ToastActionForm action={updateReviewFeedbackState} className="inline-flex">
                  <input type="hidden" name="reviewId" value={review.id} />
                  <input type="hidden" name="action" value="reanswer_completed" />
                  <Button type="submit">Переответ выполнен</Button>
                </ToastActionForm>
              ) : null}
              {needsReviewLink ? (
                <Button render={<Link href={`/reviews/${conversation.id}`} />} nativeButton={false} variant="outline">
                  Открыть
                </Button>
              ) : null}
            </>
          ) : (
            <Button render={<Link href={`/reviews/${conversation.id}`} />} nativeButton={false} variant="outline">
              Открыть
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  };

  const periodDelta = recentAverage != null && earlierAverage != null ? Math.round(recentAverage - earlierAverage) : null;

  const pendingResponseCount = actionConversations.length;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdueTrainingCount = assignments.filter(
    (assignment) => assignment.dueAt != null && assignment.dueAt.getTime() < startOfToday.getTime()
  ).length;
  const triage = buildSelfReviewTriage({
    pendingInboxCount: pendingResponseCount,
    appealCount,
    openTrainingCount: assignments.length,
    overdueTrainingCount,
    inboxHref: nextConversation ? `/reviews/${nextConversation.id}` : null
  });
  const trainingEmpty = trainingAssignmentEmptyCopy(assignedTrainingCount > 0);

  const hasCriteriaPanel = strengthCriteria.length > 0 || focusCriteria.length > 0;

  const heroPanel = (
    <Card aria-label="Личный результат качества">
      <CardHeader>
        <CardDescription>Средний балл качества</CardDescription>
        <div className="flex flex-wrap items-end gap-2">
          <CardTitle className="text-3xl font-semibold tabular-nums tracking-tight">
            {myAverage != null ? clampQualityScore(myAverage) : "—"}
          </CardTitle>
          <span className="pb-0.5 text-sm text-muted-foreground">из 100</span>
          {periodDelta != null && periodDelta !== 0 ? (
            <Chip tone={periodDelta > 0 ? "success" : "neutral"}>
              {periodDelta > 0 ? "↑" : "↓"} {formatQualityScoreDelta(periodDelta)}
            </Chip>
          ) : periodDelta === 0 ? (
            <Chip tone="neutral">→ без изменений</Chip>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {myReviewScores.length > 0
            ? `${formatReviewCount(myReviewScores.length)} за период · личная динамика`
            : "Проверок пока нет"}
        </p>
        {myReviewScores.length >= 2 ? <ScoreSparkline points={myReviewScores} /> : null}
      </CardContent>
    </Card>
  );

  return (
    <PageShell
      eyebrow="Обратная связь"
      title="Моя обратная связь"
      description="Рабочее место оператора: разобрать замечания по цитатам, принять оценку или открыть апелляцию и закрыть учебные задачи."
    >
      <TriageStrip
        tone={triage.tone}
        icon={
          appealCount > 0 ? (
            <ShieldQuestion size={18} aria-hidden="true" />
          ) : assignments.length > 0 && !nextConversation ? (
            <BookOpenCheck size={18} aria-hidden="true" />
          ) : (
            <MessageSquareText size={18} aria-hidden="true" />
          )
        }
        title={triage.title}
        description={triage.description}
        action={
          triage.action ? (
            <Button render={<Link href={triage.action.href} />} nativeButton={false}>
              {triage.action.label}
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />

      {hasCriteriaPanel ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          {heroPanel}

          <Card aria-label="Сильные стороны и фокус внимания">
            <CardHeader>
              <CardTitle>По критериям</CardTitle>
              <CardDescription>Средний процент выполнения по критериям за последние проверки.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                {strengthCriteria.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-medium text-foreground">Сильные стороны</h3>
                    <ul className="flex flex-col gap-3">
                      {strengthCriteria.map((stat) => (
                        <li key={stat.label} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm text-foreground">{stat.label}</span>
                            <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                              {stat.averagePercent}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <div
                              className="h-full rounded-full bg-emerald-500/80 transition-all"
                              style={{ width: `${stat.averagePercent}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {focusCriteria.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-medium text-foreground">На что обратить внимание</h3>
                    <ul className="flex flex-col gap-3">
                      {focusCriteria.map((stat) => (
                        <li key={stat.label} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm text-foreground">{stat.label}</span>
                            <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                              {stat.averagePercent}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <div
                              className="h-full rounded-full bg-muted-foreground/35 transition-all"
                              style={{ width: `${stat.averagePercent}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        heroPanel
      )}

      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.9fr)]" aria-label="Операторская обратная связь">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Требуют ответа</CardTitle>
            <CardDescription>Оценки, где нужно подтвердить, оспорить или проверить переответ.</CardDescription>
            <CardAction>
              <Chip tone={actionConversations.length > 0 ? "accent" : "neutral"}>{actionConversations.length}</Chip>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4">
            {actionConversations.length > 0 ? (
              actionConversations.map((conversation) => renderFeedbackCard(conversation))
            ) : (
              <EmptyState
                icon={<MessageSquareText size={24} aria-hidden="true" />}
                title="Ответов не требуется"
                description="Новые финальные проверки и апелляции появятся здесь первыми."
              />
            )}
          </CardContent>

          <Separator />

          <CardHeader className="border-b">
            <CardTitle>История</CardTitle>
            <CardDescription>Закрытые и подтвержденные проверки без срочного действия.</CardDescription>
            <CardAction>
              <Chip tone="neutral">{historyConversations.length}</Chip>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4">
            {historyConversations.length > 0 ? (
              historyConversations.map((conversation) => renderFeedbackCard(conversation, "history"))
            ) : (
              <EmptyState
                size="inline"
                icon={<MessageSquareText size={20} aria-hidden="true" />}
                title="История пока пустая"
                description="После подтверждения проверки останутся здесь для контекста."
              />
            )}
          </CardContent>
        </Card>

        <Card aria-label="Учебные задачи">
          <CardHeader className="border-b">
            <CardTitle>Учебные задачи</CardTitle>
            <CardDescription>Короткий список того, что нужно закрыть после разбора.</CardDescription>
            <CardAction>
              <Chip tone="neutral">{assignments.length}</Chip>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4">
            {assignments.length > 0 ? (
              assignments.map((assignment) => (
                <Card key={assignment.id} size="sm" className="gap-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{assignment.title}</CardTitle>
                    <CardDescription>{assignment.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <span className="text-xs text-muted-foreground">
                      {assignment.dueAt ? `до ${assignment.dueAt.toLocaleDateString("ru-RU")}` : "без срока"}
                      {assignment.review?.conversation ? ` · ${assignment.review.conversation.externalId}` : ""}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        render={
                          <Link
                            href={
                              assignment.review?.conversation
                                ? `/reviews/${assignment.review.conversation.id}`
                                : "/coaching"
                            }
                          />
                        }
                        nativeButton={false}
                        variant="outline"
                        size="sm"
                      >
                        К замечанию
                      </Button>
                    <ToastActionForm action={updateTrainingAssignmentStatusState}>
                      <input type="hidden" name="id" value={assignment.id} />
                      <input type="hidden" name="status" value="done" />
                      <Button type="submit" variant="outline" size="sm">
                        Закрыть задачу
                      </Button>
                    </ToastActionForm>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <EmptyState
                size="inline"
                icon={<BookOpenCheck size={20} aria-hidden="true" />}
                title={trainingEmpty.title}
                description={trainingEmpty.description}
              />
            )}
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
