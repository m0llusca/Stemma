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
    <section className="page-shell admin-shell">
      <div className="admin-hero">
        <div>
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Ключи API</h1>
          <p className="page-subtitle">
            Рабочие ключи и локальный ключ для проверки интеграций. Технические поля собраны в компактные карточки.
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/integrations?setup=1#connect" className="action-button action-button--primary">
            К интеграциям
          </Link>
          <Link href="/admin/audit" className="action-button">
            Журнал действий
          </Link>
        </div>
      </div>

      <section className="panel overflow-hidden">
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
          <p className="mt-1 text-sm text-[#667085]">Статус, права и последняя активность без широкой таблицы.</p>
        </div>
        <div className="record-list p-5">
          {apiTokens.map((apiToken) => {
            const health = tokenHealth(apiToken);
            const healthTone = health.label === "Ошибка" ? "pill--warn" : health.label === "Работает" ? "pill--ok" : "pill--neutral";

            return (
              <article key={apiToken.id} className="record-card">
                <div className="record-row">
                  <div className="min-w-0">
                    <h3 className="record-title">{apiToken.name}</h3>
                    <p className="record-meta mt-1 font-mono compact-text">{apiToken.tokenPrefix}</p>
                  </div>
                  <span className={`pill ${healthTone}`}>{health.label}</span>
                </div>
                <p className="record-meta compact-text">Права доступа: {formatScopes(apiToken.scopes)}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  <p className="record-meta">Использование: {formatDate(apiToken.lastUsedAt)}</p>
                  <p className="record-meta">Последний успех: {formatDate(apiToken.lastSuccessAt)}</p>
                  <p className="record-meta compact-text">
                    Последняя ошибка: {apiToken.lastError ? `${formatDate(apiToken.lastErrorAt)} · ${apiToken.lastError}` : "Нет"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
