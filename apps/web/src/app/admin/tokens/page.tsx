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
    return { label: "Ошибка", className: "bg-[#fff7ed] text-[#b45309]" };
  }

  if (token.lastSuccessAt) {
    return { label: "Работает", className: "bg-[#edf2ff] text-[#3157d5]" };
  }

  return { label: "Готов", className: "bg-[#edf2ff] text-[#1d3fae]" };
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
      <div className="command-center">
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

      <section className="admin-group-grid admin-group-grid--two" aria-label="Ключи API">
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Локальная проверка</h2>
            <p className="text-sm leading-5 text-[#64748b]">
              Плейсхолдер {apiTokenPlaceholder} и реальные значения для тестовых запросов.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="admin-tile admin-tile--compact">
              <span className="admin-tile__icon admin-tile__icon--plain">K</span>
              <div className="admin-tile__body">
                <span className="record-row">
                  <span className="record-title">Ключ</span>
                  <CopyButton value={demoApiToken} label="Скопировать ключ" />
                </span>
                <code className="inline-code-box compact-text">{demoApiToken}</code>
              </div>
            </div>
            <div className="admin-tile admin-tile--compact">
              <span className="admin-tile__icon admin-tile__icon--plain">A</span>
              <div className="admin-tile__body">
                <span className="record-row">
                  <span className="record-title">Заголовок Authorization</span>
                  <CopyButton value={authorizationHeader} label="Скопировать заголовок" />
                </span>
                <code className="inline-code-box compact-text">{authorizationHeader}</code>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Ключи рабочего пространства</h2>
            <p className="text-sm leading-5 text-[#64748b]">Статус, права и последняя активность без широкой таблицы.</p>
          </div>
          <div className="grid gap-2">
            {apiTokens.length > 0 ? (
              apiTokens.map((apiToken) => {
                const health = tokenHealth(apiToken);
                const healthTone = health.label === "Ошибка" ? "pill--warn" : health.label === "Работает" ? "pill--ok" : "pill--neutral";

                return (
                  <div key={apiToken.id} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">K</span>
                    <div className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="record-title record-title--tight">{apiToken.name}</span>
                        <span className={`pill ${healthTone}`}>{health.label}</span>
                      </span>
                      <span className="record-meta font-mono compact-text">{apiToken.tokenPrefix}</span>
                      <span className="record-meta compact-text">Права: {formatScopes(apiToken.scopes)}</span>
                      <span className="record-meta">
                        Использование: {formatDate(apiToken.lastUsedAt)} · успех: {formatDate(apiToken.lastSuccessAt)}
                      </span>
                      {apiToken.lastError ? (
                        <span className="record-meta compact-text text-[#b91c1c]">
                          Ошибка: {formatDate(apiToken.lastErrorAt)} · {apiToken.lastError}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="soft-callout text-sm text-[#64748b]">Ключи еще не созданы.</div>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
