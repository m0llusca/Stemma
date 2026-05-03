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
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Развитие качества</p>
          <h1 className="page-title">Обучение и база ошибок</h1>
          <p className="page-subtitle">
            Замечания превращаются в учебные задачи, а повторяющиеся ошибки попадают в базу рекомендаций.
          </p>
        </div>
      </div>

      <section className="admin-group-grid admin-group-grid--two" aria-label="Обучение">
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Учебные задачи</h2>
            <p className="text-sm leading-5 text-[#64748b]">Разборы по итогам проверок, переответам и апелляциям.</p>
          </div>
          <div className="grid gap-2">
            {assignments.length > 0 ? (
              assignments.map((assignment) => (
                <article key={assignment.id} className="admin-tile admin-tile--compact">
                  <span className="admin-tile__icon admin-tile__icon--plain">T</span>
                  <div className="admin-tile__body">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="record-title record-title--tight">{assignment.title}</span>
                      <span className="pill pill--neutral">{trainingStatusLabel(assignment.status)}</span>
                    </span>
                    <span className="record-meta compact-text">{assignment.description}</span>
                    <span className="record-meta compact-text">
                      {assignment.assigneeName}
                      {assignment.dueAt ? ` · до ${assignment.dueAt.toLocaleDateString("ru-RU")}` : ""}
                      {assignment.review?.conversation ? ` · ${assignment.review.conversation.externalId}` : ""}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {assignment.review ? (
                        <Link href={`/reviews/${assignment.review.conversationId}`} className="quiet-link">
                          Открыть проверку
                        </Link>
                      ) : null}
                      <form action={updateTrainingAssignmentStatus}>
                        <input type="hidden" name="id" value={assignment.id} />
                        <input type="hidden" name="status" value={assignment.status === "done" ? "open" : "done"} />
                        <button type="submit" className="quiet-link">
                          {assignment.status === "done" ? "Переоткрыть" : "Готово"}
                        </button>
                      </form>
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <div className="soft-callout text-sm text-[#64748b]">
                Учебных задач пока нет.
              </div>
            )}
          </div>
        </div>

        <details className="disclosure-panel admin-group h-fit overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Добавить типовую ошибку</h2>
              <p className="mt-1 text-sm text-[#64748b]">Форма скрыта, пока не нужно пополнить базу.</p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#1d3fae]">Открыть</span>
          </summary>
          <form action={createKnowledgeEntry} className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Категория
              <input name="category" required className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Название
              <input name="title" required className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Риск
              <select name="riskLevel" defaultValue="MEDIUM" className="form-control">
                {Object.entries(riskLevelLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Описание
              <textarea name="description" required rows={3} className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Рекомендация
              <textarea name="recommendation" required rows={3} className="form-control" />
            </label>
            <button type="submit" className="action-button action-button--primary">
              Сохранить
            </button>
          </form>
        </details>
      </section>

      <section className="admin-group">
        <div className="admin-group__header admin-group__header--compact">
          <h2 className="text-base font-semibold text-[#111827]">База типовых ошибок</h2>
          <p className="text-sm leading-5 text-[#64748b]">Используется для рекомендаций, калибровки и обучения операторов.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {knowledgeEntries.map((entry) => (
            <article key={entry.id} className="soft-callout">
              <p className="text-xs font-semibold uppercase text-[#64748b]">{entry.category} · {riskLevelLabels[entry.riskLevel]}</p>
              <h3 className="mt-2 font-semibold text-[#111827]">{entry.title}</h3>
              <p className="mt-2 text-sm leading-5 text-[#64748b]">{entry.description}</p>
              <p className="mt-3 text-sm leading-5 text-[#334155]">{entry.recommendation}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
