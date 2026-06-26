import Link from "next/link";
import { MessageSquareText, ShieldQuestion } from "lucide-react";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { ScoreSparkline } from "@/components/ui/score-sparkline";
import { StickyMetricsBar } from "@/components/ui/sticky-metrics-bar";
import { updateReviewFeedback, updateTrainingAssignmentStatus } from "@/lib/feedback-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  appealStatusLabels,
  feedbackStatusLabels,
  externalSourceLabel,
  riskLevelLabels
} from "@/lib/labels";
import { criterionEarnedPercent } from "@/lib/reports/report-aggregation";
import { formatQualityScore, formatQualityScoreDelta } from "@/lib/score-display";

export const dynamic = "force-dynamic";

function feedbackTone(status: string) {
  if (status === "acknowledged" || status === "corrected") {
    return "pill--ok";
  }

  if (status === "appeal") {
    return "pill--warn";
  }

  return "pill--neutral";
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
  const waitingFeedback = conversations.filter((conversation) => {
    const review = conversation.reviews[0];
    return review && review.feedbackStatus !== "acknowledged" && review.feedbackStatus !== "corrected";
  }).length;
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
  const nextReview = nextConversation?.reviews[0];
  const renderFeedbackCard = (conversation: (typeof conversations)[number], mode: "action" | "history" = "action") => {
    const review = conversation.reviews[0];
    const finding = review?.findings[0];

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

    return (
      <article key={conversation.id} className="feedback-card">
        <div className="feedback-card__main">
          <div className="feedback-card__head">
            <Link href={`/reviews/${conversation.id}`} className="record-title text-[#1d3fae] hover:underline">
              {conversation.subject}
            </Link>
            <span className="pill pill--neutral">{formatQualityScore(review.totalScore)}</span>
          </div>
          <p>{review.summary}</p>
          <div className="feedback-card__meta">
            <span>{externalSourceLabel(conversation.externalSource)} · {conversation.externalId}</span>
            <span>{review.reviewer.name}</span>
            <span>{(review.finalizedAt ?? review.createdAt).toLocaleDateString("ru-RU")}</span>
          </div>
          <div className="feedback-card__meta">
            <span className={`pill ${feedbackTone(review.feedbackStatus)}`}>
              {feedbackStatusLabels[review.feedbackStatus] ?? review.feedbackStatus}
            </span>
            <span className="pill pill--neutral">
              {appealStatusLabels[review.appealStatus] ?? review.appealStatus}
            </span>
            {finding ? (
              <span className="pill pill--neutral">
                {finding.category} · {riskLevelLabels[finding.riskLevel]}
              </span>
            ) : null}
          </div>
        </div>
        {mode === "action" ? (
          <div className="feedback-card__actions">
            {canAcknowledge ? (
              <form action={updateReviewFeedback}>
                <input type="hidden" name="reviewId" value={review.id} />
                <input type="hidden" name="action" value="acknowledged" />
                <button type="submit" className="action-button action-button--primary">
                  Ознакомлен
                </button>
              </form>
            ) : null}
            {canOpenAppeal ? (
              <form action={updateReviewFeedback}>
                <input type="hidden" name="reviewId" value={review.id} />
                <input type="hidden" name="action" value="appeal_opened" />
                <button type="submit" className="action-button">
                  Апелляция
                </button>
              </form>
            ) : null}
            {canCompleteReanswer ? (
              <form action={updateReviewFeedback}>
                <input type="hidden" name="reviewId" value={review.id} />
                <input type="hidden" name="action" value="reanswer_completed" />
                <button type="submit" className="action-button action-button--primary">
                  Переответ выполнен
                </button>
              </form>
            ) : null}
            {needsReviewLink ? (
              <Link href={`/reviews/${conversation.id}`} className="action-button">
                Открыть
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="feedback-card__actions">
            <Link href={`/reviews/${conversation.id}`} className="action-button">
              Открыть
            </Link>
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center command-center--split command-center--metrics">
        <div className="min-w-0">
          <p className="page-kicker">Обратная связь</p>
          <h1 className="page-title">Моя обратная связь</h1>
          <p className="page-subtitle">
            Это не отдельная самооценка, а рабочее место оператора: принять проверку, открыть апелляцию и закрыть учебные задачи.
          </p>
        </div>
        <div className="learning-metrics" aria-label="Сводка обратной связи">
          <div className="learning-metric">
            <MessageSquareText size={16} aria-hidden="true" />
            <span>{waitingFeedback}</span>
            <small>ожидают ответа</small>
          </div>
          <div className="learning-metric">
            <ShieldQuestion size={16} aria-hidden="true" />
            <span>{appealCount}</span>
            <small>апелляции</small>
          </div>
        </div>
      </div>

      <StickyMetricsBar
        ariaLabel="Сводка обратной связи"
        items={[
          { icon: <MessageSquareText size={14} aria-hidden="true" />, value: waitingFeedback, label: "ожидают ответа" },
          { icon: <ShieldQuestion size={14} aria-hidden="true" />, value: appealCount, label: "апелляции" }
        ]}
      />

      {myAverage != null ? (
        <section className="panel personal-score" aria-label="Личный результат качества">
          <div className="personal-score__head">
            <div className="personal-score__value">
              <span className="personal-score__number">{formatQualityScore(myAverage)}</span>
              <span className="personal-score__caption">средний балл · {myReviewScores.length} проверок</span>
            </div>
            {recentAverage != null && earlierAverage != null ? (
              <span
                className={`personal-score__delta ${recentAverage - earlierAverage >= 0 ? "personal-score__delta--up" : "personal-score__delta--down"}`}
              >
                {recentAverage - earlierAverage >= 0 ? "▲" : "▼"} {formatQualityScoreDelta(recentAverage - earlierAverage)} к началу периода
              </span>
            ) : null}
          </div>
          <ScoreSparkline points={myReviewScores} />
          {focusCriteria.length > 0 ? (
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
            </div>
          ) : null}
          {teamAverage != null ? (
            <p className="personal-score__benchmark">
              {Math.round(myAverage - teamAverage) === 0
                ? "На уровне среднего по команде."
                : myAverage - teamAverage > 0
                  ? `Выше среднего по команде на ${formatQualityScore(Math.abs(myAverage - teamAverage))}.`
                  : `Ниже среднего по команде на ${formatQualityScore(Math.abs(myAverage - teamAverage))}.`}{" "}
              Средний балл команды — {formatQualityScore(teamAverage)}.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="workflow-focus-strip" aria-label="Фокус обратной связи">
        <div className="workflow-focus-strip__lead">
          <span className="page-kicker">Сейчас оператору</span>
          <strong>{nextConversation ? nextConversation.subject : "Нет срочных ответов"}</strong>
          <small>
            {nextReview
              ? `${formatQualityScore(nextReview.totalScore)} · ${feedbackStatusLabels[nextReview.feedbackStatus] ?? nextReview.feedbackStatus}`
              : "История проверок остается ниже для контекста."}
          </small>
        </div>
        <div className="workflow-focus-strip__items">
          {nextConversation ? (
            <Link href={`/reviews/${nextConversation.id}`} className="workflow-focus-card">
              <span>Ответить сейчас</span>
              <strong>{formatQualityScore(nextReview?.totalScore ?? null)}</strong>
              <small>{nextReview ? feedbackStatusLabels[nextReview.feedbackStatus] ?? nextReview.feedbackStatus : "Открыть проверку"}</small>
            </Link>
          ) : (
            <div className="workflow-focus-card workflow-focus-card--static">
              <span>Состояние</span>
              <strong>{assignments.length}</strong>
              <small>Учебных задач осталось закрыть</small>
            </div>
          )}
        </div>
      </section>

      <section className="feedback-layout" aria-label="Операторская обратная связь">
        <div className="feedback-main panel">
          <div className="learning-section-header">
            <div className="min-w-0">
              <h2>Требуют ответа</h2>
              <p>Оценки, где нужно подтвердить, оспорить или проверить переответ.</p>
            </div>
            <span className="pill pill--neutral">{actionConversations.length}</span>
          </div>

          <div className="feedback-card-list">
            {actionConversations.length > 0 ? (
              actionConversations.map((conversation) => renderFeedbackCard(conversation))
            ) : (
              <div className="empty-state">
                <h3>Ответов не требуется</h3>
                <p>Новые финальные проверки и апелляции появятся здесь первыми.</p>
              </div>
            )}
          </div>

          <div className="feedback-history-section">
            <div className="learning-section-header">
              <div className="min-w-0">
                <h2>История</h2>
                <p>Закрытые и подтвержденные проверки без срочного действия.</p>
              </div>
              <span className="pill pill--neutral">{historyConversations.length}</span>
            </div>
            <div className="feedback-card-list feedback-card-list--history">
              {historyConversations.length > 0 ? (
                historyConversations.map((conversation) => renderFeedbackCard(conversation, "history"))
              ) : (
                <div className="empty-state empty-state--compact">
                  <h3>История пока пустая</h3>
                  <p>После подтверждения проверки останутся здесь для контекста.</p>
                </div>
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
            <span className="pill pill--neutral">{assignments.length}</span>
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
                  <form action={updateTrainingAssignmentStatus}>
                    <input type="hidden" name="id" value={assignment.id} />
                    <input type="hidden" name="status" value="done" />
                    <button type="submit" className="action-button">
                      Закрыть задачу
                    </button>
                  </form>
                </article>
              ))
            ) : (
              <div className="empty-state empty-state--compact">
                <h3>Задач нет</h3>
                <p>Все разборы закрыты.</p>
              </div>
            )}
          </div>
        </aside>
      </section>
    </section>
  );
}
