import type { CertificationSummary } from "@/lib/certification/status";

export type IntegrationInstallState =
  | "available"
  | "token-only"
  | "oauth-ready"
  | "webhook-ready"
  | "live-certified"
  | "limited";

export type IntegrationInstallSource =
  | "zendesk"
  | "freshdesk"
  | "intercom"
  | "hubspot"
  | "jira"
  | "salesforce"
  | "servicenow"
  | "dynamics"
  | "ydb"
  | "ytsaurus"
  | "otrs"
  | "znuny"
  | "otobo";

export type IntegrationInstallFamily = "native_helpdesk" | "enterprise" | "data_source" | "otrs_family";

export type IntegrationTestImportContract = Readonly<{
  mode: "fixture" | "probe" | "live";
  supported: boolean;
  command?: string;
  notes: readonly string[];
}>;

export type IntegrationInstallContract = Readonly<{
  source: IntegrationInstallSource;
  family: IntegrationInstallFamily;
  displayName: string;
  installState: IntegrationInstallState;
  authModes: readonly string[];
  requiredScopes: readonly string[];
  callbackPath?: string;
  supportsWebhooks: boolean;
  healthChecks: readonly string[];
  testImport: IntegrationTestImportContract;
  certificationState: CertificationSummary;
  limitations: readonly string[];
}>;
