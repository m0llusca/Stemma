import type { ReviewEvent } from "@prisma/client";
import { ArrowRight, BookOpenCheck, CheckCircle2, ClipboardCheck, Clock3, Star, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { formatQualityScore, formatQualityScoreDelta } from "@/lib/score-display";

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

function formatSignedNumber(value: number, suffix = "") {
  if (value === 0) {
    return `0${suffix}`;
  }

  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function eventLabel(action: ReviewEvent["action"]) {
  const labels: Record<string, string> = {
    "review.draft_saved": "Черновик проверки",
    "review.finalized": "Проверка завершена",
    "review.assigned": "Проверка назначена",
    "review.reopened": "Проверка переоткрыта",
    "feedback.acknowledged": "Обратная связь принята",
    "appeal.opened": "Открыта апелляция",
    "appeal.resolved": "Апелляция закрыта"
  };

  return labels[action] ?? action;
}

function weekdayLabel(value: Date) {
  return value.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
}

type AgentRow = {
  name: string;
  average: number;
  count: number;
  riskCount: number;
  appealCount: number;
};

export default async function DashboardPage() {
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
  const scoreDelta = currentAverage != null && previousAverage != null ? currentAverage - previousAverage : null;
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
  const maxDailyCount = Math.max(1, ...dailyCounts.map((item) => item.count));
  const agentRows = Array.from(
    agentReviews
      .reduce((acc, review) => {
        const name = review.conversation.assigneeName ?? "Без оператора";
        const current = acc.get(name) ?? { name, total: 0, count: 0, riskCount: 0, appealCount: 0 };
        current.total += review.totalScore;
        current.count += 1;
        current.riskCount += review.criticalError || review.findings.some((finding) => finding.riskLevel === "HIGH" || finding.riskLevel === "CRITICAL") ? 1 : 0;
        current.appealCount += review.appealStatus === "open" ? 1 : 0;
        acc.set(name, current);
        return acc;
      }, new Map<string, { name: string; total: number; count: number; riskCount: number; appealCount: number }>())
      .values()
  )
    .map<AgentRow>((row) => ({
      name: row.name,
      average: row.total / row.count,
      count: row.count,
      riskCount: row.riskCount,
      appealCount: row.appealCount
    }))
    .sort((left, right) => right.average - left.average)
    .slice(0, 5);
  const canReadAudit = hasPermission(user.role, "audit:read");
  const focusItems = [
    highRiskCount > 0
      ? {
          icon: TriangleAlert,
          href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
          label: "Высокий риск",
          value: highRiskCount,
          hint: "Открыть проверки с критичными замечаниями"
        }
      : null,
    overdueTrainingCount > 0
      ? {
          icon: BookOpenCheck,
          href: "/coaching",
          label: "Просрочено обучение",
          value: overdueTrainingCount,
          hint: "Разобрать задания с истекшим сроком"
        }
      : null,
    queuedCount > 0
      ? {
          icon: ClipboardCheck,
          href: "/reviews?qaStatus=QUEUED",
          label: "Очередь без старта",
          value: queuedCount,
          hint: "Назначить или открыть следующую проверку"
        }
      : null
  ].filter((item): item is { icon: typeof TriangleAlert; href: string; label: string; value: number; hint: string } => Boolean(item));

  return (
    <section className="page-shell dashboard-shell">
      <div className="command-center dashboard-hero">
        <div className="min-w-0">
          <p className="page-kicker">Рабочее пространство</p>
          <h1 className="page-title">Дашборд качества</h1>
          <p className="page-subtitle">
            Быстрый обзор очереди, риска, обучения и последних действий без перехода по всем разделам.
          </p>
          <div className="dashboard-hero__meta">
            <span>{now.toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" })}</span>
            <span>{highRiskCount > 0 || overdueTrainingCount > 0 ? "Есть фокус на сегодня" : "Команда в норме"}</span>
          </div>
        </div>
      </div>

      <section className="dashboard-metric-grid" aria-label="Ключевые показатели">
        <Link href="/reviews?status=reviewed" className="dashboard-kpi dashboard-kpi--blue">
          <span className="dashboard-kpi__icon"><ClipboardCheck size={18} aria-hidden="true" /></span>
          <strong>{checkedThisWeek}</strong>
          <span>Проверок за неделю</span>
          <small>{formatSignedNumber(checkedDelta)} к прошлой неделе</small>
        </Link>
        <Link href="/reports" className="dashboard-kpi dashboard-kpi--green">
          <span className="dashboard-kpi__icon"><Star size={18} aria-hidden="true" /></span>
          <strong>{formatQualityScore(currentAverage, "Нет данных")}</strong>
          <span>Средний балл</span>
          <small>{scoreDelta == null ? "Недостаточно сравнения" : `${formatQualityScoreDelta(scoreDelta)} к прошлой неделе`}</small>
        </Link>
        <Link href="/reviews?status=unreviewed" className="dashboard-kpi dashboard-kpi--amber">
          <span className="dashboard-kpi__icon"><Clock3 size={18} aria-hidden="true" /></span>
          <strong>{queuedCount + inWorkCount}</strong>
          <span>В очереди и работе</span>
          <small>{queuedCount} ждут старта · {inWorkCount} в работе</small>
        </Link>
        <Link href="/coaching" className="dashboard-kpi dashboard-kpi--violet">
          <span className="dashboard-kpi__icon"><BookOpenCheck size={18} aria-hidden="true" /></span>
          <strong>{activeTrainingCount}</strong>
          <span>Активных обучений</span>
          <small>{overdueTrainingCount > 0 ? `${overdueTrainingCount} просрочено` : "Сроки под контролем"}</small>
        </Link>
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-panel dashboard-panel--wide">
          <div className="dashboard-panel__header">
            <div className="min-w-0">
              <h2>Последняя активность</h2>
              <p>Что менялось в проверках и обучении.</p>
            </div>
            <Link href={canReadAudit ? "/admin/audit" : "/reviews"} className="quiet-link">{canReadAudit ? "Аудит" : "Очередь"}</Link>
          </div>
          <div className="dashboard-activity-list">
            {recentEvents.slice(0, 5).map((event) => (
              <Link key={event.id} href={event.conversationId ? `/reviews/${event.conversationId}` : "/reviews"} className="dashboard-activity-row">
                <span className="dashboard-activity-row__avatar">{event.actor?.name?.slice(0, 2).toLocaleUpperCase("ru-RU") ?? "QA"}</span>
                <span className="dashboard-activity-row__body">
                  <strong>{event.actor?.name ?? "Система"} · {eventLabel(event.action)}</strong>
                  <small>
                    {event.review?.conversation.externalId ?? event.review?.conversation.subject ?? "Проверка"}{event.review ? ` · ${formatQualityScore(event.review.totalScore)}` : ""}
                  </small>
                </span>
                <time>{formatRelative(event.createdAt, now)}</time>
              </Link>
            ))}
            {recentEvents.length === 0 ? <p className="empty-note">Событий пока нет.</p> : null}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div className="min-w-0">
              <h2>Фокус сейчас</h2>
              <p>Переходы к конкретике.</p>
            </div>
          </div>
          <div className="dashboard-focus-list">
            {(focusItems.length ? focusItems : [{
              icon: CheckCircle2,
              href: "/reviews?status=unreviewed",
              label: "Обычная очередь",
              value: queuedCount + inWorkCount,
              hint: "Критичных отклонений нет"
            }]).map((item) => {
              const Icon = item.icon;

              return (
                <Link key={item.href} href={item.href} className="dashboard-focus-row">
                  <span><Icon size={16} aria-hidden="true" /></span>
                  <strong>{item.label}</strong>
                  <em>{item.value}</em>
                  <small>{item.hint}</small>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="dashboard-panel dashboard-panel--wide">
          <div className="dashboard-panel__header">
            <div className="min-w-0">
              <h2>Проверки за неделю</h2>
              <p>Объем и средний балл по дням.</p>
            </div>
            <span className="metric-card__action">{formatSignedNumber(checkedDelta)}</span>
          </div>
          <div className="dashboard-week-chart" aria-label="Проверки за неделю">
            {dailyCounts.map((item) => (
              <div key={item.date.toISOString()} className="dashboard-week-chart__day">
                <span className="dashboard-week-chart__bar" style={{ height: `${Math.max(16, (item.count / maxDailyCount) * 100)}%` }}>
                  <strong>{item.count}</strong>
                </span>
                <small>{weekdayLabel(item.date)}</small>
                <em>{item.average == null ? "нет" : Math.round(item.average)}</em>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div className="min-w-0">
              <h2>Операторы</h2>
              <p>Последние 30 дней.</p>
            </div>
            <Link href="/reports?view=details" className="quiet-link">Подробнее</Link>
          </div>
          <div className="dashboard-agent-list">
            {agentRows.map((agent) => (
              <Link key={agent.name} href={`/reviews?status=reviewed&assignee=${encodeURIComponent(agent.name)}`} className="dashboard-agent-row">
                <span>{agent.name.slice(0, 2).toLocaleUpperCase("ru-RU")}</span>
                <strong>{agent.name}</strong>
                <small>{agent.count} проверок · {agent.riskCount} риск · {agent.appealCount} апелл.</small>
                <em>{Math.round(agent.average)}</em>
                <i style={{ width: `${Math.max(8, Math.round(agent.average))}%` }} />
              </Link>
            ))}
          </div>
        </div>
        <div className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div className="min-w-0">
              <h2>Ближайшее обучение</h2>
              <p>Задачи с ближайшим сроком.</p>
            </div>
          </div>
          <div className="dashboard-training-list">
            {recentTrainings.map((assignment) => (
              <Link key={assignment.id} href="/coaching" className="dashboard-training-row">
                <strong>{assignment.title}</strong>
                <span>{assignment.assigneeName}</span>
                <small>{assignment.dueAt ? `до ${formatDate(assignment.dueAt)}` : "без срока"} · {assignment.review?.conversation.externalId ?? "ручная задача"}</small>
              </Link>
            ))}
            {recentTrainings.length === 0 ? <p className="empty-note">Активных обучений нет.</p> : null}
          </div>
        </div>
      </section>
    </section>
  );
}
