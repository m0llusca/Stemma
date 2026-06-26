import { summarizeCertification, type CertificationGateSummary } from "@/lib/certification/status";
import type {
  IntegrationInstallContract,
  IntegrationInstallFamily,
  IntegrationInstallSource,
  IntegrationInstallState
} from "@/lib/integrations/install-contracts/types";

const readyForLiveGates = {
  docs: "docs_checked",
  contract: "contract_certified",
  stub: "stub_certified",
  live: "waiting_for_access"
} as const satisfies CertificationGateSummary;

const limitedGates = {
  ...readyForLiveGates,
  live: "limited"
} as const satisfies CertificationGateSummary;

const webhookCallbackPath = "/api/v1/webhooks/{endpointId}";

type InstallContractConfig = Readonly<{
  source: IntegrationInstallSource;
  family: IntegrationInstallFamily;
  displayName: string;
  installState: IntegrationInstallState;
  authModes: readonly string[];
  requiredScopes?: readonly string[];
  supportsWebhooks?: boolean;
  callbackPath?: string;
  healthChecks: readonly string[];
  testImportMode?: IntegrationInstallContract["testImport"]["mode"];
  testImportSupported?: boolean;
  testImportCommand?: string;
  testImportNotes?: readonly string[];
  limited?: boolean;
  limitations?: readonly string[];
}>;

function installContract(config: InstallContractConfig): IntegrationInstallContract {
  const supportsWebhooks = config.supportsWebhooks ?? false;

  return {
    source: config.source,
    family: config.family,
    displayName: config.displayName,
    installState: config.installState,
    authModes: [...config.authModes],
    requiredScopes: [...(config.requiredScopes ?? [])],
    callbackPath: config.callbackPath ?? (supportsWebhooks ? webhookCallbackPath : undefined),
    supportsWebhooks,
    healthChecks: [...config.healthChecks],
    testImport: {
      mode: config.testImportMode ?? "fixture",
      supported: config.testImportSupported ?? true,
      command: config.testImportCommand,
      notes: [
        ...(config.testImportNotes ?? [
          "Пробный импорт выполняется через существующий adapter fixture/stub путь; live import требует отдельной сертификации."
        ])
      ]
    },
    certificationState: summarizeCertification(config.limited ? limitedGates : readyForLiveGates),
    limitations: [
      ...(config.limitations ?? [
        "Живая сертификация не запускалась: нужны реальные доступы к источнику.",
        "Registry-only контракт не подключён к UI/capability manifest в этом изменении."
      ])
    ]
  };
}

const tokenOnlyHelpdeskLimitations = [
  "Доступ настраивается через существующий token/basic credential flow.",
  "OAuth install redirect flow пока не реализован для этого источника.",
  "Живая сертификация не запускалась: нужны реальные доступы к источнику.",
  "Registry-only контракт не подключён к UI/capability manifest в этом изменении."
] as const;

const helpdeskWebhookLimitations = [
  ...tokenOnlyHelpdeskLimitations,
  "Inbound webhook endpoint существует, но vendor-specific install wiring будет подключено отдельно."
] as const;

const dataSourceLimitations = [
  "Доступ настраивается через существующий credential/token flow.",
  "Проверка здоровья подтверждает доступность подключения, но не выполняет production import без явного live доступа.",
  "Живая сертификация не запускалась: нужны реальные доступы к источнику.",
  "Registry-only контракт не подключён к UI/capability manifest в этом изменении."
] as const;

const enterpriseLimitations = [
  "Ограниченная поддержка: требуется живая сертификация на tenant/sandbox заказчика.",
  "Текущий flow принимает OAuth client credentials вручную; интерактивный marketplace install не реализован.",
  "Registry-only контракт не подключён к UI/capability manifest в этом изменении."
] as const;

const otrsFamilyAuthModes = ["user_password", "session_create", "tls_ca_bundle"] as const;

export const integrationInstallSources = [
  "zendesk",
  "freshdesk",
  "intercom",
  "hubspot",
  "jira",
  "salesforce",
  "servicenow",
  "dynamics",
  "ydb",
  "ytsaurus",
  "otrs",
  "znuny",
  "otobo"
] as const satisfies readonly IntegrationInstallSource[];

export const integrationInstallContracts = {
  zendesk: installContract({
    source: "zendesk",
    family: "native_helpdesk",
    displayName: "Zendesk Support",
    installState: "token-only",
    authModes: ["basic_api_token"],
    requiredScopes: ["tickets:read", "users:read"],
    supportsWebhooks: true,
    healthChecks: ["GET /api/v2/users/me.json"],
    limitations: helpdeskWebhookLimitations
  }),
  freshdesk: installContract({
    source: "freshdesk",
    family: "native_helpdesk",
    displayName: "Freshdesk",
    installState: "token-only",
    authModes: ["basic_api_key"],
    requiredScopes: ["tickets:read", "conversations:read"],
    supportsWebhooks: true,
    healthChecks: ["GET /api/v2/agents/me"],
    limitations: helpdeskWebhookLimitations
  }),
  intercom: installContract({
    source: "intercom",
    family: "native_helpdesk",
    displayName: "Intercom",
    installState: "token-only",
    authModes: ["bearer_token"],
    requiredScopes: ["conversations.read"],
    supportsWebhooks: true,
    healthChecks: ["GET /me"],
    limitations: [
      ...helpdeskWebhookLimitations,
      "Intercom REST calls must send Intercom-Version: 2.15 until the adapter is re-certified for a newer version."
    ]
  }),
  hubspot: installContract({
    source: "hubspot",
    family: "native_helpdesk",
    displayName: "HubSpot Service Hub",
    installState: "token-only",
    authModes: ["private_app_token", "oauth"],
    requiredScopes: ["crm.objects.tickets.read"],
    supportsWebhooks: true,
    healthChecks: ["GET /account-info/v3/details"],
    limitations: [
      ...helpdeskWebhookLimitations,
      "OAuth is documented in the adapter contract, but current install flow uses a pasted private app token."
    ]
  }),
  jira: installContract({
    source: "jira",
    family: "native_helpdesk",
    displayName: "Jira Service Management",
    installState: "token-only",
    authModes: ["basic_api_token"],
    requiredScopes: ["read:servicedesk-request", "read:jira-user"],
    supportsWebhooks: true,
    healthChecks: ["GET /rest/servicedeskapi/myself"],
    limitations: helpdeskWebhookLimitations
  }),
  salesforce: installContract({
    source: "salesforce",
    family: "enterprise",
    displayName: "Salesforce Service Cloud",
    installState: "limited",
    authModes: ["oauth_connected_app"],
    requiredScopes: ["api", "refresh_token"],
    supportsWebhooks: true,
    healthChecks: ["POST /services/oauth2/token"],
    testImportMode: "probe",
    testImportSupported: false,
    testImportNotes: ["Only token exchange probing is registered until a live Salesforce tenant is certified."],
    limited: true,
    limitations: enterpriseLimitations
  }),
  servicenow: installContract({
    source: "servicenow",
    family: "enterprise",
    displayName: "ServiceNow Customer Service",
    installState: "limited",
    authModes: ["basic", "oauth"],
    requiredScopes: ["table_api:read", "attachment_api:read"],
    supportsWebhooks: true,
    healthChecks: ["POST /oauth_token.do"],
    testImportMode: "probe",
    testImportSupported: false,
    testImportNotes: ["Only credential probing is registered until a live ServiceNow instance is certified."],
    limited: true,
    limitations: enterpriseLimitations
  }),
  dynamics: installContract({
    source: "dynamics",
    family: "enterprise",
    displayName: "Dynamics 365 Customer Service",
    installState: "limited",
    authModes: ["oauth"],
    requiredScopes: ["https://org.crm.dynamics.com/.default"],
    supportsWebhooks: true,
    healthChecks: ["POST /oauth2/token"],
    testImportMode: "probe",
    testImportSupported: false,
    testImportNotes: ["Only token exchange probing is registered until a live Dataverse tenant is certified."],
    limited: true,
    limitations: enterpriseLimitations
  }),
  ydb: installContract({
    source: "ydb",
    family: "data_source",
    displayName: "YDB",
    installState: "token-only",
    authModes: ["static_credentials"],
    requiredScopes: ["database:read"],
    healthChecks: ["Driver.ready()"],
    testImportMode: "probe",
    limitations: dataSourceLimitations
  }),
  ytsaurus: installContract({
    source: "ytsaurus",
    family: "data_source",
    displayName: "YTsaurus/YT",
    installState: "token-only",
    authModes: ["oauth_token"],
    requiredScopes: ["read"],
    healthChecks: ["GET /api/v3/get?path=//@ with Authorization: OAuth"],
    testImportMode: "probe",
    limitations: dataSourceLimitations
  }),
  otrs: installContract({
    source: "otrs",
    family: "otrs_family",
    displayName: "OTRS Community Edition 6",
    installState: "token-only",
    authModes: otrsFamilyAuthModes,
    requiredScopes: ["ticket:read"],
    healthChecks: ["GenericTicketConnectorREST TicketSearch"],
    limitations: tokenOnlyHelpdeskLimitations
  }),
  znuny: installContract({
    source: "znuny",
    family: "otrs_family",
    displayName: "Znuny LTS",
    installState: "token-only",
    authModes: otrsFamilyAuthModes,
    requiredScopes: ["ticket:read"],
    healthChecks: ["GenericTicketConnectorREST TicketSearch"],
    limitations: tokenOnlyHelpdeskLimitations
  }),
  otobo: installContract({
    source: "otobo",
    family: "otrs_family",
    displayName: "OTOBO",
    installState: "token-only",
    authModes: otrsFamilyAuthModes,
    requiredScopes: ["ticket:read"],
    healthChecks: ["GenericTicketConnectorREST TicketSearch"],
    limitations: tokenOnlyHelpdeskLimitations
  })
} satisfies Record<IntegrationInstallSource, IntegrationInstallContract>;

export function listIntegrationInstallContracts(): IntegrationInstallContract[] {
  return integrationInstallSources.map((source) => integrationInstallContracts[source]);
}

export function getIntegrationInstallContract(source: string): IntegrationInstallContract | undefined {
  if (!Object.prototype.hasOwnProperty.call(integrationInstallContracts, source)) {
    return undefined;
  }

  return integrationInstallContracts[source as IntegrationInstallSource];
}
