import { History, KeyRound, Plug } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ApiTokenCreateForm } from "@/components/admin/api-token-create-form";
import { CopyButton } from "@/components/copy-button";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { PageSkeleton } from "@/components/loading-states";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { StatKpi } from "@/components/ui/stat-kpi";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { allowedApiScopes } from "@/lib/api-token-service";
import { revokeApiTokenById } from "@/lib/api-token-actions";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { isDemoAuthEnabled, requireCurrentUserPermission } from "@/lib/current-user";
import { apiTokenPlaceholder, demoApiToken } from "@/lib/custom-api-docs";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type AdminTokensPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type TokensSection = "tokens" | "create" | "local";

const tokenSections: Array<{ value: TokensSection; label: string }> = [
  { value: "tokens", label: "Ключи" },
  { value: "create", label: "Новый ключ" },
  { value: "local", label: "Локальная проверка" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function tokensSectionParam(value: string | string[] | undefined): TokensSection {
  const section = firstParam(value);

  return tokenSections.some((item) => item.value === section) ? (section as TokensSection) : "tokens";
}

function tokensSectionHref(section: TokensSection) {
  return `/admin/tokens?section=${section}`;
}

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

function tokenHealth(token: {
  expiresAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
}): { label: string; tone: ChipTone } {
  if (token.expiresAt && token.expiresAt <= new Date()) {
    return { label: "Истек", tone: "warning" };
  }

  if (token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)) {
    return { label: "Ошибка", tone: "danger" };
  }

  if (token.lastSuccessAt) {
    return { label: "Работает", tone: "success" };
  }

  return { label: "Готов", tone: "neutral" };
}

export default function AdminTokensPage({ searchParams }: AdminTokensPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка API-токенов" />}>
      <AdminTokensPageContent searchParams={searchParams} />
    </Suspense>
  );
}

export async function AdminTokensPageContent({ searchParams }: AdminTokensPageProps) {
  const params = await searchParams;
  const activeSection = tokensSectionParam(params.section);
  const user = await requireCurrentUserPermission("api_tokens:manage");
  const apiTokens = await prisma.apiToken.findMany({
    where: {
      workspaceId: user.workspaceId
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  const demoAuthEnabled = isDemoAuthEnabled();
  const authorizationHeader = `Authorization: Bearer ${demoApiToken}`;
  const now = new Date();
  const activeTokens = apiTokens.filter((token) => !token.expiresAt || token.expiresAt > now).length;
  const tokensWithErrors = apiTokens.filter((token) => token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)).length;
  const apiTokenSetupHint = activeTokens > 0 ? null : getSettingCoachmark("apiTokens");

  return (
    <PageShell
      eyebrow="Администрирование"
      title="Ключи API"
      description="Рабочие ключи и локальный ключ для проверки интеграций. Технические поля собраны в компактные карточки."
      actions={
        <>
          <Link href={tokensSectionHref("create")} className="action-button action-button--primary">
            <KeyRound size={16} aria-hidden="true" />
            Новый ключ
          </Link>
          <Link href="/admin/integrations" className="action-button">
            <Plug size={16} aria-hidden="true" />
            Интеграции
          </Link>
          <Link href="/admin/audit" className="action-button action-button--quiet">
            <History size={16} aria-hidden="true" />
            Журнал действий
          </Link>
        </>
      }
    >
      <AdminFrame>
      <section className="ops-metric-grid" aria-label="Сводка API-ключей">
        <StatKpi label="Ключи" value={apiTokens.length} hint={`Активных: ${activeTokens}`} />
        <StatKpi
          label="Ошибки"
          value={tokensWithErrors}
          tone={tokensWithErrors > 0 ? "danger" : "neutral"}
          hint="По последней активности"
        />
        <StatKpi
          label={
            <span className="flex items-center gap-1">
              Права
              <HelpTooltip
                label="Что такое scope API-ключа?"
                content="Scope ограничивает, какие API endpoint может вызывать ключ. Для production выдавайте минимально нужный набор scope."
                placement="top-start"
              />
            </span>
          }
          value={allowedApiScopes.length}
          hint="Доступные области API"
        />
      </section>

      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы API-ключей">
        {tokenSections.map((section) => (
          <Link
            key={section.value}
            href={tokensSectionHref(section.value)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "tokens" ? (
        <section className="ops-panel" aria-labelledby="api-tokens-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Рабочее пространство</p>
              <h2 id="api-tokens-title" className="ops-panel__title">Ключи API</h2>
              <p className="ops-panel__subtitle">Статус, права и последняя активность без широкой таблицы.</p>
            </div>
            <Chip tone="neutral" size="sm" numeric>{apiTokens.length}</Chip>
          </div>
          <div className="grid gap-2 p-4">
            {apiTokenSetupHint ? (
              <CoachCallout
                title={apiTokenSetupHint.title}
                body={apiTokenSetupHint.body}
                href={apiTokenSetupHint.href}
                actionLabel={apiTokenSetupHint.actionLabel}
                variant="spotlight"
                placement="top"
                anchorLabel="Подсказка к API-ключам"
                stepIndex={1}
                dismissId="settings:apiTokens"
              />
            ) : null}
            {apiTokens.length > 0 ? (
              apiTokens.map((apiToken) => {
                const health = tokenHealth(apiToken);
                const isExpired = Boolean(apiToken.expiresAt && apiToken.expiresAt <= now);

                return (
                  <div key={apiToken.id} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">K</span>
                    <div className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="record-title record-title--tight">{apiToken.name}</span>
                        <Chip tone={health.tone} size="xs">{health.label}</Chip>
                      </span>
                      <span className="record-meta font-mono compact-text">{apiToken.tokenPrefix}</span>
                      <span className="record-meta compact-text">Права: {formatScopes(apiToken.scopes)}</span>
                      <span className="record-meta tabular-nums">
                        Использование: {formatDate(apiToken.lastUsedAt)} · успех: {formatDate(apiToken.lastSuccessAt)}
                      </span>
                      <span className="record-meta tabular-nums">Истекает: {formatDate(apiToken.expiresAt)}</span>
                      {apiToken.lastError ? (
                        <span className="record-meta compact-text tabular-nums text-[var(--danger)]">
                          Ошибка: {formatDate(apiToken.lastErrorAt)} · {apiToken.lastError}
                        </span>
                      ) : null}
                      <form action={revokeApiTokenById} className="mt-2">
                        <input type="hidden" name="tokenId" value={apiToken.id} />
                        <button
                          type="submit"
                          className="action-button action-button--small"
                          disabled={isExpired}
                          aria-label={`Отозвать ключ ${apiToken.name}`}
                        >
                          Отозвать
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                size="inline"
                icon={<KeyRound size={20} aria-hidden="true" />}
                title="Ключи еще не созданы"
                description="Создайте рабочий ключ, чтобы интеграции и кастомные источники могли обращаться к API."
                action={
                  <Link href={tokensSectionHref("create")} className="action-button action-button--small">
                    Новый ключ
                  </Link>
                }
              />
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "create" ? (
        <section className="ops-panel" aria-labelledby="new-api-token-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Выпуск</p>
              <h2 id="new-api-token-title" className="ops-panel__title">Новый рабочий ключ</h2>
              <p className="ops-panel__subtitle">Создание идет через backend-сервис, секрет показывается только один раз после выпуска.</p>
            </div>
          </div>
          <div className="p-4">
            <ApiTokenCreateForm scopes={allowedApiScopes} />
          </div>
        </section>
      ) : null}

      {activeSection === "local" ? (
        <section className="ops-panel" aria-labelledby="local-api-token-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Проверка</p>
              <h2 id="local-api-token-title" className="ops-panel__title">Локальная проверка</h2>
              <p className="ops-panel__subtitle">Плейсхолдер {apiTokenPlaceholder} и реальные значения для тестовых запросов.</p>
            </div>
          </div>
          {demoAuthEnabled ? (
            <div className="grid gap-2 p-4">
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
          ) : (
            <div className="p-4">
              <EmptyState
                size="inline"
                icon={<KeyRound size={20} aria-hidden="true" />}
                title="Демо-ключ недоступен"
                description="Демо-ключ показывается только при включенном демо-режиме."
              />
            </div>
          )}
        </section>
      ) : null}
      </AdminFrame>
    </PageShell>
  );
}
