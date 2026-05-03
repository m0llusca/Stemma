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
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Контроль качества</p>
        <h1 className="mt-1 text-2xl font-semibold">Калибровка проверяющих</h1>
        <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">
          Несколько проверяющих оценивают одинаковые обращения, а руководитель смотрит расхождения по оценке и комментариям.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-5">
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
              <section key={session.id} className={`panel overflow-hidden ${isSelected ? "ring-2 ring-[#116466]" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7dce5] px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold">{session.name}</h2>
                    <p className="mt-1 text-sm text-[#667085]">
                      {statusLabel(session.status)} · {itemCount} обращений · {participantCount} участников · {completedCount}/{expectedCount} оценок
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/calibration?session=${session.id}`} className="rounded border border-[#d7dce5] px-3 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]">
                      Открыть
                    </Link>
                    {session.status !== "completed" ? (
                      <form action={updateCalibrationSessionStatus}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="status" value="completed" />
                        <button type="submit" className="rounded bg-[#116466] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
                          Завершить
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-3 p-5 md:grid-cols-3">
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
                      <div key={participant.id} className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
                        <p className="font-semibold text-[#17202a]">{participant.user.name}</p>
                        <p className="mt-1 text-xs text-[#667085]">{roleLabels[participant.user.role]}</p>
                        <p className="mt-2 text-sm text-[#344054]">{done}/{itemCount} оценок</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <form action={createCalibrationSession} className="panel h-fit overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Новая калибровка</h2>
            <p className="mt-1 text-sm text-[#667085]">Выберите обращения и проверяющих.</p>
          </div>
          <div className="grid gap-4 p-5">
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Название
              <input name="name" required defaultValue="Калибровка недели" className="rounded border border-[#d7dce5] px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Срок
              <input name="dueAt" type="date" className="rounded border border-[#d7dce5] px-3 py-2" />
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
              <textarea name="notes" rows={3} className="rounded border border-[#d7dce5] px-3 py-2" />
            </label>
            <button type="submit" className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
              Создать сессию
            </button>
          </div>
        </form>
      </div>

      {selectedSession ? (
        <section className="panel mt-6 overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Разбор расхождений: {selectedSession.name}</h2>
            <p className="mt-1 text-sm text-[#667085]">Оценки калибровки не меняют итоговую оценку обращения.</p>
          </div>
          <div className="scroll-area">
            <table className="table-fixed-copy w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Обращение</th>
                  <th className="px-5 py-3 font-semibold">Оценки</th>
                  <th className="px-5 py-3 font-semibold">Разброс</th>
                  <th className="px-5 py-3 font-semibold">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dce5]">
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
                    <tr key={item.id}>
                      <td className="px-5 py-4">
                        <Link href={`/reviews/${item.conversationId}`} className="font-semibold text-[#0b4f52] hover:underline">
                          {item.conversation.subject}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-[#344054]">
                        {reviews.length > 0
                          ? reviews.map((review) => `${review.reviewer.name}: ${Math.round(review.totalScore)}%`).join(" · ")
                          : "Пока нет оценок"}
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#17202a]">{spread == null ? "Недостаточно данных" : `${spread} п.п.`}</td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/reviews/${item.conversationId}?reviewSource=CALIBRATION&returnTo=${encodeURIComponent(`/calibration?session=${selectedSession.id}`)}`}
                          className="font-semibold text-[#0b4f52] hover:underline"
                        >
                          Оценить
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
