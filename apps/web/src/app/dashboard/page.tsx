import { ArrowRight, BookOpenCheck, CheckCircle2, ClipboardCheck, Clock3, History, Star, TrendingUp, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { WelcomeBackBanner } from "@/components/guidance/welcome-back-banner";
import { PageSkeleton } from "@/components/loading-states";
import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import { OperationKpiCard, type OperationKpiDelta } from "@/components/operations/operation-kpi-card";
import { SparklineChart, type ChartDatum } from "@/components/reports/report-charts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { ScoreSparkline } from "@/components/ui/score-sparkline";
import { Separator } from "@/components/ui/separator";
import { TriageStrip } from "@/components/ui/triage-strip";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { computeAgentLeaderboard } from "@/lib/reports/report-aggregation";
import { formatReviewCount } from "@/lib/reports/report-format";
import { reviewEventActionLabel } from "@/lib/review-events";
import { formatQualityScore, qualityScoreDelta, qualityScorePointWord } from "@/lib/score-display";
import { semanticStatusForMetric } from "@/lib/ui/semantic-status";
import { statusToneClass, type StatusTone } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

function countDelta(value: number): OperationKpiDelta {
  return {
    value: Math.abs(value),
    direction: value > 0 ? "up" : value < 0 ? "down" : "flat",
    tone: "neutral"
  };
}

function scoreDeltaTone(value: number): NonNullable<OperationKpiDelta["tone"]> {
  if (value > 0) {
    return "success";
  }

  if (value < 0) {
    return "danger";
  }

  return "neutral";
}

const triageToneForStatusTone: Record<StatusTone, "accent" | "success" | "warning" | "danger"> = {
  positive: "success",
  warning: "warning",
  negative: "danger",
  neutral: "accent",
  info: "accent"
};

export const dynamic = "force-dynamic";

const dayMs = 24 * 60 * 60 * 1000;

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysAgo(days: number, from = new Date()) {
  return new Date(startOfDay(from).getTime() - days * dayMs);
}

function formatDate(value: Date) {
  return value.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function formatRelative(value: Date, now = new Date()) {
  const diffMs = now.getTime() - value.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));

  if (minutes < 60) {
    return `${minutes} мин назад`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} ч назад`;
  }

  return formatDate(value);
}

function weekdayLabel(value: Date) {
  return value.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
}

type FocusItem = {
  icon: LucideIcon;
  href: string;
  label: string;
  value: number;
  tone: StatusTone;
  hint: string;
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" label="Загрузка дашборда" />}>
      <DashboardPageContent />
    </Suspense>
  );
}

async function DashboardPageContent() {
  const user = await requireCurrentUserPermission("reviews:read");
  const now = new Date();
  const thisWeekStart = daysAgo(6, now);
  const previousWeekStart = daysAgo(13, now);
  const thirtyDaysStart = daysAgo(29, now);
  const supportAgentScope = user.role === "SUPPORT_AGENT" ? { conversation: { assigneeName: user.name } } : {};
  const conversationScope = user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : {};

  const [
    checkedThisWeek,
    checkedPreviousWeek,
    currentScore,
    previousScore,
    queuedCount,
    inWorkCount,
    highRiskCount,
    activeTrainingCount,
    overdueTrainingCount,
    overdueReviewCount,
    dailyReviews,
    recentEvents,
    recentTrainings,
    agentReviews
  ] = await Promise.all([
    prisma.review.count({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: { gte: thisWeekStart, lte: now },
        ...supportAgentScope
      }
    }),
    prisma.review.count({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: { gte: previousWeekStart, lt: thisWeekStart },
        ...supportAgentScope
      }
    }),
    prisma.review.aggregate({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: { gte: thisWeekStart, lte: now },
        ...supportAgentScope
      },
      _avg: { totalScore: true }
    }),
    prisma.review.aggregate({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: { gte: previousWeekStart, lt: thisWeekStart },
        ...supportAgentScope
      },
      _avg: { totalScore: true }
    }),
    prisma.conversation.count({
      where: { workspaceId: user.workspaceId, qaStatus: "QUEUED", ...conversationScope }
    }),
    prisma.conversation.count({
      where: { workspaceId: user.workspaceId, qaStatus: { in: ["ASSIGNED", "IN_PROGRESS", "REOPENED"] }, ...conversationScope }
    }),
    prisma.review.count({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: { gte: thirtyDaysStart, lte: now },
        findings: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
        ...supportAgentScope
      }
    }),
    prisma.trainingAssignment.count({
      where: {
        workspaceId: user.workspaceId,
        status: { not: "done" },
        ...(user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {})
      }
    }),
    prisma.trainingAssignment.count({
      where: {
        workspaceId: user.workspaceId,
        status: { not: "done" },
        dueAt: { lt: now },
        ...(user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {})
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId: user.workspaceId,
        reviewDueAt: { lt: now },
        qaStatus: { not: "FINALIZED" },
        ...conversationScope
      }
    }),
    prisma.review.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: { gte: thisWeekStart, lte: now },
        ...supportAgentScope
      },
      select: { finalizedAt: true, totalScore: true },
      orderBy: { finalizedAt: "asc" }
    }),
    prisma.reviewEvent.findMany({
      where: {
        workspaceId: user.workspaceId,
        ...(user.role === "SUPPORT_AGENT" ? { review: { conversation: { assigneeName: user.name } } } : {})
      },
      include: {
        actor: { select: { name: true } },
        review: { select: { totalScore: true, conversation: { select: { subject: true, externalId: true } } } }
      },
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.trainingAssignment.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: { not: "done" },
        ...(user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {})
      },
      include: { review: { include: { conversation: true } } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 3
    }),
    prisma.review.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: { gte: thirtyDaysStart, lte: now },
        conversation: { assigneeName: { not: null }, ...conversationScope }
      },
      select: {
        totalScore: true,
        criticalError: true,
        appealStatus: true,
        conversation: { select: { assigneeName: true } },
        findings: { select: { riskLevel: true } }
      }
    })
  ]);

  const currentAverage = currentScore._avg.totalScore ?? null;
  const previousAverage = previousScore._avg.totalScore ?? null;
  const scoreDelta = qualityScoreDelta(currentAverage, previousAverage);
  const checkedDelta = checkedThisWeek - checkedPreviousWeek;
  const weekDays = Array.from({ length: 7 }, (_, index) => daysAgo(6 - index, now));
  const dailyCounts = weekDays.map((day) => {
    const nextDay = new Date(day.getTime() + dayMs);
    const dayReviews = dailyReviews.filter((review) => {
      const finalizedAt = review.finalizedAt?.getTime() ?? 0;
      return finalizedAt >= day.getTime() && finalizedAt < nextDay.getTime();
    });
    const avgScore = dayReviews.length ? dayReviews.reduce((sum, review) => sum + review.totalScore, 0) / dayReviews.length : null;

    return {
      date: day,
      count: dayReviews.length,
      average: avgScore
    };
  });
  // Agent leaderboard reduction lives in a unit-tested pure helper so the math
  // (averages, risk/appeal load, ordering) is verifiable and not re-derived here.
  const agentRows = computeAgentLeaderboard(agentReviews, 5);
  const canReadAudit = hasPermission(user.role, "audit:read");
  const canReadReports = hasPermission(user.role, "reports:read");
  const isLeadDashboard = user.role === "TEAM_LEAD" || user.role === "ADMIN";
  const totalQueueCount = queuedCount + inWorkCount;
  const focusItemCandidates: Array<FocusItem | null> = [
    overdueReviewCount > 0
      ? {
          icon: Clock3,
          href: "/reviews?due=overdue",
          label: "Просрочено SLA",
          value: overdueReviewCount,
          tone: "negative" as const,
          hint: "Открыть очередь просроченных проверок"
        }
      : null,
    highRiskCount > 0
      ? {
          icon: TriangleAlert,
          href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
          label: "Высокий риск",
          value: highRiskCount,
          tone: "negative" as const,
          hint: "Открыть проверки с критичными замечаниями"
        }
      : null,
    overdueTrainingCount > 0
      ? {
          icon: BookOpenCheck,
          href: "/coaching",
          label: "Просрочено обучение",
          value: overdueTrainingCount,
          tone: "negative" as const,
          hint: "Разобрать задания с истекшим сроком"
        }
      : null,
    queuedCount > 0
      ? {
          icon: ClipboardCheck,
          href: "/reviews?qaStatus=QUEUED",
          label: "Очередь без старта",
          value: queuedCount,
          tone: "warning" as const,
          hint: "Назначить или открыть следующую проверку"
        }
      : null
  ];
  const focusItems = focusItemCandidates.filter((item): item is FocusItem => Boolean(item));
  // The TriageStrip is the single home for the top signal; the "Фокус сейчас"
  // panel carries only the remaining signals so nothing is restated.
  const primaryFocus = focusItems[0];
  const secondaryFocusItems = focusItems.slice(1);
  const primaryFocusHref = primaryFocus?.href ?? "/reviews?status=unreviewed";
  const checkedStatus = semanticStatusForMetric({ kind: "completed_count", value: checkedThisWeek });
  const scoreStatus = semanticStatusForMetric({ kind: "average_score", value: currentAverage });
  const queueStatus = semanticStatusForMetric({ kind: "queue_count", value: totalQueueCount });
  const trainingStatus = semanticStatusForMetric(
    overdueTrainingCount > 0
      ? { kind: "overdue_count", value: overdueTrainingCount }
      : { kind: "learning_count", value: activeTrainingCount }
  );
  const scoreSparkPoints = dailyCounts
    .filter((item) => item.average != null)
    .map((item) => item.average as number);
  const trendPoints: ChartDatum[] = dailyCounts
    .filter((item) => item.average != null)
    .map((item) => ({
      label: weekdayLabel(item.date),
      value: item.average as number,
      detail: formatReviewCount(item.count)
    }));
  const triageTitle = focusItems.length ? `${primaryFocus.label}: ${primaryFocus.value}` : "Критичных отклонений нет";
  const triageDescription = focusItems.length
    ? primaryFocus.hint
    : "Держите ритм очереди — возьмите следующий разговор в проверку.";
  const PrimaryFocusIcon = primaryFocus?.icon;

  return (
    <PageShell
      className="dashboard-shell min-w-0"
      title="Сегодня"
      description={
        isLeadDashboard
          ? "Риск и просроченный SLA за 30 секунд — с переходом в очередь. Ops-лента и суета фильтров скрыты."
          : "Быстрый обзор очереди, риска, обучения и последних действий без перехода по всем разделам."
      }
    >
      <WelcomeBackBanner />
      <TriageStrip
        tone={focusItems.length ? triageToneForStatusTone[primaryFocus.tone] : "success"}
        icon={PrimaryFocusIcon ? <PrimaryFocusIcon size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
        title={triageTitle}
        description={triageDescription}
        action={
          <Button render={<Link href={primaryFocusHref} />} nativeButton={false}>
            <span>{focusItems.length ? "Разобрать" : "Открыть очередь"}</span>
            <ArrowRight data-icon="inline-end" size={16} aria-hidden="true" />
          </Button>
        }
      />

      <section
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label={isLeadDashboard ? "Риск и нагрузка" : "Ключевые показатели"}
      >
        {isLeadDashboard ? (
          <>
            <OperationKpiCard
              href={overdueReviewCount > 0 ? "/reviews?due=overdue" : "/reviews?status=unreviewed"}
              icon={Clock3}
              value={overdueReviewCount > 0 ? overdueReviewCount : totalQueueCount}
              tone={overdueReviewCount > 0 ? "negative" : queueStatus.tone}
              label={overdueReviewCount > 0 ? "Просрочено SLA" : "В очереди и работе"}
              hint={
                overdueReviewCount > 0
                  ? `${queuedCount} ждут старта · ${inWorkCount} в работе`
                  : `${queuedCount} ждут старта · ${inWorkCount} в работе`
              }
            />
            <OperationKpiCard
              href="/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL"
              icon={TriangleAlert}
              value={highRiskCount}
              tone={highRiskCount > 0 ? "negative" : "neutral"}
              label="Высокий риск"
              hint="за 30 дней · открыть проверки"
            />
            <OperationKpiCard
              href="/reviews?status=reviewed"
              icon={ClipboardCheck}
              value={checkedThisWeek}
              tone={checkedStatus.tone}
              delta={countDelta(checkedDelta)}
              label="Проверок за неделю"
              hint="к прошлой неделе"
            />
            <OperationKpiCard
              href="/coaching"
              icon={BookOpenCheck}
              value={activeTrainingCount}
              tone={trainingStatus.tone}
              label="Активных обучений"
              hint={overdueTrainingCount > 0 ? `${overdueTrainingCount} просрочено` : "Сроки под контролем"}
            />
          </>
        ) : (
          <>
            <OperationKpiCard
              href="/reviews?status=reviewed"
              icon={ClipboardCheck}
              value={checkedThisWeek}
              tone={checkedStatus.tone}
              delta={countDelta(checkedDelta)}
              label="Проверок за неделю"
              hint="к прошлой неделе"
            />
            <OperationKpiCard
              href={canReadReports ? "/reports" : "/reviews"}
              icon={Star}
              value={currentAverage == null ? "—" : Math.round(currentAverage)}
              unit={currentAverage == null ? undefined : qualityScorePointWord(currentAverage)}
              tone={scoreStatus.tone}
              delta={
                scoreDelta == null
                  ? undefined
                  : {
                      value: Math.abs(scoreDelta),
                      direction: scoreDelta > 0 ? "up" : scoreDelta < 0 ? "down" : "flat",
                      tone: scoreDeltaTone(scoreDelta)
                    }
              }
              label="Средний балл"
              hint={scoreDelta == null ? "Недостаточно данных для сравнения" : "к прошлой неделе"}
              trend={scoreSparkPoints.length >= 2 ? <ScoreSparkline points={scoreSparkPoints} /> : undefined}
            />
            <OperationKpiCard
              href={overdueReviewCount > 0 ? "/reviews?due=overdue" : "/reviews?status=unreviewed"}
              icon={Clock3}
              value={totalQueueCount}
              tone={queueStatus.tone}
              label="В очереди и работе"
              hint={
                overdueReviewCount > 0
                  ? `${overdueReviewCount} просрочено SLA · ${queuedCount} ждут старта`
                  : `${queuedCount} ждут старта · ${inWorkCount} в работе`
              }
            />
            <OperationKpiCard
              href="/coaching"
              icon={BookOpenCheck}
              value={activeTrainingCount}
              tone={trainingStatus.tone}
              label="Активных обучений"
              hint={overdueTrainingCount > 0 ? `${overdueTrainingCount} просрочено` : "Сроки под контролем"}
            />
          </>
        )}
      </section>

      <section
        data-slot="dashboard-primary-grid"
        className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
        aria-label="Операционные детали"
      >
        <Card className="min-h-[260px]">
          <CardHeader className="border-b pb-(--card-spacing)">
            <CardTitle className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <TrendingUp size={14} aria-hidden="true" />
              {isLeadDashboard ? "Качество команды · 7 дней" : "Качество за 7 дней"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-(--card-spacing)">
            {checkedThisWeek === 0 ? (
              <EmptyState
                size="inline"
                icon={<ClipboardCheck size={20} aria-hidden="true" />}
                title="Нет проверок за неделю"
                description="Финализируйте первую проверку, чтобы увидеть динамику по дням."
              />
            ) : (
              <div className="grid min-w-0 gap-3 content-start">
                <SparklineChart points={trendPoints} target={90} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 content-start gap-3">
          {secondaryFocusItems.length > 0 ? (
            <Card>
              <CardHeader className="border-b pb-(--card-spacing)">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Ещё в фокусе
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 pt-(--card-spacing)">
                {secondaryFocusItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="dashboard-focus-row grid min-h-[62px] min-w-0 grid-cols-[32px_minmax(0,1fr)_minmax(52px,auto)] items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/70"
                    >
                      <span className="dashboard-focus-row__icon inline-flex size-8 items-center justify-start text-muted-foreground">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="dashboard-focus-row__copy grid min-w-0 gap-1 content-center">
                        <strong className="truncate text-sm font-medium text-foreground">{item.label}</strong>
                        <small className="truncate text-xs text-muted-foreground">{item.hint}</small>
                      </span>
                      <span
                        className={cn(
                          "dashboard-focus-row__metric inline-grid min-h-[42px] grid-cols-[auto_14px] items-center justify-end gap-2.5",
                          statusToneClass(item.tone)
                        )}
                      >
                        <em className="inline-flex min-w-5 items-center justify-center text-xl font-semibold not-italic tabular-nums leading-none">
                          {item.value}
                        </em>
                        <ArrowRight size={14} aria-hidden="true" className="text-muted-foreground" />
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="border-b pb-(--card-spacing)">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                Ближайшее обучение
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 pt-(--card-spacing)">
              {recentTrainings.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<BookOpenCheck size={20} aria-hidden="true" />}
                  title="Активных обучений нет"
                  description="Назначьте обучение по итогам проверки, и оно появится здесь."
                />
              ) : (
                recentTrainings.map((assignment) => (
                  <Link
                    key={assignment.id}
                    href="/coaching"
                    className="grid min-w-0 gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-2.5 transition-colors hover:border-border hover:bg-muted/70"
                  >
                    <strong className="truncate text-sm font-medium text-foreground">{assignment.title}</strong>
                    <span className="text-xs text-muted-foreground">{assignment.assigneeName}</span>
                    <small className="text-xs text-muted-foreground">
                      {assignment.dueAt ? `до ${formatDate(assignment.dueAt)}` : "без срока"} ·{" "}
                      {assignment.review?.conversation.externalId ?? "ручная задача"}
                    </small>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div
          data-slot="dashboard-secondary-grid"
          className="col-span-full grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
        >
          <Card>
            <CardHeader className="border-b pb-(--card-spacing)">
              <CardTitle className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <TrendingUp size={14} aria-hidden="true" />
                {isLeadDashboard ? "Риск и апелляции" : "Области для роста"}
              </CardTitle>
              {canReadReports ? (
                <CardAction>
                  <Button variant="link" size="sm" render={<Link href="/reports?view=details" />} nativeButton={false}>
                    Подробнее
                  </Button>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-3 pt-(--card-spacing)">
              <CardDescription>
                {isLeadDashboard
                  ? "Операторы с наибольшей нагрузкой по риску и апелляциям — переход в очередь по клику."
                  : "Операторы с наибольшей нагрузкой по риску и апелляциям за 30 дней."}
              </CardDescription>
              <div className="grid min-w-0 gap-2">
                {agentRows.length === 0 ? (
                  <EmptyState
                    size="inline"
                    icon={<TrendingUp size={20} aria-hidden="true" />}
                    title="Нет данных для разбора"
                    description="Пока нет финализированных проверок за 30 дней."
                  />
                ) : (
                  agentRows.map((agent) => (
                    <Link
                      key={agent.name}
                      href={`/reviews?status=reviewed&assignee=${encodeURIComponent(agent.name)}`}
                      className="relative grid min-w-0 gap-2 rounded-lg border border-border/60 bg-muted/40 p-2.5 transition-colors hover:border-border hover:bg-muted/70"
                    >
                      <div className="grid min-w-0 grid-cols-[34px_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-0.5">
                        <span className="dashboard-agent-row__avatar inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-[11px] font-semibold text-muted-foreground">
                          {agent.name.slice(0, 2).toLocaleUpperCase("ru-RU")}
                        </span>
                        <strong className="truncate text-sm font-medium text-foreground">{agent.name}</strong>
                        {agent.riskCount > 0 ? (
                          <Chip tone="danger" className="dashboard-agent-row__flag self-center tabular-nums">
                            {agent.riskCount} риск
                          </Chip>
                        ) : (
                          <span />
                        )}
                        <em className="self-center text-lg font-semibold not-italic tabular-nums text-foreground">
                          {Math.round(agent.average)}
                        </em>
                        <small className="dashboard-agent-row__meta col-start-2 min-w-0 truncate text-xs text-muted-foreground">
                          {formatReviewCount(agent.count)}
                          {agent.appealCount > 0 ? ` · ${agent.appealCount} апелл.` : ""}
                        </small>
                      </div>
                      <i
                        className="block h-0.5 rounded-full bg-border"
                        style={{ width: `${Math.max(8, Math.round(agent.average))}%` }}
                        aria-hidden="true"
                      />
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {isLeadDashboard ? null : (
          <EvidenceDrawer title="Последняя активность" description="Что менялось в проверках и обучении.">
            <div className="mb-2 flex items-center justify-end">
              <Button
                variant="link"
                size="sm"
                render={<Link href={canReadAudit ? "/admin/audit" : "/reviews"} />}
                nativeButton={false}
              >
                {canReadAudit ? "Аудит" : "Очередь"}
              </Button>
            </div>
            <Separator className="mb-2" />
            <div className="grid min-w-0 gap-0">
              {recentEvents.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<History size={20} aria-hidden="true" />}
                  title="Событий пока нет"
                  description="Действия по проверкам и обучению появятся здесь."
                />
              ) : (
                recentEvents.slice(0, 5).map((event, index) => (
                  <div key={event.id}>
                    {index > 0 ? <Separator /> : null}
                    <Link
                      href={event.conversationId ? `/reviews/${event.conversationId}` : "/reviews"}
                      className="dashboard-activity-row grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 py-2 transition-colors hover:bg-muted/40"
                    >
                      <span className="dashboard-activity-row__avatar inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground">
                        {event.actor?.name?.slice(0, 2).toLocaleUpperCase("ru-RU") ?? "QA"}
                      </span>
                      <span className="dashboard-activity-row__body grid min-w-0 gap-0.5">
                        <strong className="truncate text-sm font-medium text-foreground">
                          {event.actor?.name ?? "Система"} · {reviewEventActionLabel(event.action)}
                        </strong>
                        <small className="truncate text-xs text-muted-foreground">
                          {event.review?.conversation.externalId ??
                            event.review?.conversation.subject ??
                            "Проверка"}
                          {event.review ? ` · ${formatQualityScore(event.review.totalScore)}` : ""}
                        </small>
                      </span>
                      <time dateTime={event.createdAt.toISOString()} className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {formatRelative(event.createdAt, now)}
                      </time>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </EvidenceDrawer>
          )}
        </div>
      </section>
    </PageShell>
  );
}
