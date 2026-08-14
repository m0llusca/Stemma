import { ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IntegrationSettingsForm } from "@/components/integrations/integration-settings-form";
import { NativeHelpdeskImportTester } from "@/components/integrations/native-helpdesk-import-tester";
import { PageSkeleton } from "@/components/loading-states";
import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import type { OperationalStep } from "@/components/operations/operational-brief";
import { OtrsConnectionForm } from "@/components/integrations/otrs-connection-form";
import { OtrsDiagnosticsPanel } from "@/components/integrations/otrs-diagnostics-panel";
import { OtrsImportTester } from "@/components/integrations/otrs-import-tester";
import { OtrsPreviewPanel } from "@/components/integrations/otrs-preview-panel";
import { OtrsRunHistory } from "@/components/integrations/otrs-run-history";
import { OtrsWebserviceChecklist } from "@/components/integrations/otrs-webservice-checklist";
import {
  CertificationEvidenceList,
  IntegrationFact
} from "@/components/integrations/integration-ui";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AdminSectionTabs } from "@/components/admin/admin-section-tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { adminEyebrow } from "@/lib/admin-sections";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getIntegrationCapability } from "@/lib/integrations/capabilities";
import { parseOtrsConnectorConfig, redactOtrsConfigForUi } from "@/lib/integrations/otrs-family/config";
import { summarizeIntegrationSecretSlots } from "@/lib/integrations/otrs-family/credentials";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, integrationRunOperationalStepState, integrationRunStatusView } from "@/lib/operational-status";
import type { StatusTone } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

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

function integrationTypeLabel(value: string) {
  const labels: Record<string, string> = {
    otrs_family: "Семейство OTRS",
    native_helpdesk: "Служба поддержки",
    custom_api: "Свой API",
    webhook_bridge: "Мост вебхуков",
    enterprise: "Корпоративная система",
    data_source: "Хранилище данных"
  };

  return labels[value] ?? value;
}

function secretSlotLabel(value: string) {
  const labels: Record<string, string> = {
    auth_password: "Пароль / токен доступа",
    ca_bundle: "Пакет CA-сертификатов",
    oauth_client_credentials: "OAuth: client credentials",
    webhook_secret: "Секрет вебхука"
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

function credentialFingerprintLabel(value: string | null) {
  return value ? `${value.slice(0, 16)}...` : null;
}

function statusViewTone(tone: "ok" | "warn" | "error" | "neutral"): StatusTone {
  if (tone === "ok") return "positive";
  if (tone === "warn") return "warning";
  if (tone === "error") return "negative";
  return "neutral";
}

function integrationRunTone(status: string): StatusTone {
  return statusViewTone(integrationRunStatusView(status).tone);
}

function diagnosticSucceeded(status: string | undefined) {
  return Boolean(status && ["ok", "passed", "success", "succeeded"].includes(status));
}

function readinessStepStatusView(state: OperationalStep["state"]) {
  const views: Record<OperationalStep["state"], { label: string; tone: StatusTone }> = {
    ready: { label: "Готово", tone: "positive" },
    active: { label: "Активно", tone: "info" },
    waiting: { label: "Ожидание", tone: "neutral" },
    blocked: { label: "Блок", tone: "negative" }
  };

  return views[state];
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
      },
      certificationEvidence: {
        where: {
          workspaceId
        },
        orderBy: {
          recordedAt: "desc"
        },
        take: 5,
        select: {
          id: true,
          runId: true,
          result: true,
          envGate: true,
          recordedAt: true,
          actor: {
            select: {
              name: true,
              email: true
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
  const presentRequiredSecrets = capability.requiredSecrets.filter((secret) => integration.credentials.some((credential) => credential.kind === secret)).length;
  const latestDiagnostic = integration.diagnosticRuns[0];
  const latestRun = integration.runs[0];
  const latestRunStatus = latestRun ? integrationRunStatusView(latestRun.status) : null;
  const readinessSteps: OperationalStep[] = [
    {
      label: "Профиль",
      state: hasBaseUrl ? "ready" : "active",
      detail: hasBaseUrl ? "Адрес источника сохранён." : "Укажите адрес источника."
    },
    {
      label: "Доступы",
      state: hasRequiredSecrets ? "ready" : "blocked",
      detail:
        capability.requiredSecrets.length > 0
          ? `${presentRequiredSecrets}/${capability.requiredSecrets.length} обязательных секретов.`
          : "Секреты не требуются."
    },
    {
      label: "Диагностика",
      state: diagnosticSucceeded(latestDiagnostic?.status) ? "ready" : canRunDiagnostics ? "active" : "waiting",
      detail: latestDiagnostic ? `${latestDiagnostic.status} · ${formatDate(latestDiagnostic.startedAt)}` : "Запускается после доступа."
    },
    {
      label: "Предпросмотр",
      state: integration.runs.some((run) => run.dryRun && integrationRunStatusView(run.status).tone === "ok") ? "ready" : hasRequiredSecrets ? "active" : "waiting",
      detail: integration.runs.find((run) => run.dryRun) ? `Последний пробный запуск: ${formatDate(integration.runs.find((run) => run.dryRun)?.startedAt)}` : "Пока нет предпросмотра."
    },
    {
      label: "Импорт",
      state: latestRun && !latestRun.dryRun && latestRunStatus?.tone === "ok" ? "ready" : latestRun ? "active" : "waiting",
      detail: latestRun ? `${latestRunStatus?.label ?? latestRun.status} · ${latestRun.importedCount}/${latestRun.requestedLimit}` : "Ждет успешного preview."
    }
  ];
  const gates = [
    { label: "Документация", value: capability.certification.gates.docs },
    { label: "Контракт", value: capability.certification.gates.contract },
    { label: "Stub", value: capability.certification.gates.stub },
    { label: "Live", value: capability.certification.gates.live }
  ];

  return (
    <section
      className="grid min-w-0 gap-4 border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0"
      aria-labelledby="adapter-readiness-title"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 break-words">
          <h3 id="adapter-readiness-title" className="text-sm font-medium">
            Готовность адаптера
          </h3>
          <p className="break-words text-sm text-muted-foreground">
            {capability.displayName} · {capability.authModes.map(authModeLabel).join(", ")}
          </p>
        </div>
        <StatusBadge compact
          label="Готовность"
          value={capability.certification.summary.label}
          tone={certificationTone(capability.certification.summary.status)}
        />
      </div>

      <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2">
        <section
          className="grid min-w-0 content-start overflow-clip rounded-lg border border-border"
          aria-labelledby="adapter-command-title"
        >
          <div className="min-w-0 border-b border-border bg-muted/40 p-3">
            <h4
              id="adapter-command-title"
              className="break-words text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Командный контур
            </h4>
            <p className="mt-1 break-words text-sm font-medium">
              {hasBaseUrl && hasRequiredSecrets ? "Источник готов к проверкам" : "Источник ожидает настройки"}
            </p>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {hasBaseUrl && hasRequiredSecrets
                ? "Можно переходить к диагностике, предпросмотру и свидетельствам боевого режима без раскрытия секретов."
                : "Сначала закройте профиль и обязательные секреты, затем запускайте диагностику и preview."}
            </p>
          </div>
          <div className="min-w-0 px-3">
            <IntegrationFact label="Последний запуск">
              <span className="grid min-w-0 gap-1">
                <StatusBadge
                  compact
                  label="Последний запуск"
                  value={latestRunStatus?.label ?? "нет"}
                  tone={latestRun ? integrationRunTone(latestRun.status) : "neutral"}
                />
                <span className="break-words text-xs text-muted-foreground">
                  {latestRun
                    ? `${latestRun.dryRun ? "Пробный запуск" : "Импорт"} · ${formatDate(latestRun.startedAt)}`
                    : "Импорт не запускался."}
                </span>
              </span>
            </IntegrationFact>
          </div>
        </section>

        <section
          className="min-w-0 overflow-clip rounded-lg border border-border"
          aria-label="Маршрут готовности источника"
        >
          <div className="grid min-w-0 sm:grid-cols-2" role="list">
            {readinessSteps.map((step) => {
              const status = readinessStepStatusView(step.state);

              return (
                <div
                  key={step.label}
                  className="grid min-w-0 content-start gap-1.5 border-border p-3 not-last:border-b sm:not-last:border-b-0 sm:not-last:border-r"
                  role="listitem"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-medium">{step.label}</span>
                    <StatusBadge compact label="Состояние" value={status.label} tone={status.tone} />
                  </div>
                  <span className="min-w-0 break-words text-xs text-muted-foreground">{step.detail}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid min-w-0 rounded-lg border border-border px-3 md:grid-cols-2 md:gap-x-4">
        {gates.map((gate) => (
          <IntegrationFact key={gate.label} label={gate.label}>
            {certificationGateLabel(gate.value)}
          </IntegrationFact>
        ))}
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-border px-3">
          <IntegrationFact label="Операции">
            {capability.operations.map(operationLabel).join(", ")}
          </IntegrationFact>
        </div>
        <div className="min-w-0 rounded-lg border border-border px-3">
          <IntegrationFact label="Секреты">
            <div className="grid min-w-0 gap-1">
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
                <span>Секреты не требуются.</span>
              )}
            </div>
          </IntegrationFact>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-border px-3">
          <IntegrationFact label="Документация">
            <span className="flex min-w-0 flex-wrap gap-2">
              {capability.certification.docs.length > 0 ? (
                capability.certification.docs.map((doc) => (
                  <a
                    key={`${doc.label}:${doc.href}`}
                    href={doc.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {doc.label}
                  </a>
                ))
              ) : (
                <span>Документы не указаны.</span>
              )}
            </span>
          </IntegrationFact>
        </div>
        <div className="min-w-0 rounded-lg border border-border px-3">
          <IntegrationFact label="Диагностика">
            <span>
              {readinessActionLabel(hasBaseUrl, hasRequiredSecrets)}.
              {hasRunnableDiagnostics
                ? " Можно запускать безопасную диагностику из панели операций."
                : canRunDiagnostics
                  ? " Условия выполнены, но действие диагностики для этого адаптера пока не подключено."
                  : " Действие появится после адреса источника и обязательных секретов."}
            </span>
          </IntegrationFact>
        </div>
      </div>

      {capability.certification.limitations.length > 0 ? (
        <div className="min-w-0 rounded-lg border border-border px-3">
          <IntegrationFact label="Ограничения">
            <ul className="grid min-w-0 gap-1 pl-4 text-muted-foreground">
              {capability.certification.limitations.map((limitation) => (
                <li key={limitation} className="list-disc break-words">
                  {limitation}
                </li>
              ))}
            </ul>
          </IntegrationFact>
        </div>
      ) : null}

      <EvidenceDrawer title="Свидетельства">
        <CertificationEvidenceList evidence={integration.certificationEvidence} />
      </EvidenceDrawer>
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
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section
        className="grid min-w-0 content-start overflow-clip rounded-xl border border-border"
        aria-labelledby="non-otrs-summary-title"
      >
        <div className="min-w-0 border-b border-border px-5 py-4">
          <h3 id="non-otrs-summary-title" className="break-words font-medium">
            Сводка источника
          </h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            Для источников вне семейства OTRS показываем безопасную операционную сводку без технических payload.
          </p>
        </div>
        <div className="grid min-w-0 px-4 py-2">
          <IntegrationFact label="Источник">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span>{externalSourceLabel(integration.source)}</span>
              <Badge variant="outline" className="font-normal">
                {integrationStatusLabel(integration.status)}
              </Badge>
            </span>
          </IntegrationFact>
          <IntegrationFact label="Тип">{integrationTypeLabel(integration.type)}</IntegrationFact>
          <IntegrationFact label="Адрес источника" technical={Boolean(integration.baseUrl)}>
            {integration.baseUrl ?? "Адрес источника не указан"}
          </IntegrationFact>
          <IntegrationFact label="Диагностика">
            {canRunDiagnostics
              ? "Условия для диагностики выполнены; действие диагностики для этого адаптера пока не подключено."
              : "Диагностика ожидает адрес источника и обязательные секреты."}
          </IntegrationFact>
        </div>
      </section>

      <Card className="min-w-0 overflow-clip">
        <CardHeader className="min-w-0 border-b">
          <CardTitle className="break-words">Фоновые задачи</CardTitle>
          <CardDescription className="break-words">Без отображения сырых payload.</CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-2 pt-(--card-spacing)">
          {jobs.length > 0 ? (
            jobs.slice(0, 5).map((job) => {
              const status = backendJobStatusView(job.status);

              return (
                <Link
                  key={job.id}
                  href={`/admin/system/jobs/${job.id}`}
                  className="min-w-0 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-1 text-sm font-medium">
                      <span className="min-w-0 break-words">Задача</span>
                      <span
                        className="min-w-0 [overflow-wrap:anywhere]"
                        data-technical="true"
                      >
                        {job.id.slice(0, 8)}
                      </span>
                    </span>
                    <StatusBadge compact label="Статус" value={status.label} tone={statusViewTone(status.tone)} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      попытка {job.attempts}/{job.maxAttempts}
                    </span>
                  </div>
                </Link>
              );
            })
          ) : (
            <EmptyState
              size="inline"
              title="Задач пока нет"
              description="Фоновые задачи импорта появятся здесь после первого запуска."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function IntegrationDetailsPage({ params, searchParams }: IntegrationDetailsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка: Источник" />}>
      <IntegrationDetailsPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function IntegrationDetailsPageContent({ params, searchParams }: IntegrationDetailsPageProps) {
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
  const credentialSummaries = summarizeIntegrationSecretSlots(integration.credentials);

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={integration.displayName}
      description={`${externalSourceLabel(integration.source)} · ${integrationTypeLabel(integration.type)} · ${integrationStatusLabel(integration.status)} · последний запуск ${formatDate(latestRun?.startedAt)}`}
    >
      <AdminFrame>
      <AdminSectionTabs
        ariaLabel="Разделы источника"
        items={integrationDetailsSections.map((section) => ({
          href: integrationDetailsSectionHref(section.value),
          label: section.label,
          active: activeSection === section.value
        }))}
        actions={
          <>
            {integration.type !== "otrs_family" ? (
              /* У OTRS своя форма подключения ниже на странице (корректный
                 TLS-merge) — generic-диалог для него не показываем.
                 Явно задаём text-foreground: AdminDialog рендерит Button
                 default (text-primary-foreground), иначе подпись «Изменить»
                 становится белой на белом. */
              <AdminDialog
                triggerLabel="Изменить"
                triggerClassName={cn(
                  "inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground"
                )}
                title={`Источник: ${integration.displayName}`}
                description="Обновите название, адрес и лимиты импорта. Секрет меняется только при вводе нового значения."
              >
                <IntegrationSettingsForm
                  integration={{
                    source: integration.source,
                    displayName: integration.displayName,
                    type: integration.type,
                    baseUrl: integration.baseUrl,
                    importLimit: integration.importLimit,
                    batchSize: integration.batchSize,
                    dateRangeDays: integration.dateRangeDays,
                    configJson: integration.configJson
                  }}
                />
              </AdminDialog>
            ) : null}
            <Button render={<Link href="/admin/integrations/new" />} nativeButton={false} variant="outline">
              <Plus data-icon="inline-start" aria-hidden="true" />
              Новый источник
            </Button>
            <Button render={<Link href="/reviews" />} nativeButton={false} variant="ghost">
              <ListChecks data-icon="inline-start" aria-hidden="true" />
              Очередь проверок
            </Button>
          </>
        }
      />

      {activeSection === "summary" ? (
        <Card
          className="min-w-0 overflow-clip"
          role="region"
          aria-labelledby="integration-summary-title"
        >
          <CardHeader className="min-w-0 border-b">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Источник</p>
            <CardTitle id="integration-summary-title" className="break-words">
              Сводка источника
            </CardTitle>
            <CardDescription className="break-words">
              Статус, последний запуск и состояние импорта без раскрытия технических payload.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 items-start gap-4 pt-(--card-spacing) xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="grid min-w-0 rounded-lg border border-border px-3">
              <IntegrationFact label="Состояние">
                {integrationStatusLabel(integration.status)}
              </IntegrationFact>
              <IntegrationFact label="Последние запуски">
                Пробный запуск: {formatDate(integration.lastDryRunAt)} · импорт:{" "}
                {formatDate(integration.lastImportAt)}
              </IntegrationFact>
              {integration.lastError ? (
                <Alert variant="destructive" className="mb-3 min-w-0">
                  <AlertTitle>Последняя ошибка</AlertTitle>
                  <AlertDescription className="break-words">{integration.lastError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
            <AdapterReadinessPanel integration={integration} />
          </CardContent>
        </Card>
      ) : null}

      {activeSection === "operations" ? (
        <Card
          className="min-w-0 overflow-clip"
          role="region"
          aria-labelledby="integration-operations-title"
        >
          <CardHeader className="min-w-0 border-b">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Операции</p>
            <CardTitle id="integration-operations-title" className="break-words">
              Настройка и проверки
            </CardTitle>
            <CardDescription className="break-words">
              Диагностика, предпросмотр, импорт и история запусков.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 pt-(--card-spacing)">
            {integration.type === "otrs_family" ? (
              <OtrsDetailCockpit
                integration={integration}
                credentialSummaries={credentialSummaries}
                jobByRunId={jobByRunId}
              />
            ) : (
              <NonOtrsIntegrationSummary integration={integration} jobs={relatedJobs} />
            )}
          </CardContent>
        </Card>
      ) : null}
      </AdminFrame>
    </PageShell>
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
  const latestImportRun = integration.runs.find((run) => !run.dryRun);
  const canRunDiagnostics = Boolean(integration.baseUrl?.trim()) && credentialSummaries.some((slot) => slot.kind === "auth_password");
  const otrsOperationSteps: OperationalStep[] = [
    {
      label: "Настройка",
      state: canRunDiagnostics ? "ready" : "active",
      detail: canRunDiagnostics
        ? "Адрес источника и пароль доступа сохранены."
        : "Сохраните адрес источника и пароль доступа."
    },
    {
      label: "Диагностика",
      state: diagnosticSucceeded(integration.diagnosticRuns[0]?.status) ? "ready" : canRunDiagnostics ? "active" : "waiting",
      detail: integration.diagnosticRuns[0] ? `${integration.diagnosticRuns[0].status} · ${formatDate(integration.diagnosticRuns[0].startedAt)}` : "Еще не запускалась."
    },
    {
      label: "Preview",
      state: integrationRunOperationalStepState(latestPreviewRun?.status, canRunDiagnostics ? "active" : "waiting"),
      detail: latestPreviewRun ? `${integrationRunStatusView(latestPreviewRun.status).label} · ${latestPreviewRun.importedCount}/${latestPreviewRun.requestedLimit}` : "Проверьте тикеты без импорта."
    },
    {
      label: "Импорт",
      state: integrationRunOperationalStepState(
        latestImportRun?.status,
        integrationRunOperationalStepState(latestPreviewRun?.status, "waiting") === "ready" ? "active" : "waiting"
      ),
      detail: latestImportRun ? `${integrationRunStatusView(latestImportRun.status).label} · ${formatDate(latestImportRun.startedAt)}` : "Доступен после безопасного preview."
    }
  ];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <section
        className="min-w-0 overflow-clip rounded-lg border border-border"
        aria-label="Маршрут OTRS операций"
      >
        <div className="grid min-w-0 sm:grid-cols-2 xl:grid-cols-4" role="list">
          {otrsOperationSteps.map((step) => {
            const status = readinessStepStatusView(step.state);

            return (
              <div
                key={step.label}
                className="grid min-w-0 content-start gap-1.5 border-border p-3 not-last:border-b sm:not-last:border-b-0 sm:not-last:border-r"
                role="listitem"
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-medium">{step.label}</span>
                  <StatusBadge compact label="Состояние" value={status.label} tone={status.tone} />
                </div>
                <span className="min-w-0 break-words text-xs text-muted-foreground">{step.detail}</span>
              </div>
            );
          })}
        </div>
      </section>
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

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {canRunDiagnostics ? (
          <OtrsDiagnosticsPanel integrationId={integration.id} latestDiagnostic={toDiagnosticRun(integration.diagnosticRuns[0])} />
        ) : (
          <section
            className="grid min-w-0 content-start overflow-clip rounded-lg border border-border"
            aria-labelledby="disabled-otrs-diagnostics-title"
          >
            <div className="min-w-0 border-b border-border px-5 py-4">
              <h2 id="disabled-otrs-diagnostics-title" className="break-words text-base font-medium">
                Диагностика
              </h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                Действие запуска появится после сохранения адреса источника и пароля доступа.
              </p>
            </div>
            <div className="min-w-0 p-4">
              <Alert className="min-w-0">
                <AlertDescription className="break-words">
                  Ожидает доступы. Raw секреты не отображаются; сохраните пароль или API-секрет в настройке подключения.
                </AlertDescription>
              </Alert>
            </div>
          </section>
        )}
        <OtrsPreviewPanel integrationId={integration.id} latestPreviewRun={toPreviewRun(latestPreviewRun)} />
      </div>

      <OtrsRunHistory runs={toRunHistoryRuns(integration.runs, integration.workspaceId)} jobsByRunId={jobByRunId} />

      <Collapsible className="overflow-clip rounded-xl border">
        <CollapsibleTrigger className="w-full cursor-pointer border-b px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div>
            <h2 className="text-base font-medium">Ручная проверка payload</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Ручной путь через JSON: вставка payload TicketGet без предпросмотра коннектора. Серверное действие
              оставлено без изменений.
            </p>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent keepMounted className="grid gap-5 p-4">
          <Card size="sm" className="overflow-clip">
            <CardHeader className="border-b">
              <CardTitle>OTRS-family TicketGet payload</CardTitle>
              <CardDescription>
                Используйте только для ручной проверки JSON, когда connector-путь недоступен.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-(--card-spacing)">
              <OtrsImportTester />
            </CardContent>
          </Card>
          <Collapsible className="overflow-clip rounded-lg border">
            <CollapsibleTrigger className="w-full cursor-pointer px-4 py-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Устаревший payload службы поддержки
            </CollapsibleTrigger>
            <CollapsibleContent keepMounted className="border-t p-4">
              <NativeHelpdeskImportTester />
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
