import {
  summarizeCertification,
  type CertificationGateSummary,
  type CertificationStatus
} from "@/lib/certification/status";

type IntegrationCertificationDoc = {
  label: string;
  href: string;
  status: CertificationStatus;
};

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
  certification: {
    gates: CertificationGateSummary;
    summary: ReturnType<typeof summarizeCertification>;
    docs: IntegrationCertificationDoc[];
    limitations: string[];
  };
};

const defaultPayloadLimits = {
  batchSize: 25,
  importLimit: 100
};

const defaultEvents = ["conversation.upsert"];

function certification({
  gates,
  docs,
  limitations = []
}: {
  gates: CertificationGateSummary;
  docs: IntegrationCertificationDoc[];
  limitations?: string[];
}) {
  return {
    gates,
    summary: summarizeCertification(gates),
    docs,
    limitations
  };
}

const adapterReadyGates: CertificationGateSummary = {
  docs: "docs_checked",
  contract: "contract_certified",
  stub: "stub_certified",
  live: "waiting_for_access"
};

const liveCertifiedGates: CertificationGateSummary = {
  docs: "docs_checked",
  contract: "contract_certified",
  stub: "stub_certified",
  live: "live_certified"
};

const roadmapGates: CertificationGateSummary = {
  docs: "configuration_required",
  contract: "not_production_ready",
  stub: "not_production_ready",
  live: "not_production_ready"
};

const fallbackUnverifiedGates: CertificationGateSummary = {
  docs: "configuration_required",
  contract: "not_production_ready",
  stub: "not_production_ready",
  live: "not_production_ready"
};

function fallbackCertification(source: string) {
  return certification({
    gates: { ...fallbackUnverifiedGates },
    docs: [
      {
        label: "Fallback capability requires separate certification",
        href: "/api/v1/openapi",
        status: "configuration_required"
      }
    ],
    limitations: [`Источник ${source} использует fallback capability и требует отдельной сертификации.`]
  });
}

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
    readiness: "production_slice",
    certification: certification({
      gates: adapterReadyGates,
      docs: [
        {
          label: "GenericInterface TicketSearch/TicketGet",
          href: "/admin/integrations/new?source=otrs",
          status: "docs_checked"
        }
      ],
      limitations: ["Живая сертификация требует защищенный OTRS/Znuny/OTOBO sandbox."]
    })
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
    readiness: "adapter_ready",
    certification: certification({
      gates: adapterReadyGates,
      docs: [
        {
          label: "GenericInterface TicketSearch/TicketGet",
          href: "/admin/integrations/new?source=znuny",
          status: "docs_checked"
        }
      ],
      limitations: ["Живая сертификация требует защищенный OTRS/Znuny/OTOBO sandbox."]
    })
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
    readiness: "adapter_ready",
    certification: certification({
      gates: adapterReadyGates,
      docs: [
        {
          label: "GenericInterface TicketSearch/TicketGet",
          href: "/admin/integrations/new?source=otobo",
          status: "docs_checked"
        }
      ],
      limitations: ["Живая сертификация требует защищенный OTRS/Znuny/OTOBO sandbox."]
    })
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
    readiness: "adapter_ready",
    certification: certification({
      gates: adapterReadyGates,
      docs: [
        {
          label: "Zendesk API contract",
          href: "/admin/integrations/new?source=zendesk",
          status: "docs_checked"
        }
      ],
      limitations: ["Adapter готов к контрактной проверке; нужна live-среда для промышленной сертификации."]
    })
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
    readiness: "adapter_ready",
    certification: certification({
      gates: adapterReadyGates,
      docs: [
        {
          label: "Freshdesk API contract",
          href: "/admin/integrations/new?source=freshdesk",
          status: "docs_checked"
        }
      ],
      limitations: ["Adapter готов к контрактной проверке; нужна live-среда для промышленной сертификации."]
    })
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
    readiness: "adapter_ready",
    certification: certification({
      gates: adapterReadyGates,
      docs: [
        {
          label: "Intercom API contract",
          href: "/admin/integrations/new?source=intercom",
          status: "docs_checked"
        }
      ],
      limitations: ["Adapter готов к контрактной проверке; нужна live-среда для промышленной сертификации."]
    })
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
    readiness: "adapter_ready",
    certification: certification({
      gates: adapterReadyGates,
      docs: [
        {
          label: "HubSpot API contract",
          href: "/admin/integrations/new?source=hubspot",
          status: "docs_checked"
        }
      ],
      limitations: ["Adapter готов к контрактной проверке; нужна live-среда для промышленной сертификации."]
    })
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
    readiness: "production_slice",
    certification: certification({
      gates: liveCertifiedGates,
      docs: [
        {
          label: "OpenAPI contract",
          href: "/api/v1/openapi",
          status: "contract_certified"
        }
      ]
    })
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
    readiness: "adapter_ready",
    certification: certification({
      gates: adapterReadyGates,
      docs: [
        {
          label: "Webhook HMAC contract",
          href: "/api/v1/openapi",
          status: "contract_certified"
        }
      ],
      limitations: ["Живая сертификация требует внешний webhook producer."]
    })
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
    readiness: "roadmap",
    certification: certification({
      gates: roadmapGates,
      docs: [
        {
          label: "Официальная документация требует проверки перед реализацией adapter",
          href: "/api/v1/openapi",
          status: "configuration_required"
        }
      ],
      limitations: ["Adapter еще не реализован."]
    })
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
    readiness: "roadmap",
    certification: certification({
      gates: roadmapGates,
      docs: [
        {
          label: "Официальная документация требует проверки перед реализацией adapter",
          href: "/api/v1/openapi",
          status: "configuration_required"
        }
      ],
      limitations: ["Adapter еще не реализован."]
    })
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
    readiness: "roadmap",
    certification: certification({
      gates: roadmapGates,
      docs: [
        {
          label: "Официальная документация требует проверки перед реализацией adapter",
          href: "/api/v1/openapi",
          status: "configuration_required"
        }
      ],
      limitations: ["Adapter еще не реализован."]
    })
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
    const fallback = integrationCapabilities.find((capability) => capability.source === "zendesk")!;

    return {
      ...fallback,
      source: normalizedSource,
      displayName: source,
      certification: fallbackCertification(source)
    };
  }

  const fallback = integrationCapabilities.find((capability) => capability.source === "custom_api")!;

  return {
    ...fallback,
    source: normalizedSource || "custom_api",
    displayName: source || "Custom API",
    certification: fallbackCertification(source)
  };
}

export function listIntegrationCapabilities() {
  return integrationCapabilities;
}
