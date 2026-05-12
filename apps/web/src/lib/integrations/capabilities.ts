export type IntegrationCapability = {
  source: string;
  displayName: string;
  type: "otrs_family" | "native_helpdesk" | "custom_api" | "webhook_bridge" | "enterprise";
  authModes: string[];
  supportsPaging: boolean;
  supportsCursor: boolean;
  supportsDiagnostics: boolean;
  supportsInboundWebhooks: boolean;
  supportsOutboundWebhooks: boolean;
  operations: string[];
  supportedEvents: string[];
  requiredSecrets: string[];
  docsHref: string;
  setupStatus: "available" | "preview" | "planned";
  payloadLimits: {
    batchSize: number;
    importLimit: number;
  };
  readiness: "production_slice" | "adapter_ready" | "roadmap";
};

const defaultPayloadLimits = {
  batchSize: 25,
  importLimit: 100
};

const defaultEvents = ["conversation.upsert"];

export const integrationCapabilities: IntegrationCapability[] = [
  {
    source: "otrs",
    displayName: "OTRS CE 6",
    type: "otrs_family",
    authModes: ["user_password", "session_create", "tls_ca_bundle"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: false,
    supportsOutboundWebhooks: false,
    operations: ["diagnostics", "ticket_search", "ticket_get", "preview", "selected_import"],
    supportedEvents: [],
    requiredSecrets: ["auth_password"],
    docsHref: "/admin/integrations/new?source=otrs",
    setupStatus: "available",
    payloadLimits: { batchSize: 25, importLimit: 50 },
    readiness: "production_slice"
  },
  {
    source: "znuny",
    displayName: "Znuny",
    type: "otrs_family",
    authModes: ["user_password", "session_create", "tls_ca_bundle"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: false,
    supportsOutboundWebhooks: false,
    operations: ["diagnostics", "ticket_search", "ticket_get", "preview", "selected_import"],
    supportedEvents: [],
    requiredSecrets: ["auth_password"],
    docsHref: "/admin/integrations/new?source=znuny",
    setupStatus: "available",
    payloadLimits: { batchSize: 25, importLimit: 50 },
    readiness: "adapter_ready"
  },
  {
    source: "otobo",
    displayName: "OTOBO",
    type: "otrs_family",
    authModes: ["user_password", "session_create", "tls_ca_bundle"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: false,
    supportsOutboundWebhooks: false,
    operations: ["diagnostics", "ticket_search", "ticket_get", "preview", "selected_import"],
    supportedEvents: [],
    requiredSecrets: ["auth_password"],
    docsHref: "/admin/integrations/new?source=otobo",
    setupStatus: "available",
    payloadLimits: { batchSize: 25, importLimit: 50 },
    readiness: "adapter_ready"
  },
  {
    source: "zendesk",
    displayName: "Zendesk",
    type: "native_helpdesk",
    authModes: ["bearer_token", "api_token"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["ticket_get", "comments_get", "fixture_import", "webhook_ingest"],
    supportedEvents: defaultEvents,
    requiredSecrets: ["auth_password"],
    docsHref: "/admin/integrations/new?source=zendesk",
    setupStatus: "preview",
    payloadLimits: defaultPayloadLimits,
    readiness: "adapter_ready"
  },
  {
    source: "freshdesk",
    displayName: "Freshdesk",
    type: "native_helpdesk",
    authModes: ["api_token"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["ticket_get", "conversations_get", "fixture_import", "webhook_ingest"],
    supportedEvents: defaultEvents,
    requiredSecrets: ["auth_password"],
    docsHref: "/admin/integrations/new?source=freshdesk",
    setupStatus: "preview",
    payloadLimits: defaultPayloadLimits,
    readiness: "adapter_ready"
  },
  {
    source: "intercom",
    displayName: "Intercom",
    type: "native_helpdesk",
    authModes: ["bearer_token"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["conversation_get", "fixture_import", "webhook_ingest"],
    supportedEvents: defaultEvents,
    requiredSecrets: ["auth_password"],
    docsHref: "/admin/integrations/new?source=intercom",
    setupStatus: "preview",
    payloadLimits: defaultPayloadLimits,
    readiness: "adapter_ready"
  },
  {
    source: "hubspot",
    displayName: "HubSpot Service Hub",
    type: "native_helpdesk",
    authModes: ["bearer_token"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["ticket_get", "fixture_import", "webhook_ingest"],
    supportedEvents: defaultEvents,
    requiredSecrets: ["auth_password"],
    docsHref: "/admin/integrations/new?source=hubspot",
    setupStatus: "preview",
    payloadLimits: defaultPayloadLimits,
    readiness: "adapter_ready"
  },
  {
    source: "custom_api",
    displayName: "Custom API",
    type: "custom_api",
    authModes: ["bearer_token", "none"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["conversation_import", "review_export", "webhook_ingest"],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: [],
    docsHref: "/admin/tokens",
    setupStatus: "available",
    payloadLimits: { batchSize: 50, importLimit: 500 },
    readiness: "production_slice"
  },
  {
    source: "generic_webhook",
    displayName: "Generic webhooks",
    type: "webhook_bridge",
    authModes: ["hmac_sha256"],
    supportsPaging: false,
    supportsCursor: false,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["webhook_ingest"],
    supportedEvents: defaultEvents,
    requiredSecrets: ["webhook_secret"],
    docsHref: "/api/v1/openapi",
    setupStatus: "available",
    payloadLimits: { batchSize: 100, importLimit: 1000 },
    readiness: "roadmap"
  },
  {
    source: "salesforce",
    displayName: "Salesforce Service Cloud",
    type: "enterprise",
    authModes: ["oauth_client_credentials"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["case_get", "case_search", "webhook_ingest"],
    supportedEvents: defaultEvents,
    requiredSecrets: ["oauth_client_credentials"],
    docsHref: "/api/v1/openapi",
    setupStatus: "planned",
    payloadLimits: defaultPayloadLimits,
    readiness: "roadmap"
  },
  {
    source: "servicenow",
    displayName: "ServiceNow CSM",
    type: "enterprise",
    authModes: ["oauth_client_credentials", "basic"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["case_get", "case_search", "webhook_ingest"],
    supportedEvents: defaultEvents,
    requiredSecrets: ["oauth_client_credentials"],
    docsHref: "/api/v1/openapi",
    setupStatus: "planned",
    payloadLimits: defaultPayloadLimits,
    readiness: "roadmap"
  },
  {
    source: "dynamics",
    displayName: "Dynamics 365 Customer Service",
    type: "enterprise",
    authModes: ["oauth_client_credentials"],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: true,
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: false,
    operations: ["case_get", "case_search", "webhook_ingest"],
    supportedEvents: defaultEvents,
    requiredSecrets: ["oauth_client_credentials"],
    docsHref: "/api/v1/openapi",
    setupStatus: "planned",
    payloadLimits: defaultPayloadLimits,
    readiness: "roadmap"
  }
];

export function getIntegrationCapability(source: string, type?: string | null): IntegrationCapability {
  const normalizedSource = source.trim().toLowerCase();
  const direct = integrationCapabilities.find((capability) => capability.source === normalizedSource);

  if (direct) {
    return direct;
  }

  if (type === "otrs_family") {
    return integrationCapabilities.find((capability) => capability.source === "otrs")!;
  }

  if (type === "native_helpdesk") {
    return {
      ...integrationCapabilities.find((capability) => capability.source === "zendesk")!,
      source: normalizedSource,
      displayName: source
    };
  }

  return {
    ...integrationCapabilities.find((capability) => capability.source === "custom_api")!,
    source: normalizedSource || "custom_api",
    displayName: source || "Custom API"
  };
}

export function listIntegrationCapabilities() {
  return integrationCapabilities;
}
