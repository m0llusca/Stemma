import Link from "next/link";
import { MessageSquareText, ShieldQuestion } from "lucide-react";
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
import { formatQualityScore } from "@/lib/score-display";

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

export default async function SelfReviewPage() {
  const user = await requireCurrentUserPermission("feedback:acknowledge");
  const scopedToAgent = user.role === "SUPPORT_AGENT";
  const [conversations, assignments] = await Promise.all([
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
            reviewer: true
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
    })
  ]);
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
