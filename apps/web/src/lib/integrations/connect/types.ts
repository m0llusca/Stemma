import type { CustomConversationInput } from "@/lib/validation/custom-api";

export type ConnectStepKey =
  | "validate_url"
  | "reachability"
  | "auto_detect"
  | "verify_auth"
  | "capability_probe"
  | "webhook_probe"
  | "persist"
  | "test_import"
  | "certification_evidence";

export type ConnectStepStatus = "ok" | "warning" | "failed" | "skipped";

export type ConnectStep = {
  step: ConnectStepKey;
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type UrlHints = {
  basePath?: string;
  testTicketId?: string;
  detectedSource?: string;
};

export type CredentialField = {
  key: string;
  label: string;
  placeholder?: string;
  format?: string; // RegExp source string (serialisable to the client)
  hint?: string;
  secret: boolean;
};

// Креды, собранные формой: { [field.key]: value }
export type ConnectCredentials = Record<string, string>;

export type ConnectContext = {
  baseUrl: string;
  credentials: ConnectCredentials;
  hints?: UrlHints;
  testTicketId?: string;
  config: Record<string, unknown>; // накапливается autoDetect
};

export type AutoDetectResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  config?: Record<string, unknown>; // вливается в ctx.config
};

export type VerifyResult = {
  status: "ok" | "failed";
  detail?: string;
  hint?: string;
  authMode: string; // сохраняется в Integration.authMode
  secretSlots: Array<{ kind: string; secret: string }>; // что положить в зашифрованные слоты
};

export type TestImportResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  conversation?: CustomConversationInput;
};

export type CapabilityProbeResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type WebhookProbeResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type CertificationEvidenceResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type SourceConnectionProfile = {
  source: string;
  type: "otrs_family" | "native_helpdesk" | "enterprise" | "data_source";
  urlPolicy: "required" | "fixed" | "optional";
  fixedBaseUrl?: string;
  hostPatterns?: RegExp[];
  credentialFields: CredentialField[];
  normalizeUrl(raw: string): { baseUrl: string; hints?: UrlHints };
  autoDetect?(ctx: ConnectContext): Promise<AutoDetectResult>;
  verifyAuth(ctx: ConnectContext): Promise<VerifyResult>;
  probeCapabilities?(ctx: ConnectContext): Promise<CapabilityProbeResult>;
  probeWebhooks?(ctx: ConnectContext): Promise<WebhookProbeResult>;
  recordCertificationEvidence?(ctx: ConnectContext): Promise<CertificationEvidenceResult>;
  testImport?(ctx: ConnectContext): Promise<TestImportResult>;
};
