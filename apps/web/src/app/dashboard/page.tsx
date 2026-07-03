import { ArrowRight, BookOpenCheck, CheckCircle2, ClipboardCheck, Clock3, History, Star, TrendingUp, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import { OperationKpiCard } from "@/components/operations/operation-kpi-card";
import { TrendChart } from "@/components/reports/trend-chart";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { ScoreSparkline } from "@/components/ui/score-sparkline";
import type { StatKpiDelta } from "@/components/ui/stat-kpi";
import { TriageStrip } from "@/components/ui/triage-strip";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { computeAgentLeaderboard } from "@/lib/reports/report-aggregation";
import { reviewEventActionLabel } from "@/lib/review-events";
import { formatQualityScore, qualityScoreDelta } from "@/lib/score-display";
import { semanticStatusForMetric } from "@/lib/ui/semantic-status";
import { statusToneClass, type StatusTone } from "@/lib/ui/status-tone";

function countDelta(value: number): StatKpiDelta {
  return {
    value: Math.abs(value),
    direction: value > 0 ? "up" : value < 0 ? "down" : "flat",
    tone: "neutral"
  };
}

function scoreDeltaTone(value: number): StatKpiDelta["tone"] {
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
  const totalQueueCount = queuedCount + inWorkCount;
  const focusItemCandidates: Array<FocusItem | null> = [
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
  const trendPoints = dailyCounts.map((item) => ({
    label: weekdayLabel(item.date),
    value: item.average ?? 0
  }));
  const trendVolume = dailyCounts.map((item) => item.count);
  const triageTitle = focusItems.length ? primaryFocus.label : "Критичных отклонений нет";
  const triageDescription = focusItems.length
    ? `${primaryFocus.value} ${primaryFocus.hint.toLocaleLowerCase("ru-RU")}`
    : "Держите ритм очереди — возьмите следующий разговор в проверку.";

  return (
    <PageShell
      className="dashboard-shell"
      eyebrow="Рабочее пространство"
      title="Сегодня"
      description="Быстрый обзор очереди, риска, обучения и последних действий без перехода по всем разделам."
    >
      <TriageStrip
        tone={focusItems.length ? triageToneForStatusTone[primaryFocus.tone] : "success"}
        icon={focusItems.length ? <TriangleAlert size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
        title={triageTitle}
        description={triageDescription}
        action={
          <Link href={primaryFocusHref} className="action-button action-button--primary">
            <span>{focusItems.length ? "Разобрать" : "Открыть очередь"}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />

      <section className="dashboard-metric-grid" aria-label="Ключевые показатели">
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
          unit={currentAverage == null ? undefined : "баллов"}
          tone={scoreStatus.tone}
          delta={scoreDelta == null ? undefined : { value: Math.abs(scoreDelta), direction: scoreDelta > 0 ? "up" : scoreDelta < 0 ? "down" : "flat", tone: scoreDeltaTone(scoreDelta) }}
          label="Средний балл"
          hint={scoreDelta == null ? "Недостаточно сравнения" : "к прошлой неделе"}
          trend={scoreSparkPoints.length >= 2 ? <ScoreSparkline points={scoreSparkPoints} /> : undefined}
        />
        <OperationKpiCard
          href="/reviews?status=unreviewed"
          icon={Clock3}
          value={totalQueueCount}
          tone={queueStatus.tone}
          label="В очереди и работе"
          hint={`${queuedCount} ждут старта · ${inWorkCount} в работе`}
        />
        <OperationKpiCard
          href="/coaching"
          icon={BookOpenCheck}
          value={activeTrainingCount}
          tone={trainingStatus.tone}
          label="Активных обучений"
          hint={overdueTrainingCount > 0 ? `${overdueTrainingCount} просрочено` : "Сроки под контролем"}
        />
      </section>

      <section className="dashboard-main-grid" aria-label="Операционные детали">
          <div className="dashboard-panel dashboard-panel--wide">
            <div className="dashboard-panel__header">
              <p className="dashboard-section-label">
                <TrendingUp size={14} aria-hidden="true" />
                Качество по неделям
              </p>
            </div>
            {checkedThisWeek === 0 ? (
              <EmptyState
                size="inline"
                icon={<ClipboardCheck size={20} aria-hidden="true" />}
                title="Нет проверок за неделю"
                description="Финализируйте первую проверку, чтобы увидеть динамику по дням."
              />
            ) : (
              <div className="dashboard-trend">
                <TrendChart
                  points={trendPoints}
                  volume={trendVolume}
                  height={150}
                  ariaLabel="Средний балл по дням недели на фоне объёма проверок"
                />
                <div className="dashboard-trend__legend" aria-hidden="true">
                  <span className="dashboard-trend__legend-item dashboard-trend__legend-item--line">Средний балл</span>
                  <span className="dashboard-trend__legend-item dashboard-trend__legend-item--bar">Объём проверок</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 content-start min-w-0">
          {secondaryFocusItems.length > 0 ? (
            <div className="dashboard-panel">
              <div className="dashboard-panel__header">
                <p className="dashboard-section-label">Ещё в фокусе</p>
              </div>
              <div className="dashboard-focus-list">
                {secondaryFocusItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link key={item.href} href={item.href} className="dashboard-focus-row">
                      <span className="dashboard-focus-row__icon"><Icon size={16} aria-hidden="true" /></span>
                      <span className="dashboard-focus-row__copy">
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                      <span className={`dashboard-focus-row__metric ${statusToneClass(item.tone)}`}>
                        <em>{item.value}</em>
                        <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="dashboard-panel">
            <div className="dashboard-panel__header">
              <p className="dashboard-section-label">Ближайшее обучение</p>
            </div>
            <div className="dashboard-training-list">
              {recentTrainings.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<BookOpenCheck size={20} aria-hidden="true" />}
                  title="Активных обучений нет"
                  description="Назначьте обучение по итогам проверки, и оно появится здесь."
                />
              ) : (
                recentTrainings.map((assignment) => (
                  <Link key={assignment.id} href="/coaching" className="dashboard-training-row">
                    <strong>{assignment.title}</strong>
                    <span>{assignment.assigneeName}</span>
                    <small>{assignment.dueAt ? `до ${formatDate(assignment.dueAt)}` : "без срока"} · {assignment.review?.conversation.externalId ?? "ручная задача"}</small>
                  </Link>
                ))
              )}
            </div>
          </div>
          </div>


          <div className="grid gap-3 items-start xl:grid-cols-2 [grid-column:1/-1]">
          <div className="dashboard-panel">
            <div className="dashboard-panel__header">
              <p className="dashboard-section-label">
                <TrendingUp size={14} aria-hidden="true" />
                Области для роста
              </p>
              {canReadReports ? <Link href="/reports?view=details" className="quiet-link">Подробнее</Link> : null}
            </div>
            <p className="dashboard-panel__note">Операторы с наибольшей нагрузкой по риску и апелляциям за 30 дней.</p>
            <div className="dashboard-agent-list">
              {agentRows.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<TrendingUp size={20} aria-hidden="true" />}
                  title="Нет данных для разбора"
                  description="Пока нет финализированных проверок за 30 дней."
                />
              ) : (
                agentRows.map((agent) => (
                  <Link key={agent.name} href={`/reviews?status=reviewed&assignee=${encodeURIComponent(agent.name)}`} className="dashboard-agent-row">
                    <span className="dashboard-agent-row__avatar">{agent.name.slice(0, 2).toLocaleUpperCase("ru-RU")}</span>
                    <strong>{agent.name}</strong>
                    <small className="dashboard-agent-row__meta">
                      {agent.count} проверок
                      {agent.appealCount > 0 ? ` · ${agent.appealCount} апелл.` : ""}
                    </small>
                    {agent.riskCount > 0 ? (
                      <Chip tone="danger" size="xs" numeric className="dashboard-agent-row__flag">
                        {agent.riskCount} риск
                      </Chip>
                    ) : null}
                    <em>{Math.round(agent.average)}</em>
                    <i style={{ width: `${Math.max(8, Math.round(agent.average))}%` }} />
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="dashboard-panel">
            <EvidenceDrawer title="Последняя активность" description="Что менялось в проверках и обучении." defaultOpen>
              <div className="evidence-drawer__toolbar">
                <Link href={canReadAudit ? "/admin/audit" : "/reviews"} className="quiet-link">{canReadAudit ? "Аудит" : "Очередь"}</Link>
              </div>
              <div className="dashboard-activity-list">
                {recentEvents.length === 0 ? (
                  <EmptyState
                    size="inline"
                    icon={<History size={20} aria-hidden="true" />}
                    title="Событий пока нет"
                    description="Действия по проверкам и обучению появятся здесь."
                  />
                ) : (
                  recentEvents.slice(0, 5).map((event) => (
                    <Link key={event.id} href={event.conversationId ? `/reviews/${event.conversationId}` : "/reviews"} className="dashboard-activity-row">
                      <span className="dashboard-activity-row__avatar">{event.actor?.name?.slice(0, 2).toLocaleUpperCase("ru-RU") ?? "QA"}</span>
                      <span className="dashboard-activity-row__body">
                        <strong>{event.actor?.name ?? "Система"} · {reviewEventActionLabel(event.action)}</strong>
                        <small>
                          {event.review?.conversation.externalId ?? event.review?.conversation.subject ?? "Проверка"}{event.review ? ` · ${formatQualityScore(event.review.totalScore)}` : ""}
                        </small>
                      </span>
                      <time>{formatRelative(event.createdAt, now)}</time>
                    </Link>
                  ))
                )}
              </div>
            </EvidenceDrawer>
          </div>
          </div>
        </section>
      </PageShell>
  );
}
