import { ChevronDown, Filter, History, KeyRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { StatStrip } from "@/components/ui/stat-strip";
import { PageShell } from "@/components/ui/page-shell";
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

/**
 * Колонки строки события: время · актор · действие · объект · детали.
 * Инлайн-стилем, потому что admin-data-table__row задаёт собственный
 * 4-колоночный шаблон, а CSS менять нельзя.
 */
const auditEventGridColumns =
  "minmax(96px, 0.55fr) minmax(104px, 0.85fr) minmax(150px, 1.7fr) minmax(100px, 0.85fr) auto";

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
        ariaLabel="Сводка журнала действий"
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
        <section className="ops-panel" aria-labelledby="audit-events-title">
          <div className="ops-panel__header">
            <div>
              <h2 id="audit-events-title" className="ops-panel__title">История действий</h2>
              <p className="ops-panel__subtitle tabular-nums">
                Страница {page} из {totalPages}
              </p>
            </div>
            {hasFilters ? <Chip tone="accent" size="sm" icon={<Filter size={13} aria-hidden="true" />}>Фильтр активен</Chip> : null}
          </div>

          <AutoSubmitFilterForm
            action="/admin/audit"
            className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] px-5 py-4"
          >
            <input type="hidden" name="section" value="events" />
            <input type="hidden" name="page" value="1" />
            <label className="grid min-w-[180px] flex-1 gap-1 text-xs font-semibold text-[var(--text-body)]">
              Действие
              <select name="action" defaultValue={action ?? ""} className="form-control">
                <option value="">Все</option>
                {actionRows.map((row) => (
                  <option key={row.action} value={row.action}>
                    {auditActionLabel(row.action)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-[160px] flex-1 gap-1 text-xs font-semibold text-[var(--text-body)]">
              Тип объекта
              <select name="targetType" defaultValue={targetType ?? ""} className="form-control">
                <option value="">Все</option>
                {targetTypeRows.map((row) => (
                  <option key={row.targetType} value={row.targetType}>
                    {auditTargetTypeLabel(row.targetType)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid w-[142px] gap-1 text-xs font-semibold text-[var(--text-body)]">
              С даты
              <input type="date" name="start" defaultValue={dateInputValue(start)} className="form-control" />
            </label>
            <label className="grid w-[142px] gap-1 text-xs font-semibold text-[var(--text-body)]">
              По дату
              <input type="date" name="end" defaultValue={dateInputValue(end)} className="form-control" />
            </label>
            {hasFilters ? (
              <Link href="/admin/audit?section=events" className="action-button action-button--small">
                Сбросить
              </Link>
            ) : null}
          </AutoSubmitFilterForm>

          <div className="p-4">
            {logs.length === 0 ? (
              <EmptyState
                size="inline"
                icon={<History size={20} aria-hidden="true" />}
                title="События не найдены"
                description={hasFilters ? "Под текущий фильтр нет записей. Сбросьте условия отбора." : "Записей в журнале пока нет."}
              />
            ) : (
              <div className="admin-data-table admin-data-table--compact" aria-label="События журнала">
                <div className="admin-data-table__head" style={{ gridTemplateColumns: auditEventGridColumns }}>
                  <span>Время</span>
                  <span>Актор</span>
                  <span>Действие</span>
                  <span>Объект</span>
                  <span aria-hidden="true" />
                </div>
                {logs.map((log) => (
                  <details key={log.id} className="group border-t border-[var(--line-soft)] first-of-type:border-t-0">
                    <summary
                      className="admin-data-table__row cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
                      style={{ gridTemplateColumns: auditEventGridColumns }}
                    >
                      <time className="admin-data-table__muted tabular-nums" dateTime={log.createdAt.toISOString()}>
                        {shortDateTimeFormat.format(log.createdAt)}
                      </time>
                      <span className="admin-data-table__muted truncate" title={log.actor?.name ?? undefined}>
                        {log.actor?.name ?? "Система"}
                      </span>
                      <h3 className="admin-data-table__primary truncate" title={log.action}>
                        {auditActionLabel(log.action)}
                      </h3>
                      <span className="truncate" title={log.targetType}>
                        {auditTargetTypeLabel(log.targetType)}
                      </span>
                      <span className="inline-flex items-center gap-1 justify-self-end text-xs font-bold text-[var(--accent-strong)]">
                        Детали
                        <ChevronDown size={13} aria-hidden="true" className="transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <pre className="m-0 overflow-x-auto border-t border-dashed border-[var(--line-soft)] bg-[var(--panel-muted)] px-4 py-3 text-xs leading-5 text-[var(--text-body)]">
                      <code>{parseMetadata(log.metadata)}</code>
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4 text-sm">
            {page > 1 ? (
              <Link href={buildAuditHref(page - 1, action, targetType, start, end)} className="action-button action-button--small">
                Назад
              </Link>
            ) : (
              <span className="text-[var(--text-muted)]">Назад</span>
            )}
            {page * pageSize < totalLogs ? (
              <Link href={buildAuditHref(page + 1, action, targetType, start, end)} className="action-button action-button--small">
                Вперед
              </Link>
            ) : (
              <span className="text-[var(--text-muted)]">Вперед</span>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "tokens" ? (
        <section className="ops-panel" aria-labelledby="audit-api-title">
          <div className="ops-panel__header">
            <div>
              <h2 id="audit-api-title" className="ops-panel__title">Активность API-ключей</h2>
              <p className="ops-panel__subtitle">Последнее использование ключей рядом с событиями аудита.</p>
            </div>
            <Chip tone="neutral" size="sm" numeric>{apiTokens.length}</Chip>
          </div>
          <div className="grid gap-2 p-4">
            <div className="grid gap-2 md:grid-cols-2 items-start">{apiTokens.map((token) => (
              <article key={token.id} className="admin-tile admin-tile--compact">
                <span className="admin-tile__icon admin-tile__icon--plain">K</span>
                <div className="admin-tile__body">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="record-title record-title--tight">{token.name}</span>
                    <Chip tone="neutral" size="xs">API</Chip>
                  </span>
                  <span className="record-meta font-mono compact-text">{token.tokenPrefix}</span>
                  <span className="record-meta tabular-nums">Использование: {formatDate(token.lastUsedAt)} · успех: {formatDate(token.lastSuccessAt)}</span>
                  <span className="record-meta compact-text tabular-nums">
                    Ошибка: {token.lastError ? `${formatDate(token.lastErrorAt)} · ${token.lastError}` : "Нет"}
                  </span>
                </div>
              </article>
            ))}</div>
            {apiTokens.length === 0 ? (
              <EmptyState
                size="inline"
                icon={<KeyRound size={20} aria-hidden="true" />}
                title="Ключи еще не созданы"
                description="Активность появится здесь после создания первого API-ключа."
              />
            ) : null}
          </div>
        </section>
      ) : null}
      </AdminFrame>
    </PageShell>
  );
}
