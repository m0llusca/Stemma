import Link from "next/link";
import { ArrowRight, BookOpenCheck, MessageSquareText, ShieldQuestion } from "lucide-react";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/ui/page-shell";
import { ScoreSparkline } from "@/components/ui/score-sparkline";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TriageStrip, type TriageStripTone } from "@/components/ui/triage-strip";
import { ToastActionForm } from "@/app/coaching/toast-action-form";
import { updateReviewFeedbackState, updateTrainingAssignmentStatusState } from "@/lib/feedback-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  appealStatusLabels,
  feedbackStatusLabels,
  externalSourceLabel,
  riskLevelLabels
} from "@/lib/labels";
import { criterionEarnedPercent } from "@/lib/reports/report-aggregation";
import { formatReviewCount, russianPlural } from "@/lib/reports/report-format";
import { clampQualityScore, formatQualityScoreDelta } from "@/lib/score-display";

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
  const user = await requireCurrentUserPermission("feedback:acknowledge");
  const scopedToAgent = user.role === "SUPPORT_AGENT";
  const [conversations, assignments, teamScoreAggregate] = await Promise.all([
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
        reviews: {
          where: { reviewSource: "HUMAN", status: "FINALIZED" },
          include: {
            findings: true,
            reviewer: true,
            scores: { include: { criterion: true } }
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
    prisma.review.aggregate({
      where: { workspaceId: user.workspaceId, status: "FINALIZED", reviewSource: "HUMAN" },
      _avg: { totalScore: true }
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
  const teamAverage = teamScoreAggregate._avg.totalScore;
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
    const visibleFindings = findings.slice(0, 3);
    const hiddenFindingCount = Math.max(0, findings.length - visibleFindings.length);

    if (!review) {
      return null;
    }

    const feedbackClosed = review.feedbackStatus === "acknowledged" || review.feedbackStatus === "corrected";
    const hasOpenAppeal = review.appealStatus === "open";
    const canAcknowledge = !feedbackClosed && !hasOpenAppeal;
    const canOpenAppeal = !feedbackClosed && review.appealStatus === "none";
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
          ? "Примите проверку, если замечания понятны; спорные пункты можно оспорить."
          : "Откройте детали, чтобы посмотреть основание оценки.";

    const findingTone = (riskLevel: string): ChipTone =>
      riskLevel === "CRITICAL" || riskLevel === "HIGH" ? "warning" : "neutral";

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
          <p className="text-sm font-medium text-muted-foreground">{nextStep}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {externalSourceLabel(conversation.externalSource)} · {conversation.externalId}
            </span>
            <span>{review.reviewer.name}</span>
            <span>{(review.finalizedAt ?? review.createdAt).toLocaleDateString("ru-RU")}</span>
          </div>
          {visibleFindings.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Основания оценки">
              {visibleFindings.map((finding) => (
                <Chip key={`${finding.category}:${finding.riskLevel}`} tone={findingTone(finding.riskLevel)}>
                  {finding.category} · {riskLevelLabels[finding.riskLevel]}
                </Chip>
              ))}
              {hiddenFindingCount > 0 ? <Chip tone="neutral">+{hiddenFindingCount}</Chip> : null}
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
              {canOpenAppeal ? (
                <Collapsible className="min-w-[min(100%,16rem)] flex-1 rounded-lg border border-border bg-background data-open:bg-muted/30">
                  <CollapsibleTrigger className="w-full cursor-pointer px-3 py-2 text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Оспорить
                  </CollapsibleTrigger>
                  <CollapsibleContent keepMounted>
                    <ToastActionForm action={updateReviewFeedbackState} className="flex flex-col gap-2 border-t border-border p-3">
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input type="hidden" name="action" value="appeal_opened" />
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`appeal-comment-${review.id}`}>Обоснование</Label>
                        <Textarea
                          id={`appeal-comment-${review.id}`}
                          name="comment"
                          rows={2}
                          required
                          placeholder="С каким пунктом не согласны и почему."
                        />
                      </div>
                      <Button type="submit" variant="outline" size="sm">
                        Открыть апелляцию
                      </Button>
                    </ToastActionForm>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
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
  const benchmarkDelta = myAverage != null && teamAverage != null ? Math.round(myAverage - teamAverage) : null;

  const pendingResponseCount = actionConversations.length;
  const triageTone: TriageStripTone = nextConversation ? (appealCount > 0 ? "warning" : "accent") : "success";
  const triageTitle = nextConversation
    ? `${russianPlural(pendingResponseCount, ["проверка ждёт", "проверки ждут", "проверок ждут"])} вашего ответа`
    : "Срочных ответов нет";
  const triageDescription = nextConversation
    ? appealCount > 0
      ? `Среди них ${appealCount} с открытой апелляцией. Подтвердите оценку или оспорьте спорные пункты.`
      : "Подтвердите оценку, если замечания понятны; спорные пункты можно оспорить."
    : assignments.length > 0
      ? `Осталось закрыть ${russianPlural(assignments.length, ["учебную задачу", "учебные задачи", "учебных задач"])} после разбора.`
      : "Новые финальные проверки и апелляции появятся здесь первыми.";

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
            <Chip tone={periodDelta > 0 ? "success" : "warning"}>
              {periodDelta > 0 ? "↑" : "↓"} {formatQualityScoreDelta(periodDelta)}
            </Chip>
          ) : periodDelta === 0 ? (
            <Chip tone="neutral">→ без изменений</Chip>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {myReviewScores.length > 0 ? `${formatReviewCount(myReviewScores.length)} за период` : "Проверок пока нет"}
          {benchmarkDelta != null
            ? benchmarkDelta === 0
              ? " · на уровне команды"
              : benchmarkDelta > 0
                ? ` · выше команды на ${Math.abs(benchmarkDelta)}`
                : ` · ниже команды на ${Math.abs(benchmarkDelta)}`
            : ""}
        </p>
        {myReviewScores.length >= 2 ? <ScoreSparkline points={myReviewScores} /> : null}
      </CardContent>
    </Card>
  );

  return (
    <PageShell
      eyebrow="Обратная связь"
      title="Моя обратная связь"
      description="Это не отдельная самооценка, а рабочее место оператора: принять проверку, открыть апелляцию и закрыть учебные задачи."
    >
      <TriageStrip
        tone={triageTone}
        icon={appealCount > 0 ? <ShieldQuestion size={18} aria-hidden="true" /> : <MessageSquareText size={18} aria-hidden="true" />}
        title={triageTitle}
        description={triageDescription}
        action={
          nextConversation ? (
            <Button render={<Link href={`/reviews/${nextConversation.id}`} />} nativeButton={false}>
              Ответить сейчас
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />

      {hasCriteriaPanel ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          {heroPanel}

          <Card aria-label="Сильные стороны и зоны роста">
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
                    <h3 className="text-sm font-medium text-foreground">Зоны роста</h3>
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
                              className="h-full rounded-full bg-amber-500/80 transition-all"
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
                    <ToastActionForm action={updateTrainingAssignmentStatusState}>
                      <input type="hidden" name="id" value={assignment.id} />
                      <input type="hidden" name="status" value="done" />
                      <Button type="submit" variant="outline" size="sm">
                        Закрыть задачу
                      </Button>
                    </ToastActionForm>
                  </CardContent>
                </Card>
              ))
            ) : (
              <EmptyState
                size="inline"
                icon={<BookOpenCheck size={20} aria-hidden="true" />}
                title="Задач нет"
                description="Все разборы закрыты."
              />
            )}
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
