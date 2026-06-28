import type { CertificationGateSummary, CertificationSummary } from "@/lib/certification/status";
import type { CustomConversationInput } from "@/lib/validation/custom-api";

export type PhaseBHelpdeskSource =
  | "zendesk"
  | "freshdesk"
  | "intercom"
  | "hubspot"
  | "jira"
  | "salesforce"
  | "servicenow"
  | "dynamics";

export type HelpdeskAdapterOperation =
  | "ticket_get"
  | "ticket_search"
  | "comments_get"
  | "conversations_get"
  | "activities_get"
  | "case_get"
  | "webhook_ingest"
  | "diagnostics"
  | "fixture_import";

export type HelpdeskOfficialDoc = {
  label: string;
  href: string;
  context7Id?: string;
  checkedAt: string;
  notes: string[];
};

export type HelpdeskLiveCertificationRequirement = {
  requiredEnvironment: readonly string[];
  smokeTestCommand: string;
  neverRunByDefault: true;
};

export type HelpdeskSourceContract = {
  source: PhaseBHelpdeskSource;
  displayName: string;
  type: "native_helpdesk" | "enterprise";
  authModes: readonly string[];
  operations: readonly HelpdeskAdapterOperation[];
  supportedEvents: readonly string[];
  requiredSecrets: readonly string[];
  docsHref: string;
  payloadLimits: Readonly<{
    batchSize: number;
    importLimit: number;
  }>;
  officialDocs: readonly HelpdeskOfficialDoc[];
  liveCertification: HelpdeskLiveCertificationRequirement;
  certification: Readonly<{
    gates: CertificationGateSummary;
    summary: CertificationSummary;
    limitations: readonly string[];
  }>;
};

export type HelpdeskAdapterLoadInput = {
  source: PhaseBHelpdeskSource;
  baseUrl: string;
  externalId: string;
  token?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type HelpdeskAdapterLoadResult = {
  source: PhaseBHelpdeskSource;
  externalId: string;
  payload: unknown;
  conversations: CustomConversationInput[];
  diagnostics: {
    requests: Array<{
      operation: HelpdeskAdapterOperation;
      method: "GET" | "POST";
      url: string;
      statusCode: number;
    }>;
  };
};

export type HelpdeskAdapterProbeInput = Omit<HelpdeskAdapterLoadInput, "externalId"> & {
  externalId?: string;
};

export type HelpdeskCapabilityProbeResult = {
  status: "ok" | "warning" | "failed";
  operations: HelpdeskAdapterOperation[];
  detail: string;
  hint?: string;
  diagnostics: HelpdeskAdapterLoadResult["diagnostics"];
};

export type HelpdeskAdapter = {
  loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult>;
  probeCapabilities?(input: HelpdeskAdapterProbeInput): Promise<HelpdeskCapabilityProbeResult>;
};
