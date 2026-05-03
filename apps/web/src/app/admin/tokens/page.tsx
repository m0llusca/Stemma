import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { apiTokenPlaceholder, demoApiToken } from "@/lib/custom-api-docs";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) {
    return "Нет";
  }

  return value.toLocaleString("ru-RU");
}

function formatScopes(scopes: string) {
  return scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(", ");
}

function tokenHealth(token: { lastSuccessAt: Date | null; lastErrorAt: Date | null; lastError: string | null }) {
  if (token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)) {
    return { label: "Ошибка", className: "bg-[#fff4ed] text-[#b54708]" };
  }

  if (token.lastSuccessAt) {
    return { label: "Работает", className: "bg-[#e8f3ef] text-[#116466]" };
  }

  return { label: "Готов", className: "bg-[#eef4f4] text-[#0b4f52]" };
}

export default async function AdminTokensPage() {
  const user = await requireCurrentUserPermission("api_tokens:manage");
  const apiTokens = await prisma.apiToken.findMany({
    where: {
      workspaceId: user.workspaceId
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  const authorizationHeader = `Authorization: Bearer ${demoApiToken}`;

  return (
    <section className="page-shell">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#667085]">Администрирование</p>
          <h1 className="mt-1 text-2xl font-semibold">Ключи API</h1>
        </div>
        <Link
          href="/admin/integrations"
          className="rounded border border-[#d7dce5] bg-white px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]"
        >
          К интеграциям
        </Link>
      </div>

      <section className="panel mb-6 overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <h2 className="text-lg font-semibold">Локальный ключ для разработки</h2>
          <p className="mt-1 text-sm text-[#667085]">
            На страницах интеграций используется плейсхолдер {apiTokenPlaceholder}; реальные значения собраны здесь.
          </p>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <div className="rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#17202a]">Ключ</p>
              <CopyButton value={demoApiToken} label="Скопировать ключ" />
            </div>
            <code className="block rounded bg-white px-3 py-2 text-xs text-[#344054] compact-text">{demoApiToken}</code>
          </div>
          <div className="rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#17202a]">Заголовок Authorization</p>
              <CopyButton value={authorizationHeader} label="Скопировать заголовок" />
            </div>
            <code className="block rounded bg-white px-3 py-2 text-xs text-[#344054] compact-text">{authorizationHeader}</code>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <h2 className="text-lg font-semibold">Ключи рабочего пространства</h2>
        </div>
        <div className="scroll-area">
          <table className="table-fixed-copy w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
              <tr>
                <th className="px-5 py-3 font-semibold">Статус</th>
                <th className="px-5 py-3 font-semibold">Название</th>
                <th className="px-5 py-3 font-semibold">Префикс</th>
                <th className="px-5 py-3 font-semibold">Права доступа</th>
                <th className="px-5 py-3 font-semibold">Использование</th>
                <th className="px-5 py-3 font-semibold">Последний успех</th>
                <th className="px-5 py-3 font-semibold">Последняя ошибка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dce5]">
              {apiTokens.map((apiToken) => {
                const health = tokenHealth(apiToken);

                return (
                  <tr key={apiToken.id}>
                    <td className="px-5 py-4">
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${health.className}`}>
                        {health.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-medium text-[#17202a]">{apiToken.name}</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#344054]">{apiToken.tokenPrefix}</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#344054]">{formatScopes(apiToken.scopes)}</td>
                    <td className="px-5 py-4 text-[#344054]">{formatDate(apiToken.lastUsedAt)}</td>
                    <td className="px-5 py-4 text-[#344054]">{formatDate(apiToken.lastSuccessAt)}</td>
                    <td className="px-5 py-4 text-[#344054]">
                      {apiToken.lastError ? `${formatDate(apiToken.lastErrorAt)} · ${apiToken.lastError}` : "Нет"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
