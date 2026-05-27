import {
  summarizeCertification,
  type CertificationGateSummary,
  type CertificationStatus
} from "@/lib/certification/status";
import {
  phaseBHelpdeskSources,
  phaseBSourceContracts
} from "@/lib/integrations/helpdesk-adapters/source-contracts";
import { dataSourceContracts, dataSourceSources } from "@/lib/integrations/data-source-adapters/source-contracts";

type IntegrationCertificationDoc = {
  label: string;
  href: string;
  status: CertificationStatus;
};

export type IntegrationCapability = {
  source: string;
  displayName: string;
  type: "otrs_family" | "native_helpdesk" | "custom_api" | "webhook_bridge" | "enterprise" | "data_source";
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

const fallbackCapabilityMetadata = {
  docsHref: "/api/v1/openapi",
  setupStatus: "planned",
  readiness: "roadmap"
} satisfies Pick<IntegrationCapability, "docsHref" | "setupStatus" | "readiness">;

type PhaseBSource = keyof typeof phaseBSourceContracts;

function phaseBCapability(source: PhaseBSource): IntegrationCapability {
  const contract = phaseBSourceContracts[source];

  return {
    source: contract.source,
    displayName: contract.displayName,
    type: contract.type,
    authModes: [...contract.authModes],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: contract.operations.includes("diagnostics"),
    supportsInboundWebhooks: contract.operations.includes("webhook_ingest"),
    supportsOutboundWebhooks: false,
    operations: [...contract.operations],
    supportedEvents: [...contract.supportedEvents],
    requiredSecrets: [...contract.requiredSecrets],
    docsHref: contract.docsHref,
    setupStatus: contract.type === "native_helpdesk" ? "available" : "preview",
    payloadLimits: { ...contract.payloadLimits },
    readiness: "adapter_ready",
    certification: {
      gates: { ...contract.certification.gates },
      summary: { ...contract.certification.summary },
      docs: contract.officialDocs.map((doc) => ({
        label: doc.label,
        href: doc.href,
        status: contract.certification.gates.docs
      })),
      limitations: [...contract.certification.limitations]
    }
  };
}

const phaseBCapabilities = phaseBHelpdeskSources.map(phaseBCapability);
const nativePhaseBCapabilities = phaseBCapabilities.filter((capability) => capability.type === "native_helpdesk");
const enterprisePhaseBCapabilities = phaseBCapabilities.filter((capability) => capability.type === "enterprise");

function dataSourceCapability(source: keyof typeof dataSourceContracts): IntegrationCapability {
  const contract = dataSourceContracts[source];

  return {
    source: contract.source,
    displayName: contract.displayName,
    type: "data_source",
    authModes: [...contract.authModes],
    supportsPaging: false,
    supportsCursor: false,
    supportsDiagnostics: contract.operations.includes("diagnostics"),
    supportsInboundWebhooks: false,
    supportsOutboundWebhooks: false,
    operations: [...contract.operations],
    supportedEvents: defaultEvents,
    requiredSecrets: [...contract.requiredSecrets],
    docsHref: contract.docsHref,
    setupStatus: "preview",
    payloadLimits: {
      batchSize: 100,
      importLimit: contract.payloadLimits.rowLimit
    },
    readiness: "adapter_ready",
    certification: {
      gates: { ...contract.certification.gates },
      summary: { ...contract.certification.summary },
      docs: [
        {
          label: `${contract.displayName} documentation`,
          href: contract.docsHref,
          status: contract.certification.gates.docs
        }
      ],
      limitations: [...contract.certification.limitations]
    }
  };
}

const dataSourceCapabilities = dataSourceSources.map(dataSourceCapability);

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
  ...nativePhaseBCapabilities,
  ...dataSourceCapabilities,
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
  ...enterprisePhaseBCapabilities
];

export function getIntegrationCapability(source: string, type?: string | null): IntegrationCapability {
  const normalizedSource = source.trim().toLowerCase();
  const direct = integrationCapabilities.find((capability) => capability.source === normalizedSource);

  if (direct) {
    return direct;
  }

  if (type === "otrs_family") {
    const fallback = integrationCapabilities.find((capability) => capability.source === "otrs")!;
    const fallbackSource = normalizedSource || "otrs_family";
    const fallbackDisplayName = source.trim() || "OTRS family";

    return {
      ...fallback,
      source: fallbackSource,
      displayName: fallbackDisplayName,
      ...fallbackCapabilityMetadata,
      certification: fallbackCertification(fallbackSource)
    };
  }

  if (type === "native_helpdesk") {
    const fallback = integrationCapabilities.find((capability) => capability.source === "zendesk")!;

    return {
      ...fallback,
      source: normalizedSource,
      displayName: source,
      ...fallbackCapabilityMetadata,
      certification: fallbackCertification(source)
    };
  }

  const fallback = integrationCapabilities.find((capability) => capability.source === "custom_api")!;

  return {
    ...fallback,
    source: normalizedSource || "custom_api",
    displayName: source || "Custom API",
    ...fallbackCapabilityMetadata,
    certification: fallbackCertification(source)
  };
}

export function listIntegrationCapabilities() {
  return integrationCapabilities;
}
