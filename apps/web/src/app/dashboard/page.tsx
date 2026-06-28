import { ArrowRight, BookOpenCheck, CheckCircle2, ClipboardCheck, Clock3, Star, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { PageSkeleton } from "@/components/loading-states";
import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import { OperationKpiCard } from "@/components/operations/operation-kpi-card";
import { OperationalBrief } from "@/components/operations/operational-brief";
import { OperationalPageFrame } from "@/components/operations/operational-page-frame";
import { PriorityActionPanel } from "@/components/operations/priority-action-panel";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { reviewEventActionLabel } from "@/lib/review-events";
import { formatQualityScore, formatQualityScoreDelta, qualityScoreDelta } from "@/lib/score-display";
import { semanticStatusForMetric } from "@/lib/ui/semantic-status";
import { statusToneClass, type StatusTone } from "@/lib/ui/status-tone";

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
  const primaryFocusHref = focusItems[0]?.href ?? "/reviews?status=unreviewed";
  const displayedFocusItems: FocusItem[] = focusItems.length
    ? focusItems
    : [
        {
          icon: CheckCircle2,
          href: "/reviews?status=unreviewed",
          label: "Обычная очередь",
          value: totalQueueCount,
          tone: totalQueueCount > 0 ? "info" : "positive",
          hint: "Критичных отклонений нет"
        }
      ];
  const primaryFocus = displayedFocusItems[0];
  const checkedStatus = semanticStatusForMetric({ kind: "completed_count", value: checkedThisWeek });
  const scoreStatus = semanticStatusForMetric({ kind: "average_score", value: currentAverage });
  const queueStatus = semanticStatusForMetric({ kind: "queue_count", value: totalQueueCount });
  const trainingStatus = semanticStatusForMetric(
    overdueTrainingCount > 0
      ? { kind: "overdue_count", value: overdueTrainingCount }
      : { kind: "learning_count", value: activeTrainingCount }
  );
  const executiveBriefItems = [
    {
      label: "Главный риск",
      value: primaryFocus.label,
      detail: primaryFocus.hint,
      tone: primaryFocus.tone
    },
    {
      label: "Следующий шаг",
      value: focusItems.length ? "Открыть фокус" : "Открыть очередь",
      detail: focusItems.length ? "Начните с верхнего сигнала, затем вернитесь к очереди." : "Критичных отклонений нет, важен темп проверок.",
      tone: focusItems.length ? "warning" as const : "positive" as const
    },
    {
      label: "Доверие к данным",
      value: checkedThisWeek > 0 ? `${checkedThisWeek} проверок` : "Нет данных",
      detail: scoreDelta == null ? "Недостаточно сравнения с прошлой неделей." : `${formatQualityScoreDelta(scoreDelta)} к прошлой неделе.`,
      tone: checkedThisWeek > 0 ? "info" as const : "neutral" as const
    },
    {
      label: "Операционный контур",
      value: `${queuedCount}/${inWorkCount}`,
      detail: "Ждут старта / уже в работе.",
      tone: queueStatus.tone
    }
  ];
  const primaryFocusRailLabel =
    primaryFocus.label === "Просрочено обучение"
      ? "Просрочено"
      : primaryFocus.label === "Очередь без старта"
        ? "Без старта"
        : primaryFocus.label;

  return (
    <OperationalPageFrame
      title="Дашборд качества"
      className="page-shell dashboard-shell"
      signals={
        <>
          <div className="command-center dashboard-hero">
            <div className="min-w-0">
              <p className="page-kicker">Рабочее пространство</p>
              <h1 className="page-title">Дашборд качества</h1>
              <p className="page-subtitle">
                Быстрый обзор очереди, риска, обучения и последних действий без перехода по всем разделам.
              </p>
              <div className="dashboard-hero__meta">
                <span className={focusItems.length ? "semantic-status--warning" : "semantic-status--positive"}>
                  {focusItems.length ? "Есть фокус на сегодня" : "Команда в норме"}
                </span>
              </div>
            </div>
            <div className="dashboard-hero__rail" aria-label="Быстрые переходы дашборда">
              <Link href={primaryFocusHref}>
                <span>Сейчас</span>
                <strong>{primaryFocus.value}</strong>
                <small title={primaryFocus.label}>{primaryFocusRailLabel}</small>
              </Link>
              <Link href="/reviews?status=unreviewed">
                <span>Очередь</span>
                <strong>{totalQueueCount}</strong>
                <small>{queuedCount} ждут</small>
              </Link>
              <Link href={canReadAudit ? "/admin/audit" : "/reviews"}>
                <span>События</span>
                <strong>{recentEvents.length}</strong>
                <small>свежие</small>
              </Link>
            </div>
          </div>

          <OperationalBrief
            eyebrow="Утренний бриф"
            title={focusItems.length ? "Есть управленческий фокус" : "Ритм контроля стабилен"}
            description={
              focusItems.length
                ? "Сводка показывает, что открыть первым, почему это важно и насколько свежие данные подпирают решение."
                : "Данных достаточно для обычного рабочего цикла: поддерживайте очередь, обучение и evidence без экстренного переключения."
            }
            items={executiveBriefItems}
          />

          <section className="dashboard-metric-grid" aria-label="Ключевые показатели">
            <OperationKpiCard
              href="/reviews?status=reviewed"
              className="dashboard-kpi--blue"
              icon={ClipboardCheck}
              value={checkedThisWeek}
              tone={checkedStatus.tone}
              label="Проверок за неделю"
              hint={`${formatSignedNumber(checkedDelta)} к прошлой неделе`}
            />
            <OperationKpiCard
              href="/reports"
              className="dashboard-kpi--green"
              icon={Star}
              value={formatQualityScore(currentAverage, "Нет данных")}
              tone={scoreStatus.tone}
              label="Средний балл"
              hint={scoreDelta == null ? "Недостаточно сравнения" : `${formatQualityScoreDelta(scoreDelta)} к прошлой неделе`}
            />
            <OperationKpiCard
              href="/reviews?status=unreviewed"
              className="dashboard-kpi--amber"
              icon={Clock3}
              value={totalQueueCount}
              tone={queueStatus.tone}
              label="В очереди и работе"
              hint={`${queuedCount} ждут старта · ${inWorkCount} в работе`}
            />
            <OperationKpiCard
              href="/coaching"
              className="dashboard-kpi--violet"
              icon={BookOpenCheck}
              value={activeTrainingCount}
              tone={trainingStatus.tone}
              label="Активных обучений"
              hint={overdueTrainingCount > 0 ? `${overdueTrainingCount} просрочено` : "Сроки под контролем"}
            />
          </section>
        </>
      }
      action={
        <PriorityActionPanel
          title={focusItems.length ? primaryFocus.label : "Открыть следующую проверку"}
          description={
            focusItems.length
              ? primaryFocus.hint
              : "Критичных отклонений нет. Держите ритм очереди и возьмите следующий разговор в проверку."
          }
          actionLabel={focusItems.length ? "Разобрать сигнал" : "Открыть очередь"}
          href={primaryFocusHref}
          tone={primaryFocus.tone}
        />
      }
      details={
        <section className="dashboard-main-grid" aria-label="Операционные детали">
          <div className="dashboard-panel">
            <div className="dashboard-panel__header">
              <div className="min-w-0">
                <h2>Фокус сейчас</h2>
                <p>Переходы к конкретике.</p>
              </div>
            </div>
            <div className="dashboard-focus-list">
              {displayedFocusItems.map((item) => {
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
              <CoachCallout
                title={focusItems.length ? "Начните с верхнего сигнала" : "Поддержите ритм контроля"}
                body={
                  focusItems.length
                    ? "Сначала закройте риск или просроченное обучение, затем возвращайтесь к обычной очереди."
                    : "Критичных отклонений нет: выберите следующий разговор из очереди и сохраните темп проверок."
                }
                href={primaryFocusHref}
                actionLabel={focusItems.length ? "К задаче" : "Открыть очередь"}
                tone={focusItems.length ? "warning" : "info"}
                placement="right"
                anchorLabel="Подсказка к текущему фокусу"
              />
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
              {agentRows.length === 0 ? (
                <p className="empty-note">Пока нет финализированных проверок за 30 дней.</p>
              ) : (
                agentRows.map((agent) => (
                  <Link key={agent.name} href={`/reviews?status=reviewed&assignee=${encodeURIComponent(agent.name)}`} className="dashboard-agent-row">
                    <span>{agent.name.slice(0, 2).toLocaleUpperCase("ru-RU")}</span>
                    <strong>{agent.name}</strong>
                    <small>{agent.count} проверок · {agent.riskCount} риск · {agent.appealCount} апелл.</small>
                    <em>{Math.round(agent.average)}</em>
                    <i style={{ width: `${Math.max(8, Math.round(agent.average))}%` }} />
                  </Link>
                ))
              )}
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
      }
      evidence={
        <EvidenceDrawer title="Последняя активность" description="Что менялось в проверках и обучении." defaultOpen>
          <div className="evidence-drawer__toolbar">
            <Link href={canReadAudit ? "/admin/audit" : "/reviews"} className="quiet-link">{canReadAudit ? "Аудит" : "Очередь"}</Link>
          </div>
          <div className="dashboard-activity-list">
            {recentEvents.slice(0, 5).map((event) => (
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
            ))}
            {recentEvents.length === 0 ? <p className="empty-note">Событий пока нет.</p> : null}
          </div>
        </EvidenceDrawer>
      }
    />
  );
}
