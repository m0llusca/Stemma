import Link from "next/link";
import { BookOpenCheck, CheckCircle2, Clock3, PlusCircle, TriangleAlert } from "lucide-react";
import { createTrainingAssignment, updateTrainingAssignmentStatus } from "@/lib/feedback-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { riskLevelLabels } from "@/lib/labels";
import { createKnowledgeEntry } from "@/lib/quality-actions";
import { formatQualityScore } from "@/lib/score-display";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";

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
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        conversation: {
          qaStatus: "FINALIZED"
        }
      },
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
  const linkedAssignmentCount = assignments.filter((assignment) => assignment.reviewId).length;
  const nextAssignment =
    assignments.find((assignment) => assignment.status !== "done" && isOverdue(assignment.dueAt, now)) ??
    assignments.find((assignment) => assignment.status !== "done");
  const displayedAssignments = nextAssignment
    ? [nextAssignment, ...assignments.filter((assignment) => assignment.id !== nextAssignment.id)]
    : assignments;
  const nextConversation = nextAssignment?.review?.conversation;
  const nextFinding = nextAssignment?.review?.findings[0];

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center command-center--split command-center--metrics coaching-command-center">
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
          <div className={`learning-metric ${overdueCount > 0 ? "learning-metric--danger" : "learning-metric--success"}`}>
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{overdueCount}</span>
            <small>просрочено</small>
          </div>
          <div className="learning-metric learning-metric--success">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{doneCount}</span>
            <small>закрыто</small>
          </div>
          <div className="learning-metric">
            <BookOpenCheck size={16} aria-hidden="true" />
            <span>{criticalKnowledgeCount}</span>
            <small>важных правил</small>
          </div>
        </div>
      </div>

      <section className="workflow-focus-strip" aria-label="Фокус обучения">
        <div className="workflow-focus-strip__lead">
          <span className="page-kicker">Что разобрать первым</span>
          <strong>{nextAssignment ? nextAssignment.title : "Нет срочных разборов"}</strong>
          <small>{nextAssignment ? `${nextAssignment.assigneeName} · ${dueText(nextAssignment.dueAt)}` : "Учебные задачи и база ошибок остаются ниже."}</small>
        </div>
        <div className="workflow-focus-strip__items">
          {nextConversation ? (
            <Link href={`/reviews/${nextConversation.id}`} className="workflow-focus-card">
              <span>Открыть проверку</span>
              <strong>{nextConversation.externalId}</strong>
              <small>{nextFinding ? `${nextFinding.category} · ${riskLevelLabels[nextFinding.riskLevel]}` : "Связанная проверка"}</small>
            </Link>
          ) : (
            <div className="workflow-focus-card workflow-focus-card--static">
              <span>Фокус</span>
              <strong>{openCount}</strong>
              <small>Незакрытых учебных задач</small>
            </div>
          )}
          <div className={`workflow-focus-card workflow-focus-card--static ${overdueCount > 0 ? "workflow-focus-card--warning" : ""}`}>
            <span>Сроки</span>
            <strong>{overdueCount}</strong>
            <small>{overdueCount > 0 ? "Просроченных разборов" : "Нет просроченных задач"}</small>
          </div>
          <div className="workflow-focus-card workflow-focus-card--static">
            <span>Связь с проверками</span>
            <strong>{linkedAssignmentCount}</strong>
            <small>Задач с контекстом тикета</small>
          </div>
        </div>
      </section>

      <details className="training-create-panel workflow-create-panel">
        <summary className="training-create-summary workflow-create-summary">
          <span className="workflow-create-summary__text">
            <span className="page-kicker">Назначение разбора</span>
            <strong>Новая учебная задача</strong>
            <small>Привяжите задачу к проверке, чтобы оператор сразу видел контекст ошибки.</small>
          </span>
          <span className="action-button action-button--primary training-create-summary__button">
            <PlusCircle size={18} />
            Новая задача
          </span>
        </summary>
        <form action={createTrainingAssignment} className="training-create-form">
          <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
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
          <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
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
          <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
            Срок
            <input name="dueAt" type="date" className="form-control" />
          </label>
          <label className="training-create-form__title grid gap-1 text-sm font-medium text-[var(--foreground)]">
            Задача
            <input name="title" required placeholder="Например: разбор маршрутизации" className="form-control" />
          </label>
          <label className="training-create-form__description grid gap-1 text-sm font-medium text-[var(--foreground)]">
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
            <ValidatedSubmitButton>Создать задачу</ValidatedSubmitButton>
          </div>
        </form>
      </details>

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
            {displayedAssignments.length > 0 ? (
              displayedAssignments.map((assignment) => {
                const overdue = assignment.status !== "done" && isOverdue(assignment.dueAt, now);
                const conversation = assignment.review?.conversation;
                const finding = assignment.review?.findings[0];
                const isPriority = nextAssignment?.id === assignment.id;

                return (
                  <article
                    key={assignment.id}
                    className={`learning-task ${overdue ? "learning-task--urgent" : ""} ${isPriority ? "learning-task--priority" : ""}`}
                  >
                    <div className="learning-task__marker" aria-hidden="true">
                      <BookOpenCheck size={17} />
                    </div>
                    <div className="learning-task__content">
                      <div className="learning-task__head">
                        <h3>{assignment.title}</h3>
                        {isPriority ? <span className="pill pill--warn">Следующий разбор</span> : null}
                        <span className={`pill ${trainingStatusClassName(assignment.status)}`}>
                          {trainingStatusLabel(assignment.status)}
                        </span>
                      </div>
                      <p className="learning-task__description">{assignment.description}</p>
                      <div className="learning-task__meta">
                        <span>{assignment.assigneeName}</span>
                        <span className={overdue ? "learning-task__meta-chip--warning" : undefined}>{dueText(assignment.dueAt)}</span>
                        {conversation ? <span>{conversation.externalId}</span> : null}
                        {finding ? <span>{finding.category} · {riskLevelLabels[finding.riskLevel]}</span> : null}
                        {assignment.review ? <span>{formatQualityScore(assignment.review.totalScore)}</span> : null}
                        {assignment.review?.needsReanswer ? <span>переответ</span> : null}
                      </div>
                    </div>
                    <div className="learning-task__actions">
                      {conversation ? (
                        <Link href={`/reviews/${conversation.id}`} className="action-button">
                          Открыть
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

        <section className="learning-knowledge-panel panel">
          <div className="learning-section-header">
            <div className="min-w-0">
              <h2>База ошибок</h2>
              <p>Короткие правила рядом с задачами, чтобы сразу закрепить норму.</p>
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

          <details className="compact-details knowledge-create-details">
            <summary className="disclosure-summary knowledge-create-summary">
              <span className="action-button knowledge-create-summary__button">
                <PlusCircle size={17} aria-hidden="true" />
                <span>Добавить типовую ошибку</span>
              </span>
            </summary>
            <form action={createKnowledgeEntry} className="form-stack border-t border-[#d9e0ea] p-4">
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Категория
                <input name="category" required className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Название
                <input name="title" required className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Риск
                <select name="riskLevel" defaultValue="MEDIUM" className="form-control">
                  {Object.entries(riskLevelLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Описание
                <textarea name="description" required rows={3} className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Рекомендация
                <textarea name="recommendation" required rows={3} className="form-control" />
              </label>
              <ValidatedSubmitButton>Сохранить</ValidatedSubmitButton>
            </form>
          </details>
        </section>
      </section>
    </section>
  );
}
