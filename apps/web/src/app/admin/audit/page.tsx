import { Filter, KeyRound } from "lucide-react";
import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
const pageSize = 20;

type AuditSection = "events" | "filters" | "tokens";

const auditSections: Array<{ value: AuditSection; label: string }> = [
  { value: "events", label: "События" },
  { value: "filters", label: "Фильтры" },
  { value: "tokens", label: "API-ключи" }
];

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

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
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

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Журнал действий</h1>
          <p className="page-subtitle">
            Аудит показывает события списком, а технические данные раскрываются внутри конкретной записи.
          </p>
          <div className="admin-actions mt-5">
            <Link href={auditSectionHref("filters", action, targetType, start, end)} className="action-button action-button--primary">
              <Filter size={16} aria-hidden="true" />
              Фильтры
            </Link>
            <Link href={auditSectionHref("tokens", action, targetType, start, end)} className="action-button">
              <KeyRound size={16} aria-hidden="true" />
              API-ключи
            </Link>
          </div>
        </div>
      </div>

      <section className="ops-metric-grid" aria-label="Сводка журнала действий">
        <div className="ops-metric">
          <span className="ops-metric__label">События</span>
          <strong className="ops-metric__value">{totalLogs}</strong>
          <span className="ops-metric__note">{hasFilters ? "По текущему фильтру" : "Все найденные события"}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Действия</span>
          <strong className="ops-metric__value">{actionRows.length}</strong>
          <span className="ops-metric__note">Типов событий в журнале</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Объекты</span>
          <strong className="ops-metric__value">{targetTypeRows.length}</strong>
          <span className="ops-metric__note">Типов объектов в журнале</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">API-ключи</span>
          <strong className="ops-metric__value">{apiTokens.length}</strong>
          <span className="ops-metric__note">Для сверки активности</span>
        </div>
      </section>

      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы журнала действий">
        {auditSections.map((section) => (
          <Link
            key={section.value}
            href={auditSectionHref(section.value, action, targetType, start, end)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "events" ? (
        <section className="ops-panel" aria-labelledby="audit-events-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">История</p>
              <h2 id="audit-events-title" className="ops-panel__title">История действий</h2>
              <p className="ops-panel__subtitle">
                Страница {page} · событий найдено: {totalLogs}
              </p>
            </div>
            {hasFilters ? <span className="pill pill--ok">Фильтр активен</span> : null}
          </div>
          <div className="grid gap-2 p-4">
            {logs.length === 0 ? (
              <div className="soft-callout ops-empty text-sm text-[#64748b]">События не найдены.</div>
            ) : (
              logs.map((log) => (
                <article key={log.id} className="admin-tile admin-tile--compact">
                  <span className="admin-tile__icon admin-tile__icon--plain">A</span>
                  <div className="admin-tile__body">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="record-title record-title--tight">{auditActionLabel(log.action)}</h3>
                      <time className="pill pill--neutral" dateTime={log.createdAt.toISOString()}>
                        {formatDate(log.createdAt)}
                      </time>
                    </div>
                    <span className="record-meta">
                      {auditTargetTypeLabel(log.targetType)} · {log.actor?.name ?? "Системное событие"}
                    </span>
                    <details className="compact-details bg-[#f8fafc]">
                      <summary>
                        <span className="text-sm font-semibold text-[#334155]">Детали события</span>
                        <span className="text-sm font-semibold text-[#1d3fae]">Показать</span>
                      </summary>
                      <pre className="m-0 overflow-x-auto rounded-b-md bg-[#f8fafc] p-3 text-xs leading-5 text-[#334155]">
                        <code>{parseMetadata(log.metadata)}</code>
                      </pre>
                    </details>
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#d9e0ea] px-5 py-4 text-sm">
            {page > 1 ? (
              <Link href={buildAuditHref(page - 1, action, targetType, start, end)} className="action-button action-button--small">
                Назад
              </Link>
            ) : (
              <span className="text-[#94a3b8]">Назад</span>
            )}
            {page * pageSize < totalLogs ? (
              <Link href={buildAuditHref(page + 1, action, targetType, start, end)} className="action-button action-button--small">
                Вперед
              </Link>
            ) : (
              <span className="text-[#94a3b8]">Вперед</span>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "filters" ? (
        <section className="ops-panel" aria-labelledby="audit-filters-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Отбор</p>
              <h2 id="audit-filters-title" className="ops-panel__title">Фильтры журнала</h2>
              <p className="ops-panel__subtitle">Фильтр применяется к списку событий и сбрасывает страницу на первую.</p>
            </div>
          </div>
          <form action="/admin/audit" className="ops-form-grid p-5">
            <input type="hidden" name="section" value="events" />
            <input type="hidden" name="page" value="1" />
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              С даты
              <input type="date" name="start" defaultValue={dateInputValue(start)} className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              По дату
              <input type="date" name="end" defaultValue={dateInputValue(end)} className="form-control" />
            </label>
            <div className="ops-form-grid__wide flex justify-end">
              <button type="submit" className="action-button action-button--primary">
                Применить
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {activeSection === "tokens" ? (
        <section className="ops-panel" aria-labelledby="audit-api-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Интеграции</p>
              <h2 id="audit-api-title" className="ops-panel__title">Активность API-ключей</h2>
              <p className="ops-panel__subtitle">Последнее использование ключей рядом с событиями аудита.</p>
            </div>
            <span className="pill pill--neutral">{apiTokens.length}</span>
          </div>
          <div className="grid gap-2 p-4">
            {apiTokens.map((token) => (
              <article key={token.id} className="admin-tile admin-tile--compact">
                <span className="admin-tile__icon admin-tile__icon--plain">K</span>
                <div className="admin-tile__body">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="record-title record-title--tight">{token.name}</span>
                    <span className="pill pill--neutral">API</span>
                  </span>
                  <span className="record-meta font-mono compact-text">{token.tokenPrefix}</span>
                  <span className="record-meta">Использование: {formatDate(token.lastUsedAt)} · успех: {formatDate(token.lastSuccessAt)}</span>
                  <span className="record-meta compact-text">
                    Ошибка: {token.lastError ? `${formatDate(token.lastErrorAt)} · ${token.lastError}` : "Нет"}
                  </span>
                </div>
              </article>
            ))}
            {apiTokens.length === 0 ? <div className="soft-callout ops-empty text-sm text-[#64748b]">Ключи еще не созданы.</div> : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
