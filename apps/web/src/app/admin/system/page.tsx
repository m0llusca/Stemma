import type { BackendJobStatus, IdentityProviderType } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Clock3, Play, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
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
    return "border-[#b9ddd2] bg-[#f4faf7] text-[#116466]";
  }

  if (["warn", "queued", "RUNNING", "QUEUED", "draft"].includes(status)) {
    return "border-[#fed7aa] bg-[#fffaf5] text-[#b54708]";
  }

  if (["error", "FAILED", "disabled"].includes(status)) {
    return "border-[#fecdca] bg-[#fff1f3] text-[#b42318]";
  }

  return "border-[#d7dce5] bg-[#f7f8fb] text-[#344054]";
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

function jobStatusLabel(status: BackendJobStatus) {
  const labels: Record<BackendJobStatus, string> = {
    QUEUED: "В очереди",
    RUNNING: "Выполняется",
    SUCCEEDED: "Готово",
    FAILED: "Ошибка",
    CANCELLED: "Отменено"
  };

  return labels[status];
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
    ok: "border-[#b9ddd2] bg-[#f4faf7]",
    warn: "border-[#fed7aa] bg-[#fffaf5]",
    error: "border-[#fecdca] bg-[#fff1f3]",
    neutral: "border-[#d7dce5] bg-white"
  }[tone];

  return (
    <div className={`stat-card rounded-md border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold text-[#667085]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[#17202a]">{value}</p>
      <p className="mt-2 text-sm text-[#667085]">{hint}</p>
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
    <section className="page-shell">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#667085]">Администрирование</p>
          <h1 className="mt-1 text-2xl font-semibold">Состояние системы</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#667085]">
            Короткий операционный экран: окружение, фоновые задачи, SSO/AD, импорты и очистка технических записей.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={runQueuedBackendJobs} className="flex min-w-[220px] gap-2">
            <select name="limit" defaultValue="5" className="rounded border border-[#d7dce5] bg-white px-3 py-2 text-sm">
              <option value="5">5 задач</option>
              <option value="10">10 задач</option>
              <option value="20">20 задач</option>
            </select>
            <button type="submit" className="inline-flex items-center gap-2 rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
              <Play size={16} aria-hidden="true" />
              Запустить
            </button>
          </form>
          <form action={queueRetentionCleanup}>
            <button type="submit" className="inline-flex items-center gap-2 rounded border border-[#d7dce5] bg-white px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]">
              <RotateCcw size={16} aria-hidden="true" />
              Очистка
            </button>
          </form>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Окружение" value={runtime.status === "ok" ? "Готово" : runtime.status === "warn" ? "Есть предупреждения" : "Ошибка"} hint={runtime.environment} tone={runtime.status === "ok" ? "ok" : runtime.status === "warn" ? "warn" : "error"} />
        <StatCard label="Очередь задач" value={queuedJobs} hint={`Выполняется: ${runningJobs}`} tone={failedJobs > 0 ? "error" : queuedJobs > 0 ? "warn" : "ok"} />
        <StatCard label="Ошибки задач" value={failedJobs} hint={`Успешно за 24 часа: ${succeededJobsToday}`} tone={failedJobs > 0 ? "error" : "ok"} />
        <StatCard label="Активные сессии" value={activeSessions} hint={`Просрочено активных: ${expiredActiveSessions}`} tone={expiredActiveSessions > 0 ? "warn" : "ok"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Фоновые задачи</h2>
            <p className="mt-1 text-sm text-[#667085]">Импорты, отчеты, синхронизация каталога и обслуживание данных.</p>
          </div>
          <div className="divide-y divide-[#d7dce5]">
            {recentJobs.length === 0 ? (
              <div className="p-5 text-sm text-[#667085]">Фоновых задач пока нет.</div>
            ) : (
              recentJobs.map((job) => (
                <article key={job.id} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_150px_150px] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(job.status)}`}>
                        {jobStatusLabel(job.status)}
                      </span>
                      <h3 className="font-semibold text-[#17202a]">{job.type}</h3>
                    </div>
                    <p className="mt-1 text-sm text-[#667085]">
                      {job.queueName} · попытка {job.attempts}/{job.maxAttempts} · {job.createdBy?.name ?? "Автоматика"}
                    </p>
                    {job.events[0] ? (
                      <p className="mt-2 text-sm text-[#667085]">{job.events[0].message}</p>
                    ) : null}
                    {job.errorMessage ? <p className="mt-2 text-sm font-medium text-[#b42318]">{job.errorMessage}</p> : null}
                  </div>
                  <div className="text-sm text-[#667085]">
                    <p className="font-semibold text-[#344054]">Запуск</p>
                    <p>{formatDate(job.runAfter)}</p>
                  </div>
                  <Link href={`/api/v1/jobs/${job.id}`} className="text-sm font-semibold text-[#0b4f52] hover:underline">
                    JSON задачи
                  </Link>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Готовность окружения</h2>
            <p className="mt-1 text-sm text-[#667085]">Проверки конфигурации, которые важны перед production-запуском.</p>
          </div>
          <div className="divide-y divide-[#d7dce5]">
            {runtime.checks.map((check) => {
              const Icon = check.status === "ok" ? CheckCircle2 : AlertTriangle;

              return (
                <div key={check.key} className="flex gap-3 p-5">
                  <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${statusTone(check.status)}`}>
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#17202a]">{check.key}</p>
                    <p className="mt-1 text-sm leading-5 text-[#667085]">{check.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">SSO и каталог</h2>
                <p className="mt-1 text-sm text-[#667085]">
                  Провайдеры авторизации, маппинги групп и ручной запуск синхронизации.
                </p>
              </div>
              <Link href="/admin/access" className="text-sm font-semibold text-[#0b4f52] hover:underline">
                Настроить
              </Link>
            </div>
          </div>
          <div className="divide-y divide-[#d7dce5]">
            <div className="grid grid-cols-2 gap-3 p-5 text-sm">
              <StatCard label="Провайдеры" value={providers.length} hint={`Не активны: ${providerWarnings}`} tone={providerWarnings > 0 ? "warn" : "ok"} />
              <StatCard label="Сессии" value={activeSessions} hint="Активные сейчас" tone="neutral" />
            </div>
            {providers.map((provider) => (
              <article key={provider.id} className="grid gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[#17202a]">{provider.name}</h3>
                    <p className="mt-1 text-sm text-[#667085]">
                      {providerTypeLabel(provider.type)} · {provider.slug}
                    </p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(provider.status)}`}>
                    {provider.status}
                  </span>
                </div>
                <p className="text-sm text-[#667085]">
                  Маппингов: {provider._count.groupRoleMappings} · сессий: {provider._count.authSessions} · последняя синхронизация:{" "}
                  {formatDate(provider.lastSyncAt)}
                </p>
                {provider.type !== "DEMO" ? (
                  <form action={queueDirectorySync}>
                    <input type="hidden" name="providerId" value={provider.id} />
                    <button type="submit" className="inline-flex items-center gap-2 rounded border border-[#116466] bg-white px-3 py-2 text-sm font-semibold text-[#0b4f52] hover:bg-[#eef4f4]">
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
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Интеграции</h2>
            <p className="mt-1 text-sm text-[#667085]">Последние подключения и статусы импортов.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5 text-sm">
            <StatCard label="Источники" value={integrations.length} hint={`Ошибки: ${integrationErrors}`} tone={integrationErrors > 0 ? "error" : "neutral"} />
            <StatCard label="API-ключи" value={apiTokens.length} hint={`Ошибки: ${apiTokenErrors}`} tone={apiTokenErrors > 0 ? "error" : "ok"} />
          </div>
          <div className="divide-y divide-[#d7dce5]">
            {integrations.length === 0 ? (
              <div className="p-5 text-sm text-[#667085]">Интеграции еще не настроены.</div>
            ) : (
              integrations.map((integration) => (
                <article key={integration.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#17202a]">{integration.displayName}</h3>
                      <p className="mt-1 font-mono text-xs text-[#667085]">{integration.source}</p>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(integration.status)}`}>
                      {integration.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[#667085]">
                    Лимит: {integration.importLimit} · батч: {integration.batchSize} · последний импорт: {formatDate(integration.lastImportAt)}
                  </p>
                  {integration.lastError ? <p className="mt-2 text-sm font-medium text-[#b42318]">{integration.lastError}</p> : null}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Обслуживание</h2>
            <p className="mt-1 text-sm text-[#667085]">Технические записи, которые чистит задача обслуживания.</p>
          </div>
          <div className="grid gap-3 p-5">
            <StatCard label="Просроченные сессии" value={expiredActiveSessions} hint="Будут помечены как истекшие" tone={expiredActiveSessions > 0 ? "warn" : "ok"} />
            <StatCard label="Idempotency keys" value={expiredIdempotencyKeys} hint="Можно удалить после TTL" tone={expiredIdempotencyKeys > 0 ? "warn" : "ok"} />
            <StatCard label="Rate-limit buckets" value={staleRateLimits} hint="Старше 7 дней" tone={staleRateLimits > 0 ? "warn" : "ok"} />
          </div>
          <div className="border-t border-[#d7dce5] px-5 py-4">
            <h3 className="font-semibold text-[#17202a]">Последние импорты</h3>
            <div className="mt-3 grid gap-3">
              {recentRuns.length === 0 ? (
                <p className="text-sm text-[#667085]">Запусков пока нет.</p>
              ) : (
                recentRuns.map((run) => (
                  <div key={run.id} className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#17202a]">{run.integration?.displayName ?? run.source}</p>
                      <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                    <p className="mt-2 text-[#667085]">
                      {run.dryRun ? "Dry-run" : "Импорт"} · {run.importedCount}/{run.requestedLimit} · {formatDate(run.startedAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 rounded-md border border-[#d7dce5] bg-white p-4 text-sm text-[#667085]">
        <Clock3 size={16} className="mr-2 inline-block align-[-3px]" aria-hidden="true" />
        Для регулярного production-запуска фоновых задач используйте cron-команду{" "}
        <code className="rounded bg-[#f7f8fb] px-1.5 py-0.5 text-xs text-[#344054]">npm run jobs:run</code> или внешний scheduler.
      </div>
    </section>
  );
}
