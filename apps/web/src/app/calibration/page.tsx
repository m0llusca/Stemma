import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardCheck, Gauge, PlusCircle, TriangleAlert, UsersRound } from "lucide-react";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createCalibrationSession, updateCalibrationSessionStatus } from "@/lib/calibration-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

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
        items: { include: { conversation: { include: { reviews: { include: { reviewer: true } } } } } }
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
  const selectedWaitingCount = Math.max(selectedExpectedCount - selectedCompletedCount, 0);
  const selectedDisagreementCount =
    selectedSession?.items.filter((item) => {
      const reviews = item.conversation.reviews.filter(
        (review) =>
          review.reviewSource === "CALIBRATION" &&
          review.status === "FINALIZED" &&
          selectedSession.participants.some((participant) => participant.userId === review.reviewerId)
      );
      const spread = scoreSpread(reviews.map((review) => Math.round(review.totalScore)));

      return spread != null && spread > 10;
    }).length ?? 0;

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Калибровка</h1>
          <p className="page-subtitle">
            Проверяющие оценивают одни и те же обращения. Руководитель видит расхождения и фиксирует единое правило.
          </p>
        </div>
      </div>

      <details className="calibration-create-panel" open={openNewSession}>
        <summary className="training-create-summary calibration-create-summary">
          <span className="action-button action-button--primary training-create-summary__button calibration-create-summary__button">
            <PlusCircle size={18} aria-hidden="true" />
            Новая сессия
          </span>
        </summary>
        <form action={createCalibrationSession} className="calibration-create-form">
          <div className="learning-section-header calibration-create-form__header">
            <div className="min-w-0">
              <h2>Новая калибровка</h2>
              <p>Выберите проверяющих и обращения. После создания участники получат один и тот же набор для оценки.</p>
            </div>
          </div>
          <div className="calibration-create-shell">
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Название
              <input name="name" required defaultValue="Калибровка недели" className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Срок
              <input name="dueAt" type="date" className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Заметки
              <textarea name="notes" rows={2} className="form-control" />
            </label>
          </div>

          <div className="calibration-create-columns">
            <fieldset className="form-stack">
              <legend className="text-sm font-semibold text-[#334155]">Участники</legend>
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
              <legend className="text-sm font-semibold text-[#334155]">Обращения</legend>
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
      </details>

      <section className="calibration-workspace" aria-label="Рабочая область калибровки">
        <aside className="calibration-rail panel">
          <div className="learning-section-header">
            <div className="min-w-0">
              <h2>Сессии</h2>
              <p>Активные и последние калибровки.</p>
            </div>
            <span className="pill pill--neutral">{sessions.length}</span>
          </div>
          <div className="calibration-session-list">
            {sessions.map((session) => {
              const isSelected = selectedSession?.id === session.id;
              const itemCount = session.items.length;
              const participantCount = session.participants.length;

              return (
                <Link
                  key={session.id}
                  href={`/calibration?session=${session.id}`}
                  className={`calibration-session-card ${isSelected ? "calibration-session-card--selected" : ""}`}
                >
                  <span className={`pill ${statusClassName(session.status)}`}>{statusLabel(session.status)}</span>
                  <h3>{session.name}</h3>
                  <p>{itemCount} обращений · {participantCount} участников</p>
                </Link>
              );
            })}
          </div>
        </aside>

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
                  {selectedSession.status !== "completed" ? (
                    <form action={updateCalibrationSessionStatus}>
                      <input type="hidden" name="id" value={selectedSession.id} />
                      <input type="hidden" name="status" value="completed" />
                      <button type="submit" className="action-button action-button--primary">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        Завершить
                      </button>
                    </form>
                  ) : (
                    <form action={updateCalibrationSessionStatus}>
                      <input type="hidden" name="id" value={selectedSession.id} />
                      <input type="hidden" name="status" value="active" />
                      <button type="submit" className="action-button">
                        Вернуть в работу
                      </button>
                    </form>
                  )}
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

              <div className="calibration-attention-strip">
                <div>
                  <strong>{selectedWaitingCount}</strong>
                  <span>оценок еще ждут участников</span>
                </div>
                <div>
                  <strong>{selectedDisagreementCount}</strong>
                  <span>обращений требуют общего решения по правилу</span>
                </div>
              </div>

              <div className="calibration-item-list">
                {selectedSession.items.map((item) => {
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

                  return (
                    <article key={item.id} className="calibration-item-card">
                      <div className="calibration-item-card__main">
                        <Link href={`/reviews/${item.conversationId}`} className="record-title text-[#1d3fae] hover:underline">
                          {item.conversation.subject}
                        </Link>
                        <p>
                          Эталон: {baselineReview ? `${Math.round(baselineReview.totalScore)}% · ${baselineReview.reviewer.name}` : "нет финальной проверки"}
                        </p>
                        <div className="calibration-reviewers">
                          {selectedSession.participants.map((participant) => {
                            const review = reviews.find((candidate) => candidate.reviewerId === participant.userId);

                            return (
                              <span key={participant.id} className={`pill ${review ? "pill--ok" : "pill--neutral"}`}>
                                {participant.user.name}: {review ? `${Math.round(review.totalScore)}%` : "ждет"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="calibration-item-card__aside">
                        <span className={`pill ${spread != null && spread > 10 ? "pill--warn" : "pill--neutral"}`}>
                          {spread == null ? "нет расхождения" : `${spread} п.п.`}
                        </span>
                        <Link
                          href={`/reviews/${item.conversationId}?reviewSource=CALIBRATION&returnTo=${encodeURIComponent(`/calibration?session=${selectedSession.id}`)}`}
                          className="action-button"
                        >
                          Оценить
                        </Link>
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
