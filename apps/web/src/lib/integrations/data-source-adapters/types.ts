import type { CertificationGateSummary, CertificationSummary } from "@/lib/certification/status";
import type { CustomConversationInput } from "@/lib/validation/custom-api";

export type DataSourceSource = "ydb" | "ytsaurus";

export type DataSourceOperation = "table_read" | "query_execute" | "diagnostics" | "fixture_import";

export type DataSourceContract = {
  source: DataSourceSource;
  displayName: string;
  type: "data_source";
  authModes: readonly string[];
  operations: readonly DataSourceOperation[];
  requiredSecrets: readonly string[];
  docsHref: string;
  payloadLimits: {
    rowLimit: number;
    maxResponseBytes: number;
  };
  certification: {
    gates: CertificationGateSummary;
    summary: CertificationSummary;
    limitations: readonly string[];
  };
};

export type DataSourceAdapterLoadInput = {
  source: DataSourceSource;
  baseUrl: string | null;
  config: Record<string, unknown>;
  credential?: string;
  limit: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type DataSourceAdapterLoadResult = {
  source: DataSourceSource;
  rows: unknown[];
  conversations: CustomConversationInput[];
  diagnostics: {
    requests: Array<{
      operation: DataSourceOperation;
      method: "GET" | "POST" | "YQL";
      url: string;
      statusCode: number;
    }>;
  };
};
