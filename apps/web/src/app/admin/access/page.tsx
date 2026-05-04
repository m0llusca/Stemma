import type { AuthSessionStatus, IdentityProvider, IdentityProviderType, RoleName } from "@prisma/client";
import { KeyRound, Link2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  revokeAuthSessionById,
  saveGroupRoleMapping,
  saveIdentityProvider,
  toggleGroupRoleMapping
} from "@/lib/auth-provider-actions";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { buildEntraAuthorizationMetadata, getDirectoryIntegrationGuidance } from "@/lib/auth/providers";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { queueDirectorySync } from "@/lib/system-actions";

export const dynamic = "force-dynamic";

type AccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const providerTypeLabels: Record<IdentityProviderType, string> = {
  DEMO: "Демо",
  MICROSOFT_ENTRA_ID: "Microsoft Entra ID",
  ACTIVE_DIRECTORY_LDAPS: "Active Directory LDAPS",
  OIDC: "OIDC",
  SAML: "SAML"
};

const sessionStatusLabels: Record<AuthSessionStatus, string> = {
  ACTIVE: "Активна",
  REVOKED: "Отозвана",
  EXPIRED: "Истекла"
};

const providerTypes: Array<{ value: Exclude<IdentityProviderType, "DEMO">; label: string }> = [
  { value: "MICROSOFT_ENTRA_ID", label: "Microsoft Entra ID" },
  { value: "OIDC", label: "OIDC" },
  { value: "SAML", label: "SAML" },
  { value: "ACTIVE_DIRECTORY_LDAPS", label: "Active Directory LDAPS" }
];

const roles: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function statusTone(status: string) {
  if (status === "active" || status === "ACTIVE") {
    return "border-[#bbf7d0] bg-[#ecfdf5] text-[#3157d5]";
  }

  if (status === "draft") {
    return "border-[#fed7aa] bg-[#fff7ed] text-[#b45309]";
  }

  if (status === "disabled" || status === "REVOKED" || status === "EXPIRED") {
    return "border-[#d9e0ea] bg-[#f8fafc] text-[#64748b]";
  }

  return "border-[#d9e0ea] bg-white text-[#334155]";
}

function providerStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Активен",
    draft: "Черновик",
    disabled: "Отключен"
  };

  return labels[status] ?? status;
}

function configText(provider: IdentityProvider | null | undefined) {
  if (!provider?.configJson) {
    return "";
  }

  try {
    return JSON.stringify(JSON.parse(provider.configJson), null, 2);
  } catch {
    return provider.configJson;
  }
}

function callbackPath() {
  return "/auth/callback";
}

function ProviderField({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[#334155]">
      {label}
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
        className="form-control"
      />
    </label>
  );
}

export default async function AdminAccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams;
  const user = await requireCurrentUserPermission("auth_providers:manage");
  const [providers, sessions] = await Promise.all([
    prisma.identityProvider.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        groupRoleMappings: {
          orderBy: [{ isActive: "desc" }, { priority: "asc" }, { role: "asc" }]
        },
        _count: {
          select: {
            externalIdentities: true,
            authSessions: true
          }
        }
      }
    }),
    prisma.authSession.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ lastSeenAt: "desc" }],
      take: 40,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        provider: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    })
  ]);
  const selectedProviderId = firstParam(params.provider);
  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers.find((provider) => provider.type !== "DEMO") ??
    null;
  const selectedProviderType = selectedProvider?.type === "DEMO" ? "MICROSOFT_ENTRA_ID" : selectedProvider?.type ?? "MICROSOFT_ENTRA_ID";
  const openProviderSettings = firstParam(params.section) === "provider";
  const openSessions = firstParam(params.section) === "sessions";
  const entraMetadata =
    selectedProvider?.type === "MICROSOFT_ENTRA_ID" || selectedProvider?.type === "OIDC"
      ? buildEntraAuthorizationMetadata(selectedProvider)
      : null;
  const guidance = getDirectoryIntegrationGuidance();
  const selectedProviderLoginPath = `/auth/login?provider=${encodeURIComponent(
    selectedProvider?.slug ?? "microsoft-entra-id"
  )}&workspaceId=${encodeURIComponent(selectedProvider?.workspaceId ?? user.workspaceId)}&returnTo=/reviews`;

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div>
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Доступ и SSO</h1>
          <p className="page-subtitle">
            Настройка сквозной авторизации, связки AD/Entra-групп с ролями и контроль активных сессий.
          </p>
        </div>
        <div className="admin-actions">
          <Link href={selectedProviderLoginPath} className="action-button action-button--primary">
            <KeyRound size={16} aria-hidden="true" />
            Проверить вход
          </Link>
          <Link href="/admin/access?section=provider" className="action-button">
            Провайдер
          </Link>
          <Link href="/admin/access?section=sessions" className="action-button action-button--quiet">
            Сессии
          </Link>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-[#d9e0ea] px-5 py-4">
          <h2 className="text-lg font-semibold">Провайдеры входа</h2>
          <p className="mt-1 text-sm text-[#64748b]">Выберите источник авторизации, чтобы ниже открыть настройки и связи групп.</p>
        </div>
        <div className="command-list">
          {providers.map((provider) => (
            <Link
              key={provider.id}
              href={`/admin/access?provider=${provider.id}`}
              className={`command-row ${selectedProvider?.id === provider.id ? "bg-[#f8faff]" : ""}`}
            >
              <span className="command-row__icon">
                <ShieldCheck size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="record-title">{provider.name}</h3>
                  <span className={`w-fit whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(provider.status)}`}>
                    {providerStatusLabel(provider.status)}
                  </span>
                </div>
                <p className="record-meta mt-1">
                  {providerTypeLabels[provider.type]} · групп: {provider.groupRoleMappings.length} · пользователей:{" "}
                  {provider._count.externalIdentities}
                </p>
              </div>
              <span className="command-row__action text-sm font-semibold text-[#1d3fae]">
                {selectedProvider?.id === provider.id ? "Выбран" : "Открыть"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <details className="disclosure-panel panel overflow-hidden" open={openProviderSettings}>
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Провайдер авторизации</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Основные поля скрыты, чтобы экран не превращался в форму настроек.
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-[#1d3fae]">Изменить</span>
          </summary>
          <form action={saveIdentityProvider} className="grid gap-5 p-5">
            <input type="hidden" name="providerId" value={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.id ?? ""} />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Тип
                <select name="type" defaultValue={selectedProviderType} className="form-control">
                  {providerTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Статус
                <select name="status" defaultValue={selectedProvider?.status ?? "draft"} className="form-control">
                  <option value="draft">Черновик</option>
                  <option value="active">Активен</option>
                  <option value="disabled">Отключен</option>
                </select>
              </label>
              <ProviderField label="Название" name="name" required defaultValue={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.name} placeholder="Microsoft Entra ID" />
              <ProviderField label="Slug для входа" name="slug" required defaultValue={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.slug} placeholder="microsoft-entra-id" />
              <ProviderField label="Tenant ID" name="tenantId" defaultValue={selectedProvider?.tenantId} placeholder="00000000-0000-0000-0000-000000000000" />
              <ProviderField label="Client ID" name="clientId" defaultValue={selectedProvider?.clientId} placeholder="Application client ID" />
              <ProviderField label="Ссылка на секрет" name="clientSecretRef" defaultValue={selectedProvider?.clientSecretRef} placeholder="env:QC_ENTRA_CLIENT_SECRET" />
              <ProviderField label="Scopes" name="scopes" defaultValue={selectedProvider?.scopes ?? "openid profile email"} />
            </div>

            <details className="compact-details">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#334155]">
                OIDC/SAML endpoints и расширенная конфигурация
              </summary>
              <div className="grid gap-4 border-t border-[#d9e0ea] p-4 md:grid-cols-2">
                <ProviderField label="Issuer" name="issuer" defaultValue={selectedProvider?.issuer} placeholder="https://login.microsoftonline.com/{tenantId}/v2.0" />
                <ProviderField label="Authorization URL" name="authorizationUrl" defaultValue={selectedProvider?.authorizationUrl} />
                <ProviderField label="Token URL" name="tokenUrl" defaultValue={selectedProvider?.tokenUrl} />
                <ProviderField label="JWKS URL" name="jwksUrl" defaultValue={selectedProvider?.jwksUrl} />
                <label className="grid gap-1 text-sm font-medium text-[#334155] md:col-span-2">
                  <textarea
                    name="configJson"
                    defaultValue={configText(selectedProvider)}
                    rows={5}
                    className="form-control font-mono text-xs"
                    placeholder='{"roleSource":"groups"}'
                  />
                </label>
              </div>
            </details>

            <div className="soft-callout text-sm text-[#64748b]">
              <div className="min-w-0">
                <p className="font-semibold text-[#334155]">Callback URL</p>
                <p className="mt-1 font-mono text-xs compact-text">{callbackPath()}</p>
              </div>
              {entraMetadata ? (
                <p className="max-w-xl text-xs leading-5">
                  Entra metadata: authorization endpoint строится от tenantId, flow — {entraMetadata.recommendedFlow}.
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <ValidatedSubmitButton>
                Сохранить провайдера
              </ValidatedSubmitButton>
            </div>
          </form>
        </details>

        <details className="disclosure-panel panel overflow-hidden">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Рекомендации</h2>
              <p className="mt-1 text-sm text-[#64748b]">Короткие подсказки по AD/Entra и fallback-сценариям.</p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-[#1d3fae]">Показать</span>
          </summary>
          <div className="record-list px-5 text-sm leading-6 text-[#64748b]">
            <article className="record-card">
              <h3 className="record-title">Основной путь</h3>
              <p className="record-meta">{guidance.preferred}</p>
            </article>
            <article className="record-card">
              <h3 className="record-title">On-prem AD</h3>
              <p className="record-meta">{guidance.onPremDirectory}</p>
            </article>
            <article className="record-card">
              <h3 className="record-title">Роли</h3>
              <p className="record-meta">{guidance.authorization}</p>
            </article>
            {selectedProvider && selectedProvider.type !== "DEMO" ? (
              <form action={queueDirectorySync} className="py-4">
                <input type="hidden" name="providerId" value={selectedProvider.id} />
                <button type="submit" className="action-button min-h-[36px] px-3 py-2 text-sm">
                  <ShieldCheck size={16} aria-hidden="true" />
                  Запланировать синхронизацию
                </button>
              </form>
            ) : null}
          </div>
        </details>
      </div>

      {selectedProvider ? (
        <section className="panel mt-6 overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">Группы и роли</h2>
            <p className="mt-1 text-sm text-[#64748b]">Маппинг групп AD/Entra в роли приложения. Приоритет меньше — роль применяется раньше.</p>
          </div>
          <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="record-list border-y border-[#d9e0ea]">
              {selectedProvider.groupRoleMappings.length === 0 ? (
                <div className="soft-callout text-sm text-[#64748b]">
                  Для выбранного провайдера пока нет групп.
                </div>
              ) : (
                selectedProvider.groupRoleMappings.map((mapping) => (
                  <article key={mapping.id} className="record-card">
                    <div className="record-row">
                      <div className="min-w-0">
                        <h3 className="record-title">{mapping.externalGroupName}</h3>
                        <p className="record-meta mt-1 font-mono compact-text">{mapping.externalGroupId}</p>
                      </div>
                      <span className="pill pill--neutral">{roleLabels[mapping.role]}</span>
                    </div>
                    <div className="record-row">
                      <p className="record-meta">Приоритет {mapping.priority}</p>
                      <form action={toggleGroupRoleMapping}>
                        <input type="hidden" name="mappingId" value={mapping.id} />
                        <input type="hidden" name="isActive" value={mapping.isActive ? "false" : "true"} />
                        <button type="submit" className={`action-button min-h-[36px] px-3 py-2 text-sm ${mapping.isActive ? "" : "action-button--primary"}`}>
                          {mapping.isActive ? "Отключить" : "Включить"}
                        </button>
                      </form>
                    </div>
                  </article>
                ))
              )}
            </div>

            <details className="compact-details">
              <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <h3 className="font-semibold text-[#111827]">Добавить группу</h3>
                <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#1d3fae]">Открыть</span>
              </summary>
              <form action={saveGroupRoleMapping} className="grid gap-3 border-t border-[#d9e0ea] p-4">
                <input type="hidden" name="providerId" value={selectedProvider.id} />
                <ProviderField label="ID группы" name="externalGroupId" required placeholder="QC_Analysts или GUID группы" />
                <ProviderField label="Название группы" name="externalGroupName" required placeholder="QC Analysts" />
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
                  Роль
                  <select name="role" defaultValue="QA_ANALYST" className="form-control">
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <ProviderField label="Приоритет" name="priority" defaultValue="100" type="number" />
                <label className="flex items-center gap-2 text-sm font-medium text-[#334155]">
                  <input type="checkbox" name="isActive" defaultChecked />
                  Активна
                </label>
                <ValidatedSubmitButton>
                  Сохранить группу
                </ValidatedSubmitButton>
              </form>
            </details>
          </div>
        </section>
      ) : null}

      <details className="disclosure-panel panel mt-6 overflow-hidden" open={openSessions}>
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Сессии пользователей</h2>
            <p className="mt-1 text-sm text-[#64748b]">Последние 40 сессий: источник входа, пользователь и возможность отзыва.</p>
          </div>
          <span className="shrink-0 rounded-md bg-[#edf2ff] px-2 py-1 text-xs font-semibold text-[#1d3fae]">{sessions.length}</span>
        </summary>
        <div className="record-list px-5">
          {sessions.length === 0 ? (
            <div className="soft-callout text-sm text-[#64748b]">
              Сессий пока нет.
            </div>
          ) : (
            sessions.map((session) => (
              <article key={session.id} className="record-card">
                <div className="record-row">
                  <div className="min-w-0">
                    <h3 className="record-title">{session.user.name}</h3>
                    <p className="record-meta mt-1">{session.user.email}</p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(session.status)}`}>
                    {sessionStatusLabels[session.status]}
                  </span>
                </div>
                <p className="record-meta">
                  Провайдер: {session.provider?.name ?? "Без провайдера"} · последняя активность: {formatDate(session.lastSeenAt)}
                </p>
                <div className="record-row">
                  <p className="record-meta">
                    Создана: {formatDate(session.createdAt)} · истекает: {formatDate(session.expiresAt)}
                  </p>
                  {session.status === "ACTIVE" ? (
                    <form action={revokeAuthSessionById}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <button type="submit" className="action-button min-h-[36px] px-3 py-2 text-sm">
                        Отозвать
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </details>

      <div className="soft-callout mt-6 text-sm text-[#64748b]">
        <Link2 size={16} className="mr-2 inline-block align-[-3px]" aria-hidden="true" />
        Для входа через выбранный провайдер используйте{" "}
        <code className="rounded bg-[#f8fafc] px-1.5 py-0.5 text-xs text-[#334155]">
          {selectedProviderLoginPath}
        </code>
        .
      </div>
    </section>
  );
}
