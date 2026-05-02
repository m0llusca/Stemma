import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
const pageSize = 20;

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

function buildAuditHref(page: number, action?: string, targetType?: string) {
  const params = new URLSearchParams();

  if (action) {
    params.set("action", action);
  }

  if (targetType) {
    params.set("targetType", targetType);
  }

  params.set("page", String(page));

  return `/admin/audit?${params.toString()}`;
}

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const action = firstParam(params.action);
  const targetType = firstParam(params.targetType);
  const page = parsePage(params.page);
  const where = {
    workspaceId: user.workspaceId,
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {})
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
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Аудит</h1>
      </div>

      <form action="/admin/audit" className="panel mb-6 grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-[minmax(180px,220px)_minmax(180px,220px)_auto]">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Action
          <select name="action" defaultValue={action ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
            <option value="">Все</option>
            {actionRows.map((row) => (
              <option key={row.action} value={row.action}>
                {row.action}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Target type
          <select name="targetType" defaultValue={targetType ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
            <option value="">Все</option>
            {targetTypeRows.map((row) => (
              <option key={row.targetType} value={row.targetType}>
                {row.targetType}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end md:col-span-2 lg:col-span-1">
          <button type="submit" className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
            Применить
          </button>
        </div>
        <input type="hidden" name="page" value="1" />
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">История действий</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Страница {page} · событий найдено: {totalLogs}
            </p>
          </div>
          <div className="divide-y divide-[#d7dce5]">
            {logs.length === 0 ? (
              <div className="p-5 text-sm text-[#667085]">События не найдены.</div>
            ) : (
              logs.map((log) => (
                <article key={log.id} className="grid gap-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[#17202a]">{log.action}</h3>
                      <p className="mt-1 text-sm text-[#667085]">
                        {log.targetType} · {log.actor.name}
                      </p>
                    </div>
                    <time className="text-sm text-[#667085]" dateTime={log.createdAt.toISOString()}>
                      {formatDate(log.createdAt)}
                    </time>
                  </div>
                  <pre className="overflow-x-auto rounded bg-[#f7f8fb] p-3 text-xs leading-5 text-[#344054]">
                    <code>{parseMetadata(log.metadata)}</code>
                  </pre>
                </article>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#d7dce5] px-5 py-4 text-sm">
            {page > 1 ? (
              <Link href={buildAuditHref(page - 1, action, targetType)} className="font-semibold text-[#0b4f52] hover:underline">
                Назад
              </Link>
            ) : (
              <span className="text-[#98a2b3]">Назад</span>
            )}
            {page * pageSize < totalLogs ? (
              <Link href={buildAuditHref(page + 1, action, targetType)} className="font-semibold text-[#0b4f52] hover:underline">
                Вперед
              </Link>
            ) : (
              <span className="text-[#98a2b3]">Вперед</span>
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">API-активность</h2>
          </div>
          <div className="divide-y divide-[#d7dce5]">
            {apiTokens.map((token) => (
              <article key={token.id} className="p-5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#17202a]">{token.name}</h3>
                    <p className="mt-1 font-mono text-xs text-[#667085]">{token.tokenPrefix}</p>
                  </div>
                  <span className="rounded-md bg-[#eef4f4] px-2 py-1 text-xs font-semibold text-[#0b4f52]">API</span>
                </div>
                <dl className="mt-4 grid gap-3">
                  <div>
                    <dt className="font-semibold text-[#667085]">Последнее использование</dt>
                    <dd className="mt-1 text-[#17202a]">{formatDate(token.lastUsedAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#667085]">Последний успех</dt>
                    <dd className="mt-1 text-[#17202a]">{formatDate(token.lastSuccessAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#667085]">Последняя ошибка</dt>
                    <dd className="mt-1 text-[#17202a]">
                      {token.lastError ? `${formatDate(token.lastErrorAt)} · ${token.lastError}` : "Нет"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
