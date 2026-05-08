import Link from "next/link";
import { IntegrationImportQueueForm } from "@/components/integrations/integration-import-queue-form";
import { IntegrationQueueRunForm } from "@/components/integrations/integration-queue-run-form";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
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

export default async function AdminIntegrationsPage() {
  const user = await requireCurrentUserPermission("integrations:manage");
  const [integrations, recentRuns, integrationJobs] = await Promise.all([
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
        integration: true,
        items: {
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
      take: 40,
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
  const integrationJobByRunId = integrationJobsByRunId(integrationJobs);
  const integrationJobByIntegrationId = integrationJobsByIntegrationId(integrationJobs);
  const activeSources = integrations.filter((integration) => ["active", "ready", "queued"].includes(integration.status));
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
                      <span className="record-meta">
                        Последний импорт: {formatDate(integration.lastImportAt)} · dry-run: {formatDate(integration.lastDryRunAt)}
                      </span>
                      {latestRun && latestRunStatus ? (
                        <span className="record-meta">
                          Последний run: <span className={`pill ${latestRunStatus.pillClass}`}>{latestRunStatus.label}</span>{" "}
                          · импортировано {latestRun.importedCount}/{latestRun.requestedLimit} · preview items {latestRun.items.length}
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
                        {run.integration ? (
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
                        Импортировано {run.importedCount}/{run.requestedLimit} · ошибок {run.errorCount} · items {run.items.length}
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
            {integrationJobs.length > 0 ? (
              integrationJobs.slice(0, 5).map((job) => {
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
      </section>
    </section>
  );
}
