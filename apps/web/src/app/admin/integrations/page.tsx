import Link from "next/link";
import { IntegrationImportQueueForm } from "@/components/integrations/integration-import-queue-form";
import { IntegrationQueueRunForm } from "@/components/integrations/integration-queue-run-form";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getIntegrationCapability, listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import { parseIntegrationSyncState } from "@/lib/integrations/sync-state";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";

export const dynamic = "force-dynamic";

const emptyStateClass = "soft-callout text-sm leading-5 text-[#64748b]";

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
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

function integrationJobsByIntegrationId<TJob extends { payloadJson: string }>(jobs: TJob[]) {
  const jobsByIntegrationId = new Map<string, TJob>();

  for (const job of jobs) {
    const integrationId = parsePayloadJson(job.payloadJson).integrationId;

    if (typeof integrationId === "string" && !jobsByIntegrationId.has(integrationId)) {
      jobsByIntegrationId.set(integrationId, job);
    }
  }

  return jobsByIntegrationId;
}

function displayedCheckedCount(run: { checkedCount: number; importedCount: number; skippedCount: number; errorCount: number }) {
  return run.checkedCount > 0 ? run.checkedCount : run.importedCount + run.skippedCount + run.errorCount;
}

function idPayloadFilters(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  return uniqueIds.map((id) => ({
    payloadJson: {
      contains: id
    }
  }));
}

export default async function AdminIntegrationsPage() {
  const user = await requireCurrentUserPermission("integrations:manage");
  const [integrations, recentRuns, recentIntegrationJobs] = await Promise.all([
    prisma.integration.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      orderBy: {
        displayName: "asc"
      },
      include: {
        runs: {
          where: {
            workspaceId: user.workspaceId
          },
          orderBy: {
            startedAt: "desc"
          },
          take: 1,
          include: {
            items: {
              select: {
                id: true,
                status: true
              }
            }
          }
        },
        diagnosticRuns: {
          where: {
            workspaceId: user.workspaceId
          },
          orderBy: {
            startedAt: "desc"
          },
          take: 1
        }
      }
    }),
    prisma.integrationRun.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      include: {
        actor: true,
        integration: {
          select: {
            id: true,
            workspaceId: true,
            displayName: true
          }
        },
        items: {
          where: {
            workspaceId: user.workspaceId
          },
          select: {
            id: true,
            status: true
          }
        }
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
      take: 5,
      select: {
        id: true,
        status: true,
        payloadJson: true,
        createdAt: true,
        runAfter: true,
        attempts: true,
        maxAttempts: true
      }
    })
  ]);
  const displayedRunIds = [
    ...integrations.flatMap((integration) => integration.runs.map((run) => run.id)),
    ...recentRuns.map((run) => run.id)
  ];
  const displayedIntegrationIds = integrations.map((integration) => integration.id);
  const linkedJobFilters = idPayloadFilters([...displayedRunIds, ...displayedIntegrationIds]);
  const linkedIntegrationJobs =
    linkedJobFilters.length > 0
      ? await prisma.backendJob.findMany({
          where: {
            workspaceId: user.workspaceId,
            type: "INTEGRATION_IMPORT",
            OR: linkedJobFilters
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            status: true,
            payloadJson: true,
            createdAt: true,
            runAfter: true,
            attempts: true,
            maxAttempts: true
          }
        })
      : [];
  const integrationJobByRunId = integrationJobsByRunId(linkedIntegrationJobs);
  const integrationJobByIntegrationId = integrationJobsByIntegrationId(linkedIntegrationJobs);
  const activeSources = integrations.filter((integration) => ["active", "ready", "queued"].includes(integration.status));
  const activeSourceKeys = new Set(integrations.map((integration) => integration.source));
  const roadmapCapabilities = listIntegrationCapabilities()
    .filter((capability) => !activeSourceKeys.has(capability.source))
    .slice(0, 8);
  const diagnosticRuns = integrations.flatMap((integration) =>
    integration.diagnosticRuns.map((run) => ({
      ...run,
      integrationName: integration.displayName,
      integrationId: integration.id
    }))
  );

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Интеграции</h1>
          <p className="page-subtitle">
            Операционный обзор источников: состояние подключений, последняя диагностика, preview/import и backend-задачи.
          </p>
        </div>
        <div className="admin-actions">
          <IntegrationQueueRunForm />
          <Link href="/admin/integrations/new" className="action-button action-button--primary">
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

      <section className="admin-group-grid admin-group-grid--wide" aria-label="Состояние интеграций">
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Подключенные источники</h2>
            <p className="text-sm leading-5 text-[#64748b]">
              Активные и готовые источники: {activeSources.length}/{integrations.length}
            </p>
          </div>
          <div className="grid gap-2">
            {integrations.length > 0 ? (
              integrations.map((integration) => {
                const latestRun = integration.runs[0];
                const latestRunStatus = latestRun ? integrationRunStatusView(latestRun.status) : null;
                const latestJob = integrationJobByIntegrationId.get(integration.id);
                const latestJobStatus = latestJob ? backendJobStatusView(latestJob.status) : null;
                const capability = getIntegrationCapability(integration.source, integration.type);
                const syncState = parseIntegrationSyncState(integration.syncStateJson);

                return (
                  <div key={integration.id} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">
                      {integration.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/integrations/${integration.id}`} className="record-title record-title--tight hover:underline">
                          {integration.displayName}
                        </Link>
                        <span className={`pill ${integration.status === "error" ? "pill--warn" : "pill--neutral"}`}>
                          {integrationStatusLabel(integration.status)}
                        </span>
                      </span>
                      <span className="record-meta compact-text">
                        {externalSourceLabel(integration.source)} · лимит {integration.importLimit} · батч {integration.batchSize}
                      </span>
                      <span className="record-meta compact-text">
                        {capability.readiness} · cursor {capability.supportsCursor ? "есть" : "нет"} · webhooks{" "}
                        {capability.supportsInboundWebhooks || capability.supportsOutboundWebhooks ? "есть" : "нет"}
                      </span>
                      <span className="record-meta">
                        Последний импорт: {formatDate(integration.lastImportAt)} · dry-run: {formatDate(integration.lastDryRunAt)}
                      </span>
                      <span className="record-meta">
                        Sync: проверено {syncState.progress.checkedCount} · импортировано {syncState.progress.importedCount} · ошибок{" "}
                        {syncState.progress.errorCount} · cursor {syncState.cursor ?? "нет"}
                      </span>
                      {latestRun && latestRunStatus ? (
                        <span className="record-meta">
                          Последний run: <span className={`pill ${latestRunStatus.pillClass}`}>{latestRunStatus.label}</span>{" "}
                          · проверено {displayedCheckedCount(latestRun)} · импортировано {latestRun.importedCount}/{latestRun.requestedLimit} ·
                          skipped {latestRun.skippedCount} · preview items {latestRun.items.length}
                        </span>
                      ) : (
                        <span className="record-meta">Запусков еще не было.</span>
                      )}
                      {latestJob && latestJobStatus ? (
                        <Link href={`/admin/system/jobs/${latestJob.id}`} className="quiet-link text-sm">
                          Backend job {latestJob.id.slice(0, 8)} · {latestJobStatus.label}
                        </Link>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <Link href={`/admin/integrations/${integration.id}`} className="quiet-link text-sm">
                          Открыть cockpit
                        </Link>
                        <IntegrationImportQueueForm integrationId={integration.id} />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={emptyStateClass}>Источники пока не настроены.</div>
            )}
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Последняя диагностика</h2>
            <p className="text-sm leading-5 text-[#64748b]">Последний diagnostic-run по каждому источнику.</p>
          </div>
          <div className="grid gap-2">
            {diagnosticRuns.length > 0 ? (
              diagnosticRuns.map((run) => {
                const status = integrationRunStatusView(run.status);

                return (
                  <Link key={run.id} href={`/admin/integrations/${run.integrationId}`} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">D</span>
                    <span className="admin-tile__body">
                      <span className="record-title record-title--tight">{run.integrationName}</span>
                      <span className="record-meta">
                        <span className={`pill ${status.pillClass}`}>{status.label}</span> · {run.mode} · {formatDate(run.startedAt)}
                      </span>
                      <span className="record-meta compact-text">{run.redactedEndpoint ?? "Endpoint появится после диагностики."}</span>
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className={emptyStateClass}>Диагностик пока нет. Запустите проверку в cockpit источника.</div>
            )}
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Preview и импорт</h2>
            <p className="text-sm leading-5 text-[#64748b]">Последние dry-run, preview и реальные импорты.</p>
          </div>
          <div className="grid gap-2">
            {recentRuns.length > 0 ? (
              recentRuns.slice(0, 5).map((run) => {
                const runStatus = integrationRunStatusView(run.status);
                const job = integrationJobByRunId.get(run.id);
                const jobStatus = job ? backendJobStatusView(job.status) : null;

                return (
                  <div key={run.id} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">{run.dryRun ? "P" : "I"}</span>
                    <span className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        {run.integration && run.integration.workspaceId === user.workspaceId ? (
                          <Link href={`/admin/integrations/${run.integration.id}`} className="record-title record-title--tight hover:underline">
                            {run.integration.displayName}
                          </Link>
                        ) : (
                          <span className="record-title record-title--tight">{externalSourceLabel(run.source)}</span>
                        )}
                        <span className={`pill ${runStatus.pillClass}`}>{runStatus.label}</span>
                      </span>
                      <span className="record-meta">
                        {run.dryRun ? "Preview/Dry-run" : "Импорт"} · {formatDate(run.startedAt)} · {run.actor?.name ?? "Автоматика"}
                      </span>
                      <span className="record-meta">
                        Проверено {displayedCheckedCount(run)} · импортировано {run.importedCount}/{run.requestedLimit} · skipped{" "}
                        {run.skippedCount} · ошибок {run.errorCount} · items {run.items.length}
                      </span>
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
              <div className={emptyStateClass}>Запуски появятся после диагностики, preview или импорта.</div>
            )}
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Backend jobs</h2>
            <p className="text-sm leading-5 text-[#64748b]">Очередь интеграционного runner без raw payload.</p>
          </div>
          <div className="grid gap-2">
            {recentIntegrationJobs.length > 0 ? (
              recentIntegrationJobs.map((job) => {
                const status = backendJobStatusView(job.status);
                const payload = parsePayloadJson(job.payloadJson);
                const runId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;
                const source = typeof payload.source === "string" ? payload.source : "integration";

                return (
                  <Link key={job.id} href={`/admin/system/jobs/${job.id}`} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">J</span>
                    <span className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="record-title record-title--tight">Job {job.id.slice(0, 8)}</span>
                        <span className={`pill ${status.pillClass}`}>{status.label}</span>
                      </span>
                      <span className="record-meta">
                        {externalSourceLabel(source)} · попытка {job.attempts}/{job.maxAttempts} · запуск {formatDate(job.runAfter)}
                      </span>
                      <span className="record-meta compact-text">Run: {runId ? runId.slice(0, 8) : "не связан"}</span>
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className={emptyStateClass}>В очереди интеграций пока нет задач.</div>
            )}
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Roadmap источников</h2>
            <p className="text-sm leading-5 text-[#64748b]">Capability registry для следующих коннекторов и webhook bridge.</p>
          </div>
          <div className="grid gap-2">
            {roadmapCapabilities.map((capability) => (
              <div key={capability.source} className="admin-tile admin-tile--compact">
                <span className="admin-tile__icon admin-tile__icon--plain">{capability.displayName.slice(0, 1).toUpperCase()}</span>
                <span className="admin-tile__body">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="record-title record-title--tight">{capability.displayName}</span>
                    <span className="pill pill--neutral">{capability.readiness}</span>
                  </span>
                  <span className="record-meta compact-text">
                    {capability.type} · auth {capability.authModes.join(", ")}
                  </span>
                  <span className="record-meta compact-text">
                    cursor {capability.supportsCursor ? "есть" : "нет"} · diagnostics {capability.supportsDiagnostics ? "есть" : "нет"} ·
                    webhooks {capability.supportsInboundWebhooks || capability.supportsOutboundWebhooks ? "есть" : "нет"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
