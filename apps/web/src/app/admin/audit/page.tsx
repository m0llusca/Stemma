import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
const pageSize = 20;

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
  "auth.session_revoked": "Сессия отозвана",
  "backend_job.cancelled": "Фоновая задача отменена",
  "backend_job.retention_cleanup_queued": "Очистка данных поставлена в очередь",
  "backend_jobs.run_from_ui": "Фоновые задачи запущены вручную",
  "calibration.session_created": "Создана калибровка",
  "conversation.bulk_workflow_updated": "Массово обновлена очередь проверок",
  "conversation.workflow_updated": "Обновлена проверка обращения",
  "integration.dry_run_checked": "Проверен пробный импорт",
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
  const params = new URLSearchParams();

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

  return (
    <section className="page-shell admin-shell">
      <div className="admin-hero">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Журнал действий</h1>
          <p className="page-subtitle">
            Аудит показывает события списком, а технические данные раскрываются внутри конкретной записи.
          </p>
        </div>
      </div>

      <form action="/admin/audit" className="panel grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-[minmax(170px,220px)_minmax(170px,220px)_150px_150px_auto]">
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
          <input
            type="date"
            name="start"
            defaultValue={dateInputValue(start)}
            className="form-control"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#334155]">
          По дату
          <input
            type="date"
            name="end"
            defaultValue={dateInputValue(end)}
            className="form-control"
          />
        </label>
        <div className="flex items-end md:col-span-2 lg:col-span-1">
          <button type="submit" className="action-button action-button--primary">
            Применить
          </button>
        </div>
        <input type="hidden" name="page" value="1" />
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">История действий</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Страница {page} · событий найдено: {totalLogs}
            </p>
          </div>
          <div className="record-list px-5">
            {logs.length === 0 ? (
              <div className="soft-callout text-sm text-[#64748b]">События не найдены.</div>
            ) : (
              logs.map((log) => (
                <article key={log.id} className="record-card">
                  <div className="record-row">
                    <div className="min-w-0">
                      <h3 className="record-title">{auditActionLabel(log.action)}</h3>
                      <p className="record-meta mt-1">
                        {auditTargetTypeLabel(log.targetType)} · {log.actor.name}
                      </p>
                    </div>
                    <time className="pill pill--neutral" dateTime={log.createdAt.toISOString()}>
                      {formatDate(log.createdAt)}
                    </time>
                  </div>
                  <details className="compact-details bg-[#f8fafc]">
                    <summary>
                      <span className="text-sm font-semibold text-[#334155]">Детали события</span>
                      <span className="text-sm font-semibold text-[#1d3fae]">Показать</span>
                    </summary>
                    <pre className="m-0 overflow-x-auto rounded-b-md bg-[#f8fafc] p-3 text-xs leading-5 text-[#334155]">
                      <code>{parseMetadata(log.metadata)}</code>
                    </pre>
                  </details>
                </article>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#d9e0ea] px-5 py-4 text-sm">
            {page > 1 ? (
              <Link href={buildAuditHref(page - 1, action, targetType, start, end)} className="font-semibold text-[#1d3fae] hover:underline">
                Назад
              </Link>
            ) : (
              <span className="text-[#94a3b8]">Назад</span>
            )}
            {page * pageSize < totalLogs ? (
              <Link href={buildAuditHref(page + 1, action, targetType, start, end)} className="font-semibold text-[#1d3fae] hover:underline">
                Вперед
              </Link>
            ) : (
              <span className="text-[#94a3b8]">Вперед</span>
            )}
          </div>
        </section>

        <details className="disclosure-panel panel h-fit overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Активность API-ключей</h2>
              <p className="mt-1 text-sm text-[#64748b]">Открывается только при разборе интеграций.</p>
            </div>
            <span className="pill pill--neutral">{apiTokens.length}</span>
          </summary>
          <div className="record-list px-5">
            {apiTokens.map((token) => (
              <article key={token.id} className="record-card">
                <div className="record-row">
                  <div className="min-w-0">
                    <h3 className="record-title">{token.name}</h3>
                    <p className="record-meta mt-1 font-mono compact-text">{token.tokenPrefix}</p>
                  </div>
                  <span className="pill pill--neutral">API</span>
                </div>
                <dl className="mt-4 grid gap-3">
                  <div className="min-w-0">
                    <dt className="font-semibold text-[#64748b]">Последнее использование</dt>
                    <dd className="mt-1 text-[#111827]">{formatDate(token.lastUsedAt)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-semibold text-[#64748b]">Последний успех</dt>
                    <dd className="mt-1 text-[#111827]">{formatDate(token.lastSuccessAt)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-semibold text-[#64748b]">Последняя ошибка</dt>
                    <dd className="mt-1 text-[#111827]">
                      {token.lastError ? `${formatDate(token.lastErrorAt)} · ${token.lastError}` : "Нет"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
