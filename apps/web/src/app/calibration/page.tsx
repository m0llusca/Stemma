import Link from "next/link";
import { createCalibrationSession, updateCalibrationSessionStatus } from "@/lib/calibration-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";

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
      take: 10
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

  return (
    <section className="page-shell workspace-shell">
      <div className="workspace-hero">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Калибровка проверяющих</h1>
          <p className="page-subtitle">
          Несколько проверяющих оценивают одинаковые обращения, а руководитель смотрит расхождения по оценке и комментариям.
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/calibration?new=1" className="action-button action-button--primary">Новая калибровка</Link>
          {selectedSession ? <Link href={`/calibration?session=${selectedSession.id}`} className="action-button">Текущая сессия</Link> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Сессии калибровки</h2>
            <p className="mt-1 text-sm text-[#667085]">Активные и последние сессии без лишних карточек.</p>
          </div>
          <div className="record-list px-5">
          {sessions.map((session) => {
            const isSelected = selectedSession?.id === session.id;
            const itemCount = session.items.length;
            const participantCount = session.participants.length;
            const calibrationReviews = session.items.flatMap((item) =>
              item.conversation.reviews.filter(
                (review) =>
                  review.reviewSource === "CALIBRATION" &&
                  review.status === "FINALIZED" &&
                  session.participants.some((participant) => participant.userId === review.reviewerId)
              )
            );
            const completedCount = new Set(calibrationReviews.map((review) => `${review.conversationId}:${review.reviewerId}`)).size;
            const expectedCount = itemCount * participantCount;

            return (
              <article key={session.id} className={`record-card ${isSelected ? "record-card--selected" : ""}`}>
                <div className="record-row">
                  <div>
                    <h2 className="text-lg font-semibold">{session.name}</h2>
                    <p className="mt-1 text-sm text-[#667085]">
                      {statusLabel(session.status)} · {itemCount} обращений · {participantCount} участников · {completedCount}/{expectedCount} оценок
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/calibration?session=${session.id}`} className="action-button min-h-[36px] px-3 py-2 text-sm">
                      Открыть
                    </Link>
                    {session.status !== "completed" ? (
                      <form action={updateCalibrationSessionStatus}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="status" value="completed" />
                        <button type="submit" className="action-button action-button--primary min-h-[36px] px-3 py-2 text-sm">
                          Завершить
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
                <div className="signal-row">
                  {session.participants.map((participant) => {
                    const done = session.items.filter((item) =>
                      item.conversation.reviews.some(
                        (review) =>
                          review.reviewSource === "CALIBRATION" &&
                          review.status === "FINALIZED" &&
                          review.reviewerId === participant.userId
                      )
                    ).length;

                    return (
                      <div key={participant.id} className="rounded-md bg-[#f7f8fb] px-3 py-2">
                        <p className="font-semibold text-[#17202a]">{participant.user.name}</p>
                        <p className="mt-1 text-xs text-[#667085]">{roleLabels[participant.user.role]}</p>
                        <p className="mt-2 text-sm text-[#344054]">{done}/{itemCount} оценок</p>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
          </div>
        </section>

        <details className="disclosure-panel panel h-fit overflow-hidden" open={openNewSession}>
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d7dce5] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Новая калибровка</h2>
              <p className="mt-1 text-sm text-[#667085]">Выберите обращения и проверяющих.</p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#0b4f52]">Открыть</span>
          </summary>
          <form action={createCalibrationSession} className="grid gap-4 p-5">
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Название
              <input name="name" required defaultValue="Калибровка недели" className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Срок
              <input name="dueAt" type="date" className="form-control" />
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-[#344054]">Участники</legend>
              {qaUsers.map((qaUser) => (
                <label key={qaUser.id} className="flex items-center gap-2 text-sm text-[#344054]">
                  <input name="participantId" type="checkbox" value={qaUser.id} defaultChecked={qaUser.id === user.id} />
                  {qaUser.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-[#344054]">Обращения</legend>
              {conversations.map((conversation) => (
                <label key={conversation.id} className="flex items-start gap-2 text-sm text-[#344054]">
                  <input name="conversationId" type="checkbox" value={conversation.id} />
                  <span>{conversation.subject}</span>
                </label>
              ))}
            </fieldset>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Заметки
              <textarea name="notes" rows={3} className="form-control" />
            </label>
            <button type="submit" className="action-button action-button--primary">
              Создать сессию
            </button>
          </form>
        </details>
      </div>

      {selectedSession ? (
        <section className="panel mt-6 overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Разбор расхождений: {selectedSession.name}</h2>
            <p className="mt-1 text-sm text-[#667085]">Оценки калибровки не меняют итоговую оценку обращения.</p>
          </div>
          <div className="record-list px-5">
                {selectedSession.items.map((item) => {
                  const reviews = item.conversation.reviews.filter(
                    (review) =>
                      review.reviewSource === "CALIBRATION" &&
                      review.status === "FINALIZED" &&
                      selectedSession.participants.some((participant) => participant.userId === review.reviewerId)
                  );
                  const scores = reviews.map((review) => Math.round(review.totalScore));
                  const spread = scoreSpread(scores);

                  return (
                    <article key={item.id} className="record-card">
                      <div className="record-row">
                        <Link href={`/reviews/${item.conversationId}`} className="record-title text-[#0b4f52] hover:underline">
                          {item.conversation.subject}
                        </Link>
                        <span className={`pill ${spread != null && spread > 10 ? "pill--warn" : "pill--neutral"}`}>
                          {spread == null ? "Недостаточно данных" : `${spread} п.п.`}
                        </span>
                      </div>
                      <p className="record-meta">
                        {reviews.length > 0
                          ? reviews.map((review) => `${review.reviewer.name}: ${Math.round(review.totalScore)}%`).join(" · ")
                          : "Пока нет оценок"}
                      </p>
                      <div className="record-row">
                        <span className="record-meta">Оценки калибровки не меняют итоговую оценку обращения.</span>
                        <Link
                          href={`/reviews/${item.conversationId}?reviewSource=CALIBRATION&returnTo=${encodeURIComponent(`/calibration?session=${selectedSession.id}`)}`}
                          className="text-sm font-semibold text-[#0b4f52] hover:underline"
                        >
                          Оценить
                        </Link>
                      </div>
                    </article>
                  );
                })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
