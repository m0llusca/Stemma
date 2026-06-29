import { ArrowUpRight, DatabaseZap, PlugZap } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { IntegrationImportQueueForm } from "@/components/integrations/integration-import-queue-form";
import { IntegrationQueueRunForm } from "@/components/integrations/integration-queue-run-form";
import { CertificationEvidenceList } from "@/components/integrations/integration-ui";
import { SourceLogoMark } from "@/components/integrations/source-logo-mark";
import { PageSkeleton } from "@/components/loading-states";
import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import { OperationalPageFrame } from "@/components/operations/operational-page-frame";
import { PriorityActionPanel } from "@/components/operations/priority-action-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { StatKpi } from "@/components/ui/stat-kpi";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getIntegrationCapability, listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import { parseIntegrationSyncState } from "@/lib/integrations/sync-state";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";
import { toneForCount, type StatusTone } from "@/lib/ui/status-tone";

export const dynamic = "force-dynamic";

type AdminIntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type IntegrationSection = "sources" | "activity" | "catalog";

const integrationSections: Array<{ value: IntegrationSection; label: string }> = [
  { value: "sources", label: "Источники" },
  { value: "activity", label: "Журнал" },
  { value: "catalog", label: "Каталог" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function integrationSectionParam(value: string | string[] | undefined): IntegrationSection {
  const section = firstParam(value);

  if (section === "diagnostics" || section === "runs" || section === "jobs") {
    return "activity";
  }

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

function formatCompactDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
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

function integrationTone(status: string): StatusTone {
  if (status === "error") return "negative";
  if (status === "disabled") return "warning";
  if (status === "active" || status === "ready") return "positive";
  if (status === "queued") return "info";
  return "neutral";
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

function readinessTone(readiness: string): StatusTone {
  if (readiness === "production_slice") return "positive";
  if (readiness === "adapter_ready") return "info";
  if (readiness === "roadmap") return "warning";
  return "neutral";
}

function readinessActionTone(input: { hasBaseUrl: boolean; hasRequiredSecrets: boolean }): StatusTone {
  return input.hasBaseUrl && input.hasRequiredSecrets ? "positive" : "warning";
}

function operationalTone(tone: "ok" | "warn" | "error" | "neutral"): StatusTone {
  if (tone === "ok") return "positive";
  if (tone === "warn") return "warning";
  if (tone === "error") return "negative";
  return "neutral";
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
    activities_get: "активности",
    case_get: "кейсы",
    comments_get: "комментарии",
    conversation_import: "импорт диалогов",
    conversations_get: "диалоги",
    diagnostics: "диагностика",
    fixture_import: "тестовые данные",
    preview: "предпросмотр",
    review_export: "экспорт проверок",
    selected_import: "выборочный импорт",
    ticket_get: "получение тикета",
    ticket_search: "поиск тикетов",
    webhook_ingest: "вебхуки"
  };

  return labels[value] ?? value;
}

function certificationGateLabel(value: string) {
  const labels: Record<string, string> = {
    configuration_required: "нужна настройка",
    contract_certified: "контракт проверен",
    docs_checked: "документация проверена",
    live_certified: "живая сертификация пройдена",
    not_production_ready: "не готово",
    stub_certified: "stub проверен",
    waiting_for_access: "ожидает доступы"
  };

  return labels[value] ?? value;
}

function compactCertificationLabel(value: string) {
  const labels: Record<string, string> = {
    "Готово к живой сертификации": "Готово к проверке",
    "Живая сертификация пройдена": "Проверка пройдена",
    "Не готово к промышленной эксплуатации": "Не готово"
  };

  return labels[value] ?? value;
}

function compactReadinessActionLabel(input: { hasBaseUrl: boolean; hasRequiredSecrets: boolean }) {
  return input.hasBaseUrl && input.hasRequiredSecrets ? "Доступы есть" : "Нужны доступы";
}

function hasRequiredCredentialSlots(
  credentials: Array<{ kind: string }>,
  requiredSecrets: string[]
) {
  return requiredSecrets.every((secret) => credentials.some((credential) => credential.kind === secret));
}

function canQueueIntegrationImport(capability: ReturnType<typeof getIntegrationCapability>) {
  return capability.type !== "enterprise" && capability.setupStatus === "available";
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

function sameReadableText(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;

  return left.trim().toLocaleLowerCase("ru-RU") === right.trim().toLocaleLowerCase("ru-RU");
}

function SourceIdentity({
  source,
  name,
  href,
  meta,
  status,
  compact = false
}: {
  source: string;
  name: string;
  href?: string;
  meta?: string;
  status?: ReactNode;
  compact?: boolean;
}) {
  const visibleMeta = sameReadableText(meta, name) ? null : meta;
  const title = href ? (
    <Link href={href} className="integration-source__title hover:underline">
      {name}
    </Link>
  ) : (
    <span className="integration-source__title">{name}</span>
  );

  return (
    <span className={`integration-source ${compact ? "integration-source--compact" : ""}`}>
      <SourceLogoMark source={source} label={name} className="integration-source__mark" />
      <span className="integration-source__body">
        <span className="integration-source__title-row">
          {title}
          {status}
        </span>
        {visibleMeta ? <span className="integration-source__meta">{visibleMeta}</span> : null}
      </span>
    </span>
  );
}

export default function AdminIntegrationsPage({ searchParams }: AdminIntegrationsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка интеграций" />}>
      <AdminIntegrationsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminIntegrationsPageContent({ searchParams }: AdminIntegrationsPageProps) {
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
        },
        credentials: {
          where: {
            workspaceId: user.workspaceId
          },
          select: {
            kind: true,
            fingerprint: true,
            lastRotatedAt: true
          }
        },
        certificationEvidence: {
          where: {
            workspaceId: user.workspaceId
          },
          orderBy: {
            recordedAt: "desc"
          },
          take: 3,
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
  const integrationsById = new Map(integrations.map((integration) => [integration.id, integration]));
  const activeSources = integrations.filter((integration) => ["active", "ready", "queued"].includes(integration.status));
  const activeSourceKeys = new Set(integrations.map((integration) => integration.source));
  const roadmapCapabilities = listIntegrationCapabilities()
    .filter((capability) => !activeSourceKeys.has(capability.source))
    .slice(0, 8);
  const diagnosticRuns = integrations.flatMap((integration) =>
    integration.diagnosticRuns.map((run) => ({
      ...run,
      integrationName: integration.displayName,
      integrationId: integration.id,
      integrationSource: integration.source,
      integrationType: integration.type
    }))
  );
  const failedDiagnostics = diagnosticRuns.filter((run) => ["failed", "error"].includes(run.status)).length;
  const activeJobs = recentIntegrationJobs.filter((job) => ["QUEUED", "RUNNING"].includes(job.status)).length;
  const lastImportRun = recentRuns.find((run) => !run.dryRun);
  const configuredSources = integrations.filter((integration) => Boolean(integration.baseUrl?.trim())).length;
  const credentialedSources = integrations.filter((integration) => {
    const capability = getIntegrationCapability(integration.source, integration.type);

    return hasRequiredCredentialSlots(integration.credentials, capability.requiredSecrets);
  }).length;
  const certifiedSources = integrations.filter((integration) => {
    const capability = getIntegrationCapability(integration.source, integration.type);

    return ["live_certified", "docs_checked", "contract_certified", "stub_certified"].includes(capability.certification.summary.status);
  }).length;
  const successfulDiagnostics = diagnosticRuns.length - failedDiagnostics;
  const importRuns = recentRuns.filter((run) => !run.dryRun);
  const monitoredSources = activeSources.filter((integration) =>
    Boolean(integration.lastImportAt || integration.lastDryRunAt || integration.diagnosticRuns.length > 0 || integration.runs.length > 0)
  ).length;
  const readinessStages = [
    {
      label: "Доступы",
      value: `${configuredSources}/${integrations.length}`,
      detail:
        configuredSources === 0
          ? "Источники еще не настроены."
          : credentialedSources === configuredSources
          ? "Адреса и секреты заполнены для настроенных источников."
          : `${credentialedSources} источников с полным набором секретов.`,
      tone: configuredSources > 0 && configuredSources === credentialedSources ? "ok" : "warn"
    },
    {
      label: "Диагностика",
      value: `${successfulDiagnostics}/${diagnosticRuns.length}`,
      detail: failedDiagnostics > 0 ? `${failedDiagnostics} диагностик требуют внимания.` : "Ошибок в последнем срезе нет.",
      tone: failedDiagnostics > 0 ? "error" : diagnosticRuns.length > 0 ? "ok" : "neutral"
    },
    {
      label: "Сертификация",
      value: `${certifiedSources}/${integrations.length}`,
      detail: "Профиль коннектора и доказательства готовности.",
      tone: certifiedSources === integrations.length && integrations.length > 0 ? "ok" : "warn"
    },
    {
      label: "Импорт",
      value: lastImportRun ? String(lastImportRun.importedCount) : "Нет",
      detail: lastImportRun ? `Последний импорт · запусков: ${importRuns.length}` : "Реальный импорт еще не запускался.",
      tone: lastImportRun ? "ok" : activeSources.length > 0 ? "warn" : "neutral"
    },
    {
      label: "Мониторинг",
      value: `${monitoredSources}/${activeSources.length}`,
      detail: activeJobs > 0 ? `${activeJobs} задач в очереди или исполнении.` : "Фоновых задач сейчас нет.",
      tone: activeJobs > 0 ? "warn" : activeSources.length > 0 ? "ok" : "neutral"
    }
  ];
  const integrationSetupHint = activeSources.length > 0 ? null : getSettingCoachmark("integrations");
  const integrationAction =
    failedDiagnostics > 0
      ? {
          title: "Разобрать диагностику",
          description: "Есть источники с ошибками диагностики. Откройте журнал и восстановите доступы до следующего импорта.",
          label: "Открыть журнал",
          href: integrationSectionHref("activity"),
          tone: "negative" as const
        }
      : activeSources.length === 0
        ? {
            title: "Подключить первый источник",
            description: "Без источника обращения не попадут в очередь QA. Начните с мастера и не отмечайте live-готовность без сертификации.",
            label: "Новый источник",
            href: "/admin/integrations/new",
            tone: "warning" as const
          }
        : activeJobs > 0
          ? {
              title: "Проверить фоновые задачи",
              description: "Импорт уже в очереди или выполняется. Сначала проверьте состояние задач обработчика.",
              label: "Открыть журнал",
              href: integrationSectionHref("activity"),
              tone: "info" as const
            }
          : {
              title: "Проверить readiness evidence",
              description: "Источники настроены. Сверьте сертификацию, доступы и последний импорт перед расширением каталога.",
              label: "Открыть источники",
              href: integrationSectionHref("sources"),
              tone: "positive" as const
            };

  return (
    <PageShell
      eyebrow="Администрирование"
      title="Интеграции"
      description="Операционный обзор источников: состояние подключений, последняя диагностика, проверочные запуски, импорт и фоновые задачи."
      actions={
        <>
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
        </>
      }
    >
      <AdminFrame>
        <OperationalPageFrame
          title="Интеграции"
          signals={
        <>
      <section className="ops-metric-grid" aria-label="Состояние интеграций">
        <StatKpi label="Источники" value={integrations.length} hint={`Активные и готовые: ${activeSources.length}`} />
        <StatKpi
          label="Диагностика"
          value={diagnosticRuns.length}
          tone={failedDiagnostics > 0 ? "danger" : "neutral"}
          hint={`Требуют внимания: ${failedDiagnostics}`}
        />
        <StatKpi
          label="Задачи обработчика"
          value={activeJobs}
          tone={activeJobs > 0 ? "warning" : "neutral"}
          hint="В очереди или в работе"
        />
        <StatKpi
          label="Последний импорт"
          value={lastImportRun ? formatDate(lastImportRun.startedAt).split(",")[0] : "Нет"}
          hint={lastImportRun ? externalSourceLabel(lastImportRun.source) : "Реальные импорты еще не запускались"}
        />
      </section>
        </>
      }
      action={
        <PriorityActionPanel
          title={integrationAction.title}
          description={integrationAction.description}
          actionLabel={integrationAction.label}
          href={integrationAction.href}
          tone={integrationAction.tone}
        />
      }
      details={
        <>

      <section className="integration-readiness-pipeline panel" aria-label="Пайплайн готовности интеграций">
        <div className="integration-readiness-pipeline__lead">
          <span className="page-kicker">Готовность источников</span>
          <h2>Путь от доступа до мониторинга</h2>
          <p>Каждый этап показывает, где источник еще не готов к надежному импорту обращений.</p>
        </div>
        <div className="integration-readiness-pipeline__stages">
          {readinessStages.map((stage) => (
            <div key={stage.label} className={`integration-readiness-stage integration-readiness-stage--${stage.tone}`}>
              <span>{stage.label}</span>
              <strong>{stage.value}</strong>
              <small>{stage.detail}</small>
            </div>
          ))}
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
        {integrationSetupHint ? (
          <div className="admin-setup-inline">
            <CoachCallout
              title={integrationSetupHint.title}
              body={integrationSetupHint.body}
              href={integrationSetupHint.href}
              actionLabel={integrationSetupHint.actionLabel}
              variant="spotlight"
              placement="top"
              anchorLabel="Подсказка к источникам"
              stepIndex={1}
              dismissId="settings:integrations"
            />
          </div>
        ) : null}
        {integrations.length > 0 ? (
          <div className="ops-table-shell">
            <div className="ops-table ops-table--integrations" role="table" aria-label="Подключенные источники">
              <div className="ops-table__row ops-table__row--head" role="row">
                <span>Источник</span>
                <span>Состояние</span>
                <span>Импорт</span>
                <span>Активность</span>
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
                const hasBaseUrl = Boolean(integration.baseUrl?.trim());
                const hasRequiredSecrets = hasRequiredCredentialSlots(integration.credentials, capability.requiredSecrets);
                const canOpenDiagnostics =
                  capability.supportsDiagnostics && hasBaseUrl && hasRequiredSecrets && integration.type === "otrs_family";
                const diagnosticsReady = capability.supportsDiagnostics && hasBaseUrl && hasRequiredSecrets;
                const canQueueImport = canQueueIntegrationImport(capability);
                const latestActivityStatus = latestRunStatus ?? latestJobStatus ?? latestDiagnosticStatus;

                return (
                  <article key={integration.id} className="ops-table__row admin-tile admin-tile--table" role="row">
	                    <div className="ops-table__cell">
	                      <span className="ops-table__label">Источник</span>
	                      <SourceIdentity
	                        source={integration.source}
	                        name={integration.displayName}
	                        href={`/admin/integrations/${integration.id}`}
	                        meta={capabilityTypeLabel(integration.type)}
	                        status={
	                          <StatusBadge
	                            label="Статус"
	                            value={integrationStatusLabel(integration.status)}
	                            tone={integrationTone(integration.status)}
	                          />
	                        }
	                      />
	                    </div>
	                    <div className="ops-table__cell">
	                      <span className="ops-table__label">Состояние</span>
	                      <div className="integration-chip-list">
	                        <StatusBadge
	                          label="Готовность"
	                          value={compactCertificationLabel(capability.certification.summary.label)}
	                          tone={certificationTone(capability.certification.summary.status)}
	                        />
	                        <StatusBadge
	                          label="Live"
	                          value={compactReadinessActionLabel({ hasBaseUrl, hasRequiredSecrets })}
	                          tone={readinessActionTone({ hasBaseUrl, hasRequiredSecrets })}
	                        />
	                        <CertificationHelpTooltip label={`Что значит статус сертификации для ${integration.displayName}?`} />
	                      </div>
	                      <span className="record-meta">{capabilityReadinessLabel(capability.readiness)}</span>
                        <EvidenceDrawer title="Evidence">
                          <CertificationEvidenceList evidence={integration.certificationEvidence} />
                        </EvidenceDrawer>
	                    </div>
	                    <div className="ops-table__cell">
	                      <span className="ops-table__label">Импорт</span>
	                      <span className="integration-stat-row">
	                        <span>Лимит {integration.importLimit}</span>
	                        <span>пакет {integration.batchSize}</span>
	                      </span>
	                      <span className="record-meta tabular-nums">Импорт: {formatCompactDate(integration.lastImportAt)}</span>
	                      <span className="record-meta tabular-nums">Проверка: {formatCompactDate(integration.lastDryRunAt)}</span>
	                    </div>
	                    <div className="ops-table__cell">
	                      <span className="ops-table__label">Активность</span>
	                      <span className="integration-stat-row integration-stat-row--strong">
	                        <span>Проверено {syncState.progress.checkedCount}</span>
	                        <span>импортировано {syncState.progress.importedCount}</span>
	                      </span>
	                      <span className="record-meta">ошибок {syncState.progress.errorCount}</span>
	                      {latestActivityStatus ? (
	                        <StatusBadge
	                          label="Статус"
	                          value={latestActivityStatus.label}
	                          tone={operationalTone(latestActivityStatus.tone)}
	                        />
	                      ) : (
	                        <span className="record-meta">Запусков еще не было</span>
	                      )}
	                      {latestJob && latestJobStatus ? (
	                        <Link href={`/admin/system/jobs/${latestJob.id}`} className="quiet-link text-sm">
	                          Задача {latestJob.id.slice(0, 8)}
	                        </Link>
	                      ) : null}
	                    </div>
	                    <div className="ops-table__cell ops-table__cell--actions">
	                      <span className="ops-table__label">Действия</span>
                      <div className="integration-action-stack">
                        <Link href={`/admin/integrations/${integration.id}`} className="quiet-link text-sm">
                          Открыть панель
                        </Link>
                        {canOpenDiagnostics ? (
                          <Link href={`/admin/integrations/${integration.id}?section=operations`} className="quiet-link text-sm">
                            Диагностика
                          </Link>
	                        ) : diagnosticsReady ? (
	                          <span className="record-meta compact-text">
	                            Диагностика готова
	                          </span>
	                        ) : (
	                          <span className="record-meta compact-text">
	                            Нужны доступы
	                          </span>
	                        )}
                        {canQueueImport ? (
                          <IntegrationImportQueueForm integrationId={integration.id} />
	                        ) : (
	                          <span className="record-meta compact-text">
	                            Нужна авторизация
	                          </span>
	                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            size="inline"
            icon={<PlugZap size={20} aria-hidden="true" />}
            title="Источники пока не настроены"
            description="Подключите helpdesk или API-источник, чтобы обращения попадали в очередь проверок."
            action={
              <Link href="/admin/integrations/new" className="action-button action-button--small">
                Новый источник
              </Link>
            }
          />
        )}
        </section>
      ) : null}

      {activeSection === "activity" ? (
        <section className="ops-panel" aria-labelledby="activity-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Журнал</p>
            <h2 id="activity-title" className="ops-panel__title">Журнал интеграций</h2>
            <p className="ops-panel__subtitle">Запуски, диагностика и фоновые задачи в одном месте.</p>
          </div>
          <StatusBadge
            label="Всего"
            value={recentRuns.length + diagnosticRuns.length + recentIntegrationJobs.length}
            tone={toneForCount(recentRuns.length + diagnosticRuns.length + recentIntegrationJobs.length, {
              zero: "neutral",
              nonZero: "info"
            })}
          />
        </div>
        <div className="integration-activity-grid">
          <section className="integration-activity-panel" aria-labelledby="activity-runs-title">
            <div className="integration-activity-panel__header">
              <h3 id="activity-runs-title">Проверка и импорт</h3>
              <StatusBadge label="Всего" value={recentRuns.length} tone={toneForCount(recentRuns.length, { zero: "neutral", nonZero: "info" })} />
            </div>
            <div className="integration-activity-list">
              {recentRuns.length > 0 ? (
                recentRuns.slice(0, 5).map((run) => {
                  const runStatus = integrationRunStatusView(run.status);
                  const job = integrationJobByRunId.get(run.id);
                  const jobStatus = job ? backendJobStatusView(job.status) : null;
                  const runSourceName =
                    run.integration && run.integration.workspaceId === user.workspaceId
                      ? run.integration.displayName
                      : externalSourceLabel(run.source);

                  return (
                    <article key={run.id} className="integration-activity-row">
                      <SourceIdentity
                        source={run.source}
                        name={runSourceName}
                        href={run.integration && run.integration.workspaceId === user.workspaceId ? `/admin/integrations/${run.integration.id}` : undefined}
                        meta={run.dryRun ? "Проверка без импорта" : "Импорт"}
                        compact
                      />
                      <div className="integration-activity-row__body">
                        <div className="integration-chip-list">
                          <StatusBadge label="Запуск" value={runStatus.label} tone={operationalTone(runStatus.tone)} />
                          {job && jobStatus ? (
                            <StatusBadge label="Задача" value={jobStatus.label} tone={operationalTone(jobStatus.tone)} />
                          ) : null}
                        </div>
                        <span className="record-meta tabular-nums">
                          {formatCompactDate(run.startedAt)} · проверено {displayedCheckedCount(run)} · импортировано {run.importedCount}
                        </span>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="integration-activity-empty">Запуски появятся после проверки или импорта.</p>
              )}
            </div>
          </section>

          <section className="integration-activity-panel" aria-labelledby="activity-diagnostics-title">
            <div className="integration-activity-panel__header">
              <h3 id="activity-diagnostics-title">Диагностика</h3>
              <StatusBadge
                label="Всего"
                value={diagnosticRuns.length}
                tone={toneForCount(diagnosticRuns.length, { zero: "neutral", nonZero: "info" })}
              />
            </div>
            <div className="integration-activity-list">
              {diagnosticRuns.length > 0 ? (
                diagnosticRuns.map((run) => {
                  const status = integrationRunStatusView(run.status);

                  return (
                    <Link key={run.id} href={`/admin/integrations/${run.integrationId}`} className="integration-activity-row">
                      <SourceIdentity
                        source={run.integrationSource}
                        name={run.integrationName}
                        meta={integrationModeLabel(run.mode)}
                        compact
                      />
                      <div className="integration-activity-row__body">
                        <StatusBadge label="Статус" value={status.label} tone={operationalTone(status.tone)} />
                        <span className="record-meta compact-text tabular-nums">{formatCompactDate(run.startedAt)} · {run.redactedEndpoint ?? "адрес не сохранен"}</span>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <p className="integration-activity-empty">Диагностик пока нет.</p>
              )}
            </div>
          </section>

          <section className="integration-activity-panel" aria-labelledby="activity-jobs-title">
            <div className="integration-activity-panel__header">
              <h3 id="activity-jobs-title">Фоновые задачи</h3>
              <StatusBadge
                label="Всего"
                value={recentIntegrationJobs.length}
                tone={toneForCount(recentIntegrationJobs.length, { zero: "neutral", nonZero: "info" })}
              />
            </div>
            <div className="integration-activity-list">
              {recentIntegrationJobs.length > 0 ? (
                recentIntegrationJobs.map((job) => {
                  const status = backendJobStatusView(job.status);
                  const payload = parsePayloadJson(job.payloadJson);
                  const runId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;
                  const integrationId = typeof payload.integrationId === "string" ? payload.integrationId : null;
                  const linkedIntegration = integrationId ? integrationsById.get(integrationId) : null;
                  const source = linkedIntegration?.source ?? (typeof payload.source === "string" ? payload.source : "integration");
                  const sourceName = linkedIntegration?.displayName ?? externalSourceLabel(source);

                  return (
                    <Link key={job.id} href={`/admin/system/jobs/${job.id}`} className="integration-activity-row">
                      <SourceIdentity source={source} name={sourceName} meta={`Задача ${job.id.slice(0, 8)}`} compact />
                      <div className="integration-activity-row__body">
                        <StatusBadge label="Статус" value={status.label} tone={operationalTone(status.tone)} />
                        <span className="record-meta tabular-nums">
                          {formatCompactDate(job.runAfter)} · попытка {job.attempts}/{job.maxAttempts}
                          {runId ? ` · запуск ${runId.slice(0, 8)}` : ""}
                        </span>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <p className="integration-activity-empty">В очереди интеграций пока нет задач.</p>
              )}
            </div>
          </section>
        </div>
        </section>
      ) : null}

      {activeSection === "catalog" ? (
        <section className="ops-panel" aria-labelledby="catalog-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Каталог</p>
            <h2 id="catalog-title" className="ops-panel__title">Каталог источников</h2>
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
                  <span className="ops-table__label">Источник</span>
                  <SourceIdentity
                    source={capability.source}
                    name={capabilityName(capability.source, capability.displayName)}
                    meta={capabilityTypeLabel(capability.type)}
                    compact
                  />
                </div>
                <div className="ops-table__cell">
                  <span className="ops-table__label">Готовность</span>
                  <div className="integration-chip-list">
                    <StatusBadge
                      label="Готовность"
                      value={capability.certification.summary.label}
                      tone={certificationTone(capability.certification.summary.status)}
                    />
                    <StatusBadge
                      label="Этап"
                      value={capabilityReadinessLabel(capability.readiness)}
                      tone={readinessTone(capability.readiness)}
                    />
                  </div>
                </div>
                <span className="ops-table__cell">
                  <span className="ops-table__label">Авторизация</span>
                  <span className="record-meta compact-text">{capability.authModes.map(authModeLabel).join(", ")}</span>
                </span>
                <span className="ops-table__cell">
                  <span className="ops-table__label">Возможности</span>
                  <span className="record-meta compact-text">
                    курсор {capability.supportsCursor ? "есть" : "нет"} · диагностика {capability.supportsDiagnostics ? "есть" : "нет"} · вебхуки{" "}
                    {capability.supportsInboundWebhooks || capability.supportsOutboundWebhooks ? "есть" : "нет"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
        </section>
      ) : null}
        </>
      }
      evidence={
        <EvidenceDrawer title="Evidence readiness" defaultOpen>
          <div className="operational-evidence-grid">
            <div className="operational-evidence-item">
              <span>Источники</span>
              <strong>{activeSources.length}/{integrations.length}</strong>
              <small>Активные и готовые подключения в текущем workspace.</small>
            </div>
            <div className="operational-evidence-item">
              <span>Диагностика</span>
              <strong>{failedDiagnostics}</strong>
              <small>{failedDiagnostics > 0 ? "Есть ошибки, которые блокируют доверие к импорту." : "Ошибок диагностики в последнем срезе нет."}</small>
            </div>
            <div className="operational-evidence-item">
              <span>Обработчик</span>
              <strong>{activeJobs}</strong>
              <small>Фоновые задачи импорта в очереди или исполнении.</small>
            </div>
            <div className="operational-evidence-item">
              <span>Каталог</span>
              <strong>{roadmapCapabilities.length}</strong>
              <small>Следующие доступные connector profiles без live-оверлейминга.</small>
            </div>
          </div>
        </EvidenceDrawer>
          }
        />
      </AdminFrame>
    </PageShell>
  );
}
