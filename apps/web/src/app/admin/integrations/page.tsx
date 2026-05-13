import { ArrowUpRight, DatabaseZap, PlugZap } from "lucide-react";
import Link from "next/link";
import { IntegrationImportQueueForm } from "@/components/integrations/integration-import-queue-form";
import { IntegrationQueueRunForm } from "@/components/integrations/integration-queue-run-form";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { certificationStatusTone } from "@/lib/certification/status";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getIntegrationCapability, listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import { parseIntegrationSyncState } from "@/lib/integrations/sync-state";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";

export const dynamic = "force-dynamic";

type AdminIntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type IntegrationSection = "sources" | "diagnostics" | "runs" | "jobs" | "catalog";

const integrationSections: Array<{ value: IntegrationSection; label: string }> = [
  { value: "sources", label: "Источники" },
  { value: "diagnostics", label: "Диагностика" },
  { value: "runs", label: "Проверка и импорт" },
  { value: "jobs", label: "Фоновые задачи" },
  { value: "catalog", label: "План источников" }
];

const emptyStateClass = "soft-callout ops-empty text-sm leading-5 text-[#64748b]";

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function integrationSectionParam(value: string | string[] | undefined): IntegrationSection {
  const section = firstParam(value);

  return integrationSections.some((item) => item.value === section) ? (section as IntegrationSection) : "sources";
}

function integrationSectionHref(section: IntegrationSection) {
  return `/admin/integrations?section=${section}`;
}

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

function integrationTone(status: string) {
  if (status === "error" || status === "disabled") return "pill--warn";
  if (status === "active" || status === "ready") return "pill--ok";
  return "pill--neutral";
}

function capabilityReadinessLabel(value: string) {
  const labels: Record<string, string> = {
    production_slice: "Готово к эксплуатации",
    adapter_ready: "Адаптер готов",
    roadmap: "В плане"
  };

  return labels[value] ?? value;
}

function capabilityTypeLabel(value: string) {
  const labels: Record<string, string> = {
    otrs_family: "Семейство OTRS",
    native_helpdesk: "Служба поддержки",
    custom_api: "Свой API",
    webhook_bridge: "Мост вебхуков",
    enterprise: "Корпоративная система"
  };

  return labels[value] ?? value;
}

function capabilityName(source: string, displayName: string) {
  const labels: Record<string, string> = {
    custom_api: "Свой API",
    generic_webhook: "Общие вебхуки"
  };

  return labels[source] ?? displayName;
}

function authModeLabel(value: string) {
  const labels: Record<string, string> = {
    api_token: "API-токен",
    basic: "Базовая авторизация",
    bearer_token: "Bearer-токен",
    hmac_sha256: "Подпись HMAC-SHA256",
    none: "Без авторизации",
    oauth_client_credentials: "OAuth: учетные данные клиента",
    session_create: "Создание сессии",
    tls_ca_bundle: "Пакет корневых сертификатов",
    user_password: "Пользователь и пароль"
  };

  return labels[value] ?? value;
}

function integrationModeLabel(value: string) {
  const labels: Record<string, string> = {
    diagnostics: "Диагностика",
    dry_run: "Проверка без импорта",
    fixture_import: "Импорт тестовых данных",
    import: "Импорт",
    manual: "Ручной запуск",
    preview: "Предпросмотр",
    scheduled: "По расписанию",
    selected_import: "Выборочный импорт"
  };

  return labels[value] ?? value;
}

function CertificationHelpTooltip({ label = "Что значит статус сертификации?" }: { label?: string }) {
  return (
    <HelpTooltip
      label={label}
      content="Статус показывает, какие проверки прошел connector: документация, контрактные тесты, заглушка и живая сертификация."
      placement="top-start"
    />
  );
}

export default async function AdminIntegrationsPage({ searchParams }: AdminIntegrationsPageProps) {
  const params = await searchParams;
  const activeSection = integrationSectionParam(params.section);
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
  const failedDiagnostics = diagnosticRuns.filter((run) => ["failed", "error"].includes(run.status)).length;
  const activeJobs = recentIntegrationJobs.filter((job) => ["QUEUED", "RUNNING"].includes(job.status)).length;
  const lastImportRun = recentRuns.find((run) => !run.dryRun);

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Интеграции</h1>
          <p className="page-subtitle">
            Операционный обзор источников: состояние подключений, последняя диагностика, проверочные запуски, импорт и фоновые задачи.
          </p>
          <div className="admin-actions mt-5">
            <Link href="/admin/integrations/new" className="action-button action-button--primary">
              <PlugZap size={16} aria-hidden="true" />
              Новый источник
            </Link>
            <IntegrationQueueRunForm />
            <Link href="/admin/tokens" className="action-button">
              API-доступ
            </Link>
            <Link href="/reviews" className="action-button action-button--quiet">
              Очередь проверок
            </Link>
          </div>
        </div>
      </div>

      <section className="ops-metric-grid" aria-label="Состояние интеграций">
        <div className="ops-metric">
          <span className="ops-metric__label">Источники</span>
          <strong className="ops-metric__value">{integrations.length}</strong>
          <span className="ops-metric__note">Активные и готовые: {activeSources.length}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Диагностика</span>
          <strong className="ops-metric__value">{diagnosticRuns.length}</strong>
          <span className="ops-metric__note">Требуют внимания: {failedDiagnostics}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Задачи обработчика</span>
          <strong className="ops-metric__value">{activeJobs}</strong>
          <span className="ops-metric__note">В очереди или в работе</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Последний импорт</span>
          <strong className="ops-metric__value">{lastImportRun ? formatDate(lastImportRun.startedAt).split(",")[0] : "Нет"}</strong>
          <span className="ops-metric__note">{lastImportRun ? externalSourceLabel(lastImportRun.source) : "Реальные импорты еще не запускались"}</span>
        </div>
      </section>

      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы интеграций">
        {integrationSections.map((section) => (
          <Link
            key={section.value}
            href={integrationSectionHref(section.value)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "sources" ? (
        <section className="ops-panel" aria-labelledby="sources-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Источники</p>
            <div className="flex min-w-0 items-center gap-2">
              <h2 id="sources-title" className="ops-panel__title">Подключенные источники</h2>
              <CertificationHelpTooltip />
            </div>
            <p className="ops-panel__subtitle">Активные и готовые источники: {activeSources.length}/{integrations.length}</p>
            <div className="admin-actions mt-3">
              <Link href="/admin/integrations/new" className="action-button action-button--small">
                <DatabaseZap size={15} aria-hidden="true" />
                Добавить
              </Link>
            </div>
          </div>
        </div>
        {integrations.length > 0 ? (
          <div className="ops-table-shell">
            <div className="ops-table ops-table--integrations" role="table" aria-label="Подключенные источники">
              <div className="ops-table__row ops-table__row--head" role="row">
                <span>Источник</span>
                <span>Импорт</span>
                <span>Синхронизация</span>
                <span>Последний запуск</span>
                <span>Задача</span>
                <span>Действия</span>
              </div>
              {integrations.map((integration) => {
                const latestRun = integration.runs[0];
                const latestRunStatus = latestRun ? integrationRunStatusView(latestRun.status) : null;
                const latestJob = integrationJobByIntegrationId.get(integration.id);
                const latestJobStatus = latestJob ? backendJobStatusView(latestJob.status) : null;
                const latestDiagnostic = integration.diagnosticRuns[0];
                const latestDiagnosticStatus = latestDiagnostic ? integrationRunStatusView(latestDiagnostic.status) : null;
                const capability = getIntegrationCapability(integration.source, integration.type);
                const syncState = parseIntegrationSyncState(integration.syncStateJson);

                return (
                  <article key={integration.id} className="ops-table__row admin-tile admin-tile--table" role="row">
                    <div className="ops-table__cell">
                      <span className="ops-table__label">Источник</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/integrations/${integration.id}`} className="record-title hover:underline">
                          {integration.displayName}
                        </Link>
                        <span className={`pill ${integrationTone(integration.status)}`}>{integrationStatusLabel(integration.status)}</span>
                      </span>
                      <span className="record-meta compact-text">
                        {externalSourceLabel(integration.source)} · {capabilityReadinessLabel(capability.readiness)} · курсор{" "}
                        {capability.supportsCursor ? "есть" : "нет"} · вебхуки{" "}
                        {capability.supportsInboundWebhooks || capability.supportsOutboundWebhooks ? "есть" : "нет"}
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={`pill ${certificationStatusTone(capability.certification.summary.status)}`}>
                          {capability.certification.summary.label}
                        </span>
                        <CertificationHelpTooltip label={`Что значит статус сертификации для ${integration.displayName}?`} />
                      </div>
                    </div>
                    <div className="ops-table__cell">
                      <span className="ops-table__label">Импорт</span>
                      <span className="record-title">лимит {integration.importLimit} · батч {integration.batchSize}</span>
                      <span className="record-meta">Импорт: {formatDate(integration.lastImportAt)}</span>
                      <span className="record-meta">Проверка без импорта: {formatDate(integration.lastDryRunAt)}</span>
                    </div>
                    <div className="ops-table__cell">
                      <span className="ops-table__label">Синхронизация</span>
                      <span className="record-title">
                        Проверено {syncState.progress.checkedCount} · импортировано {syncState.progress.importedCount}
                      </span>
                      <span className="record-meta">
                        ошибок {syncState.progress.errorCount} · курсор {syncState.cursor ?? "нет"}
                      </span>
                    </div>
                    <div className="ops-table__cell">
                      <span className="ops-table__label">Последний запуск</span>
                      {latestRun && latestRunStatus ? (
                        <>
                          <span className={`pill ${latestRunStatus.pillClass}`}>{latestRunStatus.label}</span>
                          <span className="record-meta">
                            проверено {displayedCheckedCount(latestRun)} · импортировано {latestRun.importedCount}/{latestRun.requestedLimit}
                          </span>
                          <span className="record-meta">
                            пропущено {latestRun.skippedCount} · строк предпросмотра {latestRun.items.length}
                          </span>
                        </>
                      ) : (
                        <span className="record-meta">Запусков еще не было.</span>
                      )}
                      {latestDiagnostic && latestDiagnosticStatus ? (
                        <span className="record-meta">
                          Диагностика: <span className={`pill ${latestDiagnosticStatus.pillClass}`}>{latestDiagnosticStatus.label}</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="ops-table__cell">
                      <span className="ops-table__label">Задача</span>
                      {latestJob && latestJobStatus ? (
                        <Link href={`/admin/system/jobs/${latestJob.id}`} className="quiet-link text-sm">
                          Фоновая задача {latestJob.id.slice(0, 8)} · {latestJobStatus.label}
                        </Link>
                      ) : (
                        <span className="record-meta">Нет связанной задачи</span>
                      )}
                    </div>
                    <div className="ops-table__cell ops-table__cell--actions">
                      <span className="ops-table__label">Действия</span>
                      <div className="admin-actions justify-end">
                        <Link href={`/admin/integrations/${integration.id}`} className="quiet-link text-sm">
                          Открыть панель
                        </Link>
                        <IntegrationImportQueueForm integrationId={integration.id} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={emptyStateClass}>Источники пока не настроены. Начните с мастера подключения.</div>
        )}
        </section>
      ) : null}

      {activeSection === "diagnostics" ? (
        <section className="ops-panel" aria-labelledby="diagnostics-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Диагностика</p>
            <h2 id="diagnostics-title" className="ops-panel__title">Диагностика источников</h2>
            <p className="ops-panel__subtitle">Последняя проверка по каждому источнику в табличном виде.</p>
          </div>
          <span className="pill pill--neutral">{diagnosticRuns.length}</span>
        </div>
        {diagnosticRuns.length > 0 ? (
          <div className="ops-table-shell">
            <div className="ops-table ops-table--diagnostics" role="table" aria-label="Последняя диагностика">
              <div className="ops-table__row ops-table__row--head" role="row">
                <span>Источник</span>
                <span>Статус</span>
                <span>Режим</span>
                <span>Запуск</span>
                <span>Адрес</span>
              </div>
              {diagnosticRuns.map((run) => {
                const status = integrationRunStatusView(run.status);

                return (
                  <Link key={run.id} href={`/admin/integrations/${run.integrationId}`} className="ops-table__row" role="row">
                    <span className="record-title">{run.integrationName}</span>
                    <span className={`pill ${status.pillClass}`}>{status.label}</span>
                    <span className="record-meta">{integrationModeLabel(run.mode)}</span>
                    <span className="record-meta">{formatDate(run.startedAt)}</span>
                    <span className="record-meta compact-text">{run.redactedEndpoint ?? "Адрес появится после диагностики."}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={emptyStateClass}>Диагностик пока нет. Запустите проверку в панели источника.</div>
        )}
        </section>
      ) : null}

      {activeSection === "runs" ? (
        <section className="ops-panel" aria-labelledby="runs-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Запуски</p>
            <h2 id="runs-title" className="ops-panel__title">Проверка и импорт</h2>
            <p className="ops-panel__subtitle">Последние проверки без импорта, предпросмотры и реальные импорты.</p>
          </div>
        </div>
        {recentRuns.length > 0 ? (
          <div className="ops-table-shell">
            <div className="ops-table ops-table--runs" role="table" aria-label="Последние импорты">
              <div className="ops-table__row ops-table__row--head" role="row">
                <span>Источник</span>
                <span>Тип и статус</span>
                <span>Старт</span>
                <span>Итог</span>
                <span>Задача</span>
              </div>
              {recentRuns.slice(0, 6).map((run) => {
                const runStatus = integrationRunStatusView(run.status);
                const job = integrationJobByRunId.get(run.id);
                const jobStatus = job ? backendJobStatusView(job.status) : null;

                return (
                  <div key={run.id} className="ops-table__row" role="row">
                    <div className="ops-table__cell">
                      {run.integration && run.integration.workspaceId === user.workspaceId ? (
                        <Link href={`/admin/integrations/${run.integration.id}`} className="record-title hover:underline">
                          {run.integration.displayName}
                        </Link>
                      ) : (
                        <span className="record-title">{externalSourceLabel(run.source)}</span>
                      )}
                      <span className="record-meta">{run.actor?.name ?? "Автоматика"}</span>
                    </div>
                    <div className="ops-table__cell">
                      <span className={`pill ${runStatus.pillClass}`}>{runStatus.label}</span>
                      <span className="record-meta">{run.dryRun ? "Предпросмотр без импорта" : "Импорт"}</span>
                    </div>
                    <div className="ops-table__cell">
                      <span className="record-meta">{formatDate(run.startedAt)}</span>
                    </div>
                    <div className="ops-table__cell">
                      <span className="record-title">Проверено {displayedCheckedCount(run)}</span>
                      <span className="record-meta">
                        импортировано {run.importedCount}/{run.requestedLimit} · пропущено {run.skippedCount} · ошибок {run.errorCount} · строк{" "}
                        {run.items.length}
                      </span>
                    </div>
                    <div className="ops-table__cell">
                      {job && jobStatus ? (
                        <Link href={`/admin/system/jobs/${job.id}`} className="quiet-link text-sm">
                          {job.id.slice(0, 8)} · {jobStatus.label}
                        </Link>
                      ) : (
                        <span className="record-meta">Без фоновой задачи</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={emptyStateClass}>Запуски появятся после диагностики, предпросмотра или импорта.</div>
        )}
        </section>
      ) : null}

      {activeSection === "jobs" ? (
        <section className="ops-panel" aria-labelledby="jobs-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Очередь</p>
            <h2 id="jobs-title" className="ops-panel__title">Фоновые задачи</h2>
            <p className="ops-panel__subtitle">Очередь обработчика интеграций без технического тела задачи.</p>
          </div>
        </div>
        {recentIntegrationJobs.length > 0 ? (
          <div className="ops-table-shell">
            <div className="ops-table ops-table--jobs" role="table" aria-label="Фоновые задачи">
              <div className="ops-table__row ops-table__row--head" role="row">
                <span>Задача</span>
                <span>Статус</span>
                <span>Источник</span>
                <span>Запуск</span>
                <span>Связанный запуск</span>
              </div>
              {recentIntegrationJobs.map((job) => {
                const status = backendJobStatusView(job.status);
                const payload = parsePayloadJson(job.payloadJson);
                const runId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;
                const source = typeof payload.source === "string" ? payload.source : "integration";

                return (
                  <Link key={job.id} href={`/admin/system/jobs/${job.id}`} className="ops-table__row" role="row">
                    <span className="record-title">Задача {job.id.slice(0, 8)}</span>
                    <span className={`pill ${status.pillClass}`}>{status.label}</span>
                    <span className="record-meta">{externalSourceLabel(source)}</span>
                    <span className="record-meta">
                      {formatDate(job.runAfter)} · попытка {job.attempts}/{job.maxAttempts}
                    </span>
                    <span className="record-meta compact-text">{runId ? runId.slice(0, 8) : "не связан"}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={emptyStateClass}>В очереди интеграций пока нет задач.</div>
        )}
        </section>
      ) : null}

      {activeSection === "catalog" ? (
        <section className="ops-panel" aria-labelledby="catalog-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Каталог</p>
            <h2 id="catalog-title" className="ops-panel__title">План источников</h2>
            <p className="ops-panel__subtitle">Реестр возможностей для следующих коннекторов и моста событий.</p>
            <div className="admin-actions mt-3">
              <Link href="/admin/integrations/new" className="action-button action-button--small">
                Открыть мастер
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
        <div className="ops-table-shell">
          <div className="ops-table ops-table--catalog" role="table" aria-label="План источников">
            <div className="ops-table__row ops-table__row--head" role="row">
              <span>Источник</span>
              <span>Готовность</span>
              <span>Авторизация</span>
              <span>Возможности</span>
            </div>
            {roadmapCapabilities.map((capability) => (
              <div key={capability.source} className="ops-table__row" role="row">
                <div className="ops-table__cell">
                  <span className="record-title">{capabilityName(capability.source, capability.displayName)}</span>
                  <span className="record-meta">{capabilityTypeLabel(capability.type)}</span>
                </div>
                <div className="ops-table__cell">
                  <span className={`pill ${certificationStatusTone(capability.certification.summary.status)}`}>
                    {capability.certification.summary.label}
                  </span>
                  <span className="record-meta">{capabilityReadinessLabel(capability.readiness)}</span>
                </div>
                <span className="record-meta compact-text">{capability.authModes.map(authModeLabel).join(", ")}</span>
                <span className="record-meta compact-text">
                  курсор {capability.supportsCursor ? "есть" : "нет"} · диагностика {capability.supportsDiagnostics ? "есть" : "нет"} · вебхуки{" "}
                  {capability.supportsInboundWebhooks || capability.supportsOutboundWebhooks ? "есть" : "нет"}
                </span>
              </div>
            ))}
          </div>
        </div>
        </section>
      ) : null}
    </section>
  );
}
