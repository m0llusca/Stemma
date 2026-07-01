import Link from "next/link";
import {
  Archive,
  ArrowRight,
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
  Sparkles,
  Target,
  TriangleAlert,
  UserRound,
  X
} from "lucide-react";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { StatKpi } from "@/components/ui/stat-kpi";
import { TriageStrip, type TriageStripTone } from "@/components/ui/triage-strip";
import { TrendChart } from "@/components/reports/trend-chart";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { KnowledgeCategoryFields } from "@/components/coaching/knowledge-category-fields";
import { ToastActionForm } from "@/app/coaching/toast-action-form";
import { createTrainingAssignmentState, updateTrainingAssignmentStatusState } from "@/lib/feedback-actions";
import { createCoachingPlanState, updateCoachingPlanStatusState } from "@/lib/coaching-plan-actions";
import { listCoachingPlans } from "@/lib/coaching-plan";
import { loadAssignmentCoachingImpact, type CoachingImpact } from "@/lib/coaching-impact";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { riskLevelLabels } from "@/lib/labels";
import { createKnowledgeEntryState } from "@/lib/quality-actions";
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

function trainingStatusTone(status: string): ChipTone {
  if (status === "done") {
    return "success";
  }

  if (status === "in_progress") {
    return "warning";
  }

  return "neutral";
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

function planStatusLabel(status: string) {
  return status === "completed" ? "Завершён" : "Активный";
}

function planStatusTone(status: string): ChipTone {
  return status === "completed" ? "success" : "accent";
}

/**
 * Renders the C2 coaching-impact metric as a compact Russian "до X → после Y"
 * line. Returns null when either window lacks reviews (trend "insufficient"),
 * so the UI silently omits the metric instead of showing a misleading delta.
 */
function impactSummary(impact: CoachingImpact) {
  if (impact.trend === "insufficient" || impact.beforeAvg == null || impact.afterAvg == null || impact.delta == null) {
    return null;
  }

  return {
    text: `до ${formatQualityScore(impact.beforeAvg)} → после ${formatQualityScore(impact.afterAvg)}, ${formatQualityScoreDelta(impact.delta)}`,
    trend: impact.trend,
    sampleAdequate: impact.sampleAdequate
  };
}

function impactTone(trend: CoachingImpact["trend"]): ChipTone {
  if (trend === "up") {
    return "success";
  }

  if (trend === "down") {
    return "danger";
  }

  return "neutral";
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
  const createPlanOpen = cleanParam(rawSearchParams.plan) === "1";
  const trainingWhere =
    user.role === "SUPPORT_AGENT"
      ? { workspaceId: user.workspaceId, assigneeId: user.id }
      : { workspaceId: user.workspaceId };
  const [rawAssignments, knowledgeEntries, supportUsers, reviewCandidates, agentScoreHistory, coachingPlans] = await Promise.all([
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
    }),
    listCoachingPlans(user.workspaceId)
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
  // Coaching impact (Workstream C2): for every completed assignment, compute the
  // before/after score delta around its completion moment (updatedAt = pivot).
  // Loaded through C2's loadAssignmentCoachingImpact so the page owns no scoring
  // math of its own. Keyed by assignment id for per-row display and grouped by
  // plan id so each coaching plan shows its strongest measured result.
  const assignmentImpacts = new Map<string, CoachingImpact>();
  await Promise.all(
    doneAssignments.map(async (assignment) => {
      const impact = await loadAssignmentCoachingImpact(
        {
          workspaceId: user.workspaceId,
          assigneeName: assignment.assigneeName,
          pivot: assignment.updatedAt
        },
        prisma
      );
      assignmentImpacts.set(assignment.id, impact);
    })
  );
  // Best measured impact per plan: prefer the assignment with the largest
  // positive delta so a plan headlines its most convincing win.
  const planImpacts = new Map<string, CoachingImpact>();
  for (const assignment of doneAssignments) {
    if (!assignment.coachingPlanId) {
      continue;
    }
    const impact = assignmentImpacts.get(assignment.id);
    if (!impact || impact.delta == null) {
      continue;
    }
    const current = planImpacts.get(assignment.coachingPlanId);
    if (!current || current.delta == null || impact.delta > current.delta) {
      planImpacts.set(assignment.coachingPlanId, impact);
    }
  }
  const assignmentsByPlan = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    if (!assignment.coachingPlanId) {
      continue;
    }
    const bucket = assignmentsByPlan.get(assignment.coachingPlanId);
    if (bucket) {
      bucket.push(assignment);
    } else {
      assignmentsByPlan.set(assignment.coachingPlanId, [assignment]);
    }
  }
  const activePlanCount = coachingPlans.filter((plan) => plan.status === "active").length;
  const weekAssignments = openAssignments.filter((assignment) => isDueThisWeek(assignment.dueAt, now));
  const mineAssignments = openAssignments.filter((assignment) => assignment.assigneeId === user.id || assignment.assigneeName === user.name);
  const unlinkedAssignments = openAssignments.filter((assignment) => !assignment.reviewId);
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
  const isSecondaryViewSelected = secondaryViewOptions.some((option) => option.id === view);
  const resetFiltersHref = view === "active" ? "/coaching" : `/coaching?view=${view}`;
  const baseCoachingHref = viewHref(view, { q, assigneeId, category });
  const createTaskHref = `${baseCoachingHref}&create=1`;
  const createRuleHref = `${baseCoachingHref}&rule=1`;
  const createPlanHref = `${baseCoachingHref}&plan=1`;
  const closeCreatePanelHref = baseCoachingHref;
  const coachingActionHref = nextConversation ? `/reviews/${nextConversation.id}` : createTaskHref;
  const coachingActionTone = overdueAssignments.length > 0 ? "negative" : openAssignments.length > 0 ? "warning" : "positive";
  // Team score-over-time: bucket finalized review scores by month (oldest -> newest)
  // for the TrendChart. Volume = number of reviews in the bucket.
  const scoreBuckets = new Map<string, { sum: number; count: number; order: number }>();
  for (const review of agentScoreHistory) {
    if (!review.finalizedAt) {
      continue;
    }
    const date = review.finalizedAt;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const order = date.getFullYear() * 12 + date.getMonth();
    const bucket = scoreBuckets.get(key);
    if (bucket) {
      bucket.sum += review.totalScore;
      bucket.count += 1;
    } else {
      scoreBuckets.set(key, { sum: review.totalScore, count: 1, order });
    }
  }
  const scoreTrend = [...scoreBuckets.entries()]
    .sort((left, right) => left[1].order - right[1].order)
    .slice(-8)
    .map(([key, bucket]) => {
      const [, month] = key.split("-");
      return {
        label: `${month}`,
        value: Math.round(bucket.sum / bucket.count),
        volume: bucket.count
      };
    });
  const trendPoints = scoreTrend.map((point) => ({ label: point.label, value: point.value }));
  const trendVolume = scoreTrend.map((point) => point.volume);
  const measuredTrainingEffectCount = trainingEffects.size;
  const positiveTrainingEffectCount = trainingEffectValues.filter((value) => value > 0).length;
  const linkedAssignmentShare = assignments.length > 0 ? Math.round((linkedAssignmentCount / assignments.length) * 100) : 0;

  const coachingTriageTone: TriageStripTone =
    coachingActionTone === "negative" ? "danger" : coachingActionTone === "warning" ? "warning" : "success";

  return (
    <PageShell
      eyebrow="Развитие качества"
      title="Обучение"
      description="Рабочая очередь разборов: сначала срочные задачи, затем контекст проверки и правило, которое нужно закрепить."
      actions={
        <>
          <Link href={createTaskOpen ? closeCreatePanelHref : createTaskHref} className={`action-button ${createTaskOpen ? "" : "action-button--primary"}`}>
            {createTaskOpen ? <X size={18} aria-hidden="true" /> : <PlusCircle size={18} aria-hidden="true" />}
            {createTaskOpen ? "Скрыть форму" : "Новая задача"}
          </Link>
          <Link href={createRuleOpen ? closeCreatePanelHref : createRuleHref} className="action-button">
            {createRuleOpen ? <X size={18} aria-hidden="true" /> : <BookOpenCheck size={18} aria-hidden="true" />}
            {createRuleOpen ? "Скрыть правило" : "Типовая ошибка"}
          </Link>
        </>
      }
    >
      <TriageStrip
        tone={coachingTriageTone}
        icon={overdueAssignments.length > 0 ? <TriangleAlert size={18} aria-hidden="true" /> : <ClipboardList size={18} aria-hidden="true" />}
        title={nextAssignment ? nextAssignment.title : "Создать следующий разбор"}
        description={
          nextAssignment
            ? `${nextAssignment.assigneeName} · ${dueText(nextAssignment.dueAt)}. Сначала закройте этот разбор.`
            : "Активных разборов нет. Создайте задачу из проверки с замечанием или добавьте ручной разбор."
        }
        action={
          <Link href={coachingActionHref} className="action-button action-button--primary">
            {nextConversation ? "Открыть проверку" : "Новая задача"}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />

      <div className="enablement-kpi-grid" aria-label="Ключевые показатели обучения">
        <StatKpi
          label="В работе"
          value={openAssignments.length}
          icon={<Clock3 size={16} aria-hidden="true" />}
          hint={weekAssignments.length > 0 ? `${weekAssignments.length} со сроком на неделе` : "Сроки под контролем"}
        />
        <StatKpi
          label="Просрочено"
          value={overdueAssignments.length}
          tone={overdueAssignments.length > 0 ? "danger" : "neutral"}
          icon={<TriangleAlert size={16} aria-hidden="true" />}
          hint={overdueAssignments.length > 0 ? "Поднимаются в начало очереди" : "Просроченных разборов нет"}
        />
        <StatKpi
          label="Эффект обучения"
          value={averageTrainingEffect == null ? "—" : formatQualityScoreDelta(averageTrainingEffect)}
          tone={averageTrainingEffect != null && averageTrainingEffect !== 0 ? (averageTrainingEffect > 0 ? "success" : "danger") : "neutral"}
          icon={<BookOpenCheck size={16} aria-hidden="true" />}
          hint={
            measuredTrainingEffectCount > 0
              ? `${positiveTrainingEffectCount} из ${measuredTrainingEffectCount} разборов дали рост`
              : "Нужны оценки до и после"
          }
        />
        <StatKpi
          label="Связь с QA"
          value={linkedAssignmentShare}
          unit="%"
          icon={<Link2 size={16} aria-hidden="true" />}
          hint={
            assignments.length > 0
              ? `${linkedAssignmentCount} задач с проверкой · закрыто ${doneAssignments.length}/${assignments.length}`
              : "Разборов пока нет"
          }
        />
      </div>

      {trendPoints.length >= 2 || topCategories.length > 0 ? (
        <section className="coaching-trend-board panel" aria-label="Динамика качества и зоны роста">
          <div className="coaching-trend-board__chart">
            <div className="coaching-trend-board__chart-head">
              <span className="page-kicker">Качество во времени</span>
              <h2>Средний балл команды</h2>
              <p>Динамика финальных проверок по месяцам. Закрытые разборы должны двигать линию вверх.</p>
            </div>
            {trendPoints.length >= 2 ? (
              <TrendChart
                points={trendPoints}
                volume={trendVolume}
                height={120}
                ariaLabel="Средний балл команды по месяцам"
              />
            ) : (
              <EmptyState
                size="inline"
                icon={<BookOpenCheck size={20} aria-hidden="true" />}
                title="Недостаточно данных для тренда"
                description="Линия появится после финальных проверок за несколько месяцев."
              />
            )}
          </div>
          <div className="coaching-trend-board__opportunities">
            <div className="coaching-trend-board__opportunities-head">
              <h3>Зоны роста</h3>
              <p>Категории с наибольшим числом активных разборов.</p>
            </div>
            {topCategories.length > 0 ? (
              <ol className="coaching-opportunity-list">
                {topCategories.map(([categoryName, count], index) => (
                  <li key={categoryName} className="coaching-opportunity">
                    <span className="coaching-opportunity__rank" aria-hidden="true">{index + 1}</span>
                    <span className="coaching-opportunity__name">{categoryName}</span>
                    <Chip tone="neutral" size="xs" numeric>{count}</Chip>
                    <Link
                      href={viewHref(view, { q, assigneeId, category: categoryName })}
                      className="coaching-opportunity__action"
                    >
                      <PlusCircle size={14} aria-hidden="true" />
                      <span>В обучение</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                size="inline"
                icon={<ClipboardList size={20} aria-hidden="true" />}
                title="Зон роста пока нет"
                description="Категории появятся после привязки разборов к проверкам."
              />
            )}
          </div>
        </section>
      ) : null}

      <section className="coaching-plan-board panel" aria-label="Планы коучинга">
        <div className="learning-section-header coaching-plan-board__header">
          <div className="min-w-0">
            <h2>Планы коучинга</h2>
            <p>
              {coachingPlans.length > 0
                ? `Развитие операторов по фокус-темам. Активных планов: ${activePlanCount}.`
                : "Сгруппируйте разборы оператора под одной темой развития и отслеживайте прогресс."}
            </p>
          </div>
          <Link
            href={createPlanOpen ? closeCreatePanelHref : createPlanHref}
            className={`action-button ${createPlanOpen ? "" : "action-button--primary"}`}
          >
            {createPlanOpen ? <X size={16} aria-hidden="true" /> : <Target size={16} aria-hidden="true" />}
            {createPlanOpen ? "Скрыть форму" : "Новый план"}
          </Link>
        </div>

        {createPlanOpen ? (
          <ToastActionForm
            action={createCoachingPlanState}
            className="coaching-plan-form"
            aria-label="Новый план коучинга"
          >
            <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
              Оператор
              <select name="agentName" required className="form-control">
                <option value="">Выберите оператора</option>
                {supportUsers.map((supportUser) => (
                  <option key={supportUser.id} value={supportUser.name}>
                    {supportUser.name}
                    {supportUser.teamName ? ` / ${supportUser.teamName}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
              Фокус-тема
              <input name="focusArea" placeholder="Например: работа с возражениями" className="form-control" />
            </label>
            <label className="coaching-plan-form__title grid gap-1 text-sm font-medium text-[var(--foreground)]">
              Название плана
              <input name="title" required placeholder="Например: рост качества по эмпатии" className="form-control" />
            </label>
            <div className="coaching-plan-form__action">
              <ValidatedSubmitButton>Создать план</ValidatedSubmitButton>
            </div>
          </ToastActionForm>
        ) : null}

        {coachingPlans.length > 0 ? (
          <ul className="coaching-plan-list">
            {coachingPlans.map((plan) => {
              const planAssignments = assignmentsByPlan.get(plan.id) ?? [];
              const planImpact = planImpacts.get(plan.id);
              const summary = planImpact ? impactSummary(planImpact) : null;

              return (
                <li key={plan.id} className="coaching-plan-card">
                  <div className="coaching-plan-card__head">
                    <div className="coaching-plan-card__title">
                      <Target size={16} aria-hidden="true" />
                      <h3>{plan.title}</h3>
                    </div>
                    <Chip tone={planStatusTone(plan.status)} size="xs">
                      {planStatusLabel(plan.status)}
                    </Chip>
                  </div>
                  <div className="coaching-plan-card__meta">
                    <span className="coaching-plan-card__agent">
                      <UserRound size={14} aria-hidden="true" />
                      {plan.agentName}
                    </span>
                    {plan.focusArea ? <span>{plan.focusArea}</span> : null}
                  </div>
                  <div className="coaching-plan-card__progress" aria-label="Прогресс плана">
                    <div
                      className="coaching-plan-card__progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={plan.progress.total}
                      aria-valuenow={plan.progress.done}
                    >
                      <span
                        className="coaching-plan-card__progress-fill"
                        style={{ width: `${plan.progress.percent}%` }}
                      />
                    </div>
                    <span className="coaching-plan-card__progress-label">
                      {plan.progress.done}/{plan.progress.total} закрыто
                    </span>
                  </div>
                  {summary ? (
                    <div className={`coaching-plan-card__impact coaching-plan-card__impact--${summary.trend}`}>
                      <Sparkles size={14} aria-hidden="true" />
                      <span>Эффект коучинга: {summary.text}</span>
                      <Chip tone={impactTone(summary.trend)} size="xs">
                        {formatQualityScoreDelta(planImpact?.delta ?? 0)}
                      </Chip>
                      {summary.sampleAdequate ? null : (
                        <Chip tone="neutral" size="xs">
                          мало данных для вывода
                        </Chip>
                      )}
                    </div>
                  ) : null}
                  {planAssignments.length > 0 ? (
                    <ul className="coaching-plan-card__assignments">
                      {planAssignments.map((assignment) => {
                        const assignmentImpact = assignmentImpacts.get(assignment.id);
                        const assignmentSummary = assignmentImpact ? impactSummary(assignmentImpact) : null;

                        return (
                          <li key={assignment.id} className="coaching-plan-assignment">
                            <span className="coaching-plan-assignment__title">{assignment.title}</span>
                            <Chip tone={trainingStatusTone(assignment.status)} size="xs">
                              {trainingStatusLabel(assignment.status)}
                            </Chip>
                            {assignmentSummary ? (
                              <span className={`coaching-plan-assignment__impact coaching-plan-assignment__impact--${assignmentSummary.trend}`}>
                                {assignmentSummary.text}
                                {assignmentSummary.sampleAdequate ? "" : " · мало данных для вывода"}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="coaching-plan-card__empty">К плану ещё не привязаны разборы.</p>
                  )}
                  <div className="coaching-plan-card__actions">
                    <ToastActionForm action={updateCoachingPlanStatusState} aria-label="Сменить статус плана">
                      <input type="hidden" name="id" value={plan.id} />
                      <input type="hidden" name="status" value={plan.status === "completed" ? "active" : "completed"} />
                      <button type="submit" className="action-button">
                        {plan.status === "completed" ? (
                          <>
                            <ArrowRight size={15} aria-hidden="true" />
                            Возобновить
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={15} aria-hidden="true" />
                            Завершить
                          </>
                        )}
                      </button>
                    </ToastActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            size="inline"
            icon={<Target size={20} aria-hidden="true" />}
            title="Планов коучинга пока нет"
            description="Создайте план, чтобы вести развитие оператора по конкретной теме и видеть эффект до и после."
            action={
              <Link href={createPlanHref} className="action-button action-button--primary">
                <Target size={16} aria-hidden="true" />
                Новый план
              </Link>
            }
          />
        )}
      </section>

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
          <ToastActionForm
            action={createTrainingAssignmentState}
            className="training-create-form coaching-create-inline__form"
            aria-label="Новая учебная задача"
          >
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
          </ToastActionForm>
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
          <ToastActionForm action={createKnowledgeEntryState} className="training-create-form coaching-create-inline__form coaching-rule-form">
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
          </ToastActionForm>
        </section>
      ) : null}

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
            contextualKnowledge.slice(0, 3).map((entry) => {
              const riskTone: ChipTone =
                entry.riskLevel === "CRITICAL" || entry.riskLevel === "HIGH" ? "warning" : "neutral";

              return (
                <article key={entry.id} className="coaching-rule-card">
                  <div className="coaching-rule-card__head">
                    <span className="coaching-rule-card__category">{entry.category}</span>
                    <Chip tone={riskTone} size="xs">
                      {riskLevelLabels[entry.riskLevel]}
                    </Chip>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.recommendation}</p>
                  <Link href={createTaskHref} className="coaching-rule-card__action">
                    <PlusCircle size={14} aria-hidden="true" />
                    Добавить в обучение
                  </Link>
                </article>
              );
            })
          ) : (
            <EmptyState
              size="inline"
              className="coaching-rule-empty"
              icon={<BookOpenCheck size={20} aria-hidden="true" />}
              title="Нет правила для текущего фокуса"
              description="Добавьте типовую ошибку кнопкой выше — она будет показываться здесь для похожих разборов."
            />
          )}
        </div>
      </section>

      <section className="coaching-workbench" aria-label="Рабочая область обучения">
        <div className="coaching-board panel">
          <div className="learning-section-header coaching-board__header">
            <div className="min-w-0">
              <h2>{selectedViewOption.label}</h2>
              <p>{selectedViewOption.helper}.</p>
            </div>
            <Chip tone="neutral" numeric>{filteredAssignments.length}</Chip>
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
                        {isPriority ? (
                          <Chip tone="accent" size="xs">Следующий</Chip>
                        ) : null}
                        <Chip tone={trainingStatusTone(assignment.status)} size="xs">
                          {trainingStatusLabel(assignment.status)}
                        </Chip>
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
                      <ToastActionForm action={updateTrainingAssignmentStatusState}>
                        <input type="hidden" name="id" value={assignment.id} />
                        <input type="hidden" name="status" value={assignment.status === "done" ? "open" : "done"} />
                        <button type="submit" className="action-button action-button--primary">
                          {assignment.status === "done" ? "Вернуть" : "Готово"}
                        </button>
                      </ToastActionForm>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState
                icon={<ClipboardList size={24} aria-hidden="true" />}
                title="В этом срезе нет задач"
                description="Измените фильтры или создайте учебную задачу из проверки с замечанием."
                action={
                  <Link href={createTaskHref} className="action-button action-button--primary">
                    <PlusCircle size={16} aria-hidden="true" />
                    Новая задача
                  </Link>
                }
              />
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
