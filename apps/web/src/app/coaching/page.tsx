import Link from "next/link";
import { updateTrainingAssignmentStatus } from "@/lib/feedback-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { riskLevelLabels } from "@/lib/labels";
import { createKnowledgeEntry } from "@/lib/quality-actions";

export const dynamic = "force-dynamic";

function trainingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "Новая",
    in_progress: "В работе",
    done: "Готово"
  };

  return labels[status] ?? status;
}

export default async function CoachingPage() {
  const user = await requireCurrentUserPermission("training:manage");
  const trainingWhere =
    user.role === "SUPPORT_AGENT"
      ? { workspaceId: user.workspaceId, assigneeId: user.id }
      : { workspaceId: user.workspaceId };
  const [assignments, knowledgeEntries] = await Promise.all([
    prisma.trainingAssignment.findMany({
      where: trainingWhere,
      include: {
        review: {
          include: {
            conversation: true,
            findings: true
          }
        },
        assignedBy: true
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
    }),
    prisma.qualityKnowledgeEntry.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ riskLevel: "desc" }, { category: "asc" }]
    })
  ]);

  return (
    <section className="page-shell workspace-shell">
      <div className="workspace-hero">
        <div className="min-w-0">
          <p className="page-kicker">Развитие качества</p>
          <h1 className="page-title">Обучение и база ошибок</h1>
          <p className="page-subtitle">
            Замечания превращаются в учебные задачи, а повторяющиеся ошибки попадают в базу рекомендаций.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Учебные задачи</h2>
            <p className="mt-1 text-sm text-[#667085]">Разборы по итогам проверок, переответам и апелляциям.</p>
          </div>
          <div className="grid gap-0">
            {assignments.length > 0 ? (
              assignments.map((assignment) => (
                <article key={assignment.id} className="task-row md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#17202a]">{assignment.title}</p>
                    <p className="mt-1 text-sm leading-5 text-[#667085]">{assignment.description}</p>
                    <p className="mt-2 text-xs font-semibold uppercase text-[#667085]">
                      {assignment.assigneeName}
                      {assignment.dueAt ? ` · до ${assignment.dueAt.toLocaleDateString("ru-RU")}` : ""}
                      {assignment.review?.conversation ? ` · ${assignment.review.conversation.externalId}` : ""}
                    </p>
                  </div>
                  <span className="w-fit rounded-md bg-[#f7f8fb] px-2 py-1 text-xs font-semibold uppercase text-[#475467]">
                    {trainingStatusLabel(assignment.status)}
                  </span>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {assignment.review ? (
                      <Link href={`/reviews/${assignment.review.conversationId}`} className="action-button min-h-[36px] px-3 py-2 text-sm">
                        Проверка
                      </Link>
                    ) : null}
                    <form action={updateTrainingAssignmentStatus}>
                      <input type="hidden" name="id" value={assignment.id} />
                      <input type="hidden" name="status" value={assignment.status === "done" ? "open" : "done"} />
                      <button type="submit" className="action-button action-button--primary min-h-[36px] px-3 py-2 text-sm">
                        {assignment.status === "done" ? "Переоткрыть" : "Готово"}
                      </button>
                    </form>
                  </div>
                </article>
              ))
            ) : (
              <div className="soft-callout text-sm text-[#667085]">
                Учебных задач пока нет.
              </div>
            )}
          </div>
        </section>

        <details className="disclosure-panel panel h-fit overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d7dce5] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Добавить типовую ошибку</h2>
              <p className="mt-1 text-sm text-[#667085]">Форма скрыта, пока не нужно пополнить базу.</p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#0b4f52]">Открыть</span>
          </summary>
          <form action={createKnowledgeEntry} className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Категория
              <input name="category" required className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Название
              <input name="title" required className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Риск
              <select name="riskLevel" defaultValue="MEDIUM" className="form-control">
                {Object.entries(riskLevelLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Описание
              <textarea name="description" required rows={3} className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Рекомендация
              <textarea name="recommendation" required rows={3} className="form-control" />
            </label>
            <button type="submit" className="action-button action-button--primary">
              Сохранить
            </button>
          </form>
        </details>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <h2 className="text-lg font-semibold">База типовых ошибок</h2>
          <p className="mt-1 text-sm text-[#667085]">Используется для рекомендаций, калибровки и обучения операторов.</p>
        </div>
        <div className="knowledge-grid md:grid-cols-2 xl:grid-cols-3">
          {knowledgeEntries.map((entry) => (
            <article key={entry.id} className="knowledge-item">
              <p className="text-xs font-semibold uppercase text-[#667085]">{entry.category} · {riskLevelLabels[entry.riskLevel]}</p>
              <h3 className="mt-2 font-semibold text-[#17202a]">{entry.title}</h3>
              <p className="mt-2 text-sm leading-5 text-[#667085]">{entry.description}</p>
              <p className="mt-3 text-sm leading-5 text-[#344054]">{entry.recommendation}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
