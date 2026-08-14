import { Activity, ArrowUpRight, Clock3, DownloadCloud, PlugZap } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { IntegrationImportQueueForm } from "@/components/integrations/integration-import-queue-form";
import { IntegrationQueueRunForm } from "@/components/integrations/integration-queue-run-form";
import { IntegrationSettingsForm } from "@/components/integrations/integration-settings-form";
import { SourceLogoMark } from "@/components/integrations/source-logo-mark";
import { PageSkeleton } from "@/components/loading-states";
import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import { OperationalPageFrame } from "@/components/operations/operational-page-frame";
import { PriorityActionPanel } from "@/components/operations/priority-action-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { PageShell } from "@/components/ui/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AdminSectionTabs } from "@/components/admin/admin-section-tabs";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getIntegrationCapability, listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import { parseIntegrationSyncState } from "@/lib/integrations/sync-state";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";
import { russianPlural } from "@/lib/reports/report-format";
import { statusSurfaceClass, toneForCount, type StatusTone } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

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

const badgeToneClass: Record<StatusTone, string> = {
  positive: cn("border-transparent", statusSurfaceClass("positive")),
  warning: cn("border-transparent", statusSurfaceClass("warning")),
  negative: "border-transparent bg-destructive/15 text-destructive",
  info: "border-transparent bg-primary/15 text-primary",
  neutral: ""
};

function ToneBadge({
  children,
  tone,
  title,
  className
}: {
  children: ReactNode;
  tone: StatusTone;
  title?: string;
  className?: string;
}) {
  return (
    <Badge
      variant={tone === "neutral" ? "secondary" : "outline"}
      title={title}
      className={cn("font-normal", badgeToneClass[tone], className)}
    >
      {children}
    </Badge>
  );
}

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

function formatCompactDateOrDash(value: Date | null | undefined) {
  return value ? formatCompactDate(value) : "—";
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
    enterprise: "Корпоративная система",
    data_source: "Хранилище данных"
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
    <Link href={href} className="font-semibold text-foreground hover:underline">
      {name}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{name}</span>
  );

  return (
    <span className={cn("grid min-w-0 items-center gap-2.5", compact ? "grid-cols-[30px_minmax(0,1fr)] gap-2" : "grid-cols-[36px_minmax(0,1fr)]")}>
      <SourceLogoMark
        source={source}
        label={name}
        className={cn(compact ? "size-[30px] [&_svg]:size-4 [&_img]:size-[19px]" : "size-9 [&_svg]:size-[18px] [&_img]:size-[22px]")}
      />
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={cn(compact ? "text-[13px]" : "text-sm")}>{title}</span>
          {status}
        </span>
        {visibleMeta ? <span className="text-xs text-muted-foreground">{visibleMeta}</span> : null}
      </span>
    </span>
  );
}

function readinessStageToneClass(tone: string) {
  if (tone === "ok") return cn("border-success/25", statusSurfaceClass("positive"));
  if (tone === "warn") return cn("border-warning/25", statusSurfaceClass("warning"));
  if (tone === "error") return "border-destructive/25 bg-destructive/5";
  return "border-border bg-muted/30";
}

export default function AdminIntegrationsPage({ searchParams }: AdminIntegrationsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/integrations")} />}>
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
            : `${russianPlural(credentialedSources, ["источник", "источника", "источников"])} с полным набором секретов.`,
      tone: configuredSources > 0 && configuredSources === credentialedSources ? "ok" : "warn"
    },
    {
      label: "Диагностика",
      value: `${successfulDiagnostics}/${diagnosticRuns.length}`,
      detail:
        failedDiagnostics > 0
          ? `${russianPlural(failedDiagnostics, ["диагностика требует", "диагностики требуют", "диагностик требуют"])} внимания.`
          : "Ошибок в последнем срезе нет.",
      tone: failedDiagnostics > 0 ? "error" : diagnosticRuns.length > 0 ? "ok" : "neutral"
    },
    {
      label: "Сертификация",
      value: `${certifiedSources}/${integrations.length}`,
      detail: "Профиль коннектора и свидетельства готовности.",
      tone: certifiedSources === integrations.length && integrations.length > 0 ? "ok" : "warn"
    },
    {
      label: "Импорт",
      value: lastImportRun ? String(lastImportRun.importedCount) : "Нет",
      detail: lastImportRun ? `Последний импорт · ${russianPlural(importRuns.length, ["запуск", "запуска", "запусков"])}` : "Реальный импорт еще не запускался.",
      tone: lastImportRun ? "ok" : activeSources.length > 0 ? "warn" : "neutral"
    },
    {
      label: "Мониторинг",
      value: `${monitoredSources}/${activeSources.length}`,
      detail: activeJobs > 0 ? `${russianPlural(activeJobs, ["задача", "задачи", "задач"])} в очереди или исполнении.` : "Фоновых задач сейчас нет.",
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
            description: "Без источника обращения не попадут в очередь QA. Начните с мастера и не отмечайте готовность к боевому режиму без сертификации.",
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
              title: "Проверить свидетельства готовности",
              description: "Источники настроены. Сверьте сертификацию, доступы и последний импорт перед расширением каталога.",
              label: "Открыть источники",
              href: integrationSectionHref("sources"),
              tone: "positive" as const
            };

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/integrations"]}
      description="Операционный обзор источников: состояние подключений, последняя диагностика, проверочные запуски, импорт и фоновые задачи."
    >
      <AdminFrame>
        <OperationalPageFrame
          title="Интеграции"
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
              <Card aria-labelledby="readiness-pipeline-title">
                <CardHeader className="gap-1.5">
                  <CardDescription>Готовность источников</CardDescription>
                  <CardTitle id="readiness-pipeline-title">Путь от доступа до мониторинга</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Каждый этап показывает, где источник еще не готов к надежному импорту обращений.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {readinessStages.map((stage) => (
                      <div
                        key={stage.label}
                        className={cn(
                          "grid min-w-0 gap-1 rounded-lg border p-3",
                          readinessStageToneClass(stage.tone)
                        )}
                      >
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {stage.label}
                        </span>
                        <strong className="text-lg font-semibold tabular-nums text-foreground">{stage.value}</strong>
                        <small className="text-xs leading-4 text-muted-foreground">{stage.detail}</small>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <AdminSectionTabs
                ariaLabel="Разделы интеграций"
                items={integrationSections.map((section) => ({
                  href: integrationSectionHref(section.value),
                  label: section.label,
                  active: activeSection === section.value
                }))}
                actions={
                  <>
                    <Button render={<Link href="/admin/integrations/new" />} nativeButton={false}>
                      <PlugZap data-icon="inline-start" aria-hidden="true" />
                      Новый источник
                    </Button>
                    <IntegrationQueueRunForm />
                    <Button render={<Link href="/admin/tokens" />} nativeButton={false} variant="outline">
                      API-доступ
                    </Button>
                    <Button render={<Link href="/reviews" />} nativeButton={false} variant="ghost">
                      Очередь проверок
                    </Button>
                  </>
                }
              />

              {activeSection === "sources" ? (
                <Card aria-labelledby="sources-title">
                  <CardHeader className="gap-1.5">
                    <CardDescription>Источники</CardDescription>
                    <div className="flex min-w-0 items-center gap-2">
                      <CardTitle id="sources-title">Подключенные источники</CardTitle>
                      <CertificationHelpTooltip />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Состояние подключений, сертификация, доступы и последний импорт по каждому источнику.
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {integrationSetupHint ? (
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
                    ) : null}
                    {integrations.length > 0 ? (
                      <Table className="min-w-[960px]">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="min-w-[230px]">Источник</TableHead>
                            <TableHead className="min-w-[160px]">Состояние</TableHead>
                            <TableHead className="min-w-[150px]">Импорт</TableHead>
                            <TableHead className="min-w-[200px]">Активность</TableHead>
                            <TableHead className="w-[132px] text-right">Действия</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {integrations.map((integration) => {
                            const latestRun = integration.runs[0];
                            const latestRunStatus = latestRun ? integrationRunStatusView(latestRun.status) : null;
                            const latestJob = integrationJobByIntegrationId.get(integration.id);
                            const latestJobStatus = latestJob ? backendJobStatusView(latestJob.status) : null;
                            const latestDiagnostic = integration.diagnosticRuns[0];
                            const latestDiagnosticStatus = latestDiagnostic
                              ? integrationRunStatusView(latestDiagnostic.status)
                              : null;
                            const capability = getIntegrationCapability(integration.source, integration.type);
                            const syncState = parseIntegrationSyncState(integration.syncStateJson);
                            const hasBaseUrl = Boolean(integration.baseUrl?.trim());
                            const hasRequiredSecrets = hasRequiredCredentialSlots(
                              integration.credentials,
                              capability.requiredSecrets
                            );
                            const canQueueImport = canQueueIntegrationImport(capability);
                            const latestActivityStatus = latestRunStatus ?? latestJobStatus ?? latestDiagnosticStatus;

                            return (
                              <TableRow key={integration.id} className="align-top">
                                <TableCell className="whitespace-normal">
                                  <SourceIdentity
                                    source={integration.source}
                                    name={integration.displayName}
                                    href={`/admin/integrations/${integration.id}`}
                                    meta={capabilityTypeLabel(integration.type)}
                                    status={
                                      <ToneBadge
                                        tone={integrationTone(integration.status)}
                                        title={`Статус: ${integrationStatusLabel(integration.status)}`}
                                      >
                                        {integrationStatusLabel(integration.status)}
                                      </ToneBadge>
                                    }
                                  />
                                </TableCell>
                                <TableCell className="whitespace-normal">
                                  <div className="grid gap-1.5">
                                    <ToneBadge
                                      tone={certificationTone(capability.certification.summary.status)}
                                      className="justify-self-start"
                                    >
                                      {compactCertificationLabel(capability.certification.summary.label)}
                                    </ToneBadge>
                                    <span className="text-xs text-muted-foreground">
                                      {compactReadinessActionLabel({ hasBaseUrl, hasRequiredSecrets })} ·{" "}
                                      {capabilityReadinessLabel(capability.readiness)}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="whitespace-normal">
                                  <div className="grid gap-1 text-xs tabular-nums text-muted-foreground">
                                    <span>Импорт: {formatCompactDateOrDash(integration.lastImportAt)}</span>
                                    <span>Проверка: {formatCompactDateOrDash(integration.lastDryRunAt)}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="whitespace-normal">
                                  <div className="grid gap-1.5">
                                    {latestActivityStatus ? (
                                      <ToneBadge
                                        tone={operationalTone(latestActivityStatus.tone)}
                                        className="justify-self-start"
                                      >
                                        {latestActivityStatus.label}
                                      </ToneBadge>
                                    ) : (
                                      <span className="inline-flex min-h-5 items-center text-xs text-muted-foreground">
                                        Запусков не было
                                      </span>
                                    )}
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                      {syncState.progress.checkedCount} проверено · {syncState.progress.importedCount}{" "}
                                      импортировано ·{" "}
                                      <span
                                        className={
                                          syncState.progress.errorCount > 0
                                            ? "font-semibold text-destructive"
                                            : undefined
                                        }
                                      >
                                        {syncState.progress.errorCount} ошибок
                                      </span>
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="whitespace-normal text-right">
                                  <div className="grid justify-items-end gap-1.5">
                                    <Button
                                      render={<Link href={`/admin/integrations/${integration.id}`} />}
                                      nativeButton={false}
                                      size="sm"
                                      variant="outline"
                                    >
                                      Открыть
                                    </Button>
                                    {integration.type === "otrs_family" ? (
                                      /* Generic-сохранение пересобирает configJson без TLS-блока
                                         (caBundle) — OTRS редактируется только на деталке, где
                                         специализированная форма делает корректный merge. */
                                      <Button
                                        render={<Link href={`/admin/integrations/${integration.id}`} />}
                                        nativeButton={false}
                                        size="xs"
                                        variant="link"
                                        className="h-auto px-0"
                                      >
                                        Изменить
                                      </Button>
                                    ) : (
                                      <AdminDialog
                                        triggerLabel="Изменить"
                                        triggerClassName="inline-flex h-auto items-center border-transparent bg-transparent px-0 text-xs font-medium text-primary underline-offset-4 shadow-none hover:bg-transparent hover:text-primary hover:underline"
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
                                    )}
                                    {canQueueImport ? (
                                      <IntegrationImportQueueForm integrationId={integration.id} label="Импорт" />
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <EmptyState
                        size="inline"
                        icon={<PlugZap size={20} aria-hidden="true" />}
                        title="Источники пока не настроены"
                        description="Подключите helpdesk или API-источник, чтобы обращения попадали в очередь проверок."
                        action={
                          <Button render={<Link href="/admin/integrations/new" />} nativeButton={false} size="sm">
                            Новый источник
                          </Button>
                        }
                      />
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {activeSection === "activity" ? (
                <Card aria-labelledby="activity-title">
                  <CardHeader className="gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="grid gap-1.5">
                      <CardDescription>Журнал</CardDescription>
                      <CardTitle id="activity-title">Журнал интеграций</CardTitle>
                      <p className="text-sm text-muted-foreground">Запуски, диагностика и фоновые задачи в одном месте.</p>
                    </div>
                    <ToneBadge
                      tone={toneForCount(recentRuns.length + diagnosticRuns.length + recentIntegrationJobs.length, {
                        zero: "neutral",
                        nonZero: "info"
                      })}
                      title="Всего"
                    >
                      Всего {recentRuns.length + diagnosticRuns.length + recentIntegrationJobs.length}
                    </ToneBadge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 xl:grid-cols-3">
                      <Card size="sm" className="min-w-0" aria-labelledby="activity-runs-title">
                        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                          <CardTitle id="activity-runs-title" className="text-sm">
                            Проверка и импорт
                          </CardTitle>
                          <ToneBadge
                            tone={toneForCount(recentRuns.length, { zero: "neutral", nonZero: "info" })}
                            title="Всего"
                          >
                            {recentRuns.length}
                          </ToneBadge>
                        </CardHeader>
                        <CardContent className="grid gap-2">
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
                                <article
                                  key={run.id}
                                  className="grid min-w-0 gap-2 rounded-lg border border-border p-3"
                                >
                                  <SourceIdentity
                                    source={run.source}
                                    name={runSourceName}
                                    href={
                                      run.integration && run.integration.workspaceId === user.workspaceId
                                        ? `/admin/integrations/${run.integration.id}`
                                        : undefined
                                    }
                                    meta={run.dryRun ? "Проверка без импорта" : "Импорт"}
                                    compact
                                  />
                                  <div className="grid gap-1.5">
                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                      <ToneBadge
                                        tone={operationalTone(runStatus.tone)}
                                        title={`Запуск: ${runStatus.label}`}
                                      >
                                        {runStatus.label}
                                      </ToneBadge>
                                      {job && jobStatus ? (
                                        <ToneBadge
                                          tone={operationalTone(jobStatus.tone)}
                                          title={`Задача: ${jobStatus.label}`}
                                        >
                                          {jobStatus.label}
                                        </ToneBadge>
                                      ) : null}
                                    </div>
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                      {formatCompactDate(run.startedAt)} · проверено {displayedCheckedCount(run)} ·
                                      импортировано {run.importedCount}
                                    </span>
                                  </div>
                                </article>
                              );
                            })
                          ) : (
                            <EmptyState
                              size="inline"
                              icon={<DownloadCloud size={20} aria-hidden="true" />}
                              title="Импортов ещё не было"
                              description="Запуски появятся после первой проверки или импорта источника."
                            />
                          )}
                        </CardContent>
                      </Card>

                      <Card size="sm" className="min-w-0" aria-labelledby="activity-diagnostics-title">
                        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                          <CardTitle id="activity-diagnostics-title" className="text-sm">
                            Диагностика
                          </CardTitle>
                          <ToneBadge
                            tone={toneForCount(diagnosticRuns.length, { zero: "neutral", nonZero: "info" })}
                            title="Всего"
                          >
                            {diagnosticRuns.length}
                          </ToneBadge>
                        </CardHeader>
                        <CardContent className="grid gap-2">
                          {diagnosticRuns.length > 0 ? (
                            diagnosticRuns.map((run) => {
                              const status = integrationRunStatusView(run.status);

                              return (
                                <Link
                                  key={run.id}
                                  href={`/admin/integrations/${run.integrationId}`}
                                  className="grid min-w-0 gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                                >
                                  <SourceIdentity
                                    source={run.integrationSource}
                                    name={run.integrationName}
                                    meta={integrationModeLabel(run.mode)}
                                    compact
                                  />
                                  <div className="grid gap-1.5">
                                    <ToneBadge
                                      tone={operationalTone(status.tone)}
                                      title={`Статус: ${status.label}`}
                                      className="justify-self-start"
                                    >
                                      {status.label}
                                    </ToneBadge>
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                      {formatCompactDate(run.startedAt)} · {run.redactedEndpoint ?? "адрес не сохранен"}
                                    </span>
                                  </div>
                                </Link>
                              );
                            })
                          ) : (
                            <EmptyState
                              size="inline"
                              icon={<Activity size={20} aria-hidden="true" />}
                              title="Диагностика не запускалась"
                              description="Результаты появятся после первой проверки доступов на странице источника."
                            />
                          )}
                        </CardContent>
                      </Card>

                      <Card size="sm" className="min-w-0" aria-labelledby="activity-jobs-title">
                        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                          <CardTitle id="activity-jobs-title" className="text-sm">
                            Фоновые задачи
                          </CardTitle>
                          <ToneBadge
                            tone={toneForCount(recentIntegrationJobs.length, { zero: "neutral", nonZero: "info" })}
                            title="Всего"
                          >
                            {recentIntegrationJobs.length}
                          </ToneBadge>
                        </CardHeader>
                        <CardContent className="grid gap-2">
                          {recentIntegrationJobs.length > 0 ? (
                            recentIntegrationJobs.map((job) => {
                              const status = backendJobStatusView(job.status);
                              const payload = parsePayloadJson(job.payloadJson);
                              const runId = typeof payload.integrationRunId === "string" ? payload.integrationRunId : null;
                              const integrationId =
                                typeof payload.integrationId === "string" ? payload.integrationId : null;
                              const linkedIntegration = integrationId ? integrationsById.get(integrationId) : null;
                              const source =
                                linkedIntegration?.source ??
                                (typeof payload.source === "string" ? payload.source : "integration");
                              const sourceName = linkedIntegration?.displayName ?? externalSourceLabel(source);

                              return (
                                <Link
                                  key={job.id}
                                  href={`/admin/system/jobs/${job.id}`}
                                  className="grid min-w-0 gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                                >
                                  <SourceIdentity
                                    source={source}
                                    name={sourceName}
                                    meta={`Задача ${job.id.slice(0, 8)}`}
                                    compact
                                  />
                                  <div className="grid gap-1.5">
                                    <ToneBadge
                                      tone={operationalTone(status.tone)}
                                      title={`Статус: ${status.label}`}
                                      className="justify-self-start"
                                    >
                                      {status.label}
                                    </ToneBadge>
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                      {formatCompactDate(job.runAfter)} · попытка {job.attempts}/{job.maxAttempts}
                                      {runId ? ` · запуск ${runId.slice(0, 8)}` : ""}
                                    </span>
                                  </div>
                                </Link>
                              );
                            })
                          ) : (
                            <EmptyState
                              size="inline"
                              icon={<Clock3 size={20} aria-hidden="true" />}
                              title="Фоновых задач нет"
                              description="Задачи появятся после постановки импорта в очередь обработчика."
                            />
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {activeSection === "catalog" ? (
                <Card aria-labelledby="catalog-title">
                  <CardHeader className="gap-1.5">
                    <CardDescription>Каталог</CardDescription>
                    <CardTitle id="catalog-title">Каталог источников</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Реестр возможностей для следующих коннекторов и моста событий.
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Button render={<Link href="/admin/integrations/new" />} nativeButton={false} size="sm">
                        Открыть мастер
                        <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Источник</TableHead>
                          <TableHead>Готовность</TableHead>
                          <TableHead>Авторизация</TableHead>
                          <TableHead>Возможности</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roadmapCapabilities.map((capability) => (
                          <TableRow key={capability.source} className="align-top">
                            <TableCell className="whitespace-normal">
                              <SourceIdentity
                                source={capability.source}
                                name={capabilityName(capability.source, capability.displayName)}
                                meta={capabilityTypeLabel(capability.type)}
                                compact
                              />
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <ToneBadge
                                  tone={certificationTone(capability.certification.summary.status)}
                                  title={`Готовность: ${capability.certification.summary.label}`}
                                >
                                  {capability.certification.summary.label}
                                </ToneBadge>
                                <ToneBadge
                                  tone={readinessTone(capability.readiness)}
                                  title={`Этап: ${capabilityReadinessLabel(capability.readiness)}`}
                                >
                                  {capabilityReadinessLabel(capability.readiness)}
                                </ToneBadge>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-normal text-xs text-muted-foreground">
                              {capability.authModes.map(authModeLabel).join(", ")}
                            </TableCell>
                            <TableCell className="whitespace-normal text-xs text-muted-foreground">
                              курсор {capability.supportsCursor ? "есть" : "нет"} · диагностика{" "}
                              {capability.supportsDiagnostics ? "есть" : "нет"} · вебхуки{" "}
                              {capability.supportsInboundWebhooks || capability.supportsOutboundWebhooks
                                ? "есть"
                                : "нет"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : null}
            </>
          }
          evidence={
            <EvidenceDrawer title="Свидетельства готовности">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1 rounded-lg border border-border p-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Источники</span>
                  <strong className="text-lg tabular-nums">
                    {activeSources.length}/{integrations.length}
                  </strong>
                  <small className="text-xs text-muted-foreground">
                    Активные и готовые подключения в текущем workspace.
                  </small>
                </div>
                <div className="grid gap-1 rounded-lg border border-border p-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Диагностика</span>
                  <strong className="text-lg tabular-nums">{failedDiagnostics}</strong>
                  <small className="text-xs text-muted-foreground">
                    {failedDiagnostics > 0
                      ? "Есть ошибки, которые блокируют доверие к импорту."
                      : "Ошибок диагностики в последнем срезе нет."}
                  </small>
                </div>
                <div className="grid gap-1 rounded-lg border border-border p-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Обработчик</span>
                  <strong className="text-lg tabular-nums">{activeJobs}</strong>
                  <small className="text-xs text-muted-foreground">
                    Фоновые задачи импорта в очереди или исполнении.
                  </small>
                </div>
                <div className="grid gap-1 rounded-lg border border-border p-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Каталог</span>
                  <strong className="text-lg tabular-nums">{roadmapCapabilities.length}</strong>
                  <small className="text-xs text-muted-foreground">
                    Следующие доступные профили коннекторов без преждевременной отметки боевой готовности.
                  </small>
                </div>
              </div>
            </EvidenceDrawer>
          }
        />
      </AdminFrame>
    </PageShell>
  );
}
