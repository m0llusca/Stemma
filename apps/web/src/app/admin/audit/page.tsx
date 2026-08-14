import { ChevronDown, Filter, History, KeyRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageShell } from "@/components/ui/page-shell";
import { StatStrip } from "@/components/ui/stat-strip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AdminSectionTabs } from "@/components/admin/admin-section-tabs";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
const pageSize = 20;

type AuditSection = "events" | "tokens";

const auditSections: Array<{ value: AuditSection; label: string }> = [
  { value: "events", label: "События" },
  { value: "tokens", label: "API-ключи" }
];

const shortDateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

const auditActionLabels: Record<string, string> = {
  "api_token.created": "Создан API-ключ",
  "api_token.revoked": "API-ключ отозван",
  "auth.directory_sync_queued": "Синхронизация каталога поставлена в очередь",
  "auth.group_role_mapping_saved": "Сохранена связь группы и роли",
  "auth.group_role_mapping_toggled": "Изменен статус связи группы и роли",
  "auth.group_role_mapping_upserted": "Обновлена связь группы и роли",
  "auth.provider_saved": "Сохранен провайдер входа",
  "auth.provider_updated": "Обновлен провайдер входа",
  "auth.provider_upserted": "Обновлен провайдер входа",
  "auth.scim_token_issued": "Выпущен SCIM-токен",
  "auth.scim_token_revoked": "SCIM-токен отозван",
  "auth.scim_token_rotated": "SCIM-токен ротирован",
  "auth.session_revoked": "Сессия отозвана",
  "backend_job.cancelled": "Фоновая задача отменена",
  "backend_job.retention_cleanup_queued": "Очистка данных поставлена в очередь",
  "backend_jobs.run_from_ui": "Фоновые задачи запущены вручную",
  "calibration.session_created": "Создана калибровка",
  "conversation.bulk_workflow_updated": "Массово обновлена очередь проверок",
  "conversation.workflow_updated": "Обновлена проверка обращения",
  "integration.dry_run_checked": "Проверен пробный импорт",
  "integration.dry_run_queued": "Пробный импорт поставлен в очередь",
  "integration.import_queued": "Импорт поставлен в очередь",
  "integration.native_helpdesk_imported": "Импорт из helpdesk завершен",
  "integration.otrs_family_imported": "Импорт из OTRS/Znuny завершен",
  "integration.upserted": "Сохранена интеграция",
  "privacy.conversation_redacted": "Обращение обезличено",
  "review.draft_saved": "Черновик проверки сохранен",
  "review.feedback.acknowledged": "Обратная связь подтверждена",
  "review.feedback.appeal_opened": "Открыта апелляция",
  "review.feedback.reanswer_completed": "Переответ отмечен выполненным",
  "review.finalized": "Проверка завершена",
  "scorecard.version_created": "Создана версия формы оценки",
  "seed.created": "Демо-данные загружены",
  "training.assignment_created": "Создана учебная задача"
};

const auditTargetTypeLabels: Record<string, string> = {
  api_token: "API-ключ",
  auth_group_mapping: "Группа доступа",
  auth_provider: "Провайдер входа",
  auth_session: "Сессия",
  identity_provider: "Провайдер входа",
  backend_job: "Фоновая задача",
  calibration_session: "Калибровка",
  conversation: "Обращение",
  integration: "Интеграция",
  review: "Проверка",
  scorecard: "Форма оценки",
  training_assignment: "Учебная задача",
  workspace: "Рабочая область"
};

type AuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function auditSectionParam(value: string | string[] | undefined): AuditSection {
  const section = firstParam(value);

  // Легаси-диплинк: вкладка «Фильтры» слита со «Событиями», фильтры теперь
  // инлайн над списком. Старые ссылки ?section=filters открывают события.
  if (section === "filters") {
    return "events";
  }

  return auditSections.some((item) => item.value === section) ? (section as AuditSection) : "events";
}

function auditSectionHref(section: AuditSection, action?: string, targetType?: string, start?: Date, end?: Date) {
  const params = new URLSearchParams({ section });

  if (action) {
    params.set("action", action);
  }

  if (targetType) {
    params.set("targetType", targetType);
  }

  if (start) {
    params.set("start", dateInputValue(start));
  }

  if (end) {
    params.set("end", dateInputValue(end));
  }

  return `/admin/audit?${params.toString()}`;
}

function parsePage(value: string | string[] | undefined) {
  const page = Number(firstParam(value) ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseDateFilter(value: string | string[] | undefined, endOfDay = false) {
  const normalized = firstParam(value);

  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }

  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${normalized}T${time}Z`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateInputValue(value: Date | undefined) {
  return value?.toISOString().slice(0, 10) ?? "";
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Нет";
  }

  return value.toLocaleString("ru-RU");
}

function parseMetadata(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function auditActionLabel(value: string) {
  return auditActionLabels[value] ?? value;
}

function auditTargetTypeLabel(value: string) {
  return auditTargetTypeLabels[value] ?? value;
}

function buildAuditHref(page: number, action?: string, targetType?: string, start?: Date, end?: Date) {
  const params = new URLSearchParams({ section: "events" });

  if (action) {
    params.set("action", action);
  }

  if (targetType) {
    params.set("targetType", targetType);
  }

  if (start) {
    params.set("start", dateInputValue(start));
  }

  if (end) {
    params.set("end", dateInputValue(end));
  }

  params.set("page", String(page));

  return `/admin/audit?${params.toString()}`;
}

export default function AdminAuditPage({ searchParams }: AuditPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/audit")} />}>
      <AdminAuditPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminAuditPageContent({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const activeSection = auditSectionParam(params.section);
  const user = await requireCurrentUserPermission("audit:read");
  const action = firstParam(params.action);
  const targetType = firstParam(params.targetType);
  const start = parseDateFilter(params.start);
  const end = parseDateFilter(params.end, true);
  const page = parsePage(params.page);
  const where = {
    workspaceId: user.workspaceId,
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...(start || end
      ? {
          createdAt: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {})
          }
        }
      : {})
  };

  const [logs, totalLogs, actionRows, targetTypeRows, apiTokens] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: true
      },
      orderBy: {
        createdAt: "desc"
      },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.auditLog.count({
      where
    }),
    prisma.auditLog.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      distinct: ["action"],
      select: {
        action: true
      },
      orderBy: {
        action: "asc"
      }
    }),
    prisma.auditLog.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      distinct: ["targetType"],
      select: {
        targetType: true
      },
      orderBy: {
        targetType: "asc"
      }
    }),
    prisma.apiToken.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      orderBy: {
        updatedAt: "desc"
      }
    })
  ]);
  const hasFilters = Boolean(action || targetType || start || end);
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/audit"]}
      description="События идут компактной лентой с фильтрами прямо над списком, а технические данные раскрываются внутри конкретной записи."
    >
      <AdminFrame>
        <StatStrip
          items={[
            {
              label: "событий",
              value: totalLogs,
              tone: hasFilters ? "accent" : "neutral",
              hint: hasFilters ? "по текущему фильтру" : "за все время"
            },
            { label: "типов действий", value: actionRows.length },
            { label: "типов объектов", value: targetTypeRows.length },
            { label: "API-ключей", value: apiTokens.length, hint: "для сверки активности" }
          ]}
        />

        <AdminSectionTabs
          ariaLabel="Разделы журнала действий"
          items={auditSections.map((section) => ({
            href: auditSectionHref(section.value, action, targetType, start, end),
            label: section.label,
            active: activeSection === section.value,
            count: section.value === "events" ? totalLogs : apiTokens.length
          }))}
        />

        {activeSection === "events" ? (
          <Card aria-labelledby="audit-events-title">
            <CardHeader className="border-b">
              <CardTitle id="audit-events-title" role="heading" aria-level={2}>
                История действий
              </CardTitle>
              <CardDescription className="tabular-nums">
                Страница {page} из {totalPages}
              </CardDescription>
              {hasFilters ? (
                <CardAction>
                  <Badge variant="outline" className="gap-1 border-transparent bg-primary/10 text-primary">
                    <Filter size={13} aria-hidden="true" />
                    Фильтр активен
                  </Badge>
                </CardAction>
              ) : null}
            </CardHeader>

            <AutoSubmitFilterForm
              action="/admin/audit"
              className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-4"
            >
              <input type="hidden" name="section" value="events" />
              <input type="hidden" name="page" value="1" />
              <Field className="min-w-[180px] flex-1 gap-1.5">
                <FieldLabel htmlFor="audit-action">Действие</FieldLabel>
                <NativeSelect id="audit-action" name="action" defaultValue={action ?? ""} className="w-full">
                  <NativeSelectOption value="">Все</NativeSelectOption>
                  {actionRows.map((row) => (
                    <NativeSelectOption key={row.action} value={row.action}>
                      {auditActionLabel(row.action)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="min-w-[160px] flex-1 gap-1.5">
                <FieldLabel htmlFor="audit-target-type">Тип объекта</FieldLabel>
                <NativeSelect
                  id="audit-target-type"
                  name="targetType"
                  defaultValue={targetType ?? ""}
                  className="w-full"
                >
                  <NativeSelectOption value="">Все</NativeSelectOption>
                  {targetTypeRows.map((row) => (
                    <NativeSelectOption key={row.targetType} value={row.targetType}>
                      {auditTargetTypeLabel(row.targetType)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="w-[142px] gap-1.5">
                <FieldLabel htmlFor="audit-start">С даты</FieldLabel>
                <Input id="audit-start" type="date" name="start" defaultValue={dateInputValue(start)} />
              </Field>
              <Field className="w-[142px] gap-1.5">
                <FieldLabel htmlFor="audit-end">По дату</FieldLabel>
                <Input id="audit-end" type="date" name="end" defaultValue={dateInputValue(end)} />
              </Field>
              {hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/admin/audit?section=events" />}
                  nativeButton={false}
                >
                  Сбросить
                </Button>
              ) : null}
            </AutoSubmitFilterForm>

            <CardContent className="p-0">
              {logs.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    size="inline"
                    icon={<History size={20} aria-hidden="true" />}
                    title="События не найдены"
                    description={
                      hasFilters
                        ? "Под текущий фильтр нет записей. Сбросьте условия отбора."
                        : "Записей в журнале пока нет."
                    }
                  />
                </div>
              ) : (
                <Table aria-label="События журнала">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Время</TableHead>
                      <TableHead>Актор</TableHead>
                      <TableHead>Действие</TableHead>
                      <TableHead>Объект</TableHead>
                      <TableHead className="w-[1%] text-right">
                        <span className="sr-only">Детали</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="align-top hover:bg-transparent">
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                          <time dateTime={log.createdAt.toISOString()}>
                            {shortDateTimeFormat.format(log.createdAt)}
                          </time>
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate text-muted-foreground" title={log.actor?.name ?? undefined}>
                          {log.actor?.name ?? "Система"}
                        </TableCell>
                        <TableCell className="max-w-[16rem]">
                          <div className="truncate font-medium" title={log.action}>
                            {auditActionLabel(log.action)}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate" title={log.targetType}>
                          {auditTargetTypeLabel(log.targetType)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Collapsible className="group text-left">
                            <CollapsibleTrigger
                              render={<Button variant="ghost" size="xs" />}
                              className="justify-self-end"
                            >
                              Детали
                              <ChevronDown
                                size={13}
                                aria-hidden="true"
                                className="transition-transform group-data-open:rotate-180"
                              />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <pre className="mt-2 max-w-[min(36rem,70vw)] overflow-x-auto rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 text-left text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                                <code>{parseMetadata(log.metadata)}</code>
                              </pre>
                            </CollapsibleContent>
                          </Collapsible>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>

            <CardFooter className="justify-between gap-3 text-sm">
              {page > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={buildAuditHref(page - 1, action, targetType, start, end)} />}
                  nativeButton={false}
                >
                  Назад
                </Button>
              ) : (
                <span className="text-muted-foreground">Назад</span>
              )}
              {page * pageSize < totalLogs ? (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={buildAuditHref(page + 1, action, targetType, start, end)} />}
                  nativeButton={false}
                >
                  Вперед
                </Button>
              ) : (
                <span className="text-muted-foreground">Вперед</span>
              )}
            </CardFooter>
          </Card>
        ) : null}

        {activeSection === "tokens" ? (
          <Card aria-labelledby="audit-api-title">
            <CardHeader className="border-b">
              <CardTitle id="audit-api-title" role="heading" aria-level={2}>
                Активность API-ключей
              </CardTitle>
              <CardDescription>Последнее использование ключей рядом с событиями аудита.</CardDescription>
              <CardAction>
                <Badge variant="secondary" className="tabular-nums">
                  {apiTokens.length}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {apiTokens.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<KeyRound size={20} aria-hidden="true" />}
                  title="Ключи еще не созданы"
                  description="Активность появится здесь после создания первого API-ключа."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {apiTokens.map((token) => (
                    <Card key={token.id} size="sm" className="bg-muted/30">
                      <CardContent className="flex flex-col gap-1.5 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{token.name}</span>
                          <Badge variant="secondary">API</Badge>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">{token.tokenPrefix}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Использование: {formatDate(token.lastUsedAt)} · успех: {formatDate(token.lastSuccessAt)}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Ошибка: {token.lastError ? `${formatDate(token.lastErrorAt)} · ${token.lastError}` : "Нет"}
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </AdminFrame>
    </PageShell>
  );
}
