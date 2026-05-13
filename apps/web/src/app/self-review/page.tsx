import Link from "next/link";
import { MessageSquareText, ShieldQuestion } from "lucide-react";
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

      <section className="feedback-layout" aria-label="Операторская обратная связь">
        <div className="feedback-main panel">
          <div className="learning-section-header">
            <div className="min-w-0">
              <h2>Проверки к ознакомлению</h2>
              <p>Последние финальные оценки по обращениям оператора.</p>
            </div>
            <span className="pill pill--neutral">{conversations.length}</span>
          </div>

          <div className="feedback-card-list">
            {conversations.length > 0 ? (
              conversations.map((conversation) => {
                const review = conversation.reviews[0];
                const finding = review?.findings[0];

                if (!review) {
                  return null;
                }

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
                    <div className="feedback-card__actions">
                      <form action={updateReviewFeedback}>
                        <input type="hidden" name="reviewId" value={review.id} />
                        <input type="hidden" name="action" value="acknowledged" />
                        <button type="submit" className="action-button action-button--primary">
                          Ознакомлен
                        </button>
                      </form>
                      <form action={updateReviewFeedback}>
                        <input type="hidden" name="reviewId" value={review.id} />
                        <input type="hidden" name="action" value="appeal_opened" />
                        <button type="submit" className="action-button">
                          Апелляция
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-state">
                <h3>Нет проверок</h3>
                <p>Когда проверяющий отправит обратную связь, она появится здесь.</p>
              </div>
            )}
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
