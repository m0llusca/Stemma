import Link from "next/link";
import { ArrowRight, BookOpenCheck, MessageSquareText, ShieldQuestion } from "lucide-react";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { ScoreSparkline } from "@/components/ui/score-sparkline";
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
        assigneeName: scopedToAgent ? user.name : undefined,
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
      <article key={conversation.id} className="feedback-card">
        <div className="feedback-card__main">
          <div className="feedback-card__head">
            <Link href={`/reviews/${conversation.id}`} className="record-title feedback-card__title">
              {conversation.subject}
            </Link>
            <span className="feedback-card__score">{clampQualityScore(review.totalScore)}</span>
          </div>
          <div className="feedback-card__status-row">
            <Chip tone={feedbackTone(review.feedbackStatus)} size="xs">
              {feedbackStatusLabels[review.feedbackStatus] ?? review.feedbackStatus}
            </Chip>
            {review.appealStatus !== "none" ? (
              <Chip tone={review.appealStatus === "open" ? "warning" : "neutral"} size="xs">
                {appealStatusLabels[review.appealStatus] ?? review.appealStatus}
              </Chip>
            ) : null}
          </div>
          <p>{review.summary}</p>
          <p className="feedback-card__next-step">{nextStep}</p>
          <div className="feedback-card__meta">
            <span>{externalSourceLabel(conversation.externalSource)} · {conversation.externalId}</span>
            <span>{review.reviewer.name}</span>
            <span>{(review.finalizedAt ?? review.createdAt).toLocaleDateString("ru-RU")}</span>
          </div>
          {visibleFindings.length > 0 ? (
            <div className="feedback-card__findings" aria-label="Основания оценки">
              {visibleFindings.map((finding) => (
                <Chip key={`${finding.category}:${finding.riskLevel}`} tone={findingTone(finding.riskLevel)} size="xs">
                  {finding.category} · {riskLevelLabels[finding.riskLevel]}
                </Chip>
              ))}
              {hiddenFindingCount > 0 ? <Chip tone="neutral" size="xs" numeric>+{hiddenFindingCount}</Chip> : null}
            </div>
          ) : null}
        </div>
        {mode === "action" ? (
          <div className="feedback-card__decision">
            {canAcknowledge ? (
              <ToastActionForm action={updateReviewFeedbackState} className="feedback-card__decision-acknowledge">
                <input type="hidden" name="reviewId" value={review.id} />
                <input type="hidden" name="action" value="acknowledged" />
                <button type="submit" className="action-button action-button--primary">
                  Принять оценку
                </button>
              </ToastActionForm>
            ) : null}
            {canOpenAppeal ? (
              <details className="feedback-dispute">
                <summary className="feedback-dispute__summary">Оспорить</summary>
                <ToastActionForm action={updateReviewFeedbackState} className="feedback-dispute__form">
                  <input type="hidden" name="reviewId" value={review.id} />
                  <input type="hidden" name="action" value="appeal_opened" />
                  <label className="feedback-dispute__label">
                    Обоснование
                    <textarea
                      name="comment"
                      rows={2}
                      required
                      placeholder="С каким пунктом не согласны и почему."
                      className="form-control"
                    />
                  </label>
                  <button type="submit" className="action-button">
                    Открыть апелляцию
                  </button>
                </ToastActionForm>
              </details>
            ) : null}
            {canCompleteReanswer ? (
              <ToastActionForm action={updateReviewFeedbackState}>
                <input type="hidden" name="reviewId" value={review.id} />
                <input type="hidden" name="action" value="reanswer_completed" />
                <button type="submit" className="action-button action-button--primary">
                  Переответ выполнен
                </button>
              </ToastActionForm>
            ) : null}
            {needsReviewLink ? (
              <Link href={`/reviews/${conversation.id}`} className="action-button">
                Открыть
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="feedback-card__decision">
            <Link href={`/reviews/${conversation.id}`} className="action-button">
              Открыть
            </Link>
          </div>
        )}
      </article>
    );
  };

  const periodDelta = recentAverage != null && earlierAverage != null ? Math.round(recentAverage - earlierAverage) : null;
  const benchmarkDelta = myAverage != null && teamAverage != null ? Math.round(myAverage - teamAverage) : null;

  const pendingResponseCount = actionConversations.length;
  const triageTone: TriageStripTone = nextConversation ? (appealCount > 0 ? "warning" : "accent") : "success";
  const triageTitle = nextConversation
    ? `${pendingResponseCount} ${pendingResponseCount === 1 ? "проверка ждёт" : "проверок ждут"} вашего ответа`
    : "Срочных ответов нет";
  const triageDescription = nextConversation
    ? appealCount > 0
      ? `Среди них ${appealCount} с открытой апелляцией. Подтвердите оценку или оспорьте спорные пункты.`
      : "Подтвердите оценку, если замечания понятны; спорные пункты можно оспорить."
    : assignments.length > 0
      ? `Осталось закрыть ${assignments.length} учебных задач после разбора.`
      : "Новые финальные проверки и апелляции появятся здесь первыми.";

  const hasCriteriaPanel = strengthCriteria.length > 0 || focusCriteria.length > 0;

  const heroPanel = (
    <section className="self-review-hero panel" aria-label="Личный результат качества">
      <div className="self-review-hero__score">
        <span className="self-review-hero__eyebrow">Средний балл качества</span>
        <div className="self-review-hero__value-row">
          <span className="self-review-hero__number">{myAverage != null ? clampQualityScore(myAverage) : "—"}</span>
          <span className="self-review-hero__unit">из 100</span>
          {periodDelta != null && periodDelta !== 0 ? (
            <Chip tone={periodDelta > 0 ? "success" : "warning"} size="sm" numeric>
              {periodDelta > 0 ? "↑" : "↓"} {formatQualityScoreDelta(periodDelta)}
            </Chip>
          ) : periodDelta === 0 ? (
            <Chip tone="neutral" size="sm" numeric>→ без изменений</Chip>
          ) : null}
        </div>
        <p className="self-review-hero__context">
          {myReviewScores.length > 0 ? `${myReviewScores.length} проверок за период` : "Проверок пока нет"}
          {benchmarkDelta != null
            ? benchmarkDelta === 0
              ? " · на уровне команды"
              : benchmarkDelta > 0
                ? ` · выше команды на ${Math.abs(benchmarkDelta)}`
                : ` · ниже команды на ${Math.abs(benchmarkDelta)}`
            : ""}
        </p>
        {myReviewScores.length >= 2 ? <ScoreSparkline points={myReviewScores} /> : null}
      </div>
    </section>
  );

  return (
    <PageShell
      className="self-review-shell"
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
            <Link href={`/reviews/${nextConversation.id}`} className="action-button action-button--primary">
              Ответить сейчас
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      {hasCriteriaPanel ? (
        <div className="grid gap-[16px] items-start lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        {heroPanel}

        <section className="self-review-criteria panel" aria-label="Сильные стороны и зоны роста">
          <div className="learning-section-header">
            <div className="min-w-0">
              <h2>По критериям</h2>
              <p>Средний процент выполнения по критериям за последние проверки.</p>
            </div>
          </div>
          <div className="criterion-insights">
            {strengthCriteria.length > 0 ? (
              <div className="criterion-insights__column">
                <h3 className="criterion-insights__title">Сильные стороны</h3>
                <ul className="criterion-insights__list">
                  {strengthCriteria.map((stat) => (
                    <li key={stat.label} className="criterion-insight">
                      <span className="criterion-insight__label">{stat.label}</span>
                      <span className="criterion-insight__bar" aria-hidden="true">
                        <span className="criterion-insight__fill" style={{ width: `${stat.averagePercent}%` }} />
                      </span>
                      <span className="criterion-insight__value">{stat.averagePercent}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {focusCriteria.length > 0 ? (
              <div className="criterion-insights__column">
                <h3 className="criterion-insights__title">Зоны роста</h3>
                <ul className="criterion-insights__list">
                  {focusCriteria.map((stat) => (
                    <li key={stat.label} className="criterion-insight criterion-insight--focus">
                      <span className="criterion-insight__label">{stat.label}</span>
                      <span className="criterion-insight__bar" aria-hidden="true">
                        <span className="criterion-insight__fill" style={{ width: `${stat.averagePercent}%` }} />
                      </span>
                      <span className="criterion-insight__value">{stat.averagePercent}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
        </div>
      ) : (
        heroPanel
      )}

      <section className="feedback-layout" aria-label="Операторская обратная связь">
        <div className="feedback-main panel">
          <div className="learning-section-header">
            <div className="min-w-0">
              <h2>Требуют ответа</h2>
              <p>Оценки, где нужно подтвердить, оспорить или проверить переответ.</p>
            </div>
            <Chip tone={actionConversations.length > 0 ? "accent" : "neutral"} numeric>{actionConversations.length}</Chip>
          </div>

          <div className="feedback-card-list">
            {actionConversations.length > 0 ? (
              actionConversations.map((conversation) => renderFeedbackCard(conversation))
            ) : (
              <EmptyState
                icon={<MessageSquareText size={24} aria-hidden="true" />}
                title="Ответов не требуется"
                description="Новые финальные проверки и апелляции появятся здесь первыми."
              />
            )}
          </div>

          <div className="feedback-history-section">
            <div className="learning-section-header">
              <div className="min-w-0">
                <h2>История</h2>
                <p>Закрытые и подтвержденные проверки без срочного действия.</p>
              </div>
              <Chip tone="neutral" numeric>{historyConversations.length}</Chip>
            </div>
            <div className="feedback-card-list feedback-card-list--history">
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
            </div>
          </div>
        </div>

        <aside className="feedback-side panel">
          <div className="learning-section-header">
            <div className="min-w-0">
              <h2>Учебные задачи</h2>
              <p>Короткий список того, что нужно закрыть после разбора.</p>
            </div>
            <Chip tone="neutral" numeric>{assignments.length}</Chip>
          </div>
          <div className="feedback-task-list">
            {assignments.length > 0 ? (
              assignments.map((assignment) => (
                <article key={assignment.id} className="feedback-task">
                  <h3>{assignment.title}</h3>
                  <p>{assignment.description}</p>
                  <span className="record-meta">
                    {assignment.dueAt ? `до ${assignment.dueAt.toLocaleDateString("ru-RU")}` : "без срока"}
                    {assignment.review?.conversation ? ` · ${assignment.review.conversation.externalId}` : ""}
                  </span>
                  <ToastActionForm action={updateTrainingAssignmentStatusState}>
                    <input type="hidden" name="id" value={assignment.id} />
                    <input type="hidden" name="status" value="done" />
                    <button type="submit" className="action-button">
                      Закрыть задачу
                    </button>
                  </ToastActionForm>
                </article>
              ))
            ) : (
              <EmptyState
                size="inline"
                icon={<BookOpenCheck size={20} aria-hidden="true" />}
                title="Задач нет"
                description="Все разборы закрыты."
              />
            )}
          </div>
        </aside>
      </section>
    </PageShell>
  );
}
