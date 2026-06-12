import { ArrowLeft, ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NativeHelpdeskImportTester } from "@/components/integrations/native-helpdesk-import-tester";
import { OtrsConnectionForm } from "@/components/integrations/otrs-connection-form";
import { OtrsDiagnosticsPanel } from "@/components/integrations/otrs-diagnostics-panel";
import { OtrsImportTester } from "@/components/integrations/otrs-import-tester";
import { OtrsPreviewPanel } from "@/components/integrations/otrs-preview-panel";
import { OtrsRunHistory } from "@/components/integrations/otrs-run-history";
import { OtrsWebserviceChecklist } from "@/components/integrations/otrs-webservice-checklist";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { certificationStatusTone } from "@/lib/certification/status";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getIntegrationCapability } from "@/lib/integrations/capabilities";
import { parseOtrsConnectorConfig, redactOtrsConfigForUi } from "@/lib/integrations/otrs-family/config";
import { summarizeIntegrationSecretSlots } from "@/lib/integrations/otrs-family/credentials";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";

export const dynamic = "force-dynamic";

type IntegrationDetailsPageProps = {
  params: Promise<{ integrationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type IntegrationDetailsSection = "summary" | "operations";

const integrationDetailsSections: Array<{ value: IntegrationDetailsSection; label: string }> = [
  { value: "summary", label: "Сводка" },
  { value: "operations", label: "Операции" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function integrationDetailsSectionParam(value: string | string[] | undefined): IntegrationDetailsSection {
  const section = firstParam(value);

  return integrationDetailsSections.some((item) => item.value === section) ? (section as IntegrationDetailsSection) : "summary";
}

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

function authModeLabel(value: string) {
  const labels: Record<string, string> = {
    api_token: "API-токен",
    basic: "Базовая авторизация",
    basic_api_key: "API-ключ через Basic",
    basic_api_token: "API-токен через Basic",
    bearer_token: "Bearer-токен",
    hmac_sha256: "Подпись HMAC-SHA256",
    none: "Без авторизации",
    oauth: "OAuth",
    oauth_client_credentials: "OAuth: учетные данные клиента",
    oauth_connected_app: "OAuth-приложение Salesforce",
    private_app_token: "Токен private app",
    session_create: "Создание сессии",
    tls_ca_bundle: "Пакет корневых сертификатов",
    user_password: "Пользователь и пароль"
  };

  return labels[value] ?? value;
}

function operationLabel(value: string) {
  const labels: Record<string, string> = {
    activities_get: "Получение активностей",
    case_get: "Получение case",
    comments_get: "Получение комментариев",
    conversation_import: "Импорт диалогов",
    conversations_get: "Получение диалогов",
    diagnostics: "Диагностика",
    fixture_import: "Импорт fixture",
    preview: "Предпросмотр",
    review_export: "Экспорт проверок",
    selected_import: "Выборочный импорт",
    ticket_get: "Получение тикета",
    ticket_search: "Поиск тикетов",
    webhook_ingest: "Прием вебхуков"
  };

  return labels[value] ?? value;
}

function certificationGateLabel(value: string) {
  const labels: Record<string, string> = {
    configuration_required: "Нужна настройка",
    contract_certified: "Контракт проверен",
    docs_checked: "Документация проверена",
    live_certified: "Живая сертификация пройдена",
    not_production_ready: "Не готово",
    stub_certified: "Stub проверен",
    waiting_for_access: "Ожидает доступы"
  };

  return labels[value] ?? value;
}

function secretSlotLabel(value: string) {
  const labels: Record<string, string> = {
    auth_password: "auth_password",
    ca_bundle: "ca_bundle",
    oauth_client_credentials: "oauth_client_credentials",
    webhook_secret: "webhook_secret"
  };

  return labels[value] ?? value;
}

function hasRequiredCredentialSlots(
  credentials: Array<{ kind: string }>,
  requiredSecrets: string[]
) {
  return requiredSecrets.every((secret) => credentials.some((credential) => credential.kind === secret));
}

function readinessActionLabel(hasBaseUrl: boolean, hasRequiredSecrets: boolean) {
  return hasBaseUrl && hasRequiredSecrets ? "Готово к живой сертификации" : "Ожидает доступы";
}

function credentialFingerprintLabel(value: string | null) {
  return value ? `${value.slice(0, 16)}...` : null;
}

async function loadIntegration(workspaceId: string, integrationId: string) {
  return prisma.integration.findFirst({
    where: {
      id: integrationId,
      workspaceId
    },
    include: {
      credentials: {
        where: {
          workspaceId
        },
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
        where: {
          workspaceId
        },
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
        where: {
          workspaceId
        },
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
            where: {
              workspaceId
            },
            orderBy: {
              createdAt: "asc"
            },
            include: {
              conversation: {
                select: {
                  id: true,
                  workspaceId: true,
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

function AdapterReadinessPanel({ integration }: { integration: LoadedIntegration }) {
  const capability = getIntegrationCapability(integration.source, integration.type);
  const hasBaseUrl = Boolean(integration.baseUrl?.trim());
  const hasRequiredSecrets = hasRequiredCredentialSlots(integration.credentials, capability.requiredSecrets);
  const canRunDiagnostics = capability.supportsDiagnostics && hasBaseUrl && hasRequiredSecrets;
  const hasRunnableDiagnostics = canRunDiagnostics && integration.type === "otrs_family";
  const gates = [
    { label: "Документация", value: capability.certification.gates.docs },
    { label: "Контракт", value: capability.certification.gates.contract },
    { label: "Stub", value: capability.certification.gates.stub },
    { label: "Live", value: capability.certification.gates.live }
  ];

  return (
    <section className="soft-callout">
      <div className="grid gap-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="record-title">Готовность адаптера</h3>
            <p className="record-meta">
              {capability.displayName} · {capability.authModes.map(authModeLabel).join(", ")}
            </p>
          </div>
          <span className={`pill ${certificationStatusTone(capability.certification.summary.status)}`}>
            {capability.certification.summary.label}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {gates.map((gate) => (
            <div key={gate.label} className="admin-tile admin-tile--compact">
              <span className="admin-tile__icon admin-tile__icon--plain">G</span>
              <span className="admin-tile__body">
                <span className="record-title record-title--tight">{gate.label}</span>
                <span className="record-meta">{certificationGateLabel(gate.value)}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="soft-callout">
            <p className="soft-callout__label">Операции</p>
            <p className="mt-1 text-sm leading-5 text-[var(--text-body)]">
              {capability.operations.map(operationLabel).join(", ")}
            </p>
          </div>
          <div className="soft-callout">
            <p className="soft-callout__label">Секреты</p>
            <div className="mt-1 grid gap-1 text-sm leading-5 text-[var(--text-body)]">
              {capability.requiredSecrets.length > 0 ? (
                capability.requiredSecrets.map((secret) => {
                  const credential = integration.credentials.find((item) => item.kind === secret);
                  const fingerprint = credentialFingerprintLabel(credential?.fingerprint ?? null);

                  return (
                    <p key={secret} className="break-words">
                      {secretSlotLabel(secret)}:{" "}
                      {credential
                        ? `сохранен${fingerprint ? `, fingerprint ${fingerprint}` : ""}`
                        : "не сохранен"}
                    </p>
                  );
                })
              ) : (
                <p>Секреты не требуются.</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="soft-callout">
            <p className="soft-callout__label">Документация</p>
            <div className="mt-1 flex min-w-0 flex-wrap gap-2">
              {capability.certification.docs.length > 0 ? (
                capability.certification.docs.map((doc) => (
                  <a key={`${doc.label}:${doc.href}`} href={doc.href} target="_blank" rel="noreferrer" className="quiet-link text-sm">
                    {doc.label}
                  </a>
                ))
              ) : (
                <span className="record-meta">Документы не указаны.</span>
              )}
            </div>
          </div>
          <div className="soft-callout">
            <p className="soft-callout__label">Диагностика</p>
            <p className="mt-1 text-sm leading-5 text-[var(--text-body)]">
              {readinessActionLabel(hasBaseUrl, hasRequiredSecrets)}.
              {hasRunnableDiagnostics
                ? " Можно запускать безопасную диагностику из доступного cockpit-действия."
                : canRunDiagnostics
                  ? " Условия выполнены, но runnable action для этого адаптера пока не подключен."
                : " Действие появится после Base URL и обязательных секретов."}
            </p>
          </div>
        </div>

        {capability.certification.limitations.length > 0 ? (
          <div className="soft-callout">
            <p className="soft-callout__label">Ограничения</p>
            <ul className="mt-1 grid gap-1 pl-4 text-sm leading-5 text-[var(--text-muted)]">
              {capability.certification.limitations.map((limitation) => (
                <li key={limitation} className="list-disc break-words">
                  {limitation}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

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

function toRunHistoryRuns(runs: LoadedIntegration["runs"], workspaceId: string) {
  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    mode: run.mode,
    dryRun: run.dryRun,
    requestedLimit: run.requestedLimit,
    importedCount: run.importedCount,
    errorCount: run.errorCount,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    actor: run.actor,
    items: run.items.map((item) => ({
      id: item.id,
      externalId: item.externalId,
      ticketNumber: item.ticketNumber,
      status: item.status,
      articleCount: item.articleCount,
      privateArticleCount: item.privateArticleCount,
      attachmentCount: item.attachmentCount,
      conversationId: item.conversation?.workspaceId === workspaceId ? item.conversationId : null,
      conversation:
        item.conversation?.workspaceId === workspaceId
          ? {
              id: item.conversation.id,
              subject: item.conversation.subject
            }
          : null
    }))
  }));
}

function idPayloadFilters(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  return uniqueIds.map((id) => ({
    payloadJson: {
      contains: id
    }
  }));
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
  const capability = getIntegrationCapability(integration.source, integration.type);
  const hasBaseUrl = Boolean(integration.baseUrl?.trim());
  const hasRequiredSecrets = hasRequiredCredentialSlots(integration.credentials, capability.requiredSecrets);
  const canRunDiagnostics = capability.supportsDiagnostics && hasBaseUrl && hasRequiredSecrets;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="soft-callout">
        <div className="grid gap-2">
          <div>
            <h3 className="record-title">Сводка источника</h3>
            <p className="record-meta">Для non-OTRS источников cockpit показывает безопасную операционную сводку.</p>
          </div>
          <div className="admin-tile admin-tile--compact">
            <span className="admin-tile__icon admin-tile__icon--plain">S</span>
            <span className="admin-tile__body">
              <span className="record-title record-title--tight">{externalSourceLabel(integration.source)}</span>
              <span className="record-meta">{integration.type} · {integrationStatusLabel(integration.status)}</span>
              <span className="record-meta compact-text">{integration.baseUrl ?? "Base URL не указан"}</span>
              <span className="record-meta compact-text">
                {canRunDiagnostics
                  ? "Условия для диагностики выполнены; runnable action для этого адаптера пока не подключен."
                  : "Диагностика ожидает Base URL и обязательные секреты."}
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="soft-callout">
        <div className="grid gap-2">
          <div>
            <h3 className="record-title">Фоновые задачи</h3>
            <p className="record-meta">Без отображения raw payload.</p>
          </div>
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
            <div className="soft-callout text-sm leading-5 text-[var(--text-muted)]">Задач пока нет.</div>
          )}
        </div>
      </section>
    </div>
  );
}

export default async function IntegrationDetailsPage({ params, searchParams }: IntegrationDetailsPageProps) {
  const search = await searchParams;
  const user = await requireCurrentUserPermission("integrations:manage");
  const { integrationId } = await params;
  const activeSection = integrationDetailsSectionParam(search.section);
  const integrationDetailsSectionHref = (section: IntegrationDetailsSection) => `/admin/integrations/${integrationId}?section=${section}`;
  const integration = await loadIntegration(user.workspaceId, integrationId);

  if (!integration) {
    notFound();
  }

  const jobFilters = idPayloadFilters([integration.id, ...integration.runs.map((run) => run.id)]);
  const jobs =
    jobFilters.length > 0
      ? await prisma.backendJob.findMany({
          where: {
            workspaceId: user.workspaceId,
            type: "INTEGRATION_IMPORT",
            OR: jobFilters
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
  const capability = getIntegrationCapability(integration.source, integration.type);

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
          <div className="admin-actions mt-5">
            <Link href="/admin/integrations" className="action-button">
              <ArrowLeft size={16} aria-hidden="true" />
              К обзору
            </Link>
            <Link href="/admin/integrations/new" className="action-button">
              <Plus size={16} aria-hidden="true" />
              Новый источник
            </Link>
            <Link href="/reviews" className="action-button action-button--quiet">
              <ListChecks size={16} aria-hidden="true" />
              Очередь проверок
            </Link>
          </div>
        </div>
      </div>

      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы источника">
        {integrationDetailsSections.map((section) => (
          <Link
            key={section.value}
            href={integrationDetailsSectionHref(section.value)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "summary" ? (
        <section className="ops-panel" aria-labelledby="integration-summary-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Источник</p>
              <h2 id="integration-summary-title" className="ops-panel__title">Сводка источника</h2>
              <p className="ops-panel__subtitle">Статус, последний запуск и состояние импорта без раскрытия технических payload.</p>
            </div>
          </div>
          <div className="grid gap-2 p-4 md:grid-cols-3">
            <div className="admin-tile admin-tile--compact">
              <span className="admin-tile__icon admin-tile__icon--plain">{integration.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="admin-tile__body">
                <span className="record-title record-title--tight">{integrationStatusLabel(integration.status)}</span>
                <span className="record-meta">Dry-run: {formatDate(integration.lastDryRunAt)} · импорт: {formatDate(integration.lastImportAt)}</span>
                {integration.lastError ? <span className="record-meta text-[var(--danger)]">{integration.lastError}</span> : null}
              </span>
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
            <div className="ops-status-item">
              <div className="flex min-w-0 items-center gap-2">
                <span className="ops-status-item__label">Статус сертификации</span>
                <HelpTooltip
                  label="Что значит статус сертификации?"
                  content="Статус показывает прохождение gate-проверок: документация, контракт, заглушка и живая сертификация."
                  placement="top-end"
                />
              </div>
              <span className={`pill ${certificationStatusTone(capability.certification.summary.status)}`}>
                {capability.certification.summary.label}
              </span>
              <span className="record-meta">
                {capability.certification.summary.productionReady
                  ? "Можно использовать в промышленном контуре."
                  : "Нужны дополнительные проверки перед промышленным контуром."}
              </span>
            </div>
          </div>
          <div className="p-4 pt-0">
            <AdapterReadinessPanel integration={integration} />
          </div>
        </section>
      ) : null}

      {activeSection === "operations" ? (
        <section className="ops-panel" aria-labelledby="integration-operations-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Операции</p>
              <h2 id="integration-operations-title" className="ops-panel__title">Настройка и проверки</h2>
              <p className="ops-panel__subtitle">Диагностика, предпросмотр, импорт и история запусков.</p>
            </div>
          </div>
          <div className="p-4">
            <div className="mb-6">
              <AdapterReadinessPanel integration={integration} />
            </div>
            {integration.type === "otrs_family" ? (
              <OtrsDetailCockpit
                integration={integration}
                credentialSummaries={credentialSummaries}
                jobByRunId={jobByRunId}
              />
            ) : (
              <NonOtrsIntegrationSummary integration={integration} jobs={relatedJobs} />
            )}
          </div>
        </section>
      ) : null}
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
  const canRunDiagnostics = Boolean(integration.baseUrl?.trim()) && credentialSummaries.some((slot) => slot.kind === "auth_password");

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
        {canRunDiagnostics ? (
          <OtrsDiagnosticsPanel integrationId={integration.id} latestDiagnostic={toDiagnosticRun(integration.diagnosticRuns[0])} />
        ) : (
          <section className="panel overflow-clip">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-semibold">Диагностика</h2>
              <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
                Действие запуска появится после сохранения Base URL и секрета auth_password.
              </p>
            </div>
            <div className="p-4">
              <div className="soft-callout text-sm leading-5 text-[var(--text-muted)]">
                Ожидает доступы. Raw секреты не отображаются; сохраните пароль или API-секрет в настройке подключения.
              </div>
            </div>
          </section>
        )}
        <OtrsPreviewPanel integrationId={integration.id} latestPreviewRun={toPreviewRun(latestPreviewRun)} />
      </div>

      <OtrsRunHistory runs={toRunHistoryRuns(integration.runs, integration.workspaceId)} jobsByRunId={jobByRunId} />

      <details className="compact-details overflow-clip">
        <summary className="disclosure-summary cursor-pointer list-none border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Ручная проверка payload</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
              Legacy/manual JSON path: вставка TicketGet payload без connector preview. Server action оставлен без изменений.
            </p>
          </div>
        </summary>
        <div className="grid gap-5 p-4">
          <section className="integration-payload-section">
            <div className="integration-payload-section__header">
              <h3 className="text-base font-semibold text-[var(--foreground)]">OTRS-family TicketGet payload</h3>
              <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
                Используйте только для ручной проверки JSON, когда connector-путь недоступен.
              </p>
            </div>
            <div className="integration-payload-section__body">
              <OtrsImportTester />
            </div>
          </section>
          <details className="compact-details overflow-clip">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--text-body)]">
              Native helpdesk legacy payload
            </summary>
            <div className="border-t border-[var(--border)] p-4">
              <NativeHelpdeskImportTester />
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
