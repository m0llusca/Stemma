import type { AuthSessionStatus, IdentityProvider, IdentityProviderType, RoleName } from "@prisma/client";
import { KeyRound, Link2, ShieldCheck, UsersRound } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
  revokeAuthSessionById,
  saveGroupRoleMapping,
  saveIdentityProvider,
  toggleGroupRoleMapping
} from "@/lib/auth-provider-actions";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { PageSkeleton } from "@/components/loading-states";
import { ScimTokenManager } from "@/components/admin/scim-token-manager";
import { AdminFrame } from "@/components/admin/admin-frame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageShell } from "@/components/ui/page-shell";
import { Separator } from "@/components/ui/separator";
import { StatKpi } from "@/components/ui/stat-kpi";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { sanitizeProviderConfigForDisplay } from "@/lib/auth/provider-config-validation";
import { buildEntraAuthorizationMetadata, getDirectoryIntegrationGuidance } from "@/lib/auth/providers";
import { buildSamlServiceProviderUrls } from "@/lib/auth/saml";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { queueDirectorySync } from "@/lib/system-enqueue-actions";
import { statusSurfaceClass } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type AccessSection = "overview" | "provider" | "scim" | "mappings" | "sessions" | "recommendations";

type StatusTone = "neutral" | "success" | "warning" | "danger";

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

const roles: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"];
const interactiveSsoTypes: IdentityProviderType[] = ["MICROSOFT_ENTRA_ID", "OIDC", "SAML"];

const toneClass: Record<StatusTone, string> = {
  neutral: "",
  success: cn("border-transparent", statusSurfaceClass("positive")),
  warning: cn("border-transparent", statusSurfaceClass("warning")),
  danger: "border-transparent bg-destructive/15 text-destructive"
};

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

function statusTone(status: string): StatusTone {
  if (status === "active" || status === "ACTIVE") {
    return "success";
  }

  if (status === "draft") {
    return "warning";
  }

  return "neutral";
}

function providerStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Активен",
    draft: "Черновик",
    disabled: "Отключен"
  };

  return labels[status] ?? status;
}

function StatusPill({ tone = "neutral", children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return (
    <Badge
      variant={tone === "neutral" ? "secondary" : "outline"}
      className={cn("font-normal", toneClass[tone], className)}
    >
      {children}
    </Badge>
  );
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
      tone: "neutral" as StatusTone,
      canTest: false,
      canDirectorySync: false,
      canDryRun: false,
      details: ["Создайте или выберите провайдера"]
    };
  }

  if (provider.type === "DEMO") {
    return {
      label: "Демо",
      tone: "neutral" as StatusTone,
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
        tone: "warning" as StatusTone,
        canTest: false,
        canDirectorySync: false,
        canDryRun: false,
        details: missing
      };
    }

    return {
      label: provider.status === "active" ? "Конфиг готов к live-проверке" : "Конфиг готов к dry-run",
      // Config completeness ≠ executed check: never success/green without a real probe.
      tone: "warning" as StatusTone,
      canTest: false,
      canDirectorySync: provider.status === "active",
      canDryRun: true,
      details: [
        "Только синхронизация каталога, не LDAP password login",
        "Статус — готовность конфигурации, а не подтверждённый live-результат",
        config.nestedGroups ? "Nested groups включены" : "Nested groups выключены",
        config.caConfigured ? "Custom CA настроен" : "Используется системное доверие TLS"
      ]
    };
  }

  if (!interactiveSsoTypes.includes(provider.type)) {
    return {
      label: "Только каталог",
      tone: "neutral" as StatusTone,
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
      tone: (provider.status === "disabled" ? "neutral" : "warning") as StatusTone,
      canTest: false,
      canDirectorySync: false,
      canDryRun: false,
      details: ["Переведите провайдера в статус «Активен»"]
    };
  }

  if (missing.length > 0) {
    return {
      label: "Неполная конфигурация",
      tone: "warning" as StatusTone,
      canTest: false,
      canDirectorySync: false,
      canDryRun: false,
      details: missing
    };
  }

  return {
    label: provider.type === "SAML" ? "Конфиг готов к контрактному тесту" : "Конфиг готов к проверке SSO",
    // Fail-closed: filled config allows a test attempt, never implies SSO already works.
    tone: "warning" as StatusTone,
    canTest: true,
    canDirectorySync: true,
    canDryRun: false,
    details: [
      provider.type === "SAML"
        ? "Можно запускать тестовый вход после настройки IdP — успех только после реального ACS-обмена"
        : "Можно запускать тестовый вход — успех только после реального callback от IdP",
      "Зелёный/боевой SSO не выставляется по заполненной форме"
    ]
  };
}

function ProviderField({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
  className
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
      />
    </Field>
  );
}

export default function AdminAccessPage({ searchParams }: AccessPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/access")} />}>
      <AdminAccessPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminAccessPageContent({ searchParams }: AccessPageProps) {
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
      ? // The public origin throws without QC_PUBLIC_ORIGIN in production, so resolve it
        // lazily — only the SAML SP metadata block needs absolute URLs.
        buildSamlServiceProviderUrls(selectedProvider, resolvePublicOrigin({ headers: await headers() }))
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
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/access"]}
      description="Настройка сквозной авторизации, связки AD/Entra-групп с ролями и контроль активных сессий."
      actions={
        <>
          {readiness.canTest ? (
            <Button render={<Link href={selectedProviderSsoPath} />} nativeButton={false}>
              <KeyRound data-icon="inline-start" aria-hidden="true" />
              Проверить вход
            </Button>
          ) : (
            <Button type="button" disabled>
              <KeyRound data-icon="inline-start" aria-hidden="true" />
              Проверить вход
            </Button>
          )}
          {readiness.canTest ? (
            <p className="sr-only">
              Проверка входа запускает реальный SSO-обмен. Заполненная конфигурация сама по себе не считается
              успешным входом.
            </p>
          ) : null}
          <Button render={<Link href="/admin/users" />} nativeButton={false} variant="outline">
            <UsersRound data-icon="inline-start" aria-hidden="true" />
            Пользователи
          </Button>
        </>
      }
      tabs={accessSections.map((section) => ({
        href: accessSectionHref(section.value),
        label: section.label,
        active: activeSection === section.value,
        count:
          section.value === "mappings"
            ? selectedProvider?.groupRoleMappings.length
            : section.value === "sessions"
              ? sessions.length
              : section.value === "overview"
                ? providers.length
                : undefined
      }))}
    >
      <AdminFrame>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Сводка доступа">
          <StatKpi
            label="Провайдеры"
            value={providers.length}
            hint={`Активны: ${providers.filter((provider) => provider.status === "active").length}`}
          />
          <StatKpi
            label={
              <span className="flex items-center gap-1">
                Группы
                <HelpTooltip
                  label="Как работает приоритет групп?"
                  content="Меньшее значение priority применяется раньше. Если пользователь состоит в нескольких группах, победит первое активное правило."
                  placement="top-start"
                />
              </span>
            }
            value={providers.reduce((sum, provider) => sum + provider.groupRoleMappings.length, 0)}
            hint={`Активных у выбранного: ${activeMappings}`}
          />
          <StatKpi label="SSO-профили" value={linkedUsers} hint="Связанные внешние учетные записи" />
          <StatKpi label="Активные сессии" value={activeSessions} hint="Показано до 40 в разделе сессий" />
        </section>

        {activeSection === "overview" ? (
          <Card aria-labelledby="providers-title">
            <CardHeader className="border-b">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Провайдеры удостоверений</p>
              <CardTitle id="providers-title">Провайдеры входа</CardTitle>
              <CardDescription>Выберите провайдера, чтобы открыть его настройку в отдельной вкладке.</CardDescription>
              <CardAction>
                <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {accessSetupHint ? (
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
              ) : null}
              {providers.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<ShieldCheck size={20} aria-hidden="true" />}
                  title="Провайдеров пока нет"
                  description="Настройте первого провайдера входа, чтобы включить SSO и синхронизацию каталога."
                  action={
                    <Button render={<Link href={accessSectionHref("provider")} />} nativeButton={false} size="sm">
                      Настроить провайдера
                    </Button>
                  }
                />
              ) : (
                <Table aria-label="Провайдеры входа">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Провайдер</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Готовность</TableHead>
                      <TableHead className="text-right">Группы</TableHead>
                      <TableHead className="text-right">Пользователи</TableHead>
                      <TableHead className="text-right">Сессии</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers.map((provider) => {
                      const providerReady = providerReadiness(provider);
                      const selected = selectedProvider?.id === provider.id;

                      return (
                        <TableRow
                          key={provider.id}
                          data-state={selected ? "selected" : undefined}
                          className={cn(selected && "bg-muted/60")}
                        >
                          <TableCell>
                            <Link
                              href={accessSectionHref("provider", provider.id)}
                              className="flex min-w-0 flex-col gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="flex items-center gap-2 font-medium text-foreground">
                                <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                {provider.name}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">{provider.slug}</span>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-foreground">{providerTypeLabels[provider.type]}</span>
                              <StatusPill tone={statusTone(provider.status)}>{providerStatusLabel(provider.status)}</StatusPill>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex max-w-xs flex-col gap-1.5">
                              <StatusPill tone={providerReady.tone}>{providerReady.label}</StatusPill>
                              <span className="text-xs text-muted-foreground whitespace-normal">
                                {providerReady.details.slice(0, 2).join(", ")}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {provider.groupRoleMappings.length}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {provider._count.externalIdentities}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {provider._count.authSessions}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "provider" ? (
          <Card aria-labelledby="provider-settings-title">
            <CardHeader className="border-b">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Настройка</p>
              <CardTitle id="provider-settings-title">{selectedProvider?.name ?? "Провайдер авторизации"}</CardTitle>
              <CardDescription>Редактируйте поля при смене каталога, приложения или технических адресов.</CardDescription>
              <CardAction>
                <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {readiness.canTest ? (
                <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                  <AlertTitle>SSO fail-closed</AlertTitle>
                  <AlertDescription>
                    Конфигурация позволяет запустить «Проверить вход», но это ещё не успешный SSO. Боевой
                    доступ появляется только после реального обмена с IdP без ошибок.
                  </AlertDescription>
                </Alert>
              ) : null}
              {selectedProvider && selectedProvider.type !== "DEMO" ? (
                <div className="flex flex-wrap items-center gap-2">
                  {readiness.canDryRun ? (
                    <form action={queueDirectorySync}>
                      <input type="hidden" name="providerId" value={selectedProvider.id} />
                      <input type="hidden" name="dryRun" value="true" />
                      <Button type="submit" variant="outline" size="sm">
                        <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                        Пробный запуск
                      </Button>
                    </form>
                  ) : null}
                  <form action={queueDirectorySync}>
                    <input type="hidden" name="providerId" value={selectedProvider.id} />
                    <Button type="submit" variant="outline" size="sm" disabled={!readiness.canDirectorySync}>
                      <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                      Синхронизировать
                    </Button>
                  </form>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2" aria-label="Готовность выбранного провайдера">
                <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3">
                  <span className="text-xs font-medium text-muted-foreground">Адрес возврата</span>
                  <span className="font-mono text-sm text-foreground">{callbackPath(selectedProvider)}</span>
                  <span className="text-xs text-muted-foreground">Укажите этот путь в приложении провайдера.</span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3">
                  <span className="text-xs font-medium text-muted-foreground">Последняя синхронизация</span>
                  <span className="text-sm text-foreground">{formatDate(selectedProvider?.lastSyncAt)}</span>
                  <span className="text-xs text-muted-foreground">
                    {selectedProvider?.lastSyncStatus ?? "Синхронизация каталога запускается как фоновая задача."}
                    {selectedProvider?.lastSyncError ? ` · ${selectedProvider.lastSyncError}` : ""}
                  </span>
                </div>
              </div>

              {accessSetupHint ? (
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
              ) : null}

              <form action={saveIdentityProvider} className="flex flex-col gap-5">
                <input type="hidden" name="providerId" value={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.id ?? ""} />
                <input type="hidden" name="returnSection" value="provider" />

                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="type">Тип</FieldLabel>
                    <NativeSelect id="type" name="type" defaultValue={selectedProviderType} className="w-full">
                      {providerTypes.map((type) => (
                        <NativeSelectOption key={type.value} value={type.value}>
                          {type.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="status">Статус</FieldLabel>
                    <NativeSelect id="status" name="status" defaultValue={selectedProvider?.status ?? "draft"} className="w-full">
                      <NativeSelectOption value="draft">Черновик</NativeSelectOption>
                      <NativeSelectOption value="active">Активен</NativeSelectOption>
                      <NativeSelectOption value="disabled">Отключен</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <ProviderField
                    label="Название"
                    name="name"
                    required
                    defaultValue={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.name}
                    placeholder="Microsoft Entra ID"
                  />
                  <ProviderField
                    label="Код для входа"
                    name="slug"
                    required
                    defaultValue={selectedProvider?.type === "DEMO" ? "" : selectedProvider?.slug}
                    placeholder="microsoft-entra-id"
                  />
                  <ProviderField
                    label="Идентификатор каталога"
                    name="tenantId"
                    defaultValue={selectedProvider?.tenantId}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                  <ProviderField
                    label="Идентификатор приложения"
                    name="clientId"
                    defaultValue={selectedProvider?.clientId}
                    placeholder="Идентификатор приложения"
                  />
                  <ProviderField
                    label="Ссылка на секрет"
                    name="clientSecretRef"
                    defaultValue={selectedProvider?.clientSecretRef}
                    placeholder="env:QC_ENTRA_CLIENT_SECRET"
                  />
                  <ProviderField
                    label="Области доступа"
                    name="scopes"
                    defaultValue={selectedProvider?.scopes ?? "openid profile email"}
                  />
                </FieldGroup>

                <Separator />

                <Tabs defaultValue="endpoints">
                  <TabsList variant="line" className="w-full justify-start">
                    <TabsTrigger value="endpoints">Адреса OIDC/SAML</TabsTrigger>
                    <TabsTrigger value="directory">Каталог / LDAPS</TabsTrigger>
                    <TabsTrigger value="advanced">JSON и сертификаты</TabsTrigger>
                  </TabsList>

                  {/* keepMounted: hidden tab panels must stay in the form DOM so save still posts all fields */}
                  <TabsContent value="endpoints" keepMounted className="pt-4">
                    <FieldGroup className="grid gap-4 sm:grid-cols-2">
                      <ProviderField
                        label="Издатель токенов"
                        name="issuer"
                        defaultValue={selectedProvider?.issuer}
                        placeholder="https://login.microsoftonline.com/{tenantId}/v2.0"
                      />
                      <ProviderField label="Адрес авторизации" name="authorizationUrl" defaultValue={selectedProvider?.authorizationUrl} />
                      <ProviderField label="Адрес токена" name="tokenUrl" defaultValue={selectedProvider?.tokenUrl} />
                      <ProviderField label="Адрес ключей JWKS" name="jwksUrl" defaultValue={selectedProvider?.jwksUrl} />
                      <ProviderField
                        label="SAML Entity ID"
                        name="samlEntityId"
                        defaultValue={selectedProvider?.samlEntityId}
                        placeholder="https://app.example.com/auth/saml/metadata?provider=saml"
                      />
                      <ProviderField label="SAML Metadata URL IdP" name="samlMetadataUrl" defaultValue={selectedProvider?.samlMetadataUrl} />
                    </FieldGroup>
                  </TabsContent>

                  <TabsContent value="directory" keepMounted className="pt-4">
                    <FieldGroup className="grid gap-4 sm:grid-cols-2">
                      <ProviderField
                        label="LDAPS URL"
                        name="ldapsUrl"
                        defaultValue={selectedProvider?.ldapsUrl}
                        placeholder="ldaps://dc01.example.com:636"
                      />
                      <ProviderField
                        label="LDAPS bind DN"
                        name="ldapsBindDn"
                        defaultValue={selectedProvider?.ldapsBindDn}
                        placeholder="CN=qc-sync,OU=Service Accounts,DC=example,DC=com"
                      />
                      <ProviderField
                        label="LDAPS bind secret ref"
                        name="ldapsBindSecretRef"
                        defaultValue={selectedProvider?.ldapsBindSecretRef}
                        placeholder="env:QC_AD_BIND_PASSWORD"
                        className="sm:col-span-2"
                      />
                    </FieldGroup>
                  </TabsContent>

                  <TabsContent value="advanced" keepMounted className="pt-4">
                    <FieldGroup className="grid gap-4">
                      <Field>
                        <FieldLabel htmlFor="samlCertificateRef">SAML сертификаты IdP</FieldLabel>
                        <Textarea
                          id="samlCertificateRef"
                          name="samlCertificateRef"
                          defaultValue={selectedProvider?.samlCertificateRef ?? ""}
                          rows={4}
                          className="font-mono text-xs"
                          placeholder={"env:SAML_IDP_CERT_CURRENT\nenv:SAML_IDP_CERT_NEXT"}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="configJson">Настройка JSON</FieldLabel>
                        <Textarea
                          id="configJson"
                          name="configJson"
                          defaultValue={configText(selectedProvider)}
                          rows={5}
                          className="font-mono text-xs"
                          placeholder='{"userSearchBase":"OU=Users,DC=example,DC=com","groupSearchBase":"OU=Groups,DC=example,DC=com","nestedGroups":true,"caCertRefs":["env:QC_AD_CA_PEM"]}'
                        />
                      </Field>
                    </FieldGroup>
                  </TabsContent>
                </Tabs>

                {entraMetadata ? (
                  <Alert>
                    <AlertTitle>Метаданные Entra/OIDC</AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                      <span className="font-mono text-xs">Авторизация: {entraMetadata.authorizationUrl}</span>
                      <span className="font-mono text-xs">Токен: {entraMetadata.tokenUrl}</span>
                      <span>Сценарий: {entraMetadata.recommendedFlow}</span>
                      <span>
                        Переполнение групп: Graph fallback включайте только явно в JSON-конфигурации; используйте Microsoft Graph
                        getMemberGroups с минимальными правами GroupMember.Read.All или Directory.Read.All.
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {samlMetadata ? (
                  <Alert>
                    <AlertTitle>Метаданные SAML SP</AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                      <span className="font-mono text-xs">Entity ID: {samlMetadata.entityId}</span>
                      <span className="font-mono text-xs">ACS: {samlMetadata.acsUrl}</span>
                      <span className="font-mono text-xs">Metadata: {samlMetadata.metadataUrl}</span>
                      <span>
                        Статус — готовность конфигурации к контрактному тесту с IdP, а не подтверждённый
                        production/live SSO. Успех только после реального ACS-обмена.
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {selectedProvider?.type === "ACTIVE_DIRECTORY_LDAPS" ? (
                  <Alert>
                    <AlertTitle>Active Directory LDAPS</AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                      <span>LDAPS здесь используется только для синхронизации пользователей и групп. Вход по паролю LDAP не включается.</span>
                      <span className="text-xs">
                        TLS обязателен: используйте ldaps:// на 636/3269; bind secret и CA сейчас исполняются только через env:-ссылки.
                      </span>
                      <span className="text-xs">
                        Готовность — возможность запустить dry-run или live-проверку, а не подтверждённый
                        production-live статус. Без реального прогона результат fail-closed.
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex justify-end">
                  <ValidatedSubmitButton className={buttonVariants()}>Сохранить провайдера</ValidatedSubmitButton>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "scim" && selectedProvider ? (
          <Card aria-labelledby="scim-token-title">
            {selectedProvider.type === "DEMO" ? (
              <>
                <CardHeader className="border-b">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Провижининг</p>
                  <CardTitle id="scim-token-title">Bearer-токен SCIM 2.0</CardTitle>
                  <CardDescription>
                    Выпуск, ротация и отзыв токена входящего провижининга для выбранного провайдера.
                  </CardDescription>
                  <CardAction>
                    <StatusPill tone="warning">Не выпущен</StatusPill>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    size="inline"
                    icon={<KeyRound size={20} aria-hidden="true" />}
                    title="SCIM недоступен"
                    description="Для демо-провайдера токен провижининга не выпускается."
                  />
                </CardContent>
              </>
            ) : (
              <CardContent className="pt-(--card-spacing)">
                <ScimTokenManager
                  titleId="scim-token-title"
                  providerId={selectedProvider.id}
                  providerName={selectedProvider.name}
                  initialTokenPrefix={selectedProvider.scimTokenPrefix}
                  scimBaseUrl={scimBaseUrl}
                />
              </CardContent>
            )}
          </Card>
        ) : null}

        {activeSection === "mappings" && selectedProvider ? (
          <Card aria-labelledby="mappings-title">
            <CardHeader className="border-b">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Политика ролей</p>
              <CardTitle id="mappings-title">Группы и роли</CardTitle>
              <CardDescription>
                Приоритет меньше — роль применяется раньше. Неактивные строки остаются в истории конфигурации.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary" className="tabular-nums">
                  {selectedProvider.groupRoleMappings.length}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {groupMappingsHint ? (
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
              ) : null}

              {selectedProvider.groupRoleMappings.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<UsersRound size={20} aria-hidden="true" />}
                  title="Групп пока нет"
                  description="Добавьте связь группы и роли, чтобы участники каталога получали доступ автоматически."
                />
              ) : (
                <Table aria-label="Группы и роли">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Статус</TableHead>
                      <TableHead>Группа</TableHead>
                      <TableHead>Идентификатор группы</TableHead>
                      <TableHead>Роль</TableHead>
                      <TableHead className="text-right">Приоритет</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProvider.groupRoleMappings.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell>
                          <form action={toggleGroupRoleMapping}>
                            <input type="hidden" name="mappingId" value={mapping.id} />
                            <input type="hidden" name="isActive" value={mapping.isActive ? "false" : "true"} />
                            <Button
                              type="submit"
                              size="sm"
                              variant={mapping.isActive ? "outline" : "default"}
                              aria-label={`${mapping.isActive ? "Отключить" : "Включить"} группу ${mapping.externalGroupName}`}
                            >
                              {mapping.isActive ? "Отключить" : "Включить"}
                            </Button>
                          </form>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5">
                            <span className="font-medium text-foreground">{mapping.externalGroupName}</span>
                            <StatusPill tone={mapping.isActive ? "success" : "neutral"}>
                              {mapping.isActive ? "Активна" : "Отключена"}
                            </StatusPill>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-normal">
                          {mapping.externalGroupId}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{roleLabels[mapping.role]}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{mapping.priority}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <Separator />

              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Добавить группу</h3>
                  <p className="text-sm text-muted-foreground">Создайте правило сопоставления группы каталога с ролью QC.</p>
                </div>
                <form action={saveGroupRoleMapping} className="flex flex-col gap-4">
                  <input type="hidden" name="providerId" value={selectedProvider.id} />
                  <input type="hidden" name="returnSection" value="mappings" />
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <ProviderField
                      label="Идентификатор группы"
                      name="externalGroupId"
                      required
                      placeholder="QC_Analysts или GUID группы"
                    />
                    <ProviderField
                      label="Название группы"
                      name="externalGroupName"
                      required
                      placeholder="Аналитики контроля качества"
                    />
                    <Field>
                      <FieldLabel htmlFor="role">Роль</FieldLabel>
                      <NativeSelect id="role" name="role" defaultValue="QA_ANALYST" className="w-full">
                        {roles.map((role) => (
                          <NativeSelectOption key={role} value={role}>
                            {roleLabels[role]}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <ProviderField label="Приоритет" name="priority" defaultValue="100" type="number" />
                    <Field orientation="horizontal" className="items-center sm:col-span-2">
                      <Switch id="mapping-is-active" name="isActive" defaultChecked />
                      <FieldLabel htmlFor="mapping-is-active" className="font-normal">
                        Активна
                      </FieldLabel>
                    </Field>
                  </FieldGroup>
                  <div className="flex justify-end">
                    <ValidatedSubmitButton className={buttonVariants()}>Сохранить группу</ValidatedSubmitButton>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "sessions" ? (
          <Card aria-labelledby="sessions-title">
            <CardHeader className="border-b">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Сессии</p>
              <CardTitle id="sessions-title">Сессии пользователей</CardTitle>
              <CardDescription>Последние 40 сессий: источник входа, пользователь и возможность отзыва.</CardDescription>
              <CardAction>
                <Badge variant="secondary" className="tabular-nums">
                  {sessions.length}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<UsersRound size={20} aria-hidden="true" />}
                  title="Сессий пока нет"
                  description="Активные входы появятся здесь после первой авторизации пользователей."
                />
              ) : (
                <Table aria-label="Сессии пользователей">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Пользователь</TableHead>
                      <TableHead>Провайдер</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Последняя активность</TableHead>
                      <TableHead>Завершение</TableHead>
                      <TableHead className="text-right">Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{session.user.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {session.user.email} · {roleLabels[session.user.role]}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-foreground">{session.provider?.name ?? "Без провайдера"}</span>
                            <span className="text-xs text-muted-foreground">
                              {session.provider ? providerTypeLabels[session.provider.type] : "Локальный вход"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={statusTone(session.status)}>{sessionStatusLabels[session.status]}</StatusPill>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{formatDate(session.lastSeenAt)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{formatDate(session.expiresAt)}</TableCell>
                        <TableCell className="text-right">
                          {session.status === "ACTIVE" ? (
                            <form action={revokeAuthSessionById} className="inline-flex">
                              <input type="hidden" name="sessionId" value={session.id} />
                              <ConfirmSubmitButton
                                className={buttonVariants({ variant: "destructive", size: "sm" })}
                                aria-label={`Отозвать сессию ${session.user.email}`}
                                confirmMessage={`Отозвать сессию пользователя ${session.user.email}? Пользователь будет разлогинен, сессию нельзя восстановить — потребуется повторный вход.`}
                              >
                                Отозвать
                              </ConfirmSubmitButton>
                            </form>
                          ) : (
                            <span className="text-sm text-muted-foreground">Нет действия</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "recommendations" ? (
          <Card aria-labelledby="recommendations-title">
            <CardHeader className="border-b">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Справка</p>
              <CardTitle id="recommendations-title">Рекомендации</CardTitle>
              <CardDescription>Короткие подсказки по AD/Entra и резервным сценариям.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Alert>
                  <AlertTitle>Основной путь</AlertTitle>
                  <AlertDescription>{guidance.preferred}</AlertDescription>
                </Alert>
                <Alert>
                  <AlertTitle>Локальный AD</AlertTitle>
                  <AlertDescription>{guidance.onPremDirectory}</AlertDescription>
                </Alert>
                <Alert>
                  <AlertTitle>Роли</AlertTitle>
                  <AlertDescription>{guidance.authorization}</AlertDescription>
                </Alert>
              </div>
              <Alert>
                <Link2 className="size-4" aria-hidden="true" />
                <AlertTitle>Ссылка для входа</AlertTitle>
                <AlertDescription className="flex flex-col gap-2">
                  <span>Для входа через выбранный провайдер используйте:</span>
                  <code className="rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-xs break-all text-foreground">
                    {selectedProviderSsoPath}
                  </code>
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
              Рекомендации носят справочный характер и не заменяют проверку конфигурации IdP.
            </CardFooter>
          </Card>
        ) : null}
      </AdminFrame>
    </PageShell>
  );
}
