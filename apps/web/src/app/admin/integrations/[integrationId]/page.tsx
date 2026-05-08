import Link from "next/link";
import { notFound } from "next/navigation";
import { NativeHelpdeskImportTester } from "@/components/integrations/native-helpdesk-import-tester";
import { OtrsConnectionForm } from "@/components/integrations/otrs-connection-form";
import { OtrsDiagnosticsPanel } from "@/components/integrations/otrs-diagnostics-panel";
import { OtrsImportTester } from "@/components/integrations/otrs-import-tester";
import { OtrsPreviewPanel } from "@/components/integrations/otrs-preview-panel";
import { OtrsRunHistory } from "@/components/integrations/otrs-run-history";
import { OtrsWebserviceChecklist } from "@/components/integrations/otrs-webservice-checklist";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { parseOtrsConnectorConfig, redactOtrsConfigForUi } from "@/lib/integrations/otrs-family/config";
import { summarizeIntegrationSecretSlots } from "@/lib/integrations/otrs-family/credentials";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";

export const dynamic = "force-dynamic";

type IntegrationDetailsPageProps = {
  params: Promise<{ integrationId: string }>;
};

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("ru-RU") : "Нет данных";
}

function parsePayloadJson(value: string) {
  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function userLoginFromConfig(value: string) {
  try {
    const parsed = JSON.parse(value) as { userLogin?: unknown };

    return typeof parsed.userLogin === "string" ? parsed.userLogin : "";
  } catch {
    return "";
  }
}

async function loadIntegration(workspaceId: string, integrationId: string) {
  return prisma.integration.findFirst({
    where: {
      id: integrationId,
      workspaceId
    },
    include: {
      credentials: {
        select: {
          id: true,
          kind: true,
          authMode: true,
          fingerprint: true,
          lastRotatedAt: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: {
          kind: "asc"
        }
      },
      diagnosticRuns: {
        orderBy: {
          startedAt: "desc"
        },
        take: 5,
        include: {
          steps: {
            orderBy: {
              position: "asc"
            }
          }
        }
      },
      runs: {
        orderBy: {
          startedAt: "desc"
        },
        take: 10,
        include: {
          actor: {
            select: {
              name: true
            }
          },
          items: {
            orderBy: {
              createdAt: "asc"
            },
            include: {
              conversation: {
                select: {
                  id: true,
                  subject: true
                }
              }
            }
          }
        }
      }
    }
  });
}

type LoadedIntegration = NonNullable<Awaited<ReturnType<typeof loadIntegration>>>;

function toDiagnosticRun(run: LoadedIntegration["diagnosticRuns"][number] | undefined) {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    status: run.status,
    mode: run.mode,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    redactedEndpoint: run.redactedEndpoint,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    steps: run.steps.map((step) => ({
      id: step.id,
      key: step.key,
      position: step.position,
      status: step.status,
      durationMs: step.durationMs,
      remediationHint: step.remediationHint
    }))
  };
}

function toPreviewRun(run: LoadedIntegration["runs"][number] | undefined) {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    status: run.status,
    requestedLimit: run.requestedLimit,
    importedCount: run.importedCount,
    errorCount: run.errorCount,
    startedAt: run.startedAt.toISOString(),
    items: run.items.map((item) => ({
      id: item.id,
      externalId: item.externalId,
      ticketNumber: item.ticketNumber,
      status: item.status,
      articleCount: item.articleCount,
      privateArticleCount: item.privateArticleCount,
      attachmentCount: item.attachmentCount,
      conversationId: item.conversationId
    }))
  };
}

function NonOtrsIntegrationSummary({
  integration,
  jobs
}: {
  integration: LoadedIntegration;
  jobs: Array<{
    id: string;
    status: string;
    createdAt: Date;
    runAfter: Date;
    attempts: number;
    maxAttempts: number;
  }>;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="admin-group">
        <div className="admin-group__header admin-group__header--compact">
          <h2 className="text-base font-semibold text-[#111827]">Сводка источника</h2>
          <p className="text-sm leading-5 text-[#64748b]">Для non-OTRS источников cockpit показывает безопасную операционную сводку.</p>
        </div>
        <div className="grid gap-2">
          <div className="admin-tile admin-tile--compact">
            <span className="admin-tile__icon admin-tile__icon--plain">S</span>
            <span className="admin-tile__body">
              <span className="record-title record-title--tight">{externalSourceLabel(integration.source)}</span>
              <span className="record-meta">{integration.type} · {integrationStatusLabel(integration.status)}</span>
              <span className="record-meta compact-text">{integration.baseUrl ?? "Base URL не указан"}</span>
            </span>
          </div>
        </div>
      </section>

      <section className="admin-group">
        <div className="admin-group__header admin-group__header--compact">
          <h2 className="text-base font-semibold text-[#111827]">Backend jobs</h2>
          <p className="text-sm leading-5 text-[#64748b]">Без отображения raw payload.</p>
        </div>
        <div className="grid gap-2">
          {jobs.length > 0 ? (
            jobs.slice(0, 5).map((job) => {
              const status = backendJobStatusView(job.status);

              return (
                <Link key={job.id} href={`/admin/system/jobs/${job.id}`} className="admin-tile admin-tile--compact">
                  <span className="admin-tile__icon admin-tile__icon--plain">J</span>
                  <span className="admin-tile__body">
                    <span className="record-title record-title--tight">Job {job.id.slice(0, 8)}</span>
                    <span className="record-meta">
                      <span className={`pill ${status.pillClass}`}>{status.label}</span> · попытка {job.attempts}/{job.maxAttempts}
                    </span>
                  </span>
                </Link>
              );
            })
          ) : (
            <div className="soft-callout text-sm leading-5 text-[#64748b]">Задач пока нет.</div>
          )}
        </div>
      </section>
    </div>
  );
}

export default async function IntegrationDetailsPage({ params }: IntegrationDetailsPageProps) {
  const user = await requireCurrentUserPermission("integrations:manage");
  const { integrationId } = await params;
  const integration = await loadIntegration(user.workspaceId, integrationId);

  if (!integration) {
    notFound();
  }

  const jobs = await prisma.backendJob.findMany({
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
      createdAt: true,
      runAfter: true,
      attempts: true,
      maxAttempts: true
    }
  });
  const relatedJobs = jobs.filter((job) => parsePayloadJson(job.payloadJson).integrationId === integration.id);
  const jobByRunId = new Map<string, {
    id: string;
    status: string;
    createdAt: Date;
    runAfter: Date;
    attempts: number;
    maxAttempts: number;
  }>();

  for (const job of relatedJobs) {
    const runId = parsePayloadJson(job.payloadJson).integrationRunId;

    if (typeof runId === "string" && !jobByRunId.has(runId)) {
      jobByRunId.set(runId, {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        runAfter: job.runAfter,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts
      });
    }
  }
  const latestRun = integration.runs[0];
  const latestRunStatus = latestRun ? integrationRunStatusView(latestRun.status) : null;
  const credentialSummaries = summarizeIntegrationSecretSlots(integration.credentials);

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Интеграции</p>
          <h1 className="page-title">{integration.displayName}</h1>
          <p className="page-subtitle">
            {externalSourceLabel(integration.source)} · {integration.type} · {integrationStatusLabel(integration.status)} · последний запуск{" "}
            {formatDate(latestRun?.startedAt)}
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/integrations" className="action-button">
            К обзору
          </Link>
          <Link href="/admin/integrations/new" className="action-button">
            Новый источник
          </Link>
          <Link href="/reviews" className="action-button action-button--quiet">
            Очередь проверок
          </Link>
        </div>
      </div>

      <section className="admin-group-grid admin-group-grid--wide" aria-label="Сводка источника">
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Статус</h2>
            <p className="text-sm leading-5 text-[#64748b]">Текущая операционная готовность.</p>
          </div>
          <div className="admin-tile admin-tile--compact">
            <span className="admin-tile__icon admin-tile__icon--plain">{integration.displayName.slice(0, 1).toUpperCase()}</span>
            <span className="admin-tile__body">
              <span className="record-title record-title--tight">{integrationStatusLabel(integration.status)}</span>
              <span className="record-meta">Dry-run: {formatDate(integration.lastDryRunAt)} · импорт: {formatDate(integration.lastImportAt)}</span>
              {integration.lastError ? <span className="record-meta text-[#b91c1c]">{integration.lastError}</span> : null}
            </span>
          </div>
        </div>
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Последний run</h2>
            <p className="text-sm leading-5 text-[#64748b]">Preview/import counts.</p>
          </div>
          <div className="admin-tile admin-tile--compact">
            <span className="admin-tile__icon admin-tile__icon--plain">{latestRun?.dryRun ? "P" : "I"}</span>
            <span className="admin-tile__body">
              {latestRun && latestRunStatus ? (
                <>
                  <span className="record-title record-title--tight">
                    <span className={`pill ${latestRunStatus.pillClass}`}>{latestRunStatus.label}</span>
                  </span>
                  <span className="record-meta">
                    Импортировано {latestRun.importedCount}/{latestRun.requestedLimit} · ошибок {latestRun.errorCount} · items {latestRun.items.length}
                  </span>
                </>
              ) : (
                <span className="record-meta">Запусков еще нет.</span>
              )}
            </span>
          </div>
        </div>
      </section>

      {integration.type === "otrs_family" ? (
        <OtrsDetailCockpit
          integration={integration}
          credentialSummaries={credentialSummaries}
          jobByRunId={jobByRunId}
        />
      ) : (
        <NonOtrsIntegrationSummary integration={integration} jobs={relatedJobs} />
      )}
    </section>
  );
}

function OtrsDetailCockpit({
  integration,
  credentialSummaries,
  jobByRunId
}: {
  integration: LoadedIntegration;
  credentialSummaries: ReturnType<typeof summarizeIntegrationSecretSlots>;
  jobByRunId: Map<
    string,
    {
      id: string;
      status: string;
      createdAt: Date;
      runAfter: Date;
      attempts: number;
      maxAttempts: number;
    }
  >;
}) {
  const config = redactOtrsConfigForUi(parseOtrsConnectorConfig(integration.configJson));
  const latestPreviewRun = integration.runs.find((run) => run.items.length > 0 || ["manual_ticket_ids", "ticket_search", "previewed"].includes(run.mode));

  return (
    <div className="grid gap-6">
      <OtrsWebserviceChecklist baseUrl={integration.baseUrl} config={config} />
      <OtrsConnectionForm
        integration={{
          id: integration.id,
          source: integration.source,
          displayName: integration.displayName,
          baseUrl: integration.baseUrl,
          importLimit: integration.importLimit,
          batchSize: integration.batchSize,
          dateRangeDays: integration.dateRangeDays
        }}
        config={config}
        userLogin={userLoginFromConfig(integration.configJson)}
        credentials={credentialSummaries}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <OtrsDiagnosticsPanel integrationId={integration.id} latestDiagnostic={toDiagnosticRun(integration.diagnosticRuns[0])} />
        <OtrsPreviewPanel integrationId={integration.id} latestPreviewRun={toPreviewRun(latestPreviewRun)} />
      </div>

      <OtrsRunHistory runs={integration.runs} jobsByRunId={jobByRunId} />

      <details className="disclosure-panel panel overflow-hidden">
        <summary className="disclosure-summary cursor-pointer list-none border-b border-[#d9e0ea] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Ручная проверка payload</h2>
            <p className="mt-1 text-sm leading-5 text-[#64748b]">
              Legacy/manual JSON path: вставка TicketGet payload без connector preview. Server action оставлен без изменений.
            </p>
          </div>
        </summary>
        <div className="grid gap-5 p-4">
          <section className="integration-payload-section">
            <div className="integration-payload-section__header">
              <h3 className="text-base font-semibold text-[#111827]">OTRS-family TicketGet payload</h3>
              <p className="mt-1 text-sm leading-5 text-[#64748b]">
                Используйте только для ручной проверки JSON, когда connector-путь недоступен.
              </p>
            </div>
            <div className="integration-payload-section__body">
              <OtrsImportTester />
            </div>
          </section>
          <details className="compact-details disclosure-panel overflow-hidden">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#334155]">
              Native helpdesk legacy payload
            </summary>
            <div className="border-t border-[#d9e0ea] p-4">
              <NativeHelpdeskImportTester />
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
