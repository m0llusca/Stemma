import type { IdentityProviderType } from "@prisma/client";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock3,
  Database,
  ListChecks,
  Play,
  Plug,
  RotateCcw,
  ServerCog,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { EmptyState } from "@/components/ui/empty-state";
import { StatStrip, type StatStripItem, type StatStripTone } from "@/components/ui/stat-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { TriageStrip } from "@/components/ui/triage-strip";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AdminSectionTabs } from "@/components/admin/admin-section-tabs";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { getPhaseDReadinessReport, type PhaseDReadinessItem } from "@/lib/certification/readiness-report";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, backendJobTypeLabel, integrationRunStatusView, queueNameLabel } from "@/lib/operational-status";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";
import { queueDirectorySync } from "@/lib/system-enqueue-actions";
import { queueRetentionCleanup, runQueuedBackendJobs } from "@/lib/system-actions";
import type { StatusTone } from "@/lib/ui/status-tone";

export const dynamic = "force-dynamic";

type AdminSystemPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SystemSection = "jobs" | "runtime" | "readiness" | "sso" | "integrations" | "maintenance";

type SystemNextAction = {
  section: SystemSection;
  label: string;
  title: string;
  detail: string;
};

const systemSections: Array<{ value: SystemSection; label: string }> = [
  { value: "jobs", label: "Задачи" },
  { value: "runtime", label: "Окружение" },
  { value: "readiness", label: "Готовность" },
  { value: "sso", label: "SSO и каталог" },
  { value: "integrations", label: "Интеграции" },
  { value: "maintenance", label: "Обслуживание" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function systemSectionParam(value: string | string[] | undefined): SystemSection {
  const section = firstParam(value);

  return systemSections.some((item) => item.value === section) ? (section as SystemSection) : "jobs";
}

function systemSectionHref(section: SystemSection) {
  return `/admin/system?section=${section}`;
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function runtimeTone(status: string): StatusTone {
  if (status === "ok") return "positive";
  if (status === "warn") return "warning";
  if (status === "error") return "negative";
  return "neutral";
}

function providerTone(status: string): StatusTone {
  if (status === "active") return "positive";
  if (status === "draft") return "info";
  if (status === "disabled") return "warning";
  return "neutral";
}

function integrationTone(status: string): StatusTone {
  if (status === "error") return "negative";
  if (status === "disabled") return "warning";
  if (status === "active" || status === "ready") return "positive";
  if (status === "queued") return "info";
  return "neutral";
}

function operationalTone(tone: "ok" | "warn" | "error" | "neutral"): StatusTone {
  if (tone === "ok") return "positive";
  if (tone === "warn") return "warning";
  if (tone === "error") return "negative";
  return "neutral";
}

/** StatusTone (чипы) → тон строки метрик StatStrip. */
function stripTone(tone: StatusTone): StatStripTone {
  if (tone === "positive") return "success";
  if (tone === "warning") return "warning";
  if (tone === "negative") return "danger";
  if (tone === "info") return "accent";
  return "neutral";
}

function certificationTone(status: string): StatusTone {
  if (["live_certified", "docs_checked", "contract_certified", "stub_certified"].includes(status)) {
    return "positive";
  }

  if (
    [
      "ready_for_live_certification",
      "waiting_for_access",
      "limited",
      "not_production_ready",
      "configuration_required",
      "secret_required",
      "certificate_required"
    ].includes(status)
  ) {
    return "warning";
  }

  return "neutral";
}

function runtimeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ok: "Готово",
    warn: "Требует внимания",
    error: "Ошибка"
  };

  return labels[status] ?? status;
}

function runtimeStatusShortLabel(status: string) {
  const labels: Record<string, string> = {
    ok: "Готово",
    warn: "Внимание",
    error: "Ошибка"
  };

  return labels[status] ?? status;
}

function providerStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Активен",
    draft: "Черновик",
    disabled: "Отключен"
  };

  return labels[status] ?? status;
}

function providerTypeLabel(type: IdentityProviderType) {
  const labels: Record<IdentityProviderType, string> = {
    DEMO: "Демо",
    MICROSOFT_ENTRA_ID: "Microsoft Entra ID",
    ACTIVE_DIRECTORY_LDAPS: "Active Directory LDAPS",
    OIDC: "OIDC",
    SAML: "SAML"
  };

  return labels[type];
}

function environmentLabel(environment: string) {
  const labels: Record<string, string> = {
    development: "Разработка",
    production: "Продакшен",
    test: "Тест"
  };

  return labels[environment] ?? environment;
}

function evidenceResultLabel(result: string) {
  const labels: Record<string, string> = {
    passed: "Пройдено",
    failed: "Ошибка",
    blocked: "Заблокировано",
    skipped: "Пропущено"
  };

  return labels[result] ?? result;
}

function evidenceDiagnosticsText(value: Record<string, unknown>) {
  const text = JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

/** Компактный ряд готовности: подпись и свидетельства слева, статус-чип справа. */
function renderReadinessItem(item: PhaseDReadinessItem) {
  return (
    <div key={item.key} className="setting-row">
      <div className="setting-row__copy">
        <span className="setting-row__label">{item.displayName}</span>
        <p className="setting-row__hint">
          {item.targetType === "identity_provider" ? "Провайдер удостоверений" : "Интеграция"} · {item.source}
        </p>
        <p className="setting-row__hint font-mono">{item.liveSmokeCommand}</p>
        {item.latestEvidence ? (
          <>
            <p className="setting-row__hint">
              Свидетельство {item.latestEvidence.runId} · {evidenceResultLabel(item.latestEvidence.result)} ·{" "}
              {new Date(item.latestEvidence.recordedAt).toLocaleString("ru-RU")}
            </p>
            <p className="setting-row__hint">
              Инициатор: {item.latestEvidence.actor ?? "Автоматика"} · Флаг окружения: {item.latestEvidence.envGate}
            </p>
            <p className="setting-row__hint font-mono">Диагностика: {evidenceDiagnosticsText(item.latestEvidence.redactedDiagnostics)}</p>
          </>
        ) : (
          <p className="setting-row__hint">Свидетельство защищенного проверочного прогона еще не записано.</p>
        )}
        <p className="setting-row__hint">{item.blockers.length > 0 ? item.blockers.slice(0, 3).join(" · ") : "Блокеров нет."}</p>
      </div>
      <div className="setting-row__control">
        <StatusBadge compact label="Статус" value={item.label} tone={certificationTone(item.status)} />
      </div>
    </div>
  );
}

export default function AdminSystemPage({ searchParams }: AdminSystemPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/system")} />}>
      <AdminSystemPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminSystemPageContent({ searchParams }: AdminSystemPageProps) {
  const params = await searchParams;
  const activeSection = systemSectionParam(params.section);
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24);
  const weekAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const [
    queuedJobs,
    runningJobs,
    failedJobs,
    succeededJobsToday,
    recentJobs,
    providers,
    integrations,
    recentRuns,
    activeSessions,
    expiredActiveSessions,
    expiredIdempotencyKeys,
    staleRateLimits,
    apiTokens,
    phaseDReport
  ] = await Promise.all([
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "QUEUED" } }),
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "RUNNING" } }),
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "FAILED" } }),
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "SUCCEEDED", finishedAt: { gte: dayAgo } } }),
    prisma.backendJob.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ createdAt: "desc" }],
      take: 8,
      include: {
        createdBy: {
          select: {
            name: true,
            email: true
          }
        },
        events: {
          orderBy: [{ createdAt: "desc" }],
          take: 1
        }
      }
    }),
    prisma.identityProvider.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            groupRoleMappings: true,
            authSessions: true
          }
        }
      }
    }),
    prisma.integration.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ updatedAt: "desc" }],
      take: 6
    }),
    prisma.integrationRun.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ startedAt: "desc" }],
      take: 5,
      include: {
        integration: true
      }
    }),
    prisma.authSession.count({ where: { workspaceId: user.workspaceId, status: "ACTIVE", expiresAt: { gt: now } } }),
    prisma.authSession.count({ where: { workspaceId: user.workspaceId, status: "ACTIVE", expiresAt: { lt: now } } }),
    prisma.idempotencyKey.count({ where: { workspaceId: user.workspaceId, expiresAt: { lt: now } } }),
    prisma.apiRateLimit.count({ where: { workspaceId: user.workspaceId, windowStart: { lt: weekAgo } } }),
    prisma.apiToken.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        lastSuccessAt: true,
        lastErrorAt: true,
        lastError: true
      }
    }),
    getPhaseDReadinessReport(user.workspaceId)
  ]);
  const runtime = getRuntimeConfigDiagnostics();
  const providerWarnings = providers.filter((provider) => provider.status !== "active" && provider.type !== "DEMO").length;
  const integrationErrors = integrations.filter((integration) => integration.lastError || integration.status === "error").length;
  const apiTokenErrors = apiTokens.filter(
    (token) => token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)
  ).length;
  const runtimeIssues = runtime.checks.filter((check) => check.status !== "ok").length;
  const runtimeHealthyChecks = runtime.checks.length - runtimeIssues;
  const readinessBlockers = phaseDReport.summary.failedOrLimited + phaseDReport.summary.waitingForAccess;
  const maintenanceBacklog = expiredActiveSessions + expiredIdempotencyKeys + staleRateLimits;
  const integrationRiskCount = integrationErrors + apiTokenErrors;
  const runtimeCritical = runtime.status === "error";
  const highSeverityIssues = (runtimeCritical ? 1 : 0) + failedJobs + integrationRiskCount;
  const warningSignals =
    (runtime.status === "warn" ? Math.max(runtimeIssues, 1) : 0) +
    queuedJobs +
    runningJobs +
    providerWarnings +
    readinessBlockers +
    maintenanceBacklog;
  const overallTone: StatusTone = highSeverityIssues > 0 ? "negative" : warningSignals > 0 ? "warning" : "positive";
  const overallLabel =
    overallTone === "negative" ? "Требует вмешательства" : overallTone === "warning" ? "Есть операционный риск" : "Система стабильна";
  const overallSummary =
    overallTone === "negative"
      ? `${highSeverityIssues} критичных сигналов: проверьте задачи, интеграции или окружение.`
      : overallTone === "warning"
        ? `${warningSignals} сигналов требуют плановой проверки, критичных ошибок нет.`
        : "Критичных сигналов нет, ключевые подсистемы готовы к работе.";
  const nextAction: SystemNextAction = runtimeCritical
    ? {
        section: "runtime",
        label: "Проверить окружение",
        title: "Восстановить конфигурацию",
        detail: `${runtimeIssues} проверок окружения не в норме. Начните с переменных окружения и фонового обработчика.`
      }
    : failedJobs > 0
      ? {
          section: "jobs",
          label: "Разобрать задачи",
          title: "Снять ошибки очереди",
          detail: `${failedJobs} задач завершились ошибкой. Откройте детали и повторите запуск после исправления причины.`
        }
      : integrationRiskCount > 0
          ? {
              section: "integrations",
              label: "Открыть интеграции",
              title: "Вернуть импорт в зеленую зону",
              detail: `${integrationRiskCount} сигналов по источникам или API-ключам влияют на загрузку данных.`
            }
          : providerWarnings > 0
            ? {
                section: "sso",
                label: "Проверить SSO",
                title: "Закрыть риски доступа",
                detail: `${providerWarnings} провайдеров каталога не активны. Проверьте синхронизацию и маппинги групп.`
              }
            : readinessBlockers > 0
              ? {
                  section: "readiness",
                  label: "Открыть готовность",
                  title: "Завершить сертификацию для боевого режима",
                  detail: `${readinessBlockers} объектов ждут доступы, свидетельства готовности или настройку перед сертификацией для боевого режима.`
                }
              : maintenanceBacklog > 0
                ? {
                    section: "maintenance",
                    label: "Открыть обслуживание",
                    title: "Очистить технический хвост",
                    detail: `${maintenanceBacklog} технических записей готовы к регулярной очистке.`
                  }
                : queuedJobs > 0
                  ? {
                      section: "jobs",
                      label: "Запустить очередь",
                      title: "Очередь готова к обработке",
                      detail: `${queuedJobs} задач ждут фоновый обработчик. Запустите обработку, если сейчас нет окна обслуживания.`
                    }
                  : {
                      section: "jobs",
                      label: "Посмотреть задачи",
                      title: "Критичных блокеров нет",
                      detail: "Остается регулярный мониторинг очереди и новых запусков интеграций."
                    };
  // Одна строка метрик вместо сетки карточек: переход по разделам делает
  // единственный механизм навигации — AdminSectionTabs ниже.
  const systemHealthItems: StatStripItem[] = [
    {
      label: "Общее состояние",
      value: overallLabel,
      hint: overallSummary,
      tone: stripTone(overallTone)
    },
    {
      label: "Окружение",
      value: runtimeStatusShortLabel(runtime.status),
      hint: `${runtimeHealthyChecks}/${runtime.checks.length} проверок · ${environmentLabel(runtime.environment)}`,
      tone: stripTone(runtimeTone(runtime.status))
    },
    {
      label: "Очередь задач",
      value: queuedJobs + runningJobs,
      hint: `ошибки: ${failedJobs} · успешно 24ч: ${succeededJobsToday}`,
      tone: failedJobs > 0 ? "danger" : queuedJobs + runningJobs > 0 ? "warning" : "success"
    },
    {
      label: "Готовность",
      value: `${phaseDReport.summary.liveCertified}/${phaseDReport.summary.total}`,
      hint: `готовы: ${phaseDReport.summary.readyForLiveCertification} · блокеры: ${readinessBlockers}`,
      tone:
        readinessBlockers > 0
          ? "warning"
          : phaseDReport.summary.total > 0 && phaseDReport.summary.liveCertified === phaseDReport.summary.total
            ? "success"
            : "neutral"
    },
    {
      label: "SSO и каталог",
      value: providers.length,
      hint: `сессии: ${activeSessions} · не активны: ${providerWarnings}`,
      tone: providerWarnings > 0 || expiredActiveSessions > 0 ? "warning" : providers.length > 0 ? "success" : "neutral"
    },
    {
      label: "Интеграции",
      value: integrations.length,
      hint: `ошибки: ${integrationRiskCount} · запусков: ${recentRuns.length}`,
      tone: integrationRiskCount > 0 ? "danger" : integrations.length > 0 ? "success" : "neutral"
    },
    {
      label: "Обслуживание",
      value: maintenanceBacklog,
      hint: "сессии, idempotency и rate limits",
      tone: maintenanceBacklog > 0 ? "warning" : "success"
    }
  ];

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/system"]}
      description="Единый контур для окружения, очереди, SSO/AD, интеграций и обслуживания."
    >
      <AdminFrame>
      <StatStrip ariaLabel="Операционная сводка системы" items={systemHealthItems} />

      <TriageStrip
        tone={overallTone === "negative" ? "danger" : overallTone === "warning" ? "warning" : "success"}
        icon={<Activity size={18} aria-hidden="true" />}
        title={`Следующий шаг: ${nextAction.title}`}
        description={nextAction.detail}
        action={
          <Link href={systemSectionHref(nextAction.section)} className="action-button action-button--small">
            {nextAction.label}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        }
      />

      <AdminSectionTabs
        ariaLabel="Разделы состояния системы"
        items={systemSections.map((section) => ({
          href: systemSectionHref(section.value),
          label: section.label,
          active: activeSection === section.value,
          count: section.value === "jobs" ? queuedJobs + runningJobs : undefined
        }))}
        actions={
          <form action={runQueuedBackendJobs} className="admin-inline-form">
            <select name="limit" defaultValue="5" className="form-control text-sm">
              <option value="5">5 задач</option>
              <option value="10">10 задач</option>
              <option value="20">20 задач</option>
            </select>
            <button type="submit" className="action-button action-button--primary">
              <Play size={16} aria-hidden="true" />
              Запустить
            </button>
          </form>
        }
      />

      {activeSection === "jobs" ? (
        <section className="ops-panel" aria-labelledby="system-jobs-title">
          <div className="ops-panel__header">
            <div>
              <h2 id="system-jobs-title" className="ops-panel__title">Фоновые задачи</h2>
              <p className="ops-panel__subtitle">Импорты, отчеты, синхронизация каталога и обслуживание данных.</p>
            </div>
          </div>
          <div className="px-5">
            <StatStrip
              ariaLabel="Сводка фоновых задач"
              items={[
                { label: "В очереди", value: queuedJobs, hint: "ожидают обработчик", tone: queuedJobs > 0 ? "warning" : "success" },
                { label: "Выполняется", value: runningJobs, hint: "сейчас в работе", tone: runningJobs > 0 ? "warning" : "success" },
                { label: "Успешно 24ч", value: succeededJobsToday, hint: "завершены за сутки", tone: succeededJobsToday > 0 ? "success" : "neutral" },
                { label: "Ошибки", value: failedJobs, hint: "требуют разбора", tone: failedJobs > 0 ? "danger" : "success" }
              ]}
            />
          </div>
          {failedJobs > 0 || queuedJobs > 0 ? (
            <div className={`system-attention system-attention--${failedJobs > 0 ? "negative" : "warning"}`}>
              <AlertTriangle size={17} aria-hidden="true" />
              <div>
                <p className="system-attention__title">{failedJobs > 0 ? "Есть задачи с ошибками" : "Очередь ожидает обработки"}</p>
                <p className="system-attention__text">
                  {failedJobs > 0
                    ? "Разберите последние события и повторите запуск после исправления причины."
                    : "Запустите обработчик вручную или дождитесь расписания, если это плановый импорт."}
                </p>
              </div>
            </div>
          ) : null}
          <div className={`record-list px-5${recentJobs.length > 0 ? " record-list--cols" : ""}`}>
            {recentJobs.length === 0 ? (
              <EmptyState size="inline" icon={<ListChecks size={20} aria-hidden="true" />} title="Фоновых задач пока нет" description="Очередь обработчика пуста — новые задачи появятся при импорте или обслуживании." />
            ) : (
              recentJobs.map((job) => {
                const status = backendJobStatusView(job.status);

                return (
                  <article key={job.id} className="record-card">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge compact label="Статус" value={status.label} tone={operationalTone(status.tone)} />
                        <h3 className="font-semibold text-[var(--foreground)]">{backendJobTypeLabel(job.type)}</h3>
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {queueNameLabel(job.queueName)} · попытка {job.attempts}/{job.maxAttempts} · {job.createdBy?.name ?? "Автоматика"}
                      </p>
                      {job.events[0] ? <p className="mt-2 text-sm text-[var(--text-muted)]">{job.events[0].message}</p> : null}
                      {job.errorMessage ? <p className="mt-2 text-sm font-medium text-[var(--danger)]">{job.errorMessage}</p> : null}
                    </div>
                    <div className="record-row">
                      <p className="record-meta tabular-nums">Запуск: {formatDate(job.runAfter)}</p>
                      <Link href={`/admin/system/jobs/${job.id}`} className="action-button action-button--small">
                        Детали задачи
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "runtime" ? (
        <section className="ops-panel" aria-labelledby="runtime-title">
          <div className="ops-panel__header">
            <div>
              <h2 id="runtime-title" className="ops-panel__title">Готовность окружения</h2>
              <p className="ops-panel__subtitle">Проверки конфигурации перед рабочим запуском.</p>
            </div>
            <StatusBadge compact label="Статус" value={runtimeStatusLabel(runtime.status)} tone={runtimeTone(runtime.status)} />
          </div>
          <div className="px-5 pb-5">
            <StatStrip
              ariaLabel="Сводка окружения"
              items={[
                {
                  label: "Проверки",
                  value: `${runtimeHealthyChecks}/${runtime.checks.length}`,
                  hint: "конфигурация в норме",
                  tone: runtimeIssues > 0 ? "warning" : "success"
                },
                { label: "Окружение", value: environmentLabel(runtime.environment), hint: "текущий режим приложения", tone: "accent" },
                { label: "Проблемы", value: runtimeIssues, hint: "проверки не в статусе Готово", tone: runtimeIssues > 0 ? "danger" : "success" }
              ]}
            />
            <div className="setting-rows">
              {runtime.checks.map((check) => (
                <div key={check.key} className="setting-row">
                  <div className="setting-row__copy">
                    <span className="setting-row__label">{check.key}</span>
                    <p className="setting-row__hint">{check.message}</p>
                  </div>
                  <div className="setting-row__control">
                    <StatusBadge compact label="Статус" value={runtimeStatusLabel(check.status)} tone={runtimeTone(check.status)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "readiness" ? (
        <section className="ops-panel" aria-labelledby="phase-d-readiness-title">
          <div className="ops-panel__header">
            <div>
              <h2 id="phase-d-readiness-title" className="ops-panel__title">Сертификация для боевого режима</h2>
              <p className="ops-panel__subtitle">
                Phase D: интеграции, провайдеры удостоверений и только обезличенные свидетельства из защищенных проверочных прогонов.
              </p>
            </div>
          </div>
          <div className="px-5">
            <StatStrip
              ariaLabel="Сводка сертификации для боевого режима"
              items={[
                { label: "Всего объектов", value: phaseDReport.summary.total, hint: "интеграции и провайдеры удостоверений" },
                {
                  label: "Сертифицировано",
                  value: phaseDReport.summary.liveCertified,
                  hint: "только успешные защищенные свидетельства",
                  tone: "success"
                },
                {
                  label: "Готово к боевому режиму",
                  value: phaseDReport.summary.readyForLiveCertification,
                  hint: "контракты готовы, доступов нет",
                  tone: "warning"
                },
                {
                  label: "Блокеры",
                  value: phaseDReport.summary.failedOrLimited + phaseDReport.summary.waitingForAccess,
                  hint: "ожидают доступы, настройку или исправление",
                  tone: "warning"
                }
              ]}
            />
          </div>
          <div className="grid gap-5 p-5 pt-2 lg:grid-cols-2">
            <section aria-labelledby="phase-d-integrations-title">
              <h3 id="phase-d-integrations-title" className="mb-1 text-sm font-semibold uppercase text-[var(--text-muted)]">
                Интеграции
              </h3>
              <div className="setting-rows">{phaseDReport.integrations.map(renderReadinessItem)}</div>
            </section>
            <section aria-labelledby="phase-d-identity-title">
              <h3 id="phase-d-identity-title" className="mb-1 text-sm font-semibold uppercase text-[var(--text-muted)]">
                Провайдеры удостоверений
              </h3>
              {phaseDReport.identityProviders.length > 0 ? (
                <div className="setting-rows">{phaseDReport.identityProviders.map(renderReadinessItem)}</div>
              ) : (
                <EmptyState size="inline" icon={<ShieldCheck size={20} aria-hidden="true" />} title="Провайдеры не настроены" description="SSO появится здесь после настройки провайдера входа в разделе «Доступ и SSO»." />
              )}
            </section>
          </div>
          <div className="soft-callout mx-5 mb-5 text-sm text-[var(--text-muted)]">
            <p className="font-semibold text-[var(--text-body)]">Модель свидетельств</p>
            <p className="compact-text">Поля: {phaseDReport.evidenceModel.requiredFields.join(", ")}.</p>
            <p className="compact-text">Защитные флаги окружения: {phaseDReport.evidenceModel.protectedEnvGates.slice(0, 5).join(", ")}.</p>
          </div>
        </section>
      ) : null}

      {activeSection === "sso" ? (
        <section className="ops-panel" aria-labelledby="system-sso-title">
          <div className="ops-panel__header">
            <div>
              <h2 id="system-sso-title" className="ops-panel__title">SSO и каталог</h2>
              <p className="ops-panel__subtitle">Провайдеры авторизации, маппинги групп и ручной запуск синхронизации.</p>
            </div>
            <Link href="/admin/access" className="action-button action-button--small">
              Открыть раздел
            </Link>
          </div>
          <div className="px-5 pb-5">
            <StatStrip
              ariaLabel="Сводка SSO и каталога"
              items={[
                { label: "Провайдеры", value: providers.length, hint: `не активны: ${providerWarnings}`, tone: providerWarnings > 0 ? "warning" : "success" },
                { label: "Сессии", value: activeSessions, hint: "активные сейчас" },
                {
                  label: "Просрочены",
                  value: expiredActiveSessions,
                  hint: "будут закрыты обслуживанием",
                  tone: expiredActiveSessions > 0 ? "warning" : "success"
                }
              ]}
            />
            {providers.length === 0 ? (
              <EmptyState size="inline" icon={<ShieldCheck size={20} aria-hidden="true" />} title="Провайдеры не настроены" description="SSO появится здесь после настройки провайдера входа в разделе «Доступ и SSO»." />
            ) : (
              <div className="setting-rows">
                {providers.map((provider) => (
                  <div key={provider.id} className="setting-row">
                    <div className="setting-row__copy">
                      <span className="setting-row__label">
                        {provider.name}
                        <StatusBadge compact label="Статус" value={providerStatusLabel(provider.status)} tone={providerTone(provider.status)} />
                      </span>
                      <p className="setting-row__hint tabular-nums">
                        {providerTypeLabel(provider.type)} · {provider.slug} · маппингов: {provider._count.groupRoleMappings} · сессий:{" "}
                        {provider._count.authSessions} · последняя синхронизация: {formatDate(provider.lastSyncAt)}
                      </p>
                    </div>
                    {provider.type !== "DEMO" ? (
                      <div className="setting-row__control">
                        <form action={queueDirectorySync}>
                          <input type="hidden" name="providerId" value={provider.id} />
                          <button type="submit" className="action-button action-button--small">
                            <ShieldCheck size={16} aria-hidden="true" />
                            Синхронизировать
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "integrations" ? (
        <section className="ops-panel" aria-labelledby="system-integrations-title">
          <div className="ops-panel__header">
            <div>
              <h2 id="system-integrations-title" className="ops-panel__title">Интеграции</h2>
              <p className="ops-panel__subtitle">Последние подключения, статусы импортов и API-ключи.</p>
            </div>
            <Link href="/admin/integrations" className="action-button action-button--small">
              Открыть раздел
            </Link>
          </div>
          <div className="px-5">
            <StatStrip
              ariaLabel="Сводка интеграций"
              items={[
                { label: "Источники", value: integrations.length, hint: `ошибки: ${integrationErrors}`, tone: integrationErrors > 0 ? "danger" : "neutral" },
                { label: "API-ключи", value: apiTokens.length, hint: `ошибки: ${apiTokenErrors}`, tone: apiTokenErrors > 0 ? "danger" : "success" },
                { label: "Последние запуски", value: recentRuns.length, hint: "импорты и пробные запуски", tone: recentRuns.length > 0 ? "accent" : "neutral" }
              ]}
            />
          </div>
          <div className="grid gap-5 p-5 pt-2 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
            <section aria-labelledby="integration-sources-title">
              <h3 id="integration-sources-title" className="mb-1 text-sm font-semibold uppercase text-[var(--text-muted)]">Источники данных</h3>
              {integrations.length === 0 ? (
                <EmptyState size="inline" icon={<Plug size={20} aria-hidden="true" />} title="Интеграции не настроены" description="Подключите источник, чтобы отслеживать его состояние здесь." />
              ) : (
                <div className="setting-rows">
                  {integrations.map((integration) => (
                    <div key={integration.id} className="setting-row">
                      <div className="setting-row__copy">
                        <span className="setting-row__label">{integration.displayName}</span>
                        <p className="setting-row__hint tabular-nums">
                          {externalSourceLabel(integration.source)} · лимит: {integration.importLimit} · батч: {integration.batchSize} · последний
                          импорт: {formatDate(integration.lastImportAt)}
                        </p>
                        {integration.lastError ? <p className="mt-1 text-sm font-medium text-[var(--danger)]">{integration.lastError}</p> : null}
                      </div>
                      <div className="setting-row__control">
                        <StatusBadge compact label="Статус" value={integrationStatusLabel(integration.status)} tone={integrationTone(integration.status)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section aria-labelledby="integration-token-title">
              <h3 id="integration-token-title" className="mb-1 text-sm font-semibold uppercase text-[var(--text-muted)]">API-ключи</h3>
              {apiTokens.length === 0 ? (
                <EmptyState size="inline" icon={<ServerCog size={20} aria-hidden="true" />} title="API-ключей нет" description="Активность по ключам появится после выпуска первого ключа." />
              ) : (
                <div className="setting-rows">
                  {apiTokens.map((token) => {
                    const tokenHasError = Boolean(
                      token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)
                    );

                    return (
                      <div key={token.id} className="setting-row">
                        <div className="setting-row__copy">
                          <span className="setting-row__label">{token.name}</span>
                          <p className="setting-row__hint tabular-nums">
                            Последний успех: {formatDate(token.lastSuccessAt)} · последняя ошибка: {formatDate(token.lastErrorAt)}
                          </p>
                          {token.lastError ? <p className="mt-1 text-sm font-medium text-[var(--danger)]">{token.lastError}</p> : null}
                        </div>
                        <div className="setting-row__control">
                          <StatusBadge compact
                            label="Статус"
                            value={tokenHasError ? "Ошибка" : token.lastSuccessAt ? "Работает" : "Нет запусков"}
                            tone={tokenHasError ? "negative" : token.lastSuccessAt ? "positive" : "neutral"}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          <div className="border-t border-[var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold uppercase text-[var(--text-muted)]">Последние импорты</h3>
            {recentRuns.length === 0 ? (
              <EmptyState size="inline" icon={<Database size={20} aria-hidden="true" />} title="Запусков пока нет" description="История импортов и пробных запусков появится после первого запуска." />
            ) : (
              <div className="setting-rows">
                {recentRuns.map((run) => {
                  const status = integrationRunStatusView(run.status);

                  return (
                    <div key={run.id} className="setting-row">
                      <div className="setting-row__copy">
                        <span className="setting-row__label">{run.integration?.displayName ?? run.source}</span>
                        <p className="setting-row__hint tabular-nums">
                          {run.dryRun ? "Пробный запуск" : "Импорт"} · {run.importedCount}/{run.requestedLimit} · {formatDate(run.startedAt)}
                        </p>
                      </div>
                      <div className="setting-row__control">
                        <StatusBadge label={run.dryRun ? "Проверка" : "Импорт"} value={status.label} tone={operationalTone(status.tone)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "maintenance" ? (
        <section className="ops-panel" aria-labelledby="maintenance-title">
          <div className="ops-panel__header">
            <div>
              <h2 id="maintenance-title" className="ops-panel__title">Обслуживание</h2>
              <p className="ops-panel__subtitle">Технические записи, которые чистит задача обслуживания.</p>
            </div>
          </div>
          <div className="px-5 pb-5">
            <StatStrip
              ariaLabel="Сводка обслуживания"
              items={[
                {
                  label: "Просроченные сессии",
                  value: expiredActiveSessions,
                  hint: "будут помечены как истекшие",
                  tone: expiredActiveSessions > 0 ? "warning" : "success"
                },
                {
                  label: "Ключи повторных запросов",
                  value: expiredIdempotencyKeys,
                  hint: "можно удалить после TTL",
                  tone: expiredIdempotencyKeys > 0 ? "warning" : "success"
                },
                { label: "Окна лимитов API", value: staleRateLimits, hint: "старше 7 дней", tone: staleRateLimits > 0 ? "warning" : "success" }
              ]}
            />
            <div className="setting-rows">
              <div className="setting-row">
                <div className="setting-row__copy">
                  <span className="setting-row__label">Очистка технических записей</span>
                  <p className="setting-row__hint">
                    Ставит в очередь задачу обслуживания: просроченные сессии, ключи повторных запросов и окна лимитов API.
                  </p>
                </div>
                <div className="setting-row__control">
                  <form action={queueRetentionCleanup}>
                    <button type="submit" className="action-button">
                      <RotateCcw size={16} aria-hidden="true" />
                      Очистка
                    </button>
                  </form>
                </div>
              </div>
            </div>
            <div className="soft-callout mt-3 text-sm text-[var(--text-muted)]">
              <Clock3 size={16} className="mr-2 inline-block align-[-3px]" aria-hidden="true" />
              Для cron-запуска фоновых задач используйте{" "}
              <code className="rounded bg-[var(--panel-muted)] px-1.5 py-0.5 text-xs text-[var(--text-body)]">npm run jobs:run -- --once</code>.
              Команда <code className="rounded bg-[var(--panel-muted)] px-1.5 py-0.5 text-xs text-[var(--text-body)]">npm run jobs:run</code> запускает постоянный фоновый обработчик.
            </div>
          </div>
        </section>
      ) : null}
      </AdminFrame>
    </PageShell>
  );
}
