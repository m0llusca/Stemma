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

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function statusTone(status: string) {
  if (["ok", "active", "SUCCEEDED", "READY"].includes(status)) {
    return "border-[#bbf7d0] bg-[#ecfdf5] text-[#3157d5]";
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

export default async function AdminSystemPage() {
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
      <div className="command-center command-center--split">
        <div>
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Состояние системы</h1>
          <p className="page-subtitle">
            Короткий операционный экран: окружение, фоновые задачи, SSO/AD, импорты и очистка технических записей.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <form action={runQueuedBackendJobs} className="flex min-w-[220px] gap-2">
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Окружение" value={runtime.status === "ok" ? "Готово" : runtime.status === "warn" ? "Есть предупреждения" : "Ошибка"} hint={environmentLabel(runtime.environment)} tone={runtime.status === "ok" ? "ok" : runtime.status === "warn" ? "warn" : "error"} />
        <StatCard label="Очередь задач" value={queuedJobs} hint={`Выполняется: ${runningJobs}`} tone={failedJobs > 0 ? "error" : queuedJobs > 0 ? "warn" : "ok"} />
        <StatCard label="Ошибки задач" value={failedJobs} hint={`Успешно за 24 часа: ${succeededJobsToday}`} tone={failedJobs > 0 ? "error" : "ok"} />
        <StatCard label="Активные сессии" value={activeSessions} hint={`Просрочено активных: ${expiredActiveSessions}`} tone={expiredActiveSessions > 0 ? "warn" : "ok"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">Фоновые задачи</h2>
            <p className="mt-1 text-sm text-[#64748b]">Импорты, отчеты, синхронизация каталога и обслуживание данных.</p>
          </div>
          <div className="record-list px-5">
            {recentJobs.length === 0 ? (
              <div className="soft-callout text-sm text-[#64748b]">Фоновых задач пока нет.</div>
            ) : (
              recentJobs.map((job) => {
                const status = backendJobStatusView(job.status);

                return (
                  <article key={job.id} className="record-card">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${status.badgeClass}`}>{status.label}</span>
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
                      <Link href={`/admin/system/jobs/${job.id}`} className="text-sm font-semibold text-[#1d3fae] hover:underline">
                        Детали задачи
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <details className="disclosure-panel panel overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Готовность окружения</h2>
              <p className="mt-1 text-sm text-[#64748b]">Проверки конфигурации перед production-запуском.</p>
            </div>
            <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(runtime.status)}`}>
              {runtimeStatusLabel(runtime.status)}
            </span>
          </summary>
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
        </details>
      </div>

      <details className="disclosure-panel mt-6">
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 rounded-md border border-[#d9e0ea] bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Дополнительные проверки</h2>
            <p className="mt-1 text-sm text-[#64748b]">SSO, интеграции и обслуживание данных скрыты, чтобы не перегружать основной экран.</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-[#1d3fae]">Показать</span>
        </summary>
        <div className="mt-4 grid gap-6 xl:grid-cols-3">
          <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">SSO и каталог</h2>
                <p className="mt-1 text-sm text-[#64748b]">
                  Провайдеры авторизации, маппинги групп и ручной запуск синхронизации.
                </p>
              </div>
              <Link href="/admin/access" className="text-sm font-semibold text-[#1d3fae] hover:underline">
                Настроить
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5 text-sm">
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
                    <button type="submit" className="action-button min-h-[36px] px-3 py-2 text-sm">
                      <ShieldCheck size={16} aria-hidden="true" />
                      Синхронизировать
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">Интеграции</h2>
            <p className="mt-1 text-sm text-[#64748b]">Последние подключения и статусы импортов.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5 text-sm">
            <StatCard label="Источники" value={integrations.length} hint={`Ошибки: ${integrationErrors}`} tone={integrationErrors > 0 ? "error" : "neutral"} />
            <StatCard label="API-ключи" value={apiTokens.length} hint={`Ошибки: ${apiTokenErrors}`} tone={apiTokenErrors > 0 ? "error" : "ok"} />
          </div>
          <div className="record-list px-5">
            {integrations.length === 0 ? (
              <div className="soft-callout text-sm text-[#64748b]">Интеграции еще не настроены.</div>
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
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">Обслуживание</h2>
            <p className="mt-1 text-sm text-[#64748b]">Технические записи, которые чистит задача обслуживания.</p>
          </div>
          <div className="grid gap-3 p-5">
            <StatCard label="Просроченные сессии" value={expiredActiveSessions} hint="Будут помечены как истекшие" tone={expiredActiveSessions > 0 ? "warn" : "ok"} />
            <StatCard label="Ключи повторных запросов" value={expiredIdempotencyKeys} hint="Можно удалить после TTL" tone={expiredIdempotencyKeys > 0 ? "warn" : "ok"} />
            <StatCard label="Окна лимитов API" value={staleRateLimits} hint="Старше 7 дней" tone={staleRateLimits > 0 ? "warn" : "ok"} />
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
        </div>
      </details>

      <div className="soft-callout mt-6 text-sm text-[#64748b]">
        <Clock3 size={16} className="mr-2 inline-block align-[-3px]" aria-hidden="true" />
        Для регулярного запуска фоновых задач в продакшене используйте cron-команду{" "}
        <code className="rounded bg-[#f8fafc] px-1.5 py-0.5 text-xs text-[#334155]">npm run jobs:run</code> или внешний планировщик.
      </div>
    </section>
  );
}
