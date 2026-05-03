import Link from "next/link";
import { BookOpenCheck, CheckCircle2, Clock3, PlusCircle, TriangleAlert } from "lucide-react";
import { createTrainingAssignment, updateTrainingAssignmentStatus } from "@/lib/feedback-actions";
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

function trainingStatusClassName(status: string) {
  if (status === "done") {
    return "pill--ok";
  }

  if (status === "in_progress") {
    return "pill--warn";
  }

  return "pill--neutral";
}

function dueText(date: Date | null) {
  return date ? `до ${date.toLocaleDateString("ru-RU")}` : "без срока";
}

function isOverdue(date: Date | null, now: Date) {
  return Boolean(date && date.getTime() < now.getTime());
}

export default async function CoachingPage() {
  const user = await requireCurrentUserPermission("training:manage");
  const trainingWhere =
    user.role === "SUPPORT_AGENT"
      ? { workspaceId: user.workspaceId, assigneeId: user.id }
      : { workspaceId: user.workspaceId };
  const [assignments, knowledgeEntries, supportUsers, reviewCandidates] = await Promise.all([
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
    }),
    prisma.user.findMany({
      where: { workspaceId: user.workspaceId, role: "SUPPORT_AGENT" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, supportLine: true, teamName: true }
    }),
    prisma.review.findMany({
      where: { workspaceId: user.workspaceId, status: "FINALIZED", reviewSource: "HUMAN" },
      include: {
        conversation: true,
        findings: true
      },
      orderBy: [{ finalizedAt: "desc" }, { createdAt: "desc" }],
      take: 20
    })
  ]);
  const now = new Date();
  const openCount = assignments.filter((assignment) => assignment.status !== "done").length;
  const doneCount = assignments.filter((assignment) => assignment.status === "done").length;
  const overdueCount = assignments.filter((assignment) => assignment.status !== "done" && isOverdue(assignment.dueAt, now)).length;
  const criticalKnowledgeCount = knowledgeEntries.filter((entry) => entry.riskLevel === "CRITICAL" || entry.riskLevel === "HIGH").length;
  const nextAssignment =
    assignments.find((assignment) => assignment.status !== "done" && isOverdue(assignment.dueAt, now)) ??
    assignments.find((assignment) => assignment.status !== "done");
  const nextConversation = nextAssignment?.review?.conversation;
  const nextFinding = nextAssignment?.review?.findings[0];

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center command-center--split">
        <div className="min-w-0">
          <p className="page-kicker">Развитие качества</p>
          <h1 className="page-title">Обучение</h1>
          <p className="page-subtitle">
            Один экран для разбора ошибок: что назначено, какой тикет открыть и какое правило закрепить.
          </p>
        </div>
        <div className="learning-metrics" aria-label="Сводка обучения">
          <div className="learning-metric">
            <Clock3 size={16} aria-hidden="true" />
            <span>{openCount}</span>
            <small>в работе</small>
          </div>
          <div className="learning-metric">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{overdueCount}</span>
            <small>просрочено</small>
          </div>
          <div className="learning-metric">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{doneCount}</span>
            <small>закрыто</small>
          </div>
        </div>
      </div>

      {nextAssignment ? (
        <section className={`learning-next-panel panel ${isOverdue(nextAssignment.dueAt, now) ? "learning-next-panel--urgent" : ""}`}>
          <div className="learning-next-panel__main">
            <p className="page-kicker">Следующий разбор</p>
            <h2>{nextAssignment.title}</h2>
            <p>{nextAssignment.description}</p>
            <div className="learning-task__meta">
              <span>{nextAssignment.assigneeName}</span>
              <span>{dueText(nextAssignment.dueAt)}</span>
              {nextConversation ? <span>{nextConversation.externalId}</span> : null}
              {nextFinding ? <span>{nextFinding.category}</span> : null}
            </div>
          </div>
          <div className="learning-next-panel__actions">
            {nextConversation ? (
              <Link href={`/reviews/${nextConversation.id}`} className="action-button">
                Открыть проверку
              </Link>
            ) : null}
            <form action={updateTrainingAssignmentStatus}>
              <input type="hidden" name="id" value={nextAssignment.id} />
              <input type="hidden" name="status" value="done" />
              <button type="submit" className="action-button action-button--primary">
                Завершить разбор
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <section className="training-create-panel panel">
        <div className="learning-section-header">
          <div className="min-w-0">
            <h2>Новая учебная задача</h2>
            <p>Создайте разбор вручную или привяжите его к финальной проверке.</p>
          </div>
        </div>
        <form action={createTrainingAssignment} className="training-create-form">
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Исполнитель
            <select name="assigneeId" required className="form-control">
              <option value="">Выберите оператора</option>
              {supportUsers.map((supportUser) => (
                <option key={supportUser.id} value={supportUser.id}>
                  {supportUser.name}
                  {supportUser.teamName ? ` · ${supportUser.teamName}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Проверка
            <select name="reviewId" className="form-control">
              <option value="">Без привязки</option>
              {reviewCandidates.map((review) => (
                <option key={review.id} value={review.id}>
                  {review.conversation.externalId} · {review.findings[0]?.category ?? review.conversation.subject}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Срок
            <input name="dueAt" type="date" className="form-control" />
          </label>
          <label className="training-create-form__title grid gap-1 text-sm font-medium text-[#334155]">
            Задача
            <input name="title" required placeholder="Например: разбор маршрутизации" className="form-control" />
          </label>
          <label className="training-create-form__description grid gap-1 text-sm font-medium text-[#334155]">
            Что разобрать
            <textarea
              name="description"
              required
              rows={3}
              placeholder="Коротко опишите ошибку, ожидаемое правило и результат разбора."
              className="form-control"
            />
          </label>
          <div className="training-create-form__action">
            <button type="submit" className="action-button action-button--primary">
              Создать задачу
            </button>
          </div>
        </form>
      </section>

      <section className="learning-layout" aria-label="Обучение и база ошибок">
        <div className="learning-primary panel">
          <div className="learning-section-header">
            <div className="min-w-0">
              <h2>Учебные задачи</h2>
              <p>Разборы из проверок, переответов, апелляций и калибровок.</p>
            </div>
            <span className="pill pill--neutral">{assignments.length}</span>
          </div>

          <div className="learning-task-list">
            {assignments.length > 0 ? (
              assignments.map((assignment) => {
                const overdue = assignment.status !== "done" && isOverdue(assignment.dueAt, now);
                const conversation = assignment.review?.conversation;
                const finding = assignment.review?.findings[0];

                return (
                  <article key={assignment.id} className={`learning-task ${overdue ? "learning-task--urgent" : ""}`}>
                    <div className="learning-task__marker" aria-hidden="true">
                      <BookOpenCheck size={17} />
                    </div>
                    <div className="learning-task__content">
                      <div className="learning-task__head">
                        <h3>{assignment.title}</h3>
                        <span className={`pill ${trainingStatusClassName(assignment.status)}`}>
                          {trainingStatusLabel(assignment.status)}
                        </span>
                      </div>
                      <p className="learning-task__description">{assignment.description}</p>
                      <div className="learning-task__meta">
                        <span>{assignment.assigneeName}</span>
                        <span className={overdue ? "text-[#b45309]" : ""}>{dueText(assignment.dueAt)}</span>
                        {conversation ? <span>{conversation.externalId}</span> : null}
                        {finding ? <span>{finding.category}</span> : null}
                      </div>
                    </div>
                    <div className="learning-task__actions">
                      {conversation ? (
                        <Link href={`/reviews/${conversation.id}`} className="action-button">
                          Открыть проверку
                        </Link>
                      ) : null}
                      <form action={updateTrainingAssignmentStatus}>
                        <input type="hidden" name="id" value={assignment.id} />
                        <input type="hidden" name="status" value={assignment.status === "done" ? "open" : "done"} />
                        <button type="submit" className="action-button action-button--primary">
                          {assignment.status === "done" ? "Вернуть" : "Готово"}
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-state">
                <h3>Нет учебных задач</h3>
                <p>После проверки с замечанием здесь появится задача на разбор с оператором.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="learning-sidebar">
          <section className="panel">
            <div className="learning-section-header">
              <div className="min-w-0">
                <h2>База ошибок</h2>
                <p>Короткие правила для повторяющихся замечаний.</p>
              </div>
              <span className="pill pill--warn">{criticalKnowledgeCount} важных</span>
            </div>
            <div className="knowledge-compact-list">
              {knowledgeEntries.map((entry) => (
                <article key={entry.id} className="knowledge-compact-card">
                  <div className="knowledge-compact-card__head">
                    <span className="pill pill--neutral">{entry.category}</span>
                    <span className="text-xs font-semibold text-[#64748b]">{riskLevelLabels[entry.riskLevel]}</span>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.recommendation}</p>
                </article>
              ))}
            </div>
          </section>

          <details className="panel compact-details">
            <summary className="disclosure-summary">
              <span className="flex min-w-0 items-center gap-2">
                <PlusCircle size={17} aria-hidden="true" />
                <span className="text-sm font-semibold">Добавить типовую ошибку</span>
              </span>
              <span className="text-xs font-semibold uppercase text-[#64748b]">Форма</span>
            </summary>
            <form action={createKnowledgeEntry} className="form-stack border-t border-[#d9e0ea] p-4">
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
        </aside>
      </section>
    </section>
  );
}
