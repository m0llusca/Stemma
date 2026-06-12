import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardCheck, Gauge, PlusCircle, TriangleAlert, UsersRound, X } from "lucide-react";
import { StickyMetricsBar } from "@/components/ui/sticky-metrics-bar";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createCalibrationSession, updateCalibrationSessionStatus } from "@/lib/calibration-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatQualityScore } from "@/lib/score-display";

export const dynamic = "force-dynamic";

type CalibrationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Черновик",
    active: "Активна",
    completed: "Завершена",
    archived: "В архиве"
  };

  return labels[status] ?? status;
}

function statusClassName(status: string) {
  if (status === "completed") {
    return "pill--ok";
  }

  if (status === "active") {
    return "pill--warn";
  }

  return "pill--neutral";
}

function scoreSpread(scores: number[]) {
  if (scores.length < 2) {
    return null;
  }

  return Math.max(...scores) - Math.min(...scores);
}

function calibrationHref(params: { sessionId?: string; newSession?: boolean }) {
  const searchParams = new URLSearchParams();

  if (params.sessionId) {
    searchParams.set("session", params.sessionId);
  }

  if (params.newSession) {
    searchParams.set("new", "1");
  }

  const query = searchParams.toString();
  return query ? `/calibration?${query}` : "/calibration";
}

export default async function CalibrationPage({ searchParams }: CalibrationPageProps) {
  const [user, rawSearchParams] = await Promise.all([requireCurrentUserPermission("calibration:manage"), searchParams]);
  const selectedSessionId = firstParam(rawSearchParams.session);
  const openNewSession = firstParam(rawSearchParams.new) === "1";
  const [sessions, qaUsers, conversations] = await Promise.all([
    prisma.calibrationSession.findMany({
      where: { workspaceId: user.workspaceId },
      include: {
        owner: true,
        scorecard: true,
        participants: { include: { user: true }, orderBy: { createdAt: "asc" } },
        items: {
          include: {
            conversation: {
              include: {
                reviews: { include: { reviewer: true } },
                _count: { select: { coachingPins: true } }
              }
            }
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 12
    }),
    prisma.user.findMany({
      where: { workspaceId: user.workspaceId, role: { in: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] } },
      orderBy: { name: "asc" }
    }),
    prisma.conversation.findMany({
      where: {
        workspaceId: user.workspaceId,
        qaStatus: "FINALIZED",
        reviews: { some: { status: "FINALIZED", reviewSource: "HUMAN" } }
      },
      orderBy: { updatedAt: "desc" },
      take: 8
    })
  ]);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const selectedItemCount = selectedSession?.items.length ?? 0;
  const selectedParticipantCount = selectedSession?.participants.length ?? 0;
  const selectedCalibrationReviews =
    selectedSession?.items.flatMap((item) =>
      item.conversation.reviews.filter(
        (review) =>
          review.reviewSource === "CALIBRATION" &&
          review.status === "FINALIZED" &&
          selectedSession.participants.some((participant) => participant.userId === review.reviewerId)
      )
    ) ?? [];
  const selectedCompletedCount = new Set(selectedCalibrationReviews.map((review) => `${review.conversationId}:${review.reviewerId}`)).size;
  const selectedExpectedCount = selectedItemCount * selectedParticipantCount;
  const selectedProgress = selectedExpectedCount > 0 ? Math.round((selectedCompletedCount / selectedExpectedCount) * 100) : 0;
  const activeSessionCount = sessions.filter((session) => session.status === "active" || session.status === "draft").length;
  const selectedItemStates =
    selectedSession?.items.map((item) => {
      const baselineReview =
        item.conversation.reviews.find((review) => review.id === item.baselineReviewId) ??
        item.conversation.reviews.find((review) => review.reviewSource === "HUMAN" && review.status === "FINALIZED");
      const reviews = item.conversation.reviews.filter(
        (review) =>
          review.reviewSource === "CALIBRATION" &&
          review.status === "FINALIZED" &&
          selectedSession.participants.some((participant) => participant.userId === review.reviewerId)
      );
      const scores = reviews.map((review) => Math.round(review.totalScore));
      const spread = scoreSpread(scores);
      const missingParticipants = selectedSession.participants.filter(
        (participant) => !reviews.some((review) => review.reviewerId === participant.userId)
      );

      return {
        item,
        baselineReview,
        reviews,
        spread,
        missingParticipants
      };
    }) ?? [];
  const selectedDisagreementCount = selectedItemStates.filter((state) => state.spread != null && state.spread > 10).length;
  const sessionSummaries = sessions.map((session) => {
    const participantIds = new Set(session.participants.map((participant) => participant.userId));
    const calibrationReviews = session.items.flatMap((item) =>
      item.conversation.reviews.filter(
        (review) => review.reviewSource === "CALIBRATION" && review.status === "FINALIZED" && participantIds.has(review.reviewerId)
      )
    );
    const completedCount = new Set(calibrationReviews.map((review) => `${review.conversationId}:${review.reviewerId}`)).size;
    const expectedCount = session.items.length * session.participants.length;
    const disagreementCount = session.items.filter((item) => {
      const scores = item.conversation.reviews
        .filter((review) => review.reviewSource === "CALIBRATION" && review.status === "FINALIZED" && participantIds.has(review.reviewerId))
        .map((review) => Math.round(review.totalScore));
      const spread = scoreSpread(scores);

      return spread != null && spread > 10;
    }).length;

    return {
      session,
      completedCount,
      disagreementCount,
      expectedCount,
      itemCount: session.items.length,
      participantCount: session.participants.length,
      progress: expectedCount > 0 ? Math.round((completedCount / expectedCount) * 100) : 0,
      waitingCount: Math.max(expectedCount - completedCount, 0)
    };
  });
  const newSessionHref = calibrationHref({ sessionId: selectedSession?.id, newSession: true });
  const closeNewSessionHref = calibrationHref({ sessionId: selectedSession?.id });

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center command-center--split command-center--metrics calibration-command-center">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Калибровка</h1>
          <p className="page-subtitle">
            Проверяющие оценивают одни и те же обращения. Руководитель видит расхождения и фиксирует единое правило.
          </p>
          <div className="admin-actions mt-5">
            <Link href={openNewSession ? closeNewSessionHref : newSessionHref} className={`action-button ${openNewSession ? "" : "action-button--primary"}`}>
              {openNewSession ? <X size={18} aria-hidden="true" /> : <PlusCircle size={18} aria-hidden="true" />}
              {openNewSession ? "Скрыть форму" : "Новая сессия"}
            </Link>
          </div>
        </div>
        <div className="learning-metrics" aria-label="Сводка калибровок">
          <div className="learning-metric">
            <ClipboardCheck size={16} aria-hidden="true" />
            <span>{activeSessionCount}</span>
            <small>активных</small>
          </div>
          <div className="learning-metric">
            <Gauge size={16} aria-hidden="true" />
            <span>{selectedProgress}%</span>
            <small>готовность</small>
          </div>
          <div className={`learning-metric ${selectedDisagreementCount > 0 ? "learning-metric--danger" : "learning-metric--success"}`}>
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{selectedDisagreementCount}</span>
            <small>расхождений</small>
          </div>
        </div>
      </div>

      <StickyMetricsBar
        ariaLabel="Сводка калибровок"
        items={[
          { icon: <ClipboardCheck size={14} aria-hidden="true" />, value: activeSessionCount, label: "активных" },
          { icon: <Gauge size={14} aria-hidden="true" />, value: `${selectedProgress}%`, label: "готовность" },
          {
            icon: <TriangleAlert size={14} aria-hidden="true" />,
            value: selectedDisagreementCount,
            label: "расхождений",
            tone: selectedDisagreementCount > 0 ? "danger" : "success"
          }
        ]}
      />

      {openNewSession ? (
        <section className="calibration-create-panel workflow-create-panel calibration-create-inline" aria-label="Новая калибровка">
          <div className="learning-section-header calibration-create-form__header">
            <div className="min-w-0">
              <h2>Новая калибровка</h2>
              <p>Выберите проверяющих и обращения. После создания участники получат один и тот же набор для оценки.</p>
            </div>
            <Link href={closeNewSessionHref} className="action-button">
              Скрыть
            </Link>
          </div>
          <form action={createCalibrationSession} className="calibration-create-form">
            <div className="calibration-create-shell">
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Название
                <input name="name" required defaultValue="Калибровка недели" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Срок
                <input name="dueAt" type="date" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Заметки
                <textarea name="notes" rows={2} className="form-control" />
              </label>
            </div>

            <div className="calibration-create-columns">
              <fieldset className="form-stack">
                <legend className="text-sm font-semibold text-[var(--foreground)]">Участники</legend>
                <div className="calibration-picker-grid">
                  {qaUsers.map((qaUser) => (
                    <label key={qaUser.id} className="compact-check-card">
                      <input name="participantId" type="checkbox" value={qaUser.id} defaultChecked={qaUser.id === user.id} />
                      <span>{qaUser.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="form-stack">
                <legend className="text-sm font-semibold text-[var(--foreground)]">Обращения</legend>
                <div className="calibration-picker-grid calibration-picker-grid--scroll">
                  {conversations.map((conversation) => (
                    <label key={conversation.id} className="compact-check-card compact-check-card--tall">
                      <input name="conversationId" type="checkbox" value={conversation.id} />
                      <span>
                        <strong>{conversation.externalId}</strong>
                        {conversation.subject}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <ValidatedSubmitButton minCheckedNames={["participantId", "conversationId"]}>
              Создать сессию
            </ValidatedSubmitButton>
          </form>
        </section>
      ) : null}

      <section className="calibration-session-strip panel" aria-label="Сессии калибровки">
        <div className="learning-section-header calibration-session-strip__header">
          <div className="min-w-0">
            <h2>Сессии</h2>
            <p>Выберите сессию, затем разберите ожидания и расхождения.</p>
          </div>
          <span className="pill pill--neutral">{sessions.length}</span>
        </div>
        <div className="calibration-session-row">
          {sessionSummaries.map((summary) => {
            const isSelected = selectedSession?.id === summary.session.id;

            return (
              <Link
                key={summary.session.id}
                href={calibrationHref({ sessionId: summary.session.id })}
                className={`calibration-session-chip ${isSelected ? "calibration-session-chip--selected" : ""}`}
                aria-current={isSelected ? "page" : undefined}
              >
                <span className={`pill ${statusClassName(summary.session.status)}`}>{statusLabel(summary.session.status)}</span>
                <strong>{summary.session.name}</strong>
                <small>
                  {summary.progress}% · {summary.waitingCount} ждут · {summary.disagreementCount} расх.
                </small>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="calibration-workspace" aria-label="Рабочая область калибровки">
        <div className="calibration-board panel">
          {selectedSession ? (
            <>
              <div className="calibration-board__header">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2>{selectedSession.name}</h2>
                    <span className={`pill ${statusClassName(selectedSession.status)}`}>{statusLabel(selectedSession.status)}</span>
                  </div>
                  <p>
                    {selectedSession.notes || "Сравните оценки по одним обращениям и зафиксируйте, где правило трактуется по-разному."}
                  </p>
                </div>
                <div className="calibration-board__actions">
                  {selectedSession.status === "active" || selectedSession.status === "draft" ? (
                    <form action={updateCalibrationSessionStatus}>
                      <input type="hidden" name="id" value={selectedSession.id} />
                      <input type="hidden" name="status" value="completed" />
                      <button type="submit" className="action-button action-button--primary">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        Завершить
                      </button>
                    </form>
                  ) : selectedSession.status === "completed" || selectedSession.status === "archived" ? (
                    <form action={updateCalibrationSessionStatus}>
                      <input type="hidden" name="id" value={selectedSession.id} />
                      <input type="hidden" name="status" value="active" />
                      <button type="submit" className="action-button">
                        Вернуть в работу
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              <div className="calibration-summary-strip">
                <div>
                  <ClipboardCheck size={16} aria-hidden="true" />
                  <span>{selectedItemCount}</span>
                  <small>обращений</small>
                </div>
                <div>
                  <UsersRound size={16} aria-hidden="true" />
                  <span>{selectedParticipantCount}</span>
                  <small>участников</small>
                </div>
                <div>
                  <Gauge size={16} aria-hidden="true" />
                  <span>{selectedProgress}%</span>
                  <small>готово</small>
                </div>
                <div>
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span>{selectedDisagreementCount}</span>
                  <small>расхождений</small>
                </div>
                <div>
                  <CalendarClock size={16} aria-hidden="true" />
                  <span>{selectedSession.dueAt ? selectedSession.dueAt.toLocaleDateString("ru-RU") : "нет"}</span>
                  <small>срок</small>
                </div>
              </div>

              <div className="calibration-item-list">
                {selectedItemStates.map(({ item, baselineReview, reviews, spread, missingParticipants }) => {
                  const completedCount = reviews.length;
                  const expectedCount = selectedSession.participants.length;
                  const attention = spread != null && spread > 10;
                  const waiting = missingParticipants.length > 0;

                  return (
                    <article
                      key={item.id}
                      className={`calibration-item-card ${attention ? "calibration-item-card--attention" : ""} ${waiting ? "calibration-item-card--waiting" : ""}`}
                    >
                      <div className="calibration-item-card__main">
                        <Link href={`/reviews/${item.conversationId}`} className="record-title calibration-item-card__title">
                          {item.conversation.subject}
                        </Link>
                        <div className="calibration-item-card__detail-row" aria-label="Состояние обращения в калибровке">
                          <span>
                            <strong>Эталон</strong>
                            {baselineReview ? `${formatQualityScore(baselineReview.totalScore)} · ${baselineReview.reviewer.name}` : "нет финальной проверки"}
                          </span>
                          <span>
                            <strong>Готово</strong>
                            {completedCount}/{expectedCount}
                          </span>
                          {item.conversation._count.coachingPins > 0 ? (
                            <span>
                              <strong>Заметки</strong>
                              {item.conversation._count.coachingPins}
                            </span>
                          ) : null}
                          {waiting ? (
                            <span className="calibration-info-chip--warning">
                              <strong>Ждут</strong>
                              {missingParticipants.length}
                            </span>
                          ) : null}
                        </div>
                        <details className="calibration-reviewer-details">
                          <summary>Показать оценки участников</summary>
                          <div className="calibration-reviewers">
                            {selectedSession.participants.map((participant) => {
                              const review = reviews.find((candidate) => candidate.reviewerId === participant.userId);

                              return (
                                <span key={participant.id} className={`pill ${review ? "pill--ok" : "pill--neutral"}`}>
                                  {participant.user.name}: {review ? formatQualityScore(review.totalScore) : "ждет"}
                                </span>
                              );
                            })}
                          </div>
                        </details>
                      </div>
                      <div className="calibration-item-card__aside">
                        <span className={`pill ${spread != null && spread > 10 ? "pill--warn" : "pill--neutral"}`}>
                          {spread == null ? "нет расхождения" : formatQualityScore(spread)}
                        </span>
                        {selectedSession.status === "active" || selectedSession.status === "draft" ? (
                          <Link
                            href={`/reviews/${item.conversationId}?reviewSource=CALIBRATION&returnTo=${encodeURIComponent(`/calibration?session=${selectedSession.id}`)}`}
                            className="action-button"
                          >
                            Оценить
                          </Link>
                        ) : (
                          <span className="pill pill--neutral">{selectedSession.status === "archived" ? "Архив" : "Завершена"}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h3>Нет калибровок</h3>
              <p>Создайте первую сессию из проверенных обращений и выберите участников.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
