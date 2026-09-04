import type { IdentityProviderType } from "@prisma/client";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock3,
  Database,
  ListChecks,
  Play,
  Plug,
  RotateCcw,
  ServerCog,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { StatStrip, type StatStripItem, type StatStripTone } from "@/components/ui/stat-strip";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { TriageStrip } from "@/components/ui/triage-strip";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AdminSectionTabs } from "@/components/admin/admin-section-tabs";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { getPhaseDReadinessReport, type PhaseDReadinessItem } from "@/lib/certification/readiness-report";
import { certificationDisplayTone } from "@/lib/certification/status";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";
import { backendJobStatusView, backendJobTypeLabel, integrationRunStatusView, queueNameLabel } from "@/lib/operational-status";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";
import { queueDirectorySync } from "@/lib/system-enqueue-actions";
import { queueRetentionCleanup, runQueuedBackendJobs } from "@/lib/system-actions";
import type { StatusTone } from "@/lib/ui/status-tone";

export const dynamic = "force-dynamic";

type AdminSystemPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SystemSection = "jobs" | "runtime" | "readiness" | "sso" | "integrations" | "maintenance";

type SystemNextAction = {
  section: SystemSection;
  label: string;
  title: string;
  detail: string;
};

const systemSections: Array<{ value: SystemSection; label: string }> = [
  { value: "jobs", label: "Задачи" },
  { value: "runtime", label: "Окружение" },
  { value: "readiness", label: "Готовность" },
  { value: "sso", label: "SSO и каталог" },
  { value: "integrations", label: "Интеграции" },
  { value: "maintenance", label: "Обслуживание" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function systemSectionParam(value: string | string[] | undefined): SystemSection {
  const section = firstParam(value);

  return systemSections.some((item) => item.value === section) ? (section as SystemSection) : "jobs";
}

function systemSectionHref(section: SystemSection) {
  return `/admin/system?section=${section}`;
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function runtimeTone(status: string): StatusTone {
  if (status === "ok") return "positive";
  if (status === "warn") return "warning";
  if (status === "error") return "negative";
  return "neutral";
}

function providerTone(status: string): StatusTone {
  if (status === "active") return "positive";
  if (status === "draft") return "info";
  if (status === "disabled") return "warning";
  return "neutral";
}

function integrationTone(status: string): StatusTone {
  if (status === "error") return "negative";
  if (status === "disabled") return "warning";
  if (status === "active" || status === "ready") return "positive";
  if (status === "queued") return "info";
  return "neutral";
}

function operationalTone(tone: "ok" | "warn" | "error" | "neutral"): StatusTone {
  if (tone === "ok") return "positive";
  if (tone === "warn") return "warning";
  if (tone === "error") return "negative";
  return "neutral";
}

/** StatusTone → тон StatusBadge / StatStrip. */
function badgeTone(tone: StatusTone): StatusBadgeTone {
  if (tone === "positive") return "success";
  if (tone === "warning") return "warning";
  if (tone === "negative") return "danger";
  if (tone === "info") return "info";
  return "neutral";
}

function stripTone(tone: StatusTone): StatStripTone {
  if (tone === "positive") return "success";
  if (tone === "warning") return "warning";
  if (tone === "negative") return "danger";
  if (tone === "info") return "info";
  return "neutral";
}

function certificationTone(status: string): StatusTone {
  return certificationDisplayTone(status);
}

function runtimeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ok: "Готово",
    warn: "Требует внимания",
    error: "Ошибка"
  };

  return labels[status] ?? status;
}

function runtimeStatusShortLabel(status: string) {
  const labels: Record<string, string> = {
    ok: "Готово",
    warn: "Внимание",
    error: "Ошибка"
  };

  return labels[status] ?? status;
}

function providerStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Активен",
    draft: "Черновик",
    disabled: "Отключен"
  };

  return labels[status] ?? status;
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

function environmentLabel(environment: string) {
  const labels: Record<string, string> = {
    development: "Разработка",
    production: "Продакшен",
    test: "Тест"
  };

  return labels[environment] ?? environment;
}

function evidenceResultLabel(result: string) {
  const labels: Record<string, string> = {
    passed: "Пройдено",
    failed: "Ошибка",
    blocked: "Заблокировано",
    skipped: "Пропущено"
  };

  return labels[result] ?? result;
}

function evidenceDiagnosticsText(value: Record<string, unknown>) {
  const text = JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

/** Компактный ряд готовности: подпись и свидетельства слева, статус-чип справа. */
function renderReadinessItem(item: PhaseDReadinessItem) {
  return (
    <div
      key={item.key}
      className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{item.displayName}</span>
        <p className="text-xs text-muted-foreground">
          {item.targetType === "identity_provider" ? "Провайдер удостоверений" : "Интеграция"} · {item.source}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{item.liveSmokeCommand}</p>
        {item.latestEvidence ? (
          <>
            <p className="text-xs text-muted-foreground">
              Свидетельство {item.latestEvidence.runId} · {evidenceResultLabel(item.latestEvidence.result)} ·{" "}
              {new Date(item.latestEvidence.recordedAt).toLocaleString("ru-RU")}
            </p>
            <p className="text-xs text-muted-foreground">
              Инициатор: {item.latestEvidence.actor ?? "Автоматика"} · Флаг окружения: {item.latestEvidence.envGate}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Диагностика: {evidenceDiagnosticsText(item.latestEvidence.redactedDiagnostics)}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Свидетельство защищенного проверочного прогона еще не записано.</p>
        )}
        <p className="text-xs text-muted-foreground">
          {item.blockers.length > 0 ? item.blockers.slice(0, 3).join(" · ") : "Блокеров нет."}
        </p>
      </div>
      <StatusBadge tone={badgeTone(certificationTone(item.status))} size="sm">
        {item.label}
      </StatusBadge>
    </div>
  );
}

export default function AdminSystemPage({ searchParams }: AdminSystemPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/system")} />}>
      <AdminSystemPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminSystemPageContent({ searchParams }: AdminSystemPageProps) {
  const params = await searchParams;
  const activeSection = systemSectionParam(params.section);
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
    apiTokens,
    phaseDReport
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
    }),
    getPhaseDReadinessReport(user.workspaceId)
  ]);
  const runtime = getRuntimeConfigDiagnostics();
  const providerWarnings = providers.filter((provider) => provider.status !== "active" && provider.type !== "DEMO").length;
  const integrationErrors = integrations.filter((integration) => integration.lastError || integration.status === "error").length;
  const apiTokenErrors = apiTokens.filter(
    (token) => token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)
  ).length;
  const runtimeIssues = runtime.checks.filter((check) => check.status !== "ok").length;
  const runtimeHealthyChecks = runtime.checks.length - runtimeIssues;
  const readinessBlockers = phaseDReport.summary.failedOrLimited + phaseDReport.summary.waitingForAccess;
  const maintenanceBacklog = expiredActiveSessions + expiredIdempotencyKeys + staleRateLimits;
  const integrationRiskCount = integrationErrors + apiTokenErrors;
  const runtimeCritical = runtime.status === "error";
  const highSeverityIssues = (runtimeCritical ? 1 : 0) + failedJobs + integrationRiskCount;
  const warningSignals =
    (runtime.status === "warn" ? Math.max(runtimeIssues, 1) : 0) +
    queuedJobs +
    runningJobs +
    providerWarnings +
    readinessBlockers +
    maintenanceBacklog;
  const overallTone: StatusTone = highSeverityIssues > 0 ? "negative" : warningSignals > 0 ? "warning" : "positive";
  const overallLabel =
    overallTone === "negative" ? "Требует вмешательства" : overallTone === "warning" ? "Есть операционный риск" : "Система стабильна";
  const overallSummary =
    overallTone === "negative"
      ? `${highSeverityIssues} критичных сигналов: проверьте задачи, интеграции или окружение.`
      : overallTone === "warning"
        ? `${warningSignals} сигналов требуют плановой проверки, критичных ошибок нет.`
        : "Критичных сигналов нет, ключевые подсистемы готовы к работе.";
  const nextAction: SystemNextAction = runtimeCritical
    ? {
        section: "runtime",
        label: "Проверить окружение",
        title: "Восстановить конфигурацию",
        detail: `${runtimeIssues} проверок окружения не в норме. Начните с переменных окружения и фонового обработчика.`
      }
    : failedJobs > 0
      ? {
          section: "jobs",
          label: "Разобрать задачи",
          title: "Снять ошибки очереди",
          detail: `${failedJobs} задач завершились ошибкой. Откройте детали и повторите запуск после исправления причины.`
        }
      : integrationRiskCount > 0
        ? {
            section: "integrations",
            label: "Открыть интеграции",
            title: "Вернуть импорт в зеленую зону",
            detail: `${integrationRiskCount} сигналов по источникам или API-ключам влияют на загрузку данных.`
          }
        : providerWarnings > 0
          ? {
              section: "sso",
              label: "Проверить SSO",
              title: "Закрыть риски доступа",
              detail: `${providerWarnings} провайдеров каталога не активны. Проверьте синхронизацию и маппинги групп.`
            }
          : readinessBlockers > 0
            ? {
                section: "readiness",
                label: "Открыть готовность",
                title: "Завершить сертификацию для боевого режима",
                detail: `${readinessBlockers} объектов ждут доступы, свидетельства готовности или настройку перед сертификацией для боевого режима.`
              }
            : maintenanceBacklog > 0
              ? {
                  section: "maintenance",
                  label: "Открыть обслуживание",
                  title: "Очистить технический хвост",
                  detail: `${maintenanceBacklog} технических записей готовы к регулярной очистке.`
                }
              : queuedJobs > 0
                ? {
                    section: "jobs",
                    label: "Запустить очередь",
                    title: "Очередь готова к обработке",
                    detail: `${queuedJobs} задач ждут фоновый обработчик. Запустите обработку, если сейчас нет окна обслуживания.`
                  }
                : {
                    section: "jobs",
                    label: "Посмотреть задачи",
                    title: "Критичных блокеров нет",
                    detail: "Остается регулярный мониторинг очереди и новых запусков интеграций."
                  };

  const systemHealthItems: StatStripItem[] = [
    {
      label: "Общее состояние",
      value: overallLabel,
      hint: overallSummary,
      tone: stripTone(overallTone)
    },
    {
      label: "Окружение",
      value: runtimeStatusShortLabel(runtime.status),
      hint: `${runtimeHealthyChecks}/${runtime.checks.length} проверок · ${environmentLabel(runtime.environment)}`,
      tone: stripTone(runtimeTone(runtime.status))
    },
    {
      label: "Очередь задач",
      value: queuedJobs + runningJobs,
      hint: `ошибки: ${failedJobs} · успешно 24ч: ${succeededJobsToday}`,
      tone: failedJobs > 0 ? "danger" : queuedJobs + runningJobs > 0 ? "warning" : "success"
    },
    {
      label: "Готовность",
      value: `${phaseDReport.summary.liveCertified}/${phaseDReport.summary.total}`,
      hint: `готовы: ${phaseDReport.summary.readyForLiveCertification} · блокеры: ${readinessBlockers}`,
      tone:
        readinessBlockers > 0
          ? "warning"
          : phaseDReport.summary.total > 0 && phaseDReport.summary.liveCertified === phaseDReport.summary.total
            ? "success"
            : "neutral"
    },
    {
      label: "SSO и каталог",
      value: providers.length,
      hint: `сессии: ${activeSessions} · не активны: ${providerWarnings}`,
      tone: providerWarnings > 0 || expiredActiveSessions > 0 ? "warning" : providers.length > 0 ? "success" : "neutral"
    },
    {
      label: "Интеграции",
      value: integrations.length,
      hint: `ошибки: ${integrationRiskCount} · запусков: ${recentRuns.length}`,
      tone: integrationRiskCount > 0 ? "danger" : integrations.length > 0 ? "success" : "neutral"
    },
    {
      label: "Обслуживание",
      value: maintenanceBacklog,
      hint: "сессии, idempotency и rate limits",
      tone: maintenanceBacklog > 0 ? "warning" : "success"
    }
  ];

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/system"]}
      description="Единый контур для окружения, очереди, SSO/AD, интеграций и обслуживания."
    >
      <AdminFrame>
        <div className="flex flex-col gap-6">
          <StatStrip items={systemHealthItems} className="lg:grid-cols-4 xl:grid-cols-7" />

          <TriageStrip
            tone={overallTone === "negative" ? "danger" : overallTone === "warning" ? "warning" : "success"}
            icon={<Activity size={18} aria-hidden="true" />}
            title={`Следующий шаг: ${nextAction.title}`}
            description={nextAction.detail}
            action={
              <Button render={<Link href={systemSectionHref(nextAction.section)} />} nativeButton={false} size="sm" variant="outline">
                {nextAction.label}
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            }
          />

          <AdminSectionTabs
            ariaLabel="Разделы состояния системы"
            items={systemSections.map((section) => ({
              href: systemSectionHref(section.value),
              label: section.label,
              active: activeSection === section.value,
              count: section.value === "jobs" ? queuedJobs + runningJobs : undefined
            }))}
            actions={
              <form action={runQueuedBackendJobs} className="flex flex-wrap items-center gap-2">
                <NativeSelect name="limit" defaultValue="5" size="sm" aria-label="Число задач для запуска">
                  <NativeSelectOption value="5">5 задач</NativeSelectOption>
                  <NativeSelectOption value="10">10 задач</NativeSelectOption>
                  <NativeSelectOption value="20">20 задач</NativeSelectOption>
                </NativeSelect>
                <Button type="submit" size="sm">
                  <Play data-icon="inline-start" aria-hidden="true" />
                  Запустить
                </Button>
              </form>
            }
          />

          {activeSection === "jobs" ? (
            <Card aria-labelledby="system-jobs-title">
              <CardHeader className="border-b">
                <CardTitle id="system-jobs-title">Фоновые задачи</CardTitle>
                <CardDescription>Импорты, отчеты, синхронизация каталога и обслуживание данных.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <StatStrip
                  items={[
                    { label: "В очереди", value: queuedJobs, hint: "ожидают обработчик", tone: queuedJobs > 0 ? "warning" : "success" },
                    { label: "Выполняется", value: runningJobs, hint: "сейчас в работе", tone: runningJobs > 0 ? "warning" : "success" },
                    {
                      label: "Успешно 24ч",
                      value: succeededJobsToday,
                      hint: "завершены за сутки",
                      tone: succeededJobsToday > 0 ? "success" : "neutral"
                    },
                    { label: "Ошибки", value: failedJobs, hint: "требуют разбора", tone: failedJobs > 0 ? "danger" : "success" }
                  ]}
                />

                {failedJobs > 0 || queuedJobs > 0 ? (
                  <Alert variant={failedJobs > 0 ? "destructive" : "default"}>
                    <AlertTriangle aria-hidden="true" />
                    <AlertTitle>{failedJobs > 0 ? "Есть задачи с ошибками" : "Очередь ожидает обработки"}</AlertTitle>
                    <AlertDescription>
                      {failedJobs > 0
                        ? "Разберите последние события и повторите запуск после исправления причины."
                        : "Запустите обработчик вручную или дождитесь расписания, если это плановый импорт."}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {recentJobs.length === 0 ? (
                  <EmptyState
                    size="inline"
                    icon={<ListChecks size={20} aria-hidden="true" />}
                    title="Фоновых задач пока нет"
                    description="Очередь обработчика пуста — новые задачи появятся при импорте или обслуживании."
                  />
                ) : (
                  <Table aria-labelledby="system-jobs-title">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Задача</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Очередь</TableHead>
                        <TableHead>Запуск</TableHead>
                        <TableHead className="text-right">Действие</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentJobs.map((job) => {
                        const status = backendJobStatusView(job.status);

                        return (
                          <TableRow key={job.id}>
                            <TableCell className="max-w-[280px]">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium text-foreground">{backendJobTypeLabel(job.type)}</span>
                                <span className="text-xs text-muted-foreground">
                                  попытка {job.attempts}/{job.maxAttempts} · {job.createdBy?.name ?? "Автоматика"}
                                </span>
                                {job.events[0] ? (
                                  <span className="line-clamp-2 text-xs text-muted-foreground">{job.events[0].message}</span>
                                ) : null}
                                {job.errorMessage ? (
                                  <span className="line-clamp-2 text-xs font-medium text-destructive">{job.errorMessage}</span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <StatusBadge tone={badgeTone(operationalTone(status.tone))} size="sm">
                                {status.label}
                              </StatusBadge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{queueNameLabel(job.queueName)}</TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">{formatDate(job.runAfter)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                render={<Link href={`/admin/system/jobs/${job.id}`} />}
                                nativeButton={false}
                                size="sm"
                                variant="outline"
                              >
                                Детали
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "runtime" ? (
            <Card aria-labelledby="runtime-title">
              <CardHeader className="border-b">
                <CardTitle id="runtime-title">Готовность окружения</CardTitle>
                <CardDescription>Проверки конфигурации перед рабочим запуском.</CardDescription>
                <CardAction>
                  <StatusBadge tone={badgeTone(runtimeTone(runtime.status))} size="sm">
                    {runtimeStatusLabel(runtime.status)}
                  </StatusBadge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <StatStrip
                  items={[
                    {
                      label: "Проверки",
                      value: `${runtimeHealthyChecks}/${runtime.checks.length}`,
                      hint: "конфигурация в норме",
                      tone: runtimeIssues > 0 ? "warning" : "success"
                    },
                    { label: "Окружение", value: environmentLabel(runtime.environment), hint: "текущий режим приложения", tone: "accent" },
                    { label: "Проблемы", value: runtimeIssues, hint: "проверки не в статусе Готово", tone: runtimeIssues > 0 ? "danger" : "success" }
                  ]}
                />
                <div className="flex flex-col">
                  {runtime.checks.map((check) => (
                    <div
                      key={check.key}
                      className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">{check.key}</span>
                        <p className="text-xs text-muted-foreground">{check.message}</p>
                      </div>
                      <StatusBadge tone={badgeTone(runtimeTone(check.status))} size="sm">
                        {runtimeStatusLabel(check.status)}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "readiness" ? (
            <Card aria-labelledby="phase-d-readiness-title">
              <CardHeader className="border-b">
                <CardTitle id="phase-d-readiness-title">Сертификация для боевого режима</CardTitle>
                <CardDescription>
                  Фаза D: интеграции, провайдеры удостоверений и только обезличенные свидетельства из защищенных проверочных
                  прогонов.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <StatStrip
                  items={[
                    { label: "Всего объектов", value: phaseDReport.summary.total, hint: "интеграции и провайдеры удостоверений" },
                    {
                      label: "Сертифицировано",
                      value: phaseDReport.summary.liveCertified,
                      hint: "только успешные защищенные свидетельства",
                      tone: "success"
                    },
                    {
                      label: "Готово к боевому режиму",
                      value: phaseDReport.summary.readyForLiveCertification,
                      hint: "контракты готовы, доступов нет",
                      tone: "warning"
                    },
                    {
                      label: "Блокеры",
                      value: phaseDReport.summary.failedOrLimited + phaseDReport.summary.waitingForAccess,
                      hint: "ожидают доступы, настройку или исправление",
                      tone: "warning"
                    }
                  ]}
                />
                <div className="grid gap-5 lg:grid-cols-2">
                  <section aria-labelledby="phase-d-integrations-title" className="flex flex-col gap-2">
                    <h3 id="phase-d-integrations-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Интеграции
                    </h3>
                    <div className="flex flex-col">{phaseDReport.integrations.map(renderReadinessItem)}</div>
                  </section>
                  <section aria-labelledby="phase-d-identity-title" className="flex flex-col gap-2">
                    <h3 id="phase-d-identity-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Провайдеры удостоверений
                    </h3>
                    {phaseDReport.identityProviders.length > 0 ? (
                      <div className="flex flex-col">{phaseDReport.identityProviders.map(renderReadinessItem)}</div>
                    ) : (
                      <EmptyState
                        size="inline"
                        icon={<ShieldCheck size={20} aria-hidden="true" />}
                        title="Провайдеры не настроены"
                        description="SSO появится здесь после настройки провайдера входа в разделе «Доступ и SSO»."
                      />
                    )}
                  </section>
                </div>
                <Alert>
                  <ShieldCheck aria-hidden="true" />
                  <AlertTitle>Модель свидетельств</AlertTitle>
                  <AlertDescription>
                    <p>Поля: {phaseDReport.evidenceModel.requiredFields.join(", ")}.</p>
                    <p>Защитные флаги окружения: {phaseDReport.evidenceModel.protectedEnvGates.slice(0, 5).join(", ")}.</p>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "sso" ? (
            <Card aria-labelledby="system-sso-title">
              <CardHeader className="border-b">
                <CardTitle id="system-sso-title">SSO и каталог</CardTitle>
                <CardDescription>Провайдеры авторизации, маппинги групп и ручной запуск синхронизации.</CardDescription>
                <CardAction>
                  <Button render={<Link href="/admin/access" />} nativeButton={false} size="sm" variant="outline">
                    Открыть раздел
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <StatStrip
                  items={[
                    {
                      label: "Провайдеры",
                      value: providers.length,
                      hint: `не активны: ${providerWarnings}`,
                      tone: providerWarnings > 0 ? "warning" : "success"
                    },
                    { label: "Сессии", value: activeSessions, hint: "активные сейчас" },
                    {
                      label: "Просрочены",
                      value: expiredActiveSessions,
                      hint: "будут закрыты обслуживанием",
                      tone: expiredActiveSessions > 0 ? "warning" : "success"
                    }
                  ]}
                />
                {providers.length === 0 ? (
                  <EmptyState
                    size="inline"
                    icon={<ShieldCheck size={20} aria-hidden="true" />}
                    title="Провайдеры не настроены"
                    description="SSO появится здесь после настройки провайдера входа в разделе «Доступ и SSO»."
                  />
                ) : (
                  <div className="flex flex-col">
                    {providers.map((provider) => (
                      <div
                        key={provider.id}
                        className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{provider.name}</span>
                            <StatusBadge tone={badgeTone(providerTone(provider.status))} size="sm">
                              {providerStatusLabel(provider.status)}
                            </StatusBadge>
                          </div>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {providerTypeLabel(provider.type)} · {provider.slug} · маппингов: {provider._count.groupRoleMappings} ·
                            сессий: {provider._count.authSessions} · последняя синхронизация: {formatDate(provider.lastSyncAt)}
                          </p>
                        </div>
                        {provider.type !== "DEMO" ? (
                          <form action={queueDirectorySync}>
                            <input type="hidden" name="providerId" value={provider.id} />
                            <Button type="submit" size="sm" variant="outline">
                              <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                              Синхронизировать
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "integrations" ? (
            <Card aria-labelledby="system-integrations-title">
              <CardHeader className="border-b">
                <CardTitle id="system-integrations-title">Интеграции</CardTitle>
                <CardDescription>Последние подключения, статусы импортов и API-ключи.</CardDescription>
                <CardAction>
                  <Button render={<Link href="/admin/integrations" />} nativeButton={false} size="sm" variant="outline">
                    Открыть раздел
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <StatStrip
                  items={[
                    {
                      label: "Источники",
                      value: integrations.length,
                      hint: `ошибки: ${integrationErrors}`,
                      tone: integrationErrors > 0 ? "danger" : "neutral"
                    },
                    {
                      label: "API-ключи",
                      value: apiTokens.length,
                      hint: `ошибки: ${apiTokenErrors}`,
                      tone: apiTokenErrors > 0 ? "danger" : "success"
                    },
                    {
                      label: "Последние запуски",
                      value: recentRuns.length,
                      hint: "импорты и пробные запуски",
                      tone: recentRuns.length > 0 ? "accent" : "neutral"
                    }
                  ]}
                />
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
                  <section aria-labelledby="integration-sources-title" className="flex flex-col gap-2">
                    <h3 id="integration-sources-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Источники данных
                    </h3>
                    {integrations.length === 0 ? (
                      <EmptyState
                        size="inline"
                        icon={<Plug size={20} aria-hidden="true" />}
                        title="Интеграции не настроены"
                        description="Подключите источник, чтобы отслеживать его состояние здесь."
                      />
                    ) : (
                      <div className="flex flex-col">
                        {integrations.map((integration) => (
                          <div
                            key={integration.id}
                            className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="flex min-w-0 flex-col gap-1">
                              <span className="text-sm font-medium text-foreground">{integration.displayName}</span>
                              <p className="text-xs tabular-nums text-muted-foreground">
                                {externalSourceLabel(integration.source)} · лимит: {integration.importLimit} · батч:{" "}
                                {integration.batchSize} · последний импорт: {formatDate(integration.lastImportAt)}
                              </p>
                              {integration.lastError ? (
                                <p className="text-xs font-medium text-destructive">{integration.lastError}</p>
                              ) : null}
                            </div>
                            <StatusBadge tone={badgeTone(integrationTone(integration.status))} size="sm">
                              {integrationStatusLabel(integration.status)}
                            </StatusBadge>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section aria-labelledby="integration-token-title" className="flex flex-col gap-2">
                    <h3 id="integration-token-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      API-ключи
                    </h3>
                    {apiTokens.length === 0 ? (
                      <EmptyState
                        size="inline"
                        icon={<ServerCog size={20} aria-hidden="true" />}
                        title="API-ключей нет"
                        description="Активность по ключам появится после выпуска первого ключа."
                      />
                    ) : (
                      <div className="flex flex-col">
                        {apiTokens.map((token) => {
                          const tokenHasError = Boolean(
                            token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)
                          );

                          return (
                            <div
                              key={token.id}
                              className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
                            >
                              <div className="flex min-w-0 flex-col gap-1">
                                <span className="text-sm font-medium text-foreground">{token.name}</span>
                                <p className="text-xs tabular-nums text-muted-foreground">
                                  Последний успех: {formatDate(token.lastSuccessAt)} · последняя ошибка:{" "}
                                  {formatDate(token.lastErrorAt)}
                                </p>
                                {token.lastError ? (
                                  <p className="text-xs font-medium text-destructive">{token.lastError}</p>
                                ) : null}
                              </div>
                              <StatusBadge
                                tone={tokenHasError ? "danger" : token.lastSuccessAt ? "success" : "neutral"}
                                size="sm"
                              >
                                {tokenHasError ? "Ошибка" : token.lastSuccessAt ? "Работает" : "Нет запусков"}
                              </StatusBadge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <h3 id="recent-runs-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Последние импорты</h3>
                  {recentRuns.length === 0 ? (
                    <EmptyState
                      size="inline"
                      icon={<Database size={20} aria-hidden="true" />}
                      title="Запусков пока нет"
                      description="История импортов и пробных запусков появится после первого запуска."
                    />
                  ) : (
                    <Table aria-labelledby="recent-runs-title">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Источник</TableHead>
                          <TableHead>Тип</TableHead>
                          <TableHead>Объём</TableHead>
                          <TableHead>Старт</TableHead>
                          <TableHead>Статус</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentRuns.map((run) => {
                          const status = integrationRunStatusView(run.status);

                          return (
                            <TableRow key={run.id}>
                              <TableCell className="font-medium">{run.integration?.displayName ?? run.source}</TableCell>
                              <TableCell className="text-muted-foreground">{run.dryRun ? "Пробный запуск" : "Импорт"}</TableCell>
                              <TableCell className="tabular-nums text-muted-foreground">
                                {run.importedCount}/{run.requestedLimit}
                              </TableCell>
                              <TableCell className="tabular-nums text-muted-foreground">{formatDate(run.startedAt)}</TableCell>
                              <TableCell>
                                <StatusBadge tone={badgeTone(operationalTone(status.tone))} size="sm">
                                  {status.label}
                                </StatusBadge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "maintenance" ? (
            <Card aria-labelledby="maintenance-title">
              <CardHeader className="border-b">
                <CardTitle id="maintenance-title">Обслуживание</CardTitle>
                <CardDescription>Технические записи, которые чистит задача обслуживания.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <StatStrip
                  items={[
                    {
                      label: "Просроченные сессии",
                      value: expiredActiveSessions,
                      hint: "будут помечены как истекшие",
                      tone: expiredActiveSessions > 0 ? "warning" : "success"
                    },
                    {
                      label: "Ключи повторных запросов",
                      value: expiredIdempotencyKeys,
                      hint: "можно удалить после TTL",
                      tone: expiredIdempotencyKeys > 0 ? "warning" : "success"
                    },
                    {
                      label: "Окна лимитов API",
                      value: staleRateLimits,
                      hint: "старше 7 дней",
                      tone: staleRateLimits > 0 ? "warning" : "success"
                    }
                  ]}
                />
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">Очистка технических записей</span>
                    <p className="text-xs text-muted-foreground">
                      Ставит в очередь задачу обслуживания: просроченные сессии, ключи повторных запросов и окна лимитов API.
                    </p>
                  </div>
                  <form action={queueRetentionCleanup}>
                    <Button type="submit" size="sm" variant="outline">
                      <RotateCcw data-icon="inline-start" aria-hidden="true" />
                      Очистка
                    </Button>
                  </form>
                </div>
                <Alert>
                  <Clock3 aria-hidden="true" />
                  <AlertTitle>Cron и фоновый обработчик</AlertTitle>
                  <AlertDescription>
                    Для cron-запуска фоновых задач используйте{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">npm run jobs:run -- --once</code>. Команда{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">npm run jobs:run</code> запускает постоянный
                    фоновый обработчик.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </AdminFrame>
    </PageShell>
  );
}
