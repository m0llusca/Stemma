import type { IdentityProviderType } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Clock3, Play, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { MetricValue } from "@/components/ui/metric-value";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPhaseDReadinessReport, type PhaseDReadinessItem } from "@/lib/certification/readiness-report";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, backendJobTypeLabel, integrationRunStatusView, queueNameLabel } from "@/lib/operational-status";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";
import { queueDirectorySync } from "@/lib/system-enqueue-actions";
import { queueRetentionCleanup, runQueuedBackendJobs } from "@/lib/system-actions";
import { toneForCount, type StatusTone } from "@/lib/ui/status-tone";

export const dynamic = "force-dynamic";

type AdminSystemPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SystemSection = "jobs" | "runtime" | "readiness" | "sso" | "integrations" | "maintenance";

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

function renderReadinessItem(item: PhaseDReadinessItem) {
  return (
    <article key={item.key} className="record-card">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Статус" value={item.label} tone={certificationTone(item.status)} />
          <h3 className="font-semibold text-[var(--foreground)]">{item.displayName}</h3>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {item.targetType === "identity_provider" ? "Провайдер удостоверений" : "Интеграция"} · {item.source}
        </p>
        <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">{item.liveSmokeCommand}</p>
        {item.latestEvidence ? (
          <div className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
            <p>
              Evidence {item.latestEvidence.runId} · {evidenceResultLabel(item.latestEvidence.result)} ·{" "}
              {new Date(item.latestEvidence.recordedAt).toLocaleString("ru-RU")}
            </p>
            <p className="compact-text">Actor: {item.latestEvidence.actor ?? "Автоматика"} · Env gate: {item.latestEvidence.envGate}</p>
            <p className="compact-text font-mono text-xs">Diagnostics: {evidenceDiagnosticsText(item.latestEvidence.redactedDiagnostics)}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-muted)]">Protected live smoke evidence еще не записан.</p>
        )}
      </div>
      <div className="record-row">
        <p className="record-meta compact-text">
          {item.blockers.length > 0 ? item.blockers.slice(0, 3).join(" · ") : "Блокеров нет."}
        </p>
      </div>
    </article>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral"
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: StatusTone;
}) {
  const toneClass = {
    positive: "soft-callout--ok",
    warning: "soft-callout--warn",
    negative: "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)]",
    info: "",
    neutral: ""
  }[tone];

  return (
    <div className={`soft-callout ${toneClass}`}>
      <p className="soft-callout__label">{label}</p>
      <MetricValue value={value} tone={tone} />
      <p className="record-meta">{hint}</p>
    </div>
  );
}

export default function AdminSystemPage({ searchParams }: AdminSystemPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка системы" />}>
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

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Состояние системы</h1>
          <p className="page-subtitle">
            Короткий операционный экран: окружение, фоновые задачи, SSO/AD, импорты и очистка технических записей.
          </p>
          <div className="admin-actions admin-actions--forms mt-5">
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
            <form action={queueRetentionCleanup}>
              <button type="submit" className="action-button">
                <RotateCcw size={16} aria-hidden="true" />
                Очистка
              </button>
            </form>
          </div>
        </div>
      </div>

      <section className="ops-metric-grid" aria-label="Сводка системы">
        <div className="ops-metric">
          <span className="ops-metric__label">Окружение</span>
          <StatusBadge label="Статус" value={runtimeStatusLabel(runtime.status)} tone={runtimeTone(runtime.status)} />
          <span className="ops-metric__note">{environmentLabel(runtime.environment)}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Очередь задач</span>
          <MetricValue value={queuedJobs} tone={toneForCount(queuedJobs, { zero: "positive", nonZero: "warning" })} />
          <span className="ops-metric__note">
            <StatusBadge label="Выполняется" value={runningJobs} tone={toneForCount(runningJobs, { zero: "positive", nonZero: "warning" })} />
          </span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Ошибки задач</span>
          <MetricValue value={failedJobs} tone={toneForCount(failedJobs, { zero: "positive", nonZero: "negative" })} />
          <span className="ops-metric__note">
            <StatusBadge label="Успешно 24ч" value={succeededJobsToday} tone={toneForCount(succeededJobsToday, { zero: "neutral", nonZero: "positive" })} />
          </span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Активные сессии</span>
          <MetricValue value={activeSessions} tone={toneForCount(activeSessions, { zero: "neutral", nonZero: "info" })} />
          <span className="ops-metric__note">
            <StatusBadge
              label="Просрочено"
              value={expiredActiveSessions}
              tone={toneForCount(expiredActiveSessions, { zero: "positive", nonZero: "warning" })}
            />
          </span>
        </div>
      </section>

      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы состояния системы">
        {systemSections.map((section) => (
          <Link
            key={section.value}
            href={systemSectionHref(section.value)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "jobs" ? (
        <section className="ops-panel" aria-labelledby="system-jobs-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Очередь</p>
              <h2 id="system-jobs-title" className="ops-panel__title">Фоновые задачи</h2>
              <p className="ops-panel__subtitle">Импорты, отчеты, синхронизация каталога и обслуживание данных.</p>
            </div>
            <StatusBadge label="Всего" value={recentJobs.length} tone={toneForCount(recentJobs.length, { zero: "neutral", nonZero: "info" })} />
          </div>
          <div className="record-list px-5">
            {recentJobs.length === 0 ? (
              <div className="soft-callout ops-empty text-sm text-[var(--text-muted)]">Фоновых задач пока нет.</div>
            ) : (
              recentJobs.map((job) => {
                const status = backendJobStatusView(job.status);

                return (
                  <article key={job.id} className="record-card">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label="Статус" value={status.label} tone={operationalTone(status.tone)} />
                        <h3 className="font-semibold text-[var(--foreground)]">{backendJobTypeLabel(job.type)}</h3>
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {queueNameLabel(job.queueName)} · попытка {job.attempts}/{job.maxAttempts} · {job.createdBy?.name ?? "Автоматика"}
                      </p>
                      {job.events[0] ? <p className="mt-2 text-sm text-[var(--text-muted)]">{job.events[0].message}</p> : null}
                      {job.errorMessage ? <p className="mt-2 text-sm font-medium text-[var(--danger)]">{job.errorMessage}</p> : null}
                    </div>
                    <div className="record-row">
                      <p className="record-meta">Запуск: {formatDate(job.runAfter)}</p>
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
              <p className="ops-panel__eyebrow">Окружение</p>
              <h2 id="runtime-title" className="ops-panel__title">Готовность окружения</h2>
              <p className="ops-panel__subtitle">Проверки конфигурации перед production-запуском.</p>
            </div>
            <StatusBadge label="Статус" value={runtimeStatusLabel(runtime.status)} tone={runtimeTone(runtime.status)} />
          </div>
          <div className="record-list px-5">
            {runtime.checks.map((check) => {
              const Icon = check.status === "ok" ? CheckCircle2 : AlertTriangle;

              return (
                <div key={check.key} className="record-card grid-cols-[auto_minmax(0,1fr)]">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)]">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--foreground)]">{check.key}</p>
                      <StatusBadge label="Статус" value={runtimeStatusLabel(check.status)} tone={runtimeTone(check.status)} />
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{check.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeSection === "readiness" ? (
        <section className="ops-panel" aria-labelledby="phase-d-readiness-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Phase D</p>
          <h2 id="phase-d-readiness-title" className="ops-panel__title">Готовность живой сертификации</h2>
          <p className="ops-panel__subtitle">
                Отчет по живой сертификации: интеграции, провайдеры удостоверений и только redacted evidence из protected smoke runs.
              </p>
            </div>
            <StatusBadge
              label="Live"
              value={`${phaseDReport.summary.liveCertified}/${phaseDReport.summary.total}`}
              tone={phaseDReport.summary.liveCertified > 0 ? "positive" : "warning"}
            />
          </div>
          <section className="ops-metric-grid p-5 pt-0" aria-label="Сводка live certification">
            <StatCard label="Всего объектов" value={phaseDReport.summary.total} hint="Интеграции и провайдеры удостоверений" />
            <StatCard label="Live-certified" value={phaseDReport.summary.liveCertified} hint="Только successful protected evidence" tone="positive" />
            <StatCard label="Готовы к live" value={phaseDReport.summary.readyForLiveCertification} hint="Контракты готовы, доступов нет" tone="warning" />
            <StatCard label="Блокеры" value={phaseDReport.summary.failedOrLimited + phaseDReport.summary.waitingForAccess} hint="Ожидают доступы, настройку или исправление" tone="warning" />
          </section>
          <div className="grid gap-5 p-5 pt-0 lg:grid-cols-2">
            <section aria-labelledby="phase-d-integrations-title">
              <h3 id="phase-d-integrations-title" className="mb-3 text-sm font-semibold uppercase text-[var(--text-muted)]">
                Интеграции
              </h3>
              <div className="record-list">
                {phaseDReport.integrations.map(renderReadinessItem)}
              </div>
            </section>
            <section aria-labelledby="phase-d-identity-title">
              <h3 id="phase-d-identity-title" className="mb-3 text-sm font-semibold uppercase text-[var(--text-muted)]">
                Провайдеры удостоверений
              </h3>
              <div className="record-list">
                {phaseDReport.identityProviders.length > 0 ? (
                  phaseDReport.identityProviders.map(renderReadinessItem)
                ) : (
                  <div className="soft-callout ops-empty text-sm text-[var(--text-muted)]">Провайдеры удостоверений еще не настроены.</div>
                )}
              </div>
            </section>
          </div>
          <div className="soft-callout mx-5 mb-5 text-sm text-[var(--text-muted)]">
            <p className="font-semibold text-[var(--text-body)]">Evidence model</p>
            <p className="compact-text">Поля: {phaseDReport.evidenceModel.requiredFields.join(", ")}.</p>
            <p className="compact-text">Protected gates: {phaseDReport.evidenceModel.protectedEnvGates.slice(0, 5).join(", ")}.</p>
          </div>
        </section>
      ) : null}

      {activeSection === "sso" ? (
        <section className="ops-panel" aria-labelledby="system-sso-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Каталог</p>
              <h2 id="system-sso-title" className="ops-panel__title">SSO и каталог</h2>
              <p className="ops-panel__subtitle">Провайдеры авторизации, маппинги групп и ручной запуск синхронизации.</p>
            </div>
            <Link href="/admin/access" className="action-button action-button--small">
              Настроить
            </Link>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <StatCard label="Провайдеры" value={providers.length} hint={`Не активны: ${providerWarnings}`} tone={providerWarnings > 0 ? "warning" : "positive"} />
            <StatCard label="Сессии" value={activeSessions} hint="Активные сейчас" tone="neutral" />
          </div>
          <div className="record-list px-5">
            {providers.map((provider) => (
              <article key={provider.id} className="record-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[var(--foreground)]">{provider.name}</h3>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {providerTypeLabel(provider.type)} · {provider.slug}
                    </p>
                  </div>
                  <StatusBadge label="Статус" value={providerStatusLabel(provider.status)} tone={providerTone(provider.status)} />
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Маппингов: {provider._count.groupRoleMappings} · сессий: {provider._count.authSessions} · последняя синхронизация:{" "}
                  {formatDate(provider.lastSyncAt)}
                </p>
                {provider.type !== "DEMO" ? (
                  <form action={queueDirectorySync}>
                    <input type="hidden" name="providerId" value={provider.id} />
                    <button type="submit" className="action-button action-button--small">
                      <ShieldCheck size={16} aria-hidden="true" />
                      Синхронизировать
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeSection === "integrations" ? (
        <section className="ops-panel" aria-labelledby="system-integrations-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Источники</p>
              <h2 id="system-integrations-title" className="ops-panel__title">Интеграции</h2>
              <p className="ops-panel__subtitle">Последние подключения, статусы импортов и API-ключи.</p>
            </div>
            <Link href="/admin/integrations" className="action-button action-button--small">
              К интеграциям
            </Link>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <StatCard label="Источники" value={integrations.length} hint={`Ошибки: ${integrationErrors}`} tone={integrationErrors > 0 ? "negative" : "neutral"} />
            <StatCard label="API-ключи" value={apiTokens.length} hint={`Ошибки: ${apiTokenErrors}`} tone={apiTokenErrors > 0 ? "negative" : "positive"} />
          </div>
          <div className="record-list px-5">
            {integrations.length === 0 ? (
              <div className="soft-callout ops-empty text-sm text-[var(--text-muted)]">Интеграции еще не настроены.</div>
            ) : (
              integrations.map((integration) => (
                <article key={integration.id} className="record-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[var(--foreground)]">{integration.displayName}</h3>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{externalSourceLabel(integration.source)}</p>
                    </div>
                    <StatusBadge label="Статус" value={integrationStatusLabel(integration.status)} tone={integrationTone(integration.status)} />
                  </div>
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Лимит: {integration.importLimit} · батч: {integration.batchSize} · последний импорт: {formatDate(integration.lastImportAt)}
                  </p>
                  {integration.lastError ? <p className="mt-2 text-sm font-medium text-[var(--danger)]">{integration.lastError}</p> : null}
                </article>
              ))
            )}
          </div>
          <div className="border-t border-[var(--border)] px-5 py-4">
            <h3 className="font-semibold text-[var(--foreground)]">Последние импорты</h3>
            <div className="record-list mt-3 border-y border-[var(--border)]">
              {recentRuns.length === 0 ? (
                <p className="soft-callout text-sm text-[var(--text-muted)]">Запусков пока нет.</p>
              ) : (
                recentRuns.map((run) => {
                  const status = integrationRunStatusView(run.status);

                  return (
                    <div key={run.id} className="record-card text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[var(--foreground)]">{run.integration?.displayName ?? run.source}</p>
                        <StatusBadge label={run.dryRun ? "Проверка" : "Импорт"} value={status.label} tone={operationalTone(status.tone)} />
                      </div>
                      <p className="mt-2 text-[var(--text-muted)]">
                        {run.dryRun ? "Пробный запуск" : "Импорт"} · {run.importedCount}/{run.requestedLimit} · {formatDate(run.startedAt)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "maintenance" ? (
        <section className="ops-panel" aria-labelledby="maintenance-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Очистка</p>
              <h2 id="maintenance-title" className="ops-panel__title">Обслуживание</h2>
              <p className="ops-panel__subtitle">Технические записи, которые чистит задача обслуживания.</p>
            </div>
          </div>
          <div className="grid gap-3 p-5">
            <StatCard label="Просроченные сессии" value={expiredActiveSessions} hint="Будут помечены как истекшие" tone={expiredActiveSessions > 0 ? "warning" : "positive"} />
            <StatCard label="Ключи повторных запросов" value={expiredIdempotencyKeys} hint="Можно удалить после TTL" tone={expiredIdempotencyKeys > 0 ? "warning" : "positive"} />
            <StatCard label="Окна лимитов API" value={staleRateLimits} hint="Старше 7 дней" tone={staleRateLimits > 0 ? "warning" : "positive"} />
            <div className="soft-callout text-sm text-[var(--text-muted)]">
              <Clock3 size={16} className="mr-2 inline-block align-[-3px]" aria-hidden="true" />
              Для cron-запуска фоновых задач используйте{" "}
              <code className="rounded bg-[var(--panel-muted)] px-1.5 py-0.5 text-xs text-[var(--text-body)]">npm run jobs:run -- --once</code>.
              Команда <code className="rounded bg-[var(--panel-muted)] px-1.5 py-0.5 text-xs text-[var(--text-body)]">npm run jobs:run</code> запускает постоянный worker.
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
