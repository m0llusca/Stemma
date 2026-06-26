import type { AuthSessionStatus, IdentityProvider, IdentityProviderType, RoleName } from "@prisma/client";
import { KeyRound, Link2, ShieldCheck, UsersRound } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import {
  revokeAuthSessionById,
  saveGroupRoleMapping,
  saveIdentityProvider,
  toggleGroupRoleMapping
} from "@/lib/auth-provider-actions";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { ScimTokenManager } from "@/components/admin/scim-token-manager";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { sanitizeProviderConfigForDisplay } from "@/lib/auth/provider-config-validation";
import { buildEntraAuthorizationMetadata, getDirectoryIntegrationGuidance } from "@/lib/auth/providers";
import { buildSamlServiceProviderUrls } from "@/lib/auth/saml";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { queueDirectorySync } from "@/lib/system-enqueue-actions";

export const dynamic = "force-dynamic";

type AccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type AccessSection = "overview" | "provider" | "scim" | "mappings" | "sessions" | "recommendations";

const accessSections: Array<{ value: AccessSection; label: string }> = [
  { value: "overview", label: "Провайдеры" },
  { value: "provider", label: "Настройка" },
  { value: "scim", label: "SCIM" },
  { value: "mappings", label: "Группы и роли" },
  { value: "sessions", label: "Сессии" },
  { value: "recommendations", label: "Рекомендации" }
];

const providerTypeLabels: Record<IdentityProviderType, string> = {
  DEMO: "Демо",
  MICROSOFT_ENTRA_ID: "Microsoft Entra ID",
  ACTIVE_DIRECTORY_LDAPS: "Active Directory через LDAPS",
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
  { value: "ACTIVE_DIRECTORY_LDAPS", label: "Active Directory через LDAPS" }
];

const emptyStateClass = "soft-callout ops-empty text-sm leading-5 text-[var(--text-muted)]";
const roles: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"];
const interactiveSsoTypes: IdentityProviderType[] = ["MICROSOFT_ENTRA_ID", "OIDC", "SAML"];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function accessSectionParam(value: string | string[] | undefined): AccessSection {
  const section = firstParam(value);

  return accessSections.some((item) => item.value === section) ? (section as AccessSection) : "overview";
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function statusTone(status: string) {
  if (status === "active" || status === "ACTIVE") {
    return "pill--ok";
  }

  if (status === "draft") {
    return "pill--warn";
  }

  return "pill--neutral";
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
  return sanitizeProviderConfigForDisplay(provider?.configJson);
}

function configObject(provider: IdentityProvider | null | undefined): Record<string, unknown> {
  if (!provider?.configJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(provider.configJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function hasStringEntry(value: unknown) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);
}

function hasSamlIdpCertificates(provider: IdentityProvider) {
  const config = configObject(provider);

  return Boolean(
    provider.samlCertificateRef?.trim() ||
      hasStringEntry(config.idpCertRefs) ||
      hasStringEntry(config.idpCerts)
  );
}

function hasSamlIdpSsoUrl(provider: IdentityProvider) {
  const config = configObject(provider);
  return Boolean(provider.authorizationUrl?.trim() || (typeof config.idpSsoUrl === "string" && config.idpSsoUrl.trim()));
}

function ldapsConfig(provider: IdentityProvider) {
  const config = configObject(provider);
  const ldaps = config.ldaps && typeof config.ldaps === "object" && !Array.isArray(config.ldaps) ? (config.ldaps as Record<string, unknown>) : config;

  return {
    userSearchBase: typeof ldaps.userSearchBase === "string" ? ldaps.userSearchBase.trim() : "",
    groupSearchBase: typeof ldaps.groupSearchBase === "string" ? ldaps.groupSearchBase.trim() : "",
    userFilter: typeof ldaps.userFilter === "string" ? ldaps.userFilter.trim() : "",
    groupFilter: typeof ldaps.groupFilter === "string" ? ldaps.groupFilter.trim() : "",
    nestedGroups: ldaps.nestedGroups === true,
    caConfigured: hasStringEntry(ldaps.caCertRefs) || hasStringEntry(ldaps.caCertRef) || hasStringEntry(ldaps.caFileRefs) || hasStringEntry(ldaps.caFileRef)
  };
}

function callbackPath(provider: IdentityProvider | null | undefined) {
  return provider?.type === "SAML" ? "/auth/saml/acs" : "/auth/callback";
}

function providerReadiness(provider: IdentityProvider | null | undefined) {
  if (!provider) {
    return {
      label: "Не выбран",
      tone: "pill--neutral",
      canTest: false,
      canDirectorySync: false,
      canDryRun: false,
      details: ["Создайте или выберите провайдера"]
    };
  }

  if (provider.type === "DEMO") {
    return {
      label: "Демо",
      tone: "pill--neutral",
      canTest: false,
      canDirectorySync: false,
      canDryRun: false,
      details: ["Демо-провайдер не используется для боевого SSO"]
    };
  }

  if (provider.type === "ACTIVE_DIRECTORY_LDAPS") {
    const missing: string[] = [];
    const config = ldapsConfig(provider);

    if (!provider.ldapsUrl?.startsWith("ldaps://")) missing.push("LDAPS URL");
    if (!provider.ldapsBindDn?.trim()) missing.push("Bind DN");
    if (!provider.ldapsBindSecretRef?.trim()) missing.push("Bind secret ref");
    if (!config.userSearchBase) missing.push("userSearchBase");
    if (!config.groupSearchBase) missing.push("groupSearchBase");

    if (missing.length > 0) {
      return {
        label: "Неполная LDAPS-конфигурация",
        tone: "pill--warn",
        canTest: false,
        canDirectorySync: false,
        canDryRun: false,
        details: missing
      };
    }

    return {
      label: provider.status === "active" ? "Готов к live-проверке" : "Готов к dry-run",
      tone: provider.status === "active" ? "pill--ok" : "pill--warn",
      canTest: false,
      canDirectorySync: provider.status === "active",
      canDryRun: true,
      details: [
        "Только синхронизация каталога, не LDAP password login",
        config.nestedGroups ? "Nested groups включены" : "Nested groups выключены",
        config.caConfigured ? "Custom CA настроен" : "Используется системное доверие TLS"
      ]
    };
  }

  if (!interactiveSsoTypes.includes(provider.type)) {
    return {
      label: "Только каталог",
      tone: "pill--neutral",
      canTest: false,
      canDirectorySync: provider.status === "active",
      canDryRun: false,
      details: ["Интерактивный SSO для этого типа пока не подключен"]
    };
  }

  const missing: string[] = [];

  if ((provider.type === "MICROSOFT_ENTRA_ID" || provider.type === "OIDC") && !provider.clientId) {
    missing.push("Идентификатор приложения");
  }
  if (provider.type === "MICROSOFT_ENTRA_ID" && !provider.tenantId) missing.push("Идентификатор каталога");
  if (provider.type === "OIDC" && !provider.issuer) missing.push("Issuer");
  if (provider.type === "OIDC" && !provider.authorizationUrl) missing.push("Адрес авторизации");
  if (provider.type === "OIDC" && !provider.tokenUrl) missing.push("Адрес токена");
  if (provider.type === "OIDC" && !provider.jwksUrl) missing.push("Адрес ключей JWKS");
  if (provider.type === "SAML" && !hasSamlIdpSsoUrl(provider)) missing.push("IdP SSO URL");
  if (provider.type === "SAML" && !hasSamlIdpCertificates(provider)) missing.push("Сертификат IdP или env-ссылка");

  if (provider.status !== "active") {
    return {
      label: provider.status === "disabled" ? "Отключен" : "Черновик",
      tone: provider.status === "disabled" ? "pill--neutral" : "pill--warn",
      canTest: false,
      canDirectorySync: false,
      canDryRun: false,
      details: ["Переведите провайдера в статус «Активен»"]
    };
  }

  if (missing.length > 0) {
    return {
      label: "Неполная конфигурация",
      tone: "pill--warn",
      canTest: false,
      canDirectorySync: false,
      canDryRun: false,
      details: missing
    };
  }

  return {
    label: provider.type === "SAML" ? "Готов к contract test" : "Готов к SSO",
    tone: "pill--ok",
    canTest: true,
    canDirectorySync: true,
    canDryRun: false,
    details: [provider.type === "SAML" ? "Можно запускать тестовый вход после настройки IdP" : "Можно запускать тестовый вход"]
  };
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
    <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
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
  const origin = resolvePublicOrigin({ headers: await headers() });
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
  const activeSection = accessSectionParam(params.section);
  const accessSectionHref = (section: AccessSection, providerId = selectedProvider?.id) => {
    const search = new URLSearchParams({ section });

    if (providerId) {
      search.set("provider", providerId);
    }

    return `/admin/access?${search.toString()}`;
  };
  const entraMetadata =
    selectedProvider?.type === "MICROSOFT_ENTRA_ID" || selectedProvider?.type === "OIDC"
      ? buildEntraAuthorizationMetadata(selectedProvider)
      : null;
  const samlMetadata =
    selectedProvider?.type === "SAML"
      ? buildSamlServiceProviderUrls(selectedProvider, origin)
      : null;
  const guidance = getDirectoryIntegrationGuidance();
  const readiness = providerReadiness(selectedProvider);
  const scimBaseUrl = "/scim/v2";
  const selectedProviderSsoPath = `/auth/sso?provider=${encodeURIComponent(
    selectedProvider?.slug ?? "microsoft-entra-id"
  )}&workspaceId=${encodeURIComponent(selectedProvider?.workspaceId ?? user.workspaceId)}&returnTo=/reviews`;
  const activeSessions = sessions.filter((session) => session.status === "ACTIVE").length;
  const activeMappings = selectedProvider?.groupRoleMappings.filter((mapping) => mapping.isActive).length ?? 0;
  const linkedUsers = providers.reduce((sum, provider) => sum + provider._count.externalIdentities, 0);
  const activeSsoProviders = providers.filter((provider) => provider.type !== "DEMO" && provider.status === "active").length;
  const accessSetupHint = activeSsoProviders > 0 ? null : getSettingCoachmark("access");
  const groupMappingsHint =
    selectedProvider && selectedProvider.type !== "DEMO" && selectedProvider.status === "active" && activeMappings === 0
      ? getSettingCoachmark("groupMappings")
      : null;

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Доступ и SSO</h1>
          <p className="page-subtitle">
            Настройка сквозной авторизации, связки AD/Entra-групп с ролями и контроль активных сессий.
          </p>
          <div className="admin-actions mt-5">
            {readiness.canTest ? (
              <Link href={selectedProviderSsoPath} className="action-button action-button--primary">
                <KeyRound size={16} aria-hidden="true" />
                Проверить вход
              </Link>
            ) : (
              <button type="button" className="action-button action-button--primary" disabled aria-disabled="true">
                <KeyRound size={16} aria-hidden="true" />
                Проверить вход
              </button>
            )}
            <Link href="/admin/users" className="action-button">
              <UsersRound size={16} aria-hidden="true" />
              Пользователи
            </Link>
          </div>
        </div>
      </div>

      <section className="ops-metric-grid" aria-label="Сводка доступа">
        <div className="ops-metric">
          <span className="ops-metric__label">Провайдеры</span>
          <strong className="ops-metric__value">{providers.length}</strong>
          <span className="ops-metric__note">Активны: {providers.filter((provider) => provider.status === "active").length}</span>
        </div>
        <div className="ops-metric">
          <span className="flex items-center gap-1">
            <span className="ops-metric__label">Группы</span>
            <HelpTooltip
              label="Как работает приоритет групп?"
              content="Меньшее значение priority применяется раньше. Если пользователь состоит в нескольких группах, победит первое активное правило."
              placement="top-start"
            />
          </span>
          <strong className="ops-metric__value">{providers.reduce((sum, provider) => sum + provider.groupRoleMappings.length, 0)}</strong>
          <span className="ops-metric__note">Активных у выбранного: {activeMappings}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">SSO-профили</span>
          <strong className="ops-metric__value">{linkedUsers}</strong>
          <span className="ops-metric__note">Связанные внешние учетные записи</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Активные сессии</span>
          <strong className="ops-metric__value">{activeSessions}</strong>
          <span className="ops-metric__note">Показано до 40 в разделе сессий</span>
        </div>
      </section>

      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы доступа и SSO">
        {accessSections.map((section) => (
          <Link
            key={section.value}
            href={accessSectionHref(section.value)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "overview" ? (
        <section className="ops-panel" aria-labelledby="providers-title">
            <div className="ops-panel__header">
              <div>
                <p className="ops-panel__eyebrow">Провайдеры удостоверений</p>
                <h2 id="providers-title" className="ops-panel__title">Провайдеры входа</h2>
                <p className="ops-panel__subtitle">Выберите провайдера, чтобы открыть его настройку в отдельной вкладке.</p>
              </div>
              <span className={`pill ${readiness.tone}`}>{readiness.label}</span>
            </div>
            {accessSetupHint ? (
              <div className="admin-setup-inline">
                <CoachCallout
                  title={accessSetupHint.title}
                  body={accessSetupHint.body}
                  href={accessSetupHint.href}
                  actionLabel={accessSetupHint.actionLabel}
                  variant="spotlight"
                  placement="top"
                  anchorLabel="Подсказка к SSO"
                  stepIndex={1}
                  dismissId="settings:access"
                />
              </div>
            ) : null}
            <div className="ops-table-shell">
              <div className="ops-table ops-table--providers" role="table" aria-label="Провайдеры входа">
                <div className="ops-table__row ops-table__row--head" role="row">
                  <span>Провайдер</span>
                  <span>Тип</span>
                  <span>Готовность</span>
                  <span>Группы</span>
                  <span>Пользователи</span>
                  <span>Сессии</span>
                </div>
                {providers.map((provider) => {
                  const providerReady = providerReadiness(provider);

                  return (
                    <Link
                      key={provider.id}
                      href={accessSectionHref("provider", provider.id)}
                      className={`ops-table__row ${selectedProvider?.id === provider.id ? "record-card--selected" : ""}`}
                    >
                      <div className="ops-table__cell">
                        <span className="ops-table__label">Провайдер</span>
                        <span className="flex flex-wrap items-center gap-2">
                          <ShieldCheck size={16} aria-hidden="true" />
                          <strong className="record-title">{provider.name}</strong>
                        </span>
                        <span className="record-meta compact-text">{provider.slug}</span>
                      </div>
                      <div className="ops-table__cell">
                        <span className="ops-table__label">Тип</span>
                        <span className="record-title">{providerTypeLabels[provider.type]}</span>
                        <span className={`pill ${statusTone(provider.status)}`}>{providerStatusLabel(provider.status)}</span>
                      </div>
                      <div className="ops-table__cell">
                        <span className="ops-table__label">Готовность</span>
                        <span className={`pill ${providerReady.tone}`}>{providerReady.label}</span>
                        <span className="record-meta compact-text">{providerReady.details.slice(0, 2).join(", ")}</span>
                      </div>
                      <span className="record-meta">
                        <span className="ops-table__label">Группы</span>
                        {provider.groupRoleMappings.length}
                      </span>
                      <span className="record-meta">
                        <span className="ops-table__label">Пользователи</span>
                        {provider._count.externalIdentities}
                      </span>
                      <span className="record-meta">
                        <span className="ops-table__label">Сессии</span>
                        {provider._count.authSessions}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
        </section>
      ) : null}

      {activeSection === "provider" ? (
        <section className="ops-panel" aria-labelledby="provider-settings-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Настройка</p>
              <h2 id="provider-settings-title" className="ops-panel__title">{selectedProvider?.name ?? "Провайдер авторизации"}</h2>
              <p className="ops-panel__subtitle">Редактируйте поля при смене каталога, приложения или технических адресов.</p>
              {selectedProvider && selectedProvider.type !== "DEMO" ? (
                <div className="admin-actions mt-3">
                  {readiness.canDryRun ? (
                    <form action={queueDirectorySync}>
                      <input type="hidden" name="providerId" value={selectedProvider.id} />
                      <input type="hidden" name="dryRun" value="true" />
                      <button type="submit" className="action-button action-button--small">
                        <ShieldCheck size={15} aria-hidden="true" />
                        Dry-run
                      </button>
                    </form>
                  ) : null}
                  <form action={queueDirectorySync}>
                    <input type="hidden" name="providerId" value={selectedProvider.id} />
                    <button type="submit" className="action-button action-button--small" disabled={!readiness.canDirectorySync} aria-disabled={!readiness.canDirectorySync}>
                      <ShieldCheck size={15} aria-hidden="true" />
                      Синхронизировать
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
            <span className={`pill ${readiness.tone}`}>{readiness.label}</span>
          </div>
          <div className="ops-status-strip" aria-label="Готовность выбранного провайдера">
            <div className="ops-status-item">
              <span className="ops-status-item__label">Готовность входа</span>
              <span className="ops-status-item__value">{readiness.label}</span>
              <span className="record-meta compact-text">{readiness.details.join(", ")}</span>
            </div>
            <div className="ops-status-item">
              <span className="ops-status-item__label">Адрес возврата</span>
              <span className="ops-status-item__value font-mono text-sm compact-text">{callbackPath(selectedProvider)}</span>
              <span className="record-meta">Укажите этот путь в приложении провайдера.</span>
            </div>
            <div className="ops-status-item">
              <span className="ops-status-item__label">Группы ролей</span>
              <span className="ops-status-item__value">{activeMappings}/{selectedProvider?.groupRoleMappings.length ?? 0}</span>
              <span className="record-meta">Активные группы выбранного провайдера.</span>
            </div>
            <div className="ops-status-item">
              <span className="ops-status-item__label">Последняя синхронизация</span>
              <span className="ops-status-item__value">{formatDate(selectedProvider?.lastSyncAt)}</span>
              <span className="record-meta compact-text">
                {selectedProvider?.lastSyncStatus ?? "Синхронизация каталога запускается как фоновая задача."}
                {selectedProvider?.lastSyncError ? ` · ${selectedProvider.lastSyncError}` : ""}
              </span>
            </div>
          </div>
          {accessSetupHint ? (
            <div className="admin-setup-inline">
              <CoachCallout
                title={accessSetupHint.title}
                body={accessSetupHint.body}
                href={accessSetupHint.href}
                actionLabel={accessSetupHint.actionLabel}
                variant="spotlight"
                placement="top"
                anchorLabel="Подсказка к настройке провайдера"
                stepIndex={1}
                dismissId="settings:access"
              />
            </div>
          ) : null}
          <form action={saveIdentityProvider} className="grid gap-5 p-5">
          <input type="hidden" name="providerId" value={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.id ?? ""} />
          <input type="hidden" name="returnSection" value="provider" />
          <div className="ops-form-grid">
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Тип
              <select name="type" defaultValue={selectedProviderType} className="form-control">
                {providerTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Статус
              <select name="status" defaultValue={selectedProvider?.status ?? "draft"} className="form-control">
                <option value="draft">Черновик</option>
                <option value="active">Активен</option>
                <option value="disabled">Отключен</option>
              </select>
            </label>
            <ProviderField label="Название" name="name" required defaultValue={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.name} placeholder="Microsoft Entra ID" />
            <ProviderField label="Код для входа" name="slug" required defaultValue={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.slug} placeholder="microsoft-entra-id" />
            <ProviderField label="Идентификатор каталога" name="tenantId" defaultValue={selectedProvider?.tenantId} placeholder="00000000-0000-0000-0000-000000000000" />
            <ProviderField label="Идентификатор приложения" name="clientId" defaultValue={selectedProvider?.clientId} placeholder="Идентификатор приложения" />
            <ProviderField label="Ссылка на секрет" name="clientSecretRef" defaultValue={selectedProvider?.clientSecretRef} placeholder="env:QC_ENTRA_CLIENT_SECRET" />
            <ProviderField label="Области доступа" name="scopes" defaultValue={selectedProvider?.scopes ?? "openid profile email"} />
          </div>

          <details className="compact-details">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--text-body)]">
              Адреса OIDC/SAML и расширенная настройка
            </summary>
            <div className="ops-form-grid border-t border-[var(--border)] p-4">
              <ProviderField label="Издатель токенов" name="issuer" defaultValue={selectedProvider?.issuer} placeholder="https://login.microsoftonline.com/{tenantId}/v2.0" />
              <ProviderField label="Адрес авторизации" name="authorizationUrl" defaultValue={selectedProvider?.authorizationUrl} />
              <ProviderField label="Адрес токена" name="tokenUrl" defaultValue={selectedProvider?.tokenUrl} />
              <ProviderField label="Адрес ключей JWKS" name="jwksUrl" defaultValue={selectedProvider?.jwksUrl} />
              <ProviderField label="SAML Entity ID" name="samlEntityId" defaultValue={selectedProvider?.samlEntityId} placeholder="https://app.example.com/auth/saml/metadata?provider=saml" />
              <ProviderField label="SAML Metadata URL IdP" name="samlMetadataUrl" defaultValue={selectedProvider?.samlMetadataUrl} />
              <ProviderField label="LDAPS URL" name="ldapsUrl" defaultValue={selectedProvider?.ldapsUrl} placeholder="ldaps://dc01.example.com:636" />
              <ProviderField label="LDAPS bind DN" name="ldapsBindDn" defaultValue={selectedProvider?.ldapsBindDn} placeholder="CN=qc-sync,OU=Service Accounts,DC=example,DC=com" />
              <ProviderField label="LDAPS bind secret ref" name="ldapsBindSecretRef" defaultValue={selectedProvider?.ldapsBindSecretRef} placeholder="env:QC_AD_BIND_PASSWORD" />
              <label className="ops-form-grid__wide grid gap-1 text-sm font-medium text-[var(--text-body)]">
                SAML сертификаты IdP
                <textarea
                  name="samlCertificateRef"
                  defaultValue={selectedProvider?.samlCertificateRef ?? ""}
                  rows={4}
                  className="form-control font-mono text-xs"
                  placeholder="env:SAML_IDP_CERT_CURRENT&#10;env:SAML_IDP_CERT_NEXT"
                />
              </label>
              <label className="ops-form-grid__wide grid gap-1 text-sm font-medium text-[var(--text-body)]">
                Настройка JSON
                <textarea
                  name="configJson"
                  defaultValue={configText(selectedProvider)}
                  rows={5}
                  className="form-control font-mono text-xs"
                  placeholder='{"userSearchBase":"OU=Users,DC=example,DC=com","groupSearchBase":"OU=Groups,DC=example,DC=com","nestedGroups":true,"caCertRefs":["env:QC_AD_CA_PEM"]}'
                />
              </label>
            </div>
          </details>

          {entraMetadata ? (
            <div className="soft-callout text-sm text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text-body)]">Метаданные Entra/OIDC</p>
              <p className="compact-text">Авторизация: {entraMetadata.authorizationUrl}</p>
              <p className="compact-text">Токен: {entraMetadata.tokenUrl}</p>
              <p>Сценарий: {entraMetadata.recommendedFlow}</p>
              <p>Group overage: Graph fallback включайте только явно в JSON-конфигурации; используйте Microsoft Graph getMemberGroups с минимальными правами GroupMember.Read.All или Directory.Read.All.</p>
            </div>
          ) : null}

          {samlMetadata ? (
            <div className="soft-callout text-sm text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text-body)]">Метаданные SAML SP</p>
              <p className="compact-text">Entity ID: {samlMetadata.entityId}</p>
              <p className="compact-text">ACS: {samlMetadata.acsUrl}</p>
              <p className="compact-text">Metadata: {samlMetadata.metadataUrl}</p>
              <p>Статус означает готовность к contract test с IdP, а не подтвержденную production/live интеграцию.</p>
            </div>
          ) : null}

          {selectedProvider?.type === "ACTIVE_DIRECTORY_LDAPS" ? (
            <div className="soft-callout text-sm text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text-body)]">Active Directory LDAPS</p>
              <p>LDAPS здесь используется только для синхронизации пользователей и групп. LDAP password login не включается.</p>
              <p className="compact-text">TLS обязателен: используйте ldaps:// на 636/3269; bind secret и CA сейчас исполняются только через env:-ссылки.</p>
              <p className="compact-text">Готовность означает возможность dry-run или live-проверки, а не подтвержденный production-live статус.</p>
            </div>
          ) : null}

          <div className="flex justify-end">
            <ValidatedSubmitButton>
              Сохранить провайдера
            </ValidatedSubmitButton>
          </div>
        </form>
        </section>
      ) : null}

      {activeSection === "scim" && selectedProvider ? (
        <section className="ops-panel" aria-labelledby="scim-token-title">
          {selectedProvider.type === "DEMO" ? (
            <>
              <div className="ops-panel__header">
                <div>
                  <p className="ops-panel__eyebrow">Provisioning</p>
                  <h2 id="scim-token-title" className="ops-panel__title">SCIM 2.0 bearer token</h2>
                  <p className="ops-panel__subtitle">
                    Выпуск, ротация и отзыв токена входящего provisioning для выбранного провайдера.
                  </p>
                </div>
                <span className="pill pill--warn">Не выпущен</span>
              </div>
              <div className={emptyStateClass}>Для демо-провайдера SCIM provisioning не выпускается.</div>
            </>
          ) : (
            <div className="p-5">
              <ScimTokenManager
                titleId="scim-token-title"
                providerId={selectedProvider.id}
                providerName={selectedProvider.name}
                initialTokenPrefix={selectedProvider.scimTokenPrefix}
                scimBaseUrl={scimBaseUrl}
              />
            </div>
          )}
        </section>
      ) : null}

      {activeSection === "mappings" && selectedProvider ? (
        <section className="ops-panel" aria-labelledby="mappings-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Политика ролей</p>
              <h2 id="mappings-title" className="ops-panel__title">Группы и роли</h2>
              <p className="ops-panel__subtitle">Приоритет меньше - роль применяется раньше. Неактивные строки остаются в истории конфигурации.</p>
            </div>
            <span className="pill pill--neutral">{selectedProvider.groupRoleMappings.length}</span>
          </div>
          {groupMappingsHint ? (
            <div className="admin-setup-inline">
              <CoachCallout
                title={groupMappingsHint.title}
                body={groupMappingsHint.body}
                href={groupMappingsHint.href}
                actionLabel={groupMappingsHint.actionLabel}
                variant="spotlight"
                placement="top"
                anchorLabel="Подсказка к группам и ролям"
                stepIndex={2}
                dismissId="settings:groupMappings"
              />
            </div>
          ) : null}
          <div className="ops-table-shell">
            <div className="ops-table ops-table--mappings" role="table" aria-label="Группы и роли">
              <div className="ops-table__row ops-table__row--head" role="row">
                <span>Статус</span>
                <span>Группа</span>
                <span>Идентификатор группы</span>
                <span>Роль</span>
                <span>Приоритет</span>
              </div>
              {selectedProvider.groupRoleMappings.length === 0 ? (
                <div className={emptyStateClass}>Для выбранного провайдера пока нет групп.</div>
              ) : (
                selectedProvider.groupRoleMappings.map((mapping) => (
                  <div key={mapping.id} className="ops-table__row" role="row">
                    <form action={toggleGroupRoleMapping} className="ops-table__cell">
                      <span className="ops-table__label">Статус</span>
                      <input type="hidden" name="mappingId" value={mapping.id} />
                      <input type="hidden" name="isActive" value={mapping.isActive ? "false" : "true"} />
                      <button
                        type="submit"
                        className={`action-button action-button--small ${mapping.isActive ? "" : "action-button--primary"}`}
                        aria-label={`${mapping.isActive ? "Отключить" : "Включить"} группу ${mapping.externalGroupName}`}
                      >
                        {mapping.isActive ? "Отключить" : "Включить"}
                      </button>
                    </form>
                    <div className="ops-table__cell">
                      <span className="ops-table__label">Группа</span>
                      <strong className="record-title">{mapping.externalGroupName}</strong>
                      <span className={`pill ${mapping.isActive ? "pill--ok" : "pill--neutral"}`}>{mapping.isActive ? "Активна" : "Отключена"}</span>
                    </div>
                    <span className="record-meta compact-text font-mono">
                      <span className="ops-table__label">Идентификатор группы</span>
                      {mapping.externalGroupId}
                    </span>
                    <span className="pill pill--neutral">
                      <span className="ops-table__label">Роль</span>
                      {roleLabels[mapping.role]}
                    </span>
                    <span className="record-meta">
                      <span className="ops-table__label">Приоритет</span>
                      {mapping.priority}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <details className="compact-details m-4">
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <h3 className="font-semibold text-[var(--foreground)]">Добавить группу</h3>
              <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#1d3fae]">Открыть</span>
            </summary>
            <form action={saveGroupRoleMapping} className="ops-form-grid border-t border-[var(--border)] p-4">
              <input type="hidden" name="providerId" value={selectedProvider.id} />
              <input type="hidden" name="returnSection" value="mappings" />
              <ProviderField label="Идентификатор группы" name="externalGroupId" required placeholder="QC_Analysts или GUID группы" />
              <ProviderField label="Название группы" name="externalGroupName" required placeholder="Аналитики контроля качества" />
              <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
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
              <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-body)]">
                <input type="checkbox" name="isActive" defaultChecked />
                Активна
              </label>
              <div className="flex justify-end">
                <ValidatedSubmitButton>
                  Сохранить группу
                </ValidatedSubmitButton>
              </div>
            </form>
          </details>
        </section>
      ) : null}

      {activeSection === "sessions" ? (
        <section className="ops-panel" aria-labelledby="sessions-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Сессии</p>
            <h2 id="sessions-title" className="ops-panel__title">Сессии пользователей</h2>
            <p className="ops-panel__subtitle">Последние 40 сессий: источник входа, пользователь и возможность отзыва.</p>
          </div>
          <span className="pill pill--neutral">{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <div className={emptyStateClass}>Сессий пока нет.</div>
        ) : (
          <div className="ops-table-shell">
            <div className="ops-table ops-table--sessions" role="table" aria-label="Сессии пользователей">
              <div className="ops-table__row ops-table__row--head" role="row">
                <span>Пользователь</span>
                <span>Провайдер</span>
                <span>Статус</span>
                <span>Последняя активность</span>
                <span>Завершение</span>
                <span>Действие</span>
              </div>
              {sessions.map((session) => (
                <div key={session.id} className="ops-table__row" role="row">
                  <div className="ops-table__cell">
                    <span className="ops-table__label">Пользователь</span>
                    <span className="record-title">{session.user.name}</span>
                    <span className="record-meta compact-text">
                      {session.user.email} · {roleLabels[session.user.role]}
                    </span>
                  </div>
                  <div className="ops-table__cell">
                    <span className="ops-table__label">Провайдер</span>
                    <span className="record-title">{session.provider?.name ?? "Без провайдера"}</span>
                    <span className="record-meta">{session.provider ? providerTypeLabels[session.provider.type] : "Локальный вход"}</span>
                  </div>
                  <span className={`pill ${statusTone(session.status)}`}>
                    <span className="ops-table__label">Статус</span>
                    {sessionStatusLabels[session.status]}
                  </span>
                  <span className="record-meta">
                    <span className="ops-table__label">Последняя активность</span>
                    {formatDate(session.lastSeenAt)}
                  </span>
                  <span className="record-meta">
                    <span className="ops-table__label">Завершение</span>
                    {formatDate(session.expiresAt)}
                  </span>
                  <div className="ops-table__cell ops-table__cell--actions">
                    <span className="ops-table__label">Действие</span>
                    {session.status === "ACTIVE" ? (
                      <form action={revokeAuthSessionById}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <button
                          type="submit"
                          className="action-button action-button--small"
                          aria-label={`Отозвать сессию ${session.user.email}`}
                        >
                          Отозвать
                        </button>
                      </form>
                    ) : (
                      <span className="record-meta">Нет действия</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </section>
      ) : null}

      {activeSection === "recommendations" ? (
        <section className="ops-panel" aria-labelledby="recommendations-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Справка</p>
            <h2 id="recommendations-title" className="ops-panel__title">Рекомендации</h2>
            <p className="ops-panel__subtitle">Короткие подсказки по AD/Entra и резервным сценариям.</p>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          <div className="soft-callout text-sm leading-6 text-[var(--text-muted)]">
            <h3 className="record-title">Основной путь</h3>
            <p>{guidance.preferred}</p>
          </div>
          <div className="soft-callout text-sm leading-6 text-[var(--text-muted)]">
            <h3 className="record-title">Локальный AD</h3>
            <p>{guidance.onPremDirectory}</p>
          </div>
          <div className="soft-callout text-sm leading-6 text-[var(--text-muted)]">
            <h3 className="record-title">Роли</h3>
            <p>{guidance.authorization}</p>
          </div>
        </div>
        <div className="soft-callout m-5 mt-0 text-sm text-[var(--text-muted)]">
          <Link2 size={16} className="mr-2 inline-block align-[-3px]" aria-hidden="true" />
          Для входа через выбранный провайдер используйте:
          <code className="inline-code-box inline-code-box--wrap mt-2 font-mono compact-text">
            {selectedProviderSsoPath}
          </code>
        </div>
        </section>
      ) : null}
    </section>
  );
}
