import type { AuthSessionStatus, IdentityProvider, IdentityProviderType, RoleName } from "@prisma/client";
import { KeyRound, Link2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  revokeAuthSessionById,
  saveGroupRoleMapping,
  saveIdentityProvider,
  toggleGroupRoleMapping
} from "@/lib/auth-provider-actions";
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
    return "border-[#b9ddd2] bg-[#f4faf7] text-[#116466]";
  }

  if (status === "draft") {
    return "border-[#fed7aa] bg-[#fffaf5] text-[#b54708]";
  }

  if (status === "disabled" || status === "REVOKED" || status === "EXPIRED") {
    return "border-[#d7dce5] bg-[#f7f8fb] text-[#667085]";
  }

  return "border-[#d7dce5] bg-white text-[#344054]";
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
  type = "text"
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[#344054]">
      {label}
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="rounded border border-[#d7dce5] bg-white px-3 py-2"
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
  const entraMetadata =
    selectedProvider?.type === "MICROSOFT_ENTRA_ID" || selectedProvider?.type === "OIDC"
      ? buildEntraAuthorizationMetadata(selectedProvider)
      : null;
  const guidance = getDirectoryIntegrationGuidance();

  return (
    <section className="page-shell">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#667085]">Администрирование</p>
          <h1 className="mt-1 text-2xl font-semibold">Доступ и SSO</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#667085]">
            Настройка сквозной авторизации, связки AD/Entra-групп с ролями и контроль активных сессий.
          </p>
        </div>
        <Link
          href={`/auth/login?provider=${selectedProvider?.slug ?? "microsoft-entra-id"}&returnTo=/reviews`}
          className="inline-flex items-center gap-2 rounded border border-[#116466] bg-white px-4 py-2 text-sm font-semibold text-[#0b4f52] hover:bg-[#eef4f4]"
        >
          <KeyRound size={16} aria-hidden="true" />
          Проверить вход
        </Link>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {providers.map((provider) => (
          <Link
            key={provider.id}
            href={`/admin/access?provider=${provider.id}`}
            className={`rounded-md border bg-white p-4 shadow-sm hover:border-[#116466] ${
              selectedProvider?.id === provider.id ? "border-[#116466] ring-2 ring-[#e8f3ef]" : "border-[#d7dce5]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-[#17202a]">{provider.name}</h2>
                <p className="mt-1 text-sm text-[#667085]">{providerTypeLabels[provider.type]}</p>
              </div>
              <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(provider.status)}`}>{provider.status}</span>
            </div>
            <p className="mt-3 text-sm text-[#667085]">
              Групп: {provider.groupRoleMappings.length} · пользователей: {provider._count.externalIdentities}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Провайдер авторизации</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Для Active Directory предпочтителен Microsoft Entra ID через OIDC. LDAPS оставлен для закрытых on-prem установок.
            </p>
          </div>
          <form action={saveIdentityProvider} className="grid gap-5 p-5">
            <input type="hidden" name="providerId" value={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.id ?? ""} />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Тип
                <select name="type" defaultValue={selectedProviderType} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
                  {providerTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Статус
                <select name="status" defaultValue={selectedProvider?.status ?? "draft"} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
                  <option value="draft">Черновик</option>
                  <option value="active">Активен</option>
                  <option value="disabled">Отключен</option>
                </select>
              </label>
              <ProviderField label="Название" name="name" defaultValue={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.name} placeholder="Microsoft Entra ID" />
              <ProviderField label="Slug для входа" name="slug" defaultValue={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.slug} placeholder="microsoft-entra-id" />
              <ProviderField label="Tenant ID" name="tenantId" defaultValue={selectedProvider?.tenantId} placeholder="00000000-0000-0000-0000-000000000000" />
              <ProviderField label="Client ID" name="clientId" defaultValue={selectedProvider?.clientId} placeholder="Application client ID" />
              <ProviderField label="Ссылка на секрет" name="clientSecretRef" defaultValue={selectedProvider?.clientSecretRef} placeholder="env:QC_ENTRA_CLIENT_SECRET" />
              <ProviderField label="Scopes" name="scopes" defaultValue={selectedProvider?.scopes ?? "openid profile email"} />
            </div>

            <details className="rounded-md border border-[#d7dce5] bg-[#fbfcfd]">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#344054]">
                OIDC/SAML endpoints и расширенная конфигурация
              </summary>
              <div className="grid gap-4 border-t border-[#d7dce5] p-4 md:grid-cols-2">
                <ProviderField label="Issuer" name="issuer" defaultValue={selectedProvider?.issuer} placeholder="https://login.microsoftonline.com/{tenantId}/v2.0" />
                <ProviderField label="Authorization URL" name="authorizationUrl" defaultValue={selectedProvider?.authorizationUrl} />
                <ProviderField label="Token URL" name="tokenUrl" defaultValue={selectedProvider?.tokenUrl} />
                <ProviderField label="JWKS URL" name="jwksUrl" defaultValue={selectedProvider?.jwksUrl} />
                <label className="grid gap-1 text-sm font-medium text-[#344054] md:col-span-2">
                  Дополнительная конфигурация JSON
                  <textarea
                    name="configJson"
                    defaultValue={configText(selectedProvider)}
                    rows={5}
                    className="rounded border border-[#d7dce5] bg-white px-3 py-2 font-mono text-xs"
                    placeholder='{"roleSource":"groups"}'
                  />
                </label>
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4 text-sm text-[#667085]">
              <div className="min-w-0">
                <p className="font-semibold text-[#344054]">Callback URL</p>
                <p className="mt-1 font-mono text-xs compact-text">{callbackPath()}</p>
              </div>
              {entraMetadata ? (
                <p className="max-w-xl text-xs leading-5">
                  Entra metadata: authorization endpoint строится от tenantId, flow — {entraMetadata.recommendedFlow}.
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <button type="submit" className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
                Сохранить провайдера
              </button>
            </div>
          </form>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Рекомендации</h2>
          </div>
          <div className="grid gap-3 p-5 text-sm leading-6 text-[#667085]">
            <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
              <p className="font-semibold text-[#17202a]">Основной путь</p>
              <p className="mt-1">{guidance.preferred}</p>
            </div>
            <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
              <p className="font-semibold text-[#17202a]">On-prem AD</p>
              <p className="mt-1">{guidance.onPremDirectory}</p>
            </div>
            <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
              <p className="font-semibold text-[#17202a]">Роли</p>
              <p className="mt-1">{guidance.authorization}</p>
            </div>
            {selectedProvider && selectedProvider.type !== "DEMO" ? (
              <form action={queueDirectorySync}>
                <input type="hidden" name="providerId" value={selectedProvider.id} />
                <button type="submit" className="inline-flex items-center gap-2 rounded border border-[#116466] bg-white px-3 py-2 text-sm font-semibold text-[#0b4f52] hover:bg-[#eef4f4]">
                  <ShieldCheck size={16} aria-hidden="true" />
                  Запланировать синхронизацию
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </div>

      {selectedProvider ? (
        <section className="panel mt-6 overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Группы и роли</h2>
            <p className="mt-1 text-sm text-[#667085]">Маппинг групп AD/Entra в роли приложения. Приоритет меньше — роль применяется раньше.</p>
          </div>
          <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-3">
              {selectedProvider.groupRoleMappings.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#d7dce5] bg-[#fbfcfd] p-4 text-sm text-[#667085]">
                  Для выбранного провайдера пока нет групп.
                </div>
              ) : (
                selectedProvider.groupRoleMappings.map((mapping) => (
                  <article key={mapping.id} className="grid gap-3 rounded-md border border-[#d7dce5] bg-white p-4 md:grid-cols-[minmax(0,1fr)_130px_100px_auto] md:items-center">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#17202a]">{mapping.externalGroupName}</h3>
                      <p className="mt-1 font-mono text-xs text-[#667085] compact-text">{mapping.externalGroupId}</p>
                    </div>
                    <span className="w-fit rounded-md bg-[#eef4f4] px-2 py-1 text-xs font-semibold text-[#0b4f52]">
                      {roleLabels[mapping.role]}
                    </span>
                    <p className="text-sm text-[#667085]">Приоритет {mapping.priority}</p>
                    <form action={toggleGroupRoleMapping}>
                      <input type="hidden" name="mappingId" value={mapping.id} />
                      <input type="hidden" name="isActive" value={mapping.isActive ? "false" : "true"} />
                      <button type="submit" className={`rounded border px-3 py-2 text-sm font-semibold ${mapping.isActive ? "border-[#d7dce5] text-[#667085] hover:bg-[#f7f8fb]" : "border-[#116466] text-[#0b4f52] hover:bg-[#eef4f4]"}`}>
                        {mapping.isActive ? "Отключить" : "Включить"}
                      </button>
                    </form>
                  </article>
                ))
              )}
            </div>

            <form action={saveGroupRoleMapping} className="grid gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
              <input type="hidden" name="providerId" value={selectedProvider.id} />
              <h3 className="font-semibold text-[#17202a]">Добавить группу</h3>
              <ProviderField label="ID группы" name="externalGroupId" placeholder="QC_Analysts или GUID группы" />
              <ProviderField label="Название группы" name="externalGroupName" placeholder="QC Analysts" />
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Роль
                <select name="role" defaultValue="QA_ANALYST" className="rounded border border-[#d7dce5] bg-white px-3 py-2">
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </label>
              <ProviderField label="Приоритет" name="priority" defaultValue="100" type="number" />
              <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
                <input type="checkbox" name="isActive" defaultChecked />
                Активна
              </label>
              <button type="submit" className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
                Сохранить группу
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <h2 className="text-lg font-semibold">Сессии пользователей</h2>
          <p className="mt-1 text-sm text-[#667085]">Последние 40 сессий: источник входа, пользователь и возможность отзыва.</p>
        </div>
        <div className="scroll-area">
          <table className="table-fixed-copy w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
              <tr>
                <th className="px-5 py-3 font-semibold">Статус</th>
                <th className="px-5 py-3 font-semibold">Пользователь</th>
                <th className="px-5 py-3 font-semibold">Провайдер</th>
                <th className="px-5 py-3 font-semibold">Создана</th>
                <th className="px-5 py-3 font-semibold">Последняя активность</th>
                <th className="px-5 py-3 font-semibold">Истекает</th>
                <th className="px-5 py-3 font-semibold">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dce5] bg-white">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-5 text-[#667085]">
                    Сессий пока нет.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-5 py-4">
                      <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(session.status)}`}>
                        {sessionStatusLabels[session.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-[#17202a]">{session.user.name}</p>
                      <p className="mt-1 text-xs text-[#667085]">{session.user.email}</p>
                    </td>
                    <td className="px-5 py-4 text-[#344054]">{session.provider?.name ?? "Без провайдера"}</td>
                    <td className="px-5 py-4 text-[#344054]">{formatDate(session.createdAt)}</td>
                    <td className="px-5 py-4 text-[#344054]">{formatDate(session.lastSeenAt)}</td>
                    <td className="px-5 py-4 text-[#344054]">{formatDate(session.expiresAt)}</td>
                    <td className="px-5 py-4">
                      {session.status === "ACTIVE" ? (
                        <form action={revokeAuthSessionById}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <button type="submit" className="rounded border border-[#d7dce5] bg-white px-3 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f7f8fb]">
                            Отозвать
                          </button>
                        </form>
                      ) : (
                        <span className="text-[#98a2b3]">Нет</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 rounded-md border border-[#d7dce5] bg-white p-4 text-sm text-[#667085]">
        <Link2 size={16} className="mr-2 inline-block align-[-3px]" aria-hidden="true" />
        Для входа через выбранный провайдер используйте{" "}
        <code className="rounded bg-[#f7f8fb] px-1.5 py-0.5 text-xs text-[#344054]">
          /auth/login?provider={selectedProvider?.slug ?? "microsoft-entra-id"}
        </code>
        .
      </div>
    </section>
  );
}
