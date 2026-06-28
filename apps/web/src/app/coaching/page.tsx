import Link from "next/link";
import {
  Archive,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Link2,
  MoreHorizontal,
  PlusCircle,
  Search,
  SlidersHorizontal,
  TrendingUp,
  TriangleAlert,
  UserRound,
  X
} from "lucide-react";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import { OperationalPageFrame } from "@/components/operations/operational-page-frame";
import { PriorityActionPanel } from "@/components/operations/priority-action-panel";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { KnowledgeCategoryFields } from "@/components/coaching/knowledge-category-fields";
import { createTrainingAssignment, updateTrainingAssignmentStatus } from "@/lib/feedback-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { riskLevelLabels } from "@/lib/labels";
import { createKnowledgeEntry } from "@/lib/quality-actions";
import { formatQualityScore, formatQualityScoreDelta } from "@/lib/score-display";

export const dynamic = "force-dynamic";

const dayMs = 24 * 60 * 60 * 1000;
const coachingViewIds = ["active", "overdue", "week", "mine", "unlinked", "done", "all"] as const;

type CoachingViewId = (typeof coachingViewIds)[number];
const primaryCoachingViewIds: CoachingViewId[] = ["active", "overdue", "week", "done"];

type CoachingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanParam(value: string | string[] | undefined) {
  return firstParam(value)?.trim() ?? "";
}

function selectedView(value: string | string[] | undefined): CoachingViewId {
  const candidate = firstParam(value);
  return coachingViewIds.includes(candidate as CoachingViewId) ? (candidate as CoachingViewId) : "active";
}

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

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isOverdue(date: Date | null, now: Date) {
  return Boolean(date && date.getTime() < startOfDay(now).getTime());
}

function isDueThisWeek(date: Date | null, now: Date) {
  if (!date) {
    return false;
  }

  const today = startOfDay(now).getTime();
  return date.getTime() >= today && date.getTime() < today + 7 * dayMs;
}

function viewHref(view: CoachingViewId, params: { q: string; assigneeId: string; category: string }) {
  const searchParams = new URLSearchParams();
  searchParams.set("view", view);

  if (params.q) {
    searchParams.set("q", params.q);
  }

  if (params.assigneeId) {
    searchParams.set("assigneeId", params.assigneeId);
  }

  if (params.category) {
    searchParams.set("category", params.category);
  }

  return `/coaching?${searchParams.toString()}`;
}

function statusRank(status: string) {
  if (status === "in_progress") {
    return 0;
  }

  if (status === "open") {
    return 1;
  }

  return 3;
}

export default function CoachingPage({ searchParams }: CoachingPageProps) {
  return (
    <Suspense fallback={<PageSkeleton label="Загрузка обучения" />}>
      <CoachingPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CoachingPageContent({ searchParams }: CoachingPageProps) {
  const [user, rawSearchParams] = await Promise.all([requireCurrentUserPermission("training:manage"), searchParams]);
  const now = new Date();
  const view = selectedView(rawSearchParams.view);
  const q = cleanParam(rawSearchParams.q);
  const assigneeId = cleanParam(rawSearchParams.assigneeId);
  const category = cleanParam(rawSearchParams.category);
  const createTaskOpen = cleanParam(rawSearchParams.create) === "1";
  const createRuleOpen = cleanParam(rawSearchParams.rule) === "1";
  const trainingWhere =
    user.role === "SUPPORT_AGENT"
      ? { workspaceId: user.workspaceId, assigneeId: user.id }
      : { workspaceId: user.workspaceId };
  const [rawAssignments, knowledgeEntries, supportUsers, reviewCandidates, agentScoreHistory] = await Promise.all([
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
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }]
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
    }),
    prisma.review.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: { not: null }
      },
      select: {
        totalScore: true,
        finalizedAt: true,
        conversation: { select: { assigneeName: true } }
      },
      orderBy: { finalizedAt: "desc" },
      take: 600
    })
  ]);
  const assignments = [...rawAssignments].sort((left, right) => {
    const leftOverdue = left.status !== "done" && isOverdue(left.dueAt, now);
    const rightOverdue = right.status !== "done" && isOverdue(right.dueAt, now);

    if (leftOverdue !== rightOverdue) {
      return leftOverdue ? -1 : 1;
    }

    const rankDiff = statusRank(left.status) - statusRank(right.status);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const leftDue = left.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return right.createdAt.getTime() - left.createdAt.getTime();
  });
  const openAssignments = assignments.filter((assignment) => assignment.status !== "done");
  const doneAssignments = assignments.filter((assignment) => assignment.status === "done");
  const overdueAssignments = openAssignments.filter((assignment) => isOverdue(assignment.dueAt, now));
  // Training effect: the agent's average score before the task was created vs after it was closed.
  // updatedAt of a done assignment approximates its completion moment.
  const trainingEffects = new Map<string, number>();
  for (const assignment of doneAssignments) {
    const before: number[] = [];
    const after: number[] = [];
    for (const review of agentScoreHistory) {
      if (!review.finalizedAt || review.conversation.assigneeName !== assignment.assigneeName) {
        continue;
      }
      if (review.finalizedAt < assignment.createdAt) {
        before.push(review.totalScore);
      } else if (review.finalizedAt > assignment.updatedAt) {
        after.push(review.totalScore);
      }
    }
    if (before.length >= 2 && after.length >= 2) {
      const beforeAverage = before.reduce((sum, value) => sum + value, 0) / before.length;
      const afterAverage = after.reduce((sum, value) => sum + value, 0) / after.length;
      trainingEffects.set(assignment.id, Math.round(afterAverage - beforeAverage));
    }
  }
  const trainingEffectValues = [...trainingEffects.values()];
  const averageTrainingEffect =
    trainingEffectValues.length > 0
      ? Math.round(trainingEffectValues.reduce((sum, value) => sum + value, 0) / trainingEffectValues.length)
      : null;
  const weekAssignments = openAssignments.filter((assignment) => isDueThisWeek(assignment.dueAt, now));
  const mineAssignments = openAssignments.filter((assignment) => assignment.assigneeId === user.id || assignment.assigneeName === user.name);
  const unlinkedAssignments = openAssignments.filter((assignment) => !assignment.reviewId);
  const criticalKnowledgeCount = knowledgeEntries.filter((entry) => entry.riskLevel === "CRITICAL" || entry.riskLevel === "HIGH").length;
  const linkedAssignmentCount = assignments.filter((assignment) => assignment.reviewId).length;
  const viewCounts: Record<CoachingViewId, number> = {
    active: openAssignments.length,
    overdue: overdueAssignments.length,
    week: weekAssignments.length,
    mine: mineAssignments.length,
    unlinked: unlinkedAssignments.length,
    done: doneAssignments.length,
    all: assignments.length
  };
  const viewOptions: Array<{ id: CoachingViewId; label: string; helper: string; icon: typeof Clock3 }> = [
    { id: "active", label: "Активные", helper: "Все незакрытые разборы", icon: ClipboardList },
    { id: "overdue", label: "Просрочено", helper: "Нужно разобрать первым", icon: TriangleAlert },
    { id: "week", label: "На неделе", helper: "Ближайшие сроки", icon: CalendarDays },
    { id: "mine", label: "Мои", helper: "Назначено текущему пользователю", icon: UserRound },
    { id: "unlinked", label: "Без проверки", helper: "Ручные задачи без тикета", icon: Link2 },
    { id: "done", label: "Закрытые", helper: "История разборов", icon: Archive },
    { id: "all", label: "Все", helper: "Полный список", icon: BookOpenCheck }
  ];
  const primaryViewOptions = viewOptions.filter((option) => primaryCoachingViewIds.includes(option.id));
  const secondaryViewOptions = viewOptions.filter((option) => !primaryCoachingViewIds.includes(option.id));
  const categoryOptions = Array.from(
    new Set([
      ...assignments.flatMap((assignment) => assignment.review?.findings.map((finding) => finding.category) ?? []),
      ...knowledgeEntries.map((entry) => entry.category)
    ])
  ).sort((left, right) => left.localeCompare(right, "ru"));
  const filteredAssignments = assignments.filter((assignment) => {
    const finding = assignment.review?.findings[0];
    const conversation = assignment.review?.conversation;
    const searchableText = [
      assignment.title,
      assignment.description,
      assignment.assigneeName,
      assignment.assignedBy?.name,
      conversation?.externalId,
      conversation?.subject,
      finding?.category,
      finding ? riskLevelLabels[finding.riskLevel] : null
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ru-RU");
    const matchesQuery = q ? searchableText.includes(q.toLocaleLowerCase("ru-RU")) : true;
    const matchesAssignee = assigneeId ? assignment.assigneeId === assigneeId : true;
    const matchesCategory = category ? assignment.review?.findings.some((findingItem) => findingItem.category === category) : true;
    const matchesView =
      view === "active"
        ? assignment.status !== "done"
        : view === "overdue"
          ? assignment.status !== "done" && isOverdue(assignment.dueAt, now)
          : view === "week"
            ? assignment.status !== "done" && isDueThisWeek(assignment.dueAt, now)
            : view === "mine"
              ? assignment.status !== "done" && (assignment.assigneeId === user.id || assignment.assigneeName === user.name)
              : view === "unlinked"
                ? assignment.status !== "done" && !assignment.reviewId
                : view === "done"
                  ? assignment.status === "done"
                  : true;

    return matchesQuery && matchesAssignee && matchesCategory && matchesView;
  });
  const selectedViewOption = viewOptions.find((option) => option.id === view) ?? viewOptions[0];
  const nextAssignment = overdueAssignments[0] ?? openAssignments[0];
  const nextConversation = nextAssignment?.review?.conversation;
  const nextFinding = nextAssignment?.review?.findings[0];
  const ruleFocusCategory = category || nextFinding?.category || "";
  const ruleCategoryDefault = ruleFocusCategory && categoryOptions.includes(ruleFocusCategory) ? ruleFocusCategory : "";
  const ruleFocusRiskLevel = nextFinding?.riskLevel ?? "MEDIUM";
  const activeCategoryCounts = openAssignments.reduce((acc, assignment) => {
    for (const finding of assignment.review?.findings ?? []) {
      acc.set(finding.category, (acc.get(finding.category) ?? 0) + 1);
    }

    return acc;
  }, new Map<string, number>());
  const contextualKnowledge = knowledgeEntries
    .filter((entry) => {
      if (nextFinding && entry.category === nextFinding.category) {
        return true;
      }

      if (category && entry.category === category) {
        return true;
      }

      return entry.riskLevel === "CRITICAL" || entry.riskLevel === "HIGH";
    })
    .slice(0, 5);
  const topCategories = Array.from(activeCategoryCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru"))
    .slice(0, 5);
  const quickCategories = topCategories.slice(0, 4);
  const isSecondaryViewSelected = secondaryViewOptions.some((option) => option.id === view);
  const resetFiltersHref = view === "active" ? "/coaching" : `/coaching?view=${view}`;
  const baseCoachingHref = viewHref(view, { q, assigneeId, category });
  const createTaskHref = `${baseCoachingHref}&create=1`;
  const createRuleHref = `${baseCoachingHref}&rule=1`;
  const closeCreatePanelHref = baseCoachingHref;
  const coachingActionHref = nextConversation ? `/reviews/${nextConversation.id}` : createTaskHref;
  const coachingActionTone = overdueAssignments.length > 0 ? "negative" : openAssignments.length > 0 ? "warning" : "positive";
  const measuredTrainingEffectCount = trainingEffects.size;
  const positiveTrainingEffectCount = trainingEffectValues.filter((value) => value > 0).length;
  const linkedAssignmentShare = assignments.length > 0 ? Math.round((linkedAssignmentCount / assignments.length) * 100) : 0;
  const outcomeItems = [
    {
      label: "Закрытие",
      value: `${doneAssignments.length}/${assignments.length}`,
      detail:
        assignments.length > 0
          ? `${Math.round((doneAssignments.length / assignments.length) * 100)}% всех разборов закрыто.`
          : "Разборы появятся после задач обучения."
    },
    {
      label: "Связь с QA",
      value: `${linkedAssignmentShare}%`,
      detail: `${linkedAssignmentCount} задач с проверкой и контекстом доказательств.`
    },
    {
      label: "Эффект",
      value: averageTrainingEffect == null ? "Нет данных" : formatQualityScoreDelta(averageTrainingEffect),
      detail:
        measuredTrainingEffectCount > 0
          ? `${positiveTrainingEffectCount} из ${measuredTrainingEffectCount} измеримых разборов дали рост.`
          : "Нужно минимум две оценки до и после закрытия задачи."
    },
    {
      label: "Нагрузка",
      value: overdueAssignments.length > 0 ? `${overdueAssignments.length} срочно` : `${openAssignments.length} активно`,
      detail: weekAssignments.length > 0 ? `${weekAssignments.length} задач со сроком на неделе.` : "Ближайшие сроки не перегружены."
    }
  ];

  return (
    <OperationalPageFrame
      title="Обучение"
      className="page-shell workspace-shell"
      signals={
        <>
      <div className="command-center command-center--split command-center--metrics coaching-command-center">
        <div className="min-w-0">
          <p className="page-kicker">Развитие качества</p>
          <h1 className="page-title">Обучение</h1>
          <p className="page-subtitle">
            Рабочая очередь разборов: сначала срочные задачи, затем контекст проверки и правило, которое нужно закрепить.
          </p>
          <div className="admin-actions coaching-command-actions mt-5">
            <Link href={createTaskOpen ? closeCreatePanelHref : createTaskHref} className={`action-button ${createTaskOpen ? "" : "action-button--primary"}`}>
              {createTaskOpen ? <X size={18} aria-hidden="true" /> : <PlusCircle size={18} aria-hidden="true" />}
              {createTaskOpen ? "Скрыть форму" : "Новая задача"}
            </Link>
            <Link href={createRuleOpen ? closeCreatePanelHref : createRuleHref} className={`action-button ${createRuleOpen ? "" : ""}`}>
              {createRuleOpen ? <X size={18} aria-hidden="true" /> : <BookOpenCheck size={18} aria-hidden="true" />}
              {createRuleOpen ? "Скрыть правило" : "Типовая ошибка"}
            </Link>
          </div>
        </div>
        <div className="learning-metrics" aria-label="Сводка обучения">
          <div className="learning-metric">
            <Clock3 size={16} aria-hidden="true" />
            <span>{openAssignments.length}</span>
            <small>в работе</small>
          </div>
          <div className={`learning-metric ${overdueAssignments.length > 0 ? "learning-metric--danger" : "learning-metric--success"}`}>
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{overdueAssignments.length}</span>
            <small>просрочено</small>
          </div>
          <div className="learning-metric learning-metric--success">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{doneAssignments.length}</span>
            <small>закрыто</small>
          </div>
          {averageTrainingEffect != null ? (
            <div className={`learning-metric ${averageTrainingEffect >= 0 ? "learning-metric--success" : "learning-metric--danger"}`}>
              <TrendingUp size={16} aria-hidden="true" />
              <span>{formatQualityScoreDelta(averageTrainingEffect)}</span>
              <small>эффект обучения</small>
            </div>
          ) : null}
          <div className="learning-metric">
            <BookOpenCheck size={16} aria-hidden="true" />
            <span>{criticalKnowledgeCount}</span>
            <small>важных правил</small>
          </div>
        </div>
      </div>

        </>
      }
      action={
        <PriorityActionPanel
          title={nextAssignment ? nextAssignment.title : "Создать следующий разбор"}
          description={
            nextAssignment
              ? `${nextAssignment.assigneeName} / ${dueText(nextAssignment.dueAt)}. Сначала закройте этот coaching follow-up.`
              : "Активных разборов нет. Создайте задачу из проверки с замечанием или добавьте ручной разбор."
          }
          actionLabel={nextConversation ? "Открыть проверку" : "Новая задача"}
          href={coachingActionHref}
          tone={coachingActionTone}
        />
      }
      details={
        <>

      {createTaskOpen ? (
        <section className="training-create-panel workflow-create-panel coaching-create-inline" aria-label="Новая учебная задача">
          <div className="learning-section-header coaching-create-inline__header">
            <div className="min-w-0">
              <h2>Новая учебная задача</h2>
              <p>Привяжите задачу к проверке, чтобы оператор сразу видел контекст ошибки.</p>
            </div>
            <Link href={closeCreatePanelHref} className="action-button">
              Скрыть
            </Link>
          </div>
          <form action={createTrainingAssignment} className="training-create-form coaching-create-inline__form">
            <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
              Исполнитель
              <select name="assigneeId" required className="form-control">
                <option value="">Выберите оператора</option>
                {supportUsers.map((supportUser) => (
                  <option key={supportUser.id} value={supportUser.id}>
                    {supportUser.name}
                    {supportUser.teamName ? ` / ${supportUser.teamName}` : ""}
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
                    {review.conversation.externalId} / {review.findings[0]?.category ?? review.conversation.subject}
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
        </section>
      ) : null}

      {createRuleOpen ? (
        <section className="training-create-panel workflow-create-panel coaching-create-inline" aria-label="Новая типовая ошибка">
          <div className="learning-section-header coaching-create-inline__header">
            <div className="min-w-0">
              <h2>Новая типовая ошибка</h2>
              <p>
                Правило появится в блоке “Правила для разбора”
                {ruleFocusCategory ? ` для категории “${ruleFocusCategory}”` : " для похожих разборов"}.
              </p>
            </div>
            <Link href={closeCreatePanelHref} className="action-button">
              Скрыть
            </Link>
          </div>
          <form action={createKnowledgeEntry} className="training-create-form coaching-create-inline__form coaching-rule-form">
            <KnowledgeCategoryFields categories={categoryOptions} defaultCategory={ruleCategoryDefault} />
            <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
              Риск
              <select name="riskLevel" defaultValue={ruleFocusRiskLevel} className="form-control">
                {Object.entries(riskLevelLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="training-create-form__title grid gap-1 text-sm font-medium text-[var(--foreground)]">
              Название правила
              <input name="title" required placeholder="Например: передача без объяснения клиенту" className="form-control" />
            </label>
            <label className="training-create-form__description grid gap-1 text-sm font-medium text-[var(--foreground)]">
              Описание ошибки
              <textarea name="description" required rows={3} placeholder="Что именно повторяется в проверках и почему это риск." className="form-control" />
            </label>
            <label className="training-create-form__description grid gap-1 text-sm font-medium text-[var(--foreground)]">
              Рекомендация
              <textarea name="recommendation" required rows={3} placeholder="Как оператор должен действовать в похожем случае." className="form-control" />
            </label>
            <div className="training-create-form__action">
              <ValidatedSubmitButton>Сохранить правило</ValidatedSubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      <section className="coaching-outcome-board panel" aria-label="Контур результата обучения">
        <div className="coaching-outcome-board__lead">
          <span className="page-kicker">Контур результата</span>
          <h2>От разбора к изменению качества</h2>
          <p>Сводка показывает, закрываются ли задачи, связаны ли они с проверками и появился ли измеримый эффект.</p>
        </div>
        <div className="coaching-outcome-board__items">
          {outcomeItems.map((item) => (
            <div key={item.label} className="coaching-outcome-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="coaching-rule-strip panel" aria-label="Правила для разбора">
        <div className="learning-section-header coaching-rule-strip__header">
          <div className="min-w-0">
            <h2>Правила для разбора</h2>
            <p>
              {ruleFocusCategory
                ? `Показываем правила для категории “${ruleFocusCategory}”.`
                : "Показываем критичные правила, которые стоит держать перед глазами."}
            </p>
          </div>
          <Link href={createRuleHref} className="action-button">
            <BookOpenCheck size={16} aria-hidden="true" />
            Добавить правило
          </Link>
        </div>
        <div className="coaching-rule-list">
          {contextualKnowledge.length > 0 ? (
            contextualKnowledge.slice(0, 3).map((entry) => (
              <article key={entry.id} className="coaching-rule-card">
                <div className="knowledge-compact-card__head">
                  <span className="pill pill--neutral">{entry.category}</span>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{riskLevelLabels[entry.riskLevel]}</span>
                </div>
                <h3>{entry.title}</h3>
                <p>{entry.recommendation}</p>
              </article>
            ))
          ) : (
            <div className="empty-state empty-state--compact coaching-rule-empty">
              <h3>Нет правила для текущего фокуса</h3>
              <p>Добавьте типовую ошибку, и она будет показываться здесь для похожих разборов.</p>
            </div>
          )}
        </div>
      </section>

      <section className="coaching-control-panel panel" aria-label="Срезы и фильтры обучения">
        <div className="learning-section-header coaching-control-panel__header">
          <div className="min-w-0">
            <h2>Очередь обучения</h2>
            <p>{selectedViewOption.helper}. Показано {filteredAssignments.length} из {assignments.length}.</p>
          </div>
          <span className="pill pill--neutral">{filteredAssignments.length} показано</span>
        </div>
        <div className="coaching-control-stack">
          <div className="coaching-segment-row">
            <nav className="coaching-segment-list" aria-label="Основные срезы обучения">
              {primaryViewOptions.map((option) => {
                const Icon = option.icon;

                return (
                  <Link
                    key={option.id}
                    href={viewHref(option.id, { q, assigneeId, category })}
                    aria-current={option.id === view ? "page" : undefined}
                    className={`coaching-segment ${option.id === view ? "coaching-segment--active" : ""} ${
                      option.id === "overdue" && viewCounts.overdue > 0 ? "coaching-segment--warning" : ""
                    }`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{option.label}</span>
                    <strong>{viewCounts[option.id]}</strong>
                  </Link>
                );
              })}
            </nav>
            <details className={`coaching-more-views ${isSecondaryViewSelected ? "coaching-more-views--active" : ""}`}>
              <summary>
                <MoreHorizontal size={16} aria-hidden="true" />
                <span>{isSecondaryViewSelected ? selectedViewOption.label : "Еще"}</span>
              </summary>
              <div className="coaching-more-views__menu">
                {secondaryViewOptions.map((option) => {
                  const Icon = option.icon;

                  return (
                    <Link
                      key={option.id}
                      href={viewHref(option.id, { q, assigneeId, category })}
                      aria-current={option.id === view ? "page" : undefined}
                      className={option.id === view ? "coaching-more-views__item coaching-more-views__item--active" : "coaching-more-views__item"}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>{option.label}</span>
                      <strong>{viewCounts[option.id]}</strong>
                    </Link>
                  );
                })}
              </div>
            </details>
          </div>

          <AutoSubmitFilterForm action="/coaching" className="coaching-filter-bar" debounceMs={350}>
            <input type="hidden" name="view" value={view} />
            <label className="coaching-filter-bar__search">
              Поиск
              <span className="coaching-search-control">
                <Search size={15} aria-hidden="true" />
                <input name="q" type="search" defaultValue={q} placeholder="Задача, тикет, категория" className="form-control" />
              </span>
            </label>
            <label>
              Исполнитель
              <select name="assigneeId" defaultValue={assigneeId} className="form-control">
                <option value="">Все операторы</option>
                {supportUsers.map((supportUser) => (
                  <option key={supportUser.id} value={supportUser.id}>
                    {supportUser.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Категория
              <select name="category" defaultValue={category} className="form-control">
                <option value="">Все категории</option>
                {categoryOptions.map((categoryOption) => (
                  <option key={categoryOption} value={categoryOption}>
                    {categoryOption}
                  </option>
                ))}
              </select>
            </label>
            {q || assigneeId || category ? (
              <Link href={resetFiltersHref} className="action-button coaching-filter-bar__reset">
                <SlidersHorizontal size={15} aria-hidden="true" />
                Сбросить
              </Link>
            ) : null}
          </AutoSubmitFilterForm>

          <div className="coaching-quick-categories" aria-label="Частые категории активных задач">
            <span>Часто:</span>
            {category ? (
              <Link href={viewHref(view, { q, assigneeId, category: "" })} className="coaching-quick-chip">
                Все категории
              </Link>
            ) : null}
            {quickCategories.length > 0 ? (
              quickCategories.map(([categoryName, count]) => (
                <Link
                  key={categoryName}
                  href={viewHref(view, { q, assigneeId, category: categoryName })}
                  className={`coaching-quick-chip ${category === categoryName ? "coaching-quick-chip--active" : ""}`}
                >
                  <span>{categoryName}</span>
                  <strong>{count}</strong>
                </Link>
              ))
            ) : (
              <span className="coaching-quick-categories__empty">Категории появятся после привязки задач к проверкам.</span>
            )}
          </div>
        </div>
      </section>

      <section className="coaching-workbench" aria-label="Рабочая область обучения">
        <div className="coaching-board panel">
          <div className="learning-section-header coaching-board__header">
            <div className="min-w-0">
              <h2>{selectedViewOption.label}</h2>
              <p>{selectedViewOption.helper}. Показано {filteredAssignments.length} из {assignments.length}.</p>
            </div>
            <span className="pill pill--neutral">{filteredAssignments.length}</span>
          </div>

          <div className="learning-task-list coaching-task-list">
            {filteredAssignments.length > 0 ? (
              filteredAssignments.map((assignment) => {
                const overdue = assignment.status !== "done" && isOverdue(assignment.dueAt, now);
                const dueThisWeek = assignment.status !== "done" && isDueThisWeek(assignment.dueAt, now);
                const conversation = assignment.review?.conversation;
                const finding = assignment.review?.findings[0];
                const isPriority = nextAssignment?.id === assignment.id;
                const trainingEffect = trainingEffects.get(assignment.id);

                return (
                  <article
                    key={assignment.id}
                    className={`learning-task coaching-task-row ${overdue ? "learning-task--urgent coaching-task-row--urgent" : ""} ${
                      isPriority ? "learning-task--priority coaching-task-row--priority" : ""
                    }`}
                  >
                    <div className="learning-task__marker" aria-hidden="true">
                      <BookOpenCheck size={17} />
                    </div>
                    <div className="learning-task__content">
                      <div className="learning-task__head coaching-task-row__head">
                        <h3>{assignment.title}</h3>
                        {isPriority ? <span className="pill pill--warn">Следующий</span> : null}
                        <span className={`pill ${trainingStatusClassName(assignment.status)}`}>
                          {trainingStatusLabel(assignment.status)}
                        </span>
                      </div>
                      <p className="learning-task__description">{assignment.description}</p>
                      <div className="learning-task__meta coaching-task-row__meta">
                        <span>{assignment.assigneeName}</span>
                        <span className={overdue ? "learning-task__meta-chip--warning" : dueThisWeek ? "coaching-task-row__meta-chip--soon" : undefined}>
                          {dueText(assignment.dueAt)}
                        </span>
                        {conversation ? <span>{conversation.externalId}</span> : <span>без проверки</span>}
                        {finding ? <span>{finding.category}</span> : null}
                        {finding ? <span>{riskLevelLabels[finding.riskLevel]}</span> : null}
                        {assignment.review ? <span>{formatQualityScore(assignment.review.totalScore)}</span> : null}
                        {assignment.review?.needsReanswer ? <span>переответ</span> : null}
                        {trainingEffect != null ? (
                          <span className={trainingEffect >= 0 ? "training-effect training-effect--up" : "training-effect training-effect--down"}>
                            {formatQualityScoreDelta(trainingEffect)} после разбора
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="learning-task__actions coaching-task-row__actions">
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
                <h3>В этом срезе нет задач</h3>
                <p>Измените фильтры или создайте учебную задачу из проверки с замечанием.</p>
              </div>
            )}
          </div>
        </div>
      </section>
        </>
      }
      evidence={
        <EvidenceDrawer title="Evidence обучения" defaultOpen>
          <div className="operational-evidence-grid">
            <div className="operational-evidence-item">
              <span>Активные</span>
              <strong>{openAssignments.length}</strong>
              <small>Все незакрытые coaching и training задачи.</small>
            </div>
            <div className="operational-evidence-item">
              <span>Просрочено</span>
              <strong>{overdueAssignments.length}</strong>
              <small>{overdueAssignments.length > 0 ? "Эти разборы поднимаются в основной action." : "Сроки активных разборов под контролем."}</small>
            </div>
            <div className="operational-evidence-item">
              <span>Связано с QA</span>
              <strong>{linkedAssignmentCount}</strong>
              <small>Задачи с привязкой к проверке и тикету.</small>
            </div>
            <div className="operational-evidence-item">
              <span>Правила</span>
              <strong>{criticalKnowledgeCount}</strong>
              <small>HIGH/CRITICAL правила, доступные для разбора.</small>
            </div>
          </div>
        </EvidenceDrawer>
      }
    />
  );
}
