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
import { KnowledgeCategoryFields } from "@/components/coaching/knowledge-category-fields";
import { SparklineChart, type ChartDatum } from "@/components/reports/report-charts";
import { ToastActionForm } from "@/app/coaching/toast-action-form";
import { CoachingViewNavLink } from "@/app/coaching/coaching-view-nav-link";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageShell } from "@/components/ui/page-shell";
import { StatKpi } from "@/components/ui/stat-kpi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { TriageStrip, type TriageStripTone } from "@/components/ui/triage-strip";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createTrainingAssignmentState, updateTrainingAssignmentStatusState } from "@/lib/feedback-actions";
import { createCoachingPlanState, updateCoachingPlanStatusState } from "@/lib/coaching-plan-actions";
import { listCoachingPlans } from "@/lib/coaching-plan";
import { loadAssignmentCoachingImpact, trainingEffectKpiHint, type CoachingImpact } from "@/lib/coaching-impact";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { riskLevelLabels } from "@/lib/labels";
import { formatReviewCount } from "@/lib/reports/report-format";
import { createKnowledgeEntryState } from "@/lib/quality-actions";
import { formatQualityScore, formatQualityScoreDelta } from "@/lib/score-display";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const dayMs = 24 * 60 * 60 * 1000;
const coachingViewIds = ["active", "overdue", "week", "mine", "unlinked", "done", "all"] as const;

type CoachingViewId = (typeof coachingViewIds)[number];

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
  const resetFiltersHref = view === "active" ? "/coaching" : `/coaching?view=${view}`;
  const baseCoachingHref = viewHref(view, { q, assigneeId, category });
  const createTaskHref = `${baseCoachingHref}&create=1`;
  const createRuleHref = `${baseCoachingHref}&rule=1`;
  const createPlanHref = `${baseCoachingHref}&plan=1`;
  const closeCreatePanelHref = baseCoachingHref;
  const coachingActionHref = nextConversation ? `/reviews/${nextConversation.id}` : createTaskHref;
  const coachingActionTone = overdueAssignments.length > 0 ? "negative" : openAssignments.length > 0 ? "warning" : "positive";
  // Team score-over-time: bucket finalized review scores by month (oldest -> newest)
  // with review volume in point details, using the same chart logic as quality analytics.
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
  const trendPoints: ChartDatum[] = scoreTrend.map((point) => ({
    label: point.label,
    value: point.value,
    detail: formatReviewCount(point.volume)
  }));
  const measuredTrainingEffectCount = trainingEffects.size;
  const positiveTrainingEffectCount = trainingEffectValues.filter((value) => value > 0).length;
  const linkedAssignmentShare = assignments.length > 0 ? Math.round((linkedAssignmentCount / assignments.length) * 100) : 0;

  const coachingTriageTone: TriageStripTone =
    coachingActionTone === "negative" ? "danger" : coachingActionTone === "warning" ? "warning" : "success";
  const trainingEffectDelta =
    averageTrainingEffect == null || averageTrainingEffect === 0
      ? null
      : {
          value: formatQualityScoreDelta(averageTrainingEffect),
          tone: (averageTrainingEffect > 0 ? "up" : "down") as "up" | "down"
        };

  return (
    <PageShell
      eyebrow="Развитие качества"
      title="Обучение"
      description="Рабочая очередь разборов: сначала срочные задачи, затем контекст проверки и правило, которое нужно закрепить."
      actions={
        <>
          <Button
            variant={createTaskOpen ? "outline" : "default"}
            render={<Link href={createTaskOpen ? closeCreatePanelHref : createTaskHref} />}
            nativeButton={false}
          >
            {createTaskOpen ? <X data-icon="inline-start" aria-hidden="true" /> : <PlusCircle data-icon="inline-start" aria-hidden="true" />}
            {createTaskOpen ? "Скрыть форму" : "Новая задача"}
          </Button>
          <Button
            variant="outline"
            render={<Link href={createRuleOpen ? closeCreatePanelHref : createRuleHref} />}
            nativeButton={false}
          >
            {createRuleOpen ? <X data-icon="inline-start" aria-hidden="true" /> : <BookOpenCheck data-icon="inline-start" aria-hidden="true" />}
            {createRuleOpen ? "Скрыть правило" : "Типовая ошибка"}
          </Button>
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
          <Button render={<Link href={coachingActionHref} />} nativeButton={false}>
            {nextConversation ? "Открыть проверку" : "Новая задача"}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ключевые показатели обучения">
        <StatKpi
          label="В работе"
          value={openAssignments.length}
          hint={weekAssignments.length > 0 ? `${weekAssignments.length} со сроком на неделе` : "Сроки под контролем"}
        />
        <StatKpi
          label="Просрочено"
          value={overdueAssignments.length}
          hint={overdueAssignments.length > 0 ? "Поднимаются в начало очереди" : "Просроченных разборов нет"}
        />
        <StatKpi
          label="Эффект обучения"
          value={averageTrainingEffect == null ? "—" : formatQualityScoreDelta(averageTrainingEffect)}
          delta={trainingEffectDelta}
          hint={trainingEffectKpiHint({
            averageDelta: averageTrainingEffect,
            positiveCount: positiveTrainingEffectCount,
            measuredCount: measuredTrainingEffectCount
          })}
        />
        <StatKpi
          label="Связь с QA"
          value={`${linkedAssignmentShare}%`}
          hint={
            assignments.length > 0
              ? `${linkedAssignmentCount} задач с проверкой · закрыто ${doneAssignments.length}/${assignments.length}`
              : "Разборов пока нет"
          }
        />
      </div>

      {trendPoints.length >= 2 || topCategories.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.95fr)]" aria-label="Динамика качества и зоны роста">
          <Card>
            <CardHeader>
              <CardDescription>Качество во времени</CardDescription>
              <CardTitle>Средний балл команды</CardTitle>
              <CardDescription>
                Динамика финальных проверок по месяцам. Смотрите, меняется ли линия после закрытых разборов.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendPoints.length >= 2 ? (
                <SparklineChart points={trendPoints} target={90} />
              ) : (
                <EmptyState
                  size="inline"
                  icon={<BookOpenCheck size={20} aria-hidden="true" />}
                  title="Недостаточно данных для тренда"
                  description="Линия появится после финальных проверок за несколько месяцев."
                />
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Зоны роста</CardTitle>
              <CardDescription>Категории с наибольшим числом активных разборов.</CardDescription>
            </CardHeader>
            <CardContent>
              {topCategories.length > 0 ? (
                <ol className="flex flex-col gap-2">
                  {topCategories.map(([categoryName, count], index) => (
                    <li
                      key={categoryName}
                      className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2"
                    >
                      <span
                        className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold tabular-nums text-primary"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{categoryName}</span>
                      <Chip tone="neutral" className="tabular-nums">
                        {count}
                      </Chip>
                      <Button
                        variant="link"
                        size="xs"
                        className="h-auto px-0"
                        render={<Link href={viewHref(view, { q, assigneeId, category: categoryName })} />}
                        nativeButton={false}
                      >
                        <PlusCircle data-icon="inline-start" aria-hidden="true" />
                        В обучение
                      </Button>
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
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card aria-label="Планы коучинга">
        <CardHeader className="border-b">
          <CardTitle>Планы коучинга</CardTitle>
          <CardDescription>
            {coachingPlans.length > 0
              ? `Развитие операторов по фокус-темам. Активных планов: ${activePlanCount}.`
              : "Сгруппируйте разборы оператора под одной темой развития и отслеживайте прогресс."}
          </CardDescription>
          <CardAction>
            <Button
              variant={createPlanOpen ? "outline" : "default"}
              size="sm"
              render={<Link href={createPlanOpen ? closeCreatePanelHref : createPlanHref} />}
              nativeButton={false}
            >
              {createPlanOpen ? <X data-icon="inline-start" aria-hidden="true" /> : <Target data-icon="inline-start" aria-hidden="true" />}
              {createPlanOpen ? "Скрыть форму" : "Новый план"}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
          {createPlanOpen ? (
            <ToastActionForm
              action={createCoachingPlanState}
              className="rounded-lg border border-border bg-muted/40 p-4"
              aria-label="Новый план коучинга"
            >
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="plan-agentName">Оператор</FieldLabel>
                  <NativeSelect id="plan-agentName" name="agentName" required className="w-full">
                    <NativeSelectOption value="">Выберите оператора</NativeSelectOption>
                    {supportUsers.map((supportUser) => (
                      <NativeSelectOption key={supportUser.id} value={supportUser.name}>
                        {supportUser.name}
                        {supportUser.teamName ? ` / ${supportUser.teamName}` : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="plan-focusArea">Фокус-тема</FieldLabel>
                  <Input id="plan-focusArea" name="focusArea" placeholder="Например: работа с возражениями" />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="plan-title">Название плана</FieldLabel>
                  <Input id="plan-title" name="title" required placeholder="Например: рост качества по эмпатии" />
                </Field>
                <div className="sm:col-span-2">
                  <ValidatedSubmitButton className={buttonVariants()}>Создать план</ValidatedSubmitButton>
                </div>
              </FieldGroup>
            </ToastActionForm>
          ) : null}

          {coachingPlans.length > 0 ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {coachingPlans.map((plan) => {
                const planAssignments = assignmentsByPlan.get(plan.id) ?? [];
                const planImpact = planImpacts.get(plan.id);
                const summary = planImpact ? impactSummary(planImpact) : null;

                return (
                  <li key={plan.id}>
                    <Card size="sm" className="h-full">
                      <CardHeader>
                        <div className="flex min-w-0 items-center gap-2 text-primary">
                          <Target size={16} aria-hidden="true" />
                          <CardTitle className="truncate text-foreground">{plan.title}</CardTitle>
                        </div>
                        <CardAction>
                          <Chip tone={planStatusTone(plan.status)}>{planStatusLabel(plan.status)}</Chip>
                        </CardAction>
                        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <UserRound size={14} aria-hidden="true" />
                            {plan.agentName}
                          </span>
                          {plan.focusArea ? <span>{plan.focusArea}</span> : null}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <div className="flex items-center gap-2" aria-label="Прогресс плана">
                          <div
                            className="relative h-1 w-full overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={plan.progress.total}
                            aria-valuenow={plan.progress.done}
                          >
                            <span
                              className="absolute inset-y-0 left-0 bg-primary transition-all"
                              style={{ width: `${plan.progress.percent}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {plan.progress.done}/{plan.progress.total} закрыто
                          </span>
                        </div>

                        {summary ? (
                          <div
                            className={cn(
                              "flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
                              summary.trend === "up" && "border-emerald-500/25 bg-emerald-500/10",
                              summary.trend === "down" && "border-destructive/25 bg-destructive/10",
                              summary.trend !== "up" && summary.trend !== "down" && "border-border bg-muted/40"
                            )}
                          >
                            <Sparkles size={14} aria-hidden="true" />
                            <span>Эффект коучинга: {summary.text}</span>
                            <Chip tone={impactTone(summary.trend)}>{formatQualityScoreDelta(planImpact?.delta ?? 0)}</Chip>
                            {summary.sampleAdequate ? null : <Chip tone="neutral">мало данных для вывода</Chip>}
                          </div>
                        ) : null}

                        {planAssignments.length > 0 ? (
                          <ul className="flex flex-col gap-1.5">
                            {planAssignments.map((assignment) => {
                              const assignmentImpact = assignmentImpacts.get(assignment.id);
                              const assignmentSummary = assignmentImpact ? impactSummary(assignmentImpact) : null;

                              return (
                                <li
                                  key={assignment.id}
                                  className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-sm"
                                >
                                  <span className="min-w-0 flex-1 font-medium">{assignment.title}</span>
                                  <Chip tone={trainingStatusTone(assignment.status)}>{trainingStatusLabel(assignment.status)}</Chip>
                                  {assignmentSummary ? (
                                    <span
                                      className={cn(
                                        "text-xs text-muted-foreground",
                                        assignmentSummary.trend === "up" && "text-emerald-700 dark:text-emerald-300",
                                        assignmentSummary.trend === "down" && "text-destructive"
                                      )}
                                    >
                                      {assignmentSummary.text}
                                      {assignmentSummary.sampleAdequate ? "" : " · мало данных для вывода"}
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">К плану ещё не привязаны разборы.</p>
                        )}
                      </CardContent>
                      <CardFooter className="justify-start">
                        <ToastActionForm action={updateCoachingPlanStatusState} aria-label="Сменить статус плана">
                          <input type="hidden" name="id" value={plan.id} />
                          <input type="hidden" name="status" value={plan.status === "completed" ? "active" : "completed"} />
                          <Button type="submit" variant="outline" size="sm">
                            {plan.status === "completed" ? (
                              <>
                                <ArrowRight data-icon="inline-start" aria-hidden="true" />
                                Возобновить
                              </>
                            ) : (
                              <>
                                <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
                                Завершить
                              </>
                            )}
                          </Button>
                        </ToastActionForm>
                      </CardFooter>
                    </Card>
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
                <Button render={<Link href={createPlanHref} />} nativeButton={false}>
                  <Target data-icon="inline-start" aria-hidden="true" />
                  Новый план
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {createTaskOpen ? (
        <Card aria-label="Новая учебная задача">
          <CardHeader className="border-b">
            <CardTitle>Новая учебная задача</CardTitle>
            <CardDescription>Привяжите задачу к проверке, чтобы оператор сразу видел контекст ошибки.</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link href={closeCreatePanelHref} />} nativeButton={false}>
                Скрыть
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-(--card-spacing)">
            <ToastActionForm action={createTrainingAssignmentState} aria-label="Новая учебная задача">
              <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="task-assigneeId">Исполнитель</FieldLabel>
                  <NativeSelect id="task-assigneeId" name="assigneeId" required className="w-full">
                    <NativeSelectOption value="">Выберите оператора</NativeSelectOption>
                    {supportUsers.map((supportUser) => (
                      <NativeSelectOption key={supportUser.id} value={supportUser.id}>
                        {supportUser.name}
                        {supportUser.teamName ? ` / ${supportUser.teamName}` : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-reviewId">Проверка</FieldLabel>
                  <NativeSelect id="task-reviewId" name="reviewId" className="w-full">
                    <NativeSelectOption value="">Без привязки</NativeSelectOption>
                    {reviewCandidates.map((review) => (
                      <NativeSelectOption key={review.id} value={review.id}>
                        {review.conversation.externalId} / {review.findings[0]?.category ?? review.conversation.subject}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-dueAt">Срок</FieldLabel>
                  <Input id="task-dueAt" name="dueAt" type="date" />
                </Field>
                <Field className="sm:col-span-2 lg:col-span-3">
                  <FieldLabel htmlFor="task-title">Задача</FieldLabel>
                  <Input id="task-title" name="title" required placeholder="Например: разбор маршрутизации" />
                </Field>
                <Field className="sm:col-span-2 lg:col-span-3">
                  <FieldLabel htmlFor="task-description">Что разобрать</FieldLabel>
                  <Textarea
                    id="task-description"
                    name="description"
                    required
                    rows={3}
                    placeholder="Коротко опишите ошибку, ожидаемое правило и результат разбора."
                  />
                </Field>
                <div className="sm:col-span-2 lg:col-span-3">
                  <ValidatedSubmitButton className={buttonVariants()}>Создать задачу</ValidatedSubmitButton>
                </div>
              </FieldGroup>
            </ToastActionForm>
          </CardContent>
        </Card>
      ) : null}

      {createRuleOpen ? (
        <Card aria-label="Новая типовая ошибка">
          <CardHeader className="border-b">
            <CardTitle>Новая типовая ошибка</CardTitle>
            <CardDescription>
              Правило появится в блоке «Правила для разбора»
              {ruleFocusCategory ? ` для категории «${ruleFocusCategory}»` : " для похожих разборов"}.
            </CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link href={closeCreatePanelHref} />} nativeButton={false}>
                Скрыть
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-(--card-spacing)">
            <ToastActionForm action={createKnowledgeEntryState} aria-label="Новая типовая ошибка">
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                <KnowledgeCategoryFields categories={categoryOptions} defaultCategory={ruleCategoryDefault} />
                <Field>
                  <FieldLabel htmlFor="rule-riskLevel">Риск</FieldLabel>
                  <NativeSelect id="rule-riskLevel" name="riskLevel" defaultValue={ruleFocusRiskLevel} className="w-full">
                    {Object.entries(riskLevelLabels).map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="rule-title">Название правила</FieldLabel>
                  <Input id="rule-title" name="title" required placeholder="Например: передача без объяснения клиенту" />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="rule-description">Описание ошибки</FieldLabel>
                  <Textarea
                    id="rule-description"
                    name="description"
                    required
                    rows={3}
                    placeholder="Что именно повторяется в проверках и почему это риск."
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="rule-recommendation">Рекомендация</FieldLabel>
                  <Textarea
                    id="rule-recommendation"
                    name="recommendation"
                    required
                    rows={3}
                    placeholder="Как оператор должен действовать в похожем случае."
                  />
                </Field>
                <div className="sm:col-span-2">
                  <ValidatedSubmitButton className={buttonVariants()}>Сохранить правило</ValidatedSubmitButton>
                </div>
              </FieldGroup>
            </ToastActionForm>
          </CardContent>
        </Card>
      ) : null}

      <Card aria-label="Правила для разбора">
        <CardHeader className="border-b">
          <CardTitle>Правила для разбора</CardTitle>
          <CardDescription>
            {ruleFocusCategory
              ? `Показываем правила для категории «${ruleFocusCategory}».`
              : "Показываем критичные правила, которые стоит держать перед глазами."}
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" render={<Link href={createRuleHref} />} nativeButton={false}>
              <BookOpenCheck data-icon="inline-start" aria-hidden="true" />
              Добавить правило
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="pt-(--card-spacing)">
          {contextualKnowledge.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {contextualKnowledge.slice(0, 3).map((entry) => {
                const riskTone: ChipTone =
                  entry.riskLevel === "CRITICAL" || entry.riskLevel === "HIGH" ? "warning" : "neutral";

                return (
                  <Card key={entry.id} size="sm">
                    <CardHeader>
                      <CardDescription className="truncate">{entry.category}</CardDescription>
                      <CardAction>
                        <Chip tone={riskTone}>{riskLevelLabels[entry.riskLevel]}</Chip>
                      </CardAction>
                      <CardTitle className="leading-snug">{entry.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <p className="line-clamp-2 text-sm text-muted-foreground">{entry.recommendation}</p>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto justify-start px-0"
                        render={<Link href={createTaskHref} />}
                        nativeButton={false}
                      >
                        <PlusCircle data-icon="inline-start" aria-hidden="true" />
                        Добавить в обучение
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <EmptyState
              size="inline"
              icon={<BookOpenCheck size={20} aria-hidden="true" />}
              title="Нет правила для текущего фокуса"
              description="Добавьте типовую ошибку кнопкой выше — она будет показываться здесь для похожих разборов."
            />
          )}
        </CardContent>
      </Card>

      <Card aria-label="Рабочая область обучения">
        <CardHeader className="border-b">
          <CardTitle>{selectedViewOption.label}</CardTitle>
          <CardDescription>{selectedViewOption.helper}.</CardDescription>
          <CardAction>
            <Chip tone="neutral" className="tabular-nums">
              {filteredAssignments.length}
            </Chip>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
          <nav
            aria-label="Виды разборов"
            className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border pb-px"
          >
            {viewOptions.map((option) => {
              const Icon = option.icon;
              const isActive = option.id === view;

              return (
                <CoachingViewNavLink
                  key={option.id}
                  href={viewHref(option.id, { q, assigneeId, category })}
                  active={isActive}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                    option.id === "overdue" && viewCounts.overdue > 0 && "text-warning"
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{option.label}</span>
                  <Chip
                    tone={option.id === "overdue" && viewCounts.overdue > 0 ? "warning" : "neutral"}
                    className="h-5 min-w-5 justify-center px-1.5 text-xs tabular-nums"
                  >
                    {viewCounts[option.id]}
                  </Chip>
                </CoachingViewNavLink>
              );
            })}
          </nav>

          <AutoSubmitFilterForm action="/coaching" className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.5fr)_minmax(0,0.58fr)_auto] lg:items-end" debounceMs={350}>
            <input type="hidden" name="view" value={view} />
            <Field>
              <FieldLabel htmlFor="filter-q">Поиск</FieldLabel>
              <div className="relative">
                <Search
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="filter-q"
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="Задача, тикет, категория"
                  className="pl-8"
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="filter-assigneeId">Исполнитель</FieldLabel>
              <NativeSelect id="filter-assigneeId" name="assigneeId" defaultValue={assigneeId} className="w-full">
                <NativeSelectOption value="">Все операторы</NativeSelectOption>
                {supportUsers.map((supportUser) => (
                  <NativeSelectOption key={supportUser.id} value={supportUser.id}>
                    {supportUser.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="filter-category">Категория</FieldLabel>
              <NativeSelect id="filter-category" name="category" defaultValue={category} className="w-full">
                <NativeSelectOption value="">Все категории</NativeSelectOption>
                {categoryOptions.map((categoryOption) => (
                  <NativeSelectOption key={categoryOption} value={categoryOption}>
                    {categoryOption}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {q || assigneeId || category ? (
              <Button
                variant="outline"
                className="w-full lg:w-auto"
                render={<Link href={resetFiltersHref} />}
                nativeButton={false}
              >
                <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
                Сбросить
              </Button>
            ) : null}
          </AutoSubmitFilterForm>

          {filteredAssignments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Задача</TableHead>
                  <TableHead>Исполнитель</TableHead>
                  <TableHead>Срок</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Контекст</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.map((assignment) => {
                  const overdue = assignment.status !== "done" && isOverdue(assignment.dueAt, now);
                  const dueThisWeek = assignment.status !== "done" && isDueThisWeek(assignment.dueAt, now);
                  const conversation = assignment.review?.conversation;
                  const finding = assignment.review?.findings[0];
                  const isPriority = nextAssignment?.id === assignment.id;
                  const trainingEffect = trainingEffects.get(assignment.id);

                  return (
                    <TableRow
                      key={assignment.id}
                      className={cn(
                        overdue && "bg-destructive/5",
                        isPriority && !overdue && "bg-primary/5"
                      )}
                      data-state={isPriority ? "selected" : undefined}
                    >
                      <TableCell className="max-w-[22rem] whitespace-normal">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">{assignment.title}</span>
                            {isPriority ? <Chip tone="accent">Следующий</Chip> : null}
                          </div>
                          <p className="line-clamp-2 text-sm text-muted-foreground">{assignment.description}</p>
                        </div>
                      </TableCell>
                      <TableCell>{assignment.assigneeName}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            overdue && "font-medium text-destructive",
                            dueThisWeek && !overdue && "font-medium text-primary"
                          )}
                        >
                          {dueText(assignment.dueAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Chip tone={trainingStatusTone(assignment.status)}>{trainingStatusLabel(assignment.status)}</Chip>
                      </TableCell>
                      <TableCell className="max-w-[18rem] whitespace-normal">
                        <div className="flex flex-wrap gap-1.5">
                          {conversation ? (
                            <Chip tone="neutral">{conversation.externalId}</Chip>
                          ) : (
                            <Chip tone="neutral">без проверки</Chip>
                          )}
                          {finding ? <Chip tone="neutral">{finding.category}</Chip> : null}
                          {finding ? <Chip tone="neutral">{riskLevelLabels[finding.riskLevel]}</Chip> : null}
                          {assignment.review ? (
                            <Chip tone="neutral" className="tabular-nums">
                              {formatQualityScore(assignment.review.totalScore)}
                            </Chip>
                          ) : null}
                          {assignment.review?.needsReanswer ? <Chip tone="warning">переответ</Chip> : null}
                          {trainingEffect != null ? (
                            <Chip tone={trainingEffect >= 0 ? "success" : "danger"} className="tabular-nums">
                              {formatQualityScoreDelta(trainingEffect)} после разбора
                            </Chip>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {conversation ? (
                            <Button
                              variant="outline"
                              size="sm"
                              render={<Link href={`/reviews/${conversation.id}`} />}
                              nativeButton={false}
                            >
                              Открыть
                            </Button>
                          ) : null}
                          <ToastActionForm action={updateTrainingAssignmentStatusState}>
                            <input type="hidden" name="id" value={assignment.id} />
                            <input type="hidden" name="status" value={assignment.status === "done" ? "open" : "done"} />
                            <Button type="submit" size="sm">
                              {assignment.status === "done" ? "Вернуть" : "Готово"}
                            </Button>
                          </ToastActionForm>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<ClipboardList size={24} aria-hidden="true" />}
              title="В этом срезе нет задач"
              description="Измените фильтры или создайте учебную задачу из проверки с замечанием."
              action={
                <Button render={<Link href={createTaskHref} />} nativeButton={false}>
                  <PlusCircle data-icon="inline-start" aria-hidden="true" />
                  Новая задача
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
