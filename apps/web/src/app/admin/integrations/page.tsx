import Link from "next/link";
import { IntegrationImportQueueForm } from "@/components/integrations/integration-import-queue-form";
import { IntegrationQueueRunForm } from "@/components/integrations/integration-queue-run-form";
import { IntegrationSetupWorkspace } from "@/components/integrations/integration-setup-workspace";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";

export const dynamic = "force-dynamic";

const emptyStateClass = "soft-callout text-sm leading-5 text-[#64748b]";

type AdminIntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Не синхронизировалось";
  }

  return value.toLocaleString("ru-RU");
}

function formatScopes(scopes: string) {
  return scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(", ");
}

function badgeClass(tone: "ok" | "warn" | "neutral") {
  const classes = {
    ok: "bg-[#edf2ff] text-[#3157d5]",
    warn: "bg-[#fff7ed] text-[#b45309]",
    neutral: "bg-[#edf2ff] text-[#1d3fae]"
  };

  return classes[tone];
}

function customApiHealth(
  apiTokens: Array<{ lastSuccessAt: Date | null; lastErrorAt: Date | null; lastError: string | null }>
) {
  const hasCurrentError = apiTokens.some(
    (token) => token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)
  );

  if (hasCurrentError) {
    return { label: "Есть ошибка", className: badgeClass("warn") };
  }

  if (apiTokens.some((token) => token.lastSuccessAt)) {
    return { label: "Работает", className: badgeClass("ok") };
  }

  return { label: "Готов", className: badgeClass("neutral") };
}

function queueHref(source: string, externalIds: string[]) {
  const params = new URLSearchParams({ source });
  const firstExternalId = externalIds[0];

  if (firstExternalId) {
    params.set("q", firstExternalId);
  }

  return `/reviews?${params.toString()}`;
}

function parsePayloadJson(value: string) {
  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function integrationJobsByRunId<TJob extends { payloadJson: string }>(jobs: TJob[]) {
  const jobsByRunId = new Map<string, TJob>();

  for (const job of jobs) {
    const runId = parsePayloadJson(job.payloadJson).integrationRunId;

    if (typeof runId === "string" && !jobsByRunId.has(runId)) {
      jobsByRunId.set(runId, job);
    }
  }

  return jobsByRunId;
}

export default async function AdminIntegrationsPage({ searchParams }: AdminIntegrationsPageProps) {
  const params = await searchParams;
  const user = await requireCurrentUserPermission("integrations:manage");
  const [integrations, apiTokens, recentRuns, integrationJobs] = await Promise.all([
    prisma.integration.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      orderBy: {
        displayName: "asc"
      },
      include: {
        runs: {
          orderBy: {
            startedAt: "desc"
          },
          take: 1
        }
      }
    }),
    prisma.apiToken.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.integrationRun.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      include: {
        actor: true,
        integration: true
      },
      orderBy: {
        startedAt: "desc"
      },
      take: 8
    }),
    prisma.backendJob.findMany({
      where: {
        workspaceId: user.workspaceId,
        type: "INTEGRATION_IMPORT"
      },
      orderBy: [{ createdAt: "desc" }],
      take: 80,
      select: {
        id: true,
        status: true,
        payloadJson: true,
        createdAt: true
      }
    })
  ]);
  const apiHealth = customApiHealth(apiTokens);
  const connectedIntegrations = integrations.filter((integration) => integration.status === "active" || integration.lastDryRunAt);
  const integrationJobByRunId = integrationJobsByRunId(integrationJobs);
  const shouldOpenSetup = firstParam(params.setup) === "1";

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Интеграции</h1>
          <p className="page-subtitle">
            Подключения показывают только рабочие источники по умолчанию. Настройка, история и API-детали раскрываются по необходимости.
          </p>
        </div>
        <div className="admin-actions">
          <IntegrationQueueRunForm />
          <Link href="/admin/integrations?setup=1#connect" className="action-button action-button--primary">
            Новый источник
          </Link>
          <Link href="/admin/tokens" className="action-button">
            API-доступ
          </Link>
          <Link href="/reviews" className="action-button action-button--quiet">
            Очередь проверок
          </Link>
        </div>
      </div>

      <details id="connect" className="disclosure-panel" open={shouldOpenSetup}>
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-[#d9e0ea] bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Подключить источник</h2>
            <p className="mt-1 text-sm text-[#64748b]">Пошаговая настройка скрыта до момента, когда она действительно нужна.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#1d3fae]">Открыть</span>
        </summary>
        <div className="mt-4">
          <IntegrationSetupWorkspace apiTokenCount={apiTokens.length} apiHealth={apiHealth} />
        </div>
      </details>

      <section className="admin-group-grid admin-group-grid--wide mt-6" aria-label="Состояние интеграций">
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Подключенные источники</h2>
            <p className="text-sm leading-5 text-[#64748b]">Только рабочие подключения и источники после dry-run.</p>
          </div>
          <div className="grid gap-2">
            {connectedIntegrations.length > 0 ? (
              connectedIntegrations.map((integration) => {
                const latestRun = integration.runs[0];
                const latestRunStatus = latestRun ? integrationRunStatusView(latestRun.status) : null;
                const latestJob = latestRun ? integrationJobByRunId.get(latestRun.id) : undefined;
                const latestJobStatus = latestJob ? backendJobStatusView(latestJob.status) : null;

                return (
                  <div key={integration.id} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">
                      {integration.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="record-title record-title--tight">{integration.displayName}</span>
                        <span className="pill pill--ok">{integrationStatusLabel(integration.status)}</span>
                      </span>
                      <span className="record-meta compact-text">{externalSourceLabel(integration.source)}</span>
                      <span className="record-meta">
                        {integration.importLimit} тикетов · батч {integration.batchSize} · {formatDate(integration.lastImportAt ?? integration.lastDryRunAt)}
                      </span>
                      {latestRun && latestRunStatus ? (
                        <div className="grid gap-1 border-l border-[#d9e0ea] pl-3">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={`pill ${latestRunStatus.pillClass}`}>{latestRunStatus.label}</span>
                            <span className="record-meta">{latestRun.dryRun ? "Dry-run" : "Импорт"}</span>
                          </span>
                          <span className="record-meta">
                            Импортировано {latestRun.importedCount}/{latestRun.requestedLimit} · ошибок {latestRun.errorCount} ·{" "}
                            {formatDate(latestRun.startedAt)}
                          </span>
                          {latestJob && latestJobStatus ? (
                            <Link href={`/admin/system/jobs/${latestJob.id}`} className="quiet-link text-sm">
                              Backend job {latestJob.id.slice(0, 8)} · {latestJobStatus.label}
                            </Link>
                          ) : null}
                        </div>
                      ) : (
                        <span className="record-meta">Запусков еще не было.</span>
                      )}
                      <IntegrationImportQueueForm integrationId={integration.id} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={emptyStateClass}>Активных подключений пока нет.</div>
            )}
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Последние запуски</h2>
            <p className="text-sm leading-5 text-[#64748b]">Dry-run и импорты без отдельной раскрывающейся секции.</p>
          </div>
          <div className="grid gap-2">
            {recentRuns.length > 0 ? (
              recentRuns.slice(0, 5).map((run) => {
                const runStatus = integrationRunStatusView(run.status);
                const job = integrationJobByRunId.get(run.id);
                const jobStatus = job ? backendJobStatusView(job.status) : null;

                return (
                  <div key={run.id} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">{run.dryRun ? "D" : "I"}</span>
                    <span className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={queueHref(run.source, [])} className="record-title record-title--tight hover:underline">
                          {run.integration?.displayName ?? externalSourceLabel(run.source)}
                        </Link>
                        <span className={`pill ${runStatus.pillClass}`}>{runStatus.label}</span>
                      </span>
                      <span className="record-meta">
                        {run.dryRun ? "Dry-run" : "Импорт"} · {formatDate(run.startedAt)} · {run.actor?.name ?? "Автоматика"}
                      </span>
                      <span className="record-meta">Импортировано {run.importedCount}/{run.requestedLimit} · ошибок {run.errorCount}</span>
                      {job && jobStatus ? (
                        <Link href={`/admin/system/jobs/${job.id}`} className="quiet-link text-sm">
                          Backend job {job.id.slice(0, 8)} · {jobStatus.label}
                        </Link>
                      ) : null}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className={emptyStateClass}>Запуски появятся после проверки подключения или импорта.</div>
            )}
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">API-ключи</h2>
            <p className="text-sm leading-5 text-[#64748b]">Состояние ключей для своего API и внешних интеграций.</p>
          </div>
          <div className="grid gap-2">
            {apiTokens.length > 0 ? (
              apiTokens.slice(0, 5).map((apiToken) => (
                <Link key={apiToken.id} href="/admin/tokens" className="admin-tile admin-tile--compact">
                  <span className="admin-tile__icon admin-tile__icon--plain">K</span>
                  <span className="admin-tile__body">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="record-title record-title--tight">{apiToken.name}</span>
                      <span className={`pill ${apiToken.lastError ? "pill--warn" : "pill--neutral"}`}>
                        {apiToken.lastError ? "Ошибка" : "Готов"}
                      </span>
                    </span>
                    <span className="record-meta font-mono compact-text">{apiToken.tokenPrefix}</span>
                    <span className="record-meta compact-text">{formatScopes(apiToken.scopes)}</span>
                  </span>
                </Link>
              ))
            ) : (
              <div className={emptyStateClass}>API-ключи еще не созданы.</div>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
