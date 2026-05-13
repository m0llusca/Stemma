import type { IdentityProviderType } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Clock3, Play, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, backendJobTypeLabel, integrationRunStatusView, queueNameLabel } from "@/lib/operational-status";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";
import { queueDirectorySync, queueRetentionCleanup, runQueuedBackendJobs } from "@/lib/system-actions";

export const dynamic = "force-dynamic";

type AdminSystemPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SystemSection = "jobs" | "runtime" | "sso" | "integrations" | "maintenance";

const systemSections: Array<{ value: SystemSection; label: string }> = [
  { value: "jobs", label: "Задачи" },
  { value: "runtime", label: "Окружение" },
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

function statusTone(status: string) {
  if (["ok", "active", "SUCCEEDED", "READY"].includes(status)) {
    return "border-[#bbf7d0] bg-[#ecfdf5] text-[#15803d]";
  }

  if (["warn", "queued", "RUNNING", "QUEUED", "draft"].includes(status)) {
    return "border-[#fed7aa] bg-[#fff7ed] text-[#b45309]";
  }

  if (["error", "FAILED", "disabled"].includes(status)) {
    return "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]";
  }

  return "border-[#d9e0ea] bg-[#f8fafc] text-[#334155]";
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

function StatCard({
  label,
  value,
  hint,
  tone = "neutral"
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: "ok" | "warn" | "error" | "neutral";
}) {
  const toneClass = {
    ok: "soft-callout--ok",
    warn: "soft-callout--warn",
    error: "border-[#fecaca] bg-[#fef2f2]",
    neutral: ""
  }[tone];

  return (
    <div className={`soft-callout ${toneClass}`}>
      <p className="soft-callout__label">{label}</p>
      <p className="metric-strip__value">{value}</p>
      <p className="record-meta">{hint}</p>
    </div>
  );
}

export default async function AdminSystemPage({ searchParams }: AdminSystemPageProps) {
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
    apiTokens
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
    })
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
          <strong className="ops-metric__value">{runtime.status === "ok" ? "Готово" : runtime.status === "warn" ? "Внимание" : "Ошибка"}</strong>
          <span className="ops-metric__note">{environmentLabel(runtime.environment)}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Очередь задач</span>
          <strong className="ops-metric__value">{queuedJobs}</strong>
          <span className="ops-metric__note">Выполняется: {runningJobs}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Ошибки задач</span>
          <strong className="ops-metric__value">{failedJobs}</strong>
          <span className="ops-metric__note">Успешно за 24 часа: {succeededJobsToday}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Активные сессии</span>
          <strong className="ops-metric__value">{activeSessions}</strong>
          <span className="ops-metric__note">Просрочено активных: {expiredActiveSessions}</span>
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
            <span className="pill pill--neutral">{recentJobs.length}</span>
          </div>
          <div className="record-list px-5">
            {recentJobs.length === 0 ? (
              <div className="soft-callout ops-empty text-sm text-[#64748b]">Фоновых задач пока нет.</div>
            ) : (
              recentJobs.map((job) => {
                const status = backendJobStatusView(job.status);

                return (
                  <article key={job.id} className="record-card">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`pill ${status.pillClass}`}>{status.label}</span>
                        <h3 className="font-semibold text-[#111827]">{backendJobTypeLabel(job.type)}</h3>
                      </div>
                      <p className="mt-1 text-sm text-[#64748b]">
                        {queueNameLabel(job.queueName)} · попытка {job.attempts}/{job.maxAttempts} · {job.createdBy?.name ?? "Автоматика"}
                      </p>
                      {job.events[0] ? <p className="mt-2 text-sm text-[#64748b]">{job.events[0].message}</p> : null}
                      {job.errorMessage ? <p className="mt-2 text-sm font-medium text-[#b91c1c]">{job.errorMessage}</p> : null}
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
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(runtime.status)}`}>
              {runtimeStatusLabel(runtime.status)}
            </span>
          </div>
          <div className="record-list px-5">
            {runtime.checks.map((check) => {
              const Icon = check.status === "ok" ? CheckCircle2 : AlertTriangle;

              return (
                <div key={check.key} className="record-card grid-cols-[auto_minmax(0,1fr)]">
                  <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${statusTone(check.status)}`}>
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#111827]">{check.key}</p>
                    <p className="mt-1 text-sm leading-5 text-[#64748b]">{check.message}</p>
                  </div>
                </div>
              );
            })}
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
            <StatCard label="Провайдеры" value={providers.length} hint={`Не активны: ${providerWarnings}`} tone={providerWarnings > 0 ? "warn" : "ok"} />
            <StatCard label="Сессии" value={activeSessions} hint="Активные сейчас" tone="neutral" />
          </div>
          <div className="record-list px-5">
            {providers.map((provider) => (
              <article key={provider.id} className="record-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[#111827]">{provider.name}</h3>
                    <p className="mt-1 text-sm text-[#64748b]">
                      {providerTypeLabel(provider.type)} · {provider.slug}
                    </p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(provider.status)}`}>
                    {providerStatusLabel(provider.status)}
                  </span>
                </div>
                <p className="text-sm text-[#64748b]">
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
            <StatCard label="Источники" value={integrations.length} hint={`Ошибки: ${integrationErrors}`} tone={integrationErrors > 0 ? "error" : "neutral"} />
            <StatCard label="API-ключи" value={apiTokens.length} hint={`Ошибки: ${apiTokenErrors}`} tone={apiTokenErrors > 0 ? "error" : "ok"} />
          </div>
          <div className="record-list px-5">
            {integrations.length === 0 ? (
              <div className="soft-callout ops-empty text-sm text-[#64748b]">Интеграции еще не настроены.</div>
            ) : (
              integrations.map((integration) => (
                <article key={integration.id} className="record-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#111827]">{integration.displayName}</h3>
                      <p className="mt-1 text-sm text-[#64748b]">{externalSourceLabel(integration.source)}</p>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(integration.status)}`}>
                      {integrationStatusLabel(integration.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[#64748b]">
                    Лимит: {integration.importLimit} · батч: {integration.batchSize} · последний импорт: {formatDate(integration.lastImportAt)}
                  </p>
                  {integration.lastError ? <p className="mt-2 text-sm font-medium text-[#b91c1c]">{integration.lastError}</p> : null}
                </article>
              ))
            )}
          </div>
          <div className="border-t border-[#d9e0ea] px-5 py-4">
            <h3 className="font-semibold text-[#111827]">Последние импорты</h3>
            <div className="record-list mt-3 border-y border-[#d9e0ea]">
              {recentRuns.length === 0 ? (
                <p className="soft-callout text-sm text-[#64748b]">Запусков пока нет.</p>
              ) : (
                recentRuns.map((run) => {
                  const status = integrationRunStatusView(run.status);

                  return (
                    <div key={run.id} className="record-card text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#111827]">{run.integration?.displayName ?? run.source}</p>
                        <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${status.badgeClass}`}>{status.label}</span>
                      </div>
                      <p className="mt-2 text-[#64748b]">
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
            <StatCard label="Просроченные сессии" value={expiredActiveSessions} hint="Будут помечены как истекшие" tone={expiredActiveSessions > 0 ? "warn" : "ok"} />
            <StatCard label="Ключи повторных запросов" value={expiredIdempotencyKeys} hint="Можно удалить после TTL" tone={expiredIdempotencyKeys > 0 ? "warn" : "ok"} />
            <StatCard label="Окна лимитов API" value={staleRateLimits} hint="Старше 7 дней" tone={staleRateLimits > 0 ? "warn" : "ok"} />
            <div className="soft-callout text-sm text-[#64748b]">
              <Clock3 size={16} className="mr-2 inline-block align-[-3px]" aria-hidden="true" />
              Для cron-запуска фоновых задач используйте{" "}
              <code className="rounded bg-[#f8fafc] px-1.5 py-0.5 text-xs text-[#334155]">npm run jobs:run -- --once</code>.
              Команда <code className="rounded bg-[#f8fafc] px-1.5 py-0.5 text-xs text-[#334155]">npm run jobs:run</code> запускает постоянный worker.
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
