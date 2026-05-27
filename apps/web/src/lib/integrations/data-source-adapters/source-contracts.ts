import { summarizeCertification } from "@/lib/certification/status";
import type { DataSourceContract, DataSourceSource } from "@/lib/integrations/data-source-adapters/types";

const gates = {
  docs: "docs_checked",
  contract: "contract_certified",
  stub: "stub_certified",
  live: "waiting_for_access"
} as const;

const defaultLimits = { rowLimit: 1000, maxResponseBytes: 2_000_000 } as const;

function contract(config: Omit<DataSourceContract, "payloadLimits" | "certification">): DataSourceContract {
  return {
    ...config,
    authModes: [...config.authModes],
    operations: [...config.operations],
    requiredSecrets: [...config.requiredSecrets],
    payloadLimits: { ...defaultLimits },
    certification: {
      gates: { ...gates },
      summary: summarizeCertification(gates),
      limitations: [
        "Контракт основан на документации и локальных stub проверках.",
        "Живая сертификация требует защищенный источник и реальные учетные данные."
      ]
    }
  };
}

export const dataSourceSources = ["ydb", "ytsaurus"] as const satisfies readonly DataSourceSource[];

export const dataSourceContracts = {
  ydb: contract({
    source: "ydb",
    displayName: "YDB",
    type: "data_source",
    authModes: ["static_credentials"],
    operations: ["query_execute", "diagnostics", "fixture_import"],
    requiredSecrets: ["data_source_credentials"],
    docsHref: "https://ydb.tech/docs/ru/"
  }),
  ytsaurus: contract({
    source: "ytsaurus",
    displayName: "YTsaurus/YT",
    type: "data_source",
    authModes: ["oauth_token"],
    operations: ["table_read", "diagnostics", "fixture_import"],
    requiredSecrets: ["data_source_token"],
    docsHref: "https://ytsaurus.tech/docs/ru/"
  })
} satisfies Record<DataSourceSource, DataSourceContract>;
