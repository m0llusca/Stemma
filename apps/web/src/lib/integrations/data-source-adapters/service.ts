import type { Integration, IntegrationCredential } from "@prisma/client";
import { dataSourceContracts, dataSourceSources } from "@/lib/integrations/data-source-adapters/source-contracts";
import type { DataSourceSource } from "@/lib/integrations/data-source-adapters/types";
import { createYdbAdapter } from "@/lib/integrations/data-source-adapters/ydb";
import { createYTsaurusAdapter } from "@/lib/integrations/data-source-adapters/ytsaurus";
import { decryptSecret } from "@/lib/secrets";

type IntegrationWithCredentials = Integration & {
  credentials: IntegrationCredential[];
};

function isDataSourceSource(source: string): source is DataSourceSource {
  return dataSourceSources.some((item) => item === source);
}

function parseConfig(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isConnectivityOnly(config: Record<string, unknown>) {
  return config.connectivityOnly === true;
}

function credentialSecret(credentials: IntegrationCredential[], kind: string) {
  const credential = credentials.find((item) => item.kind === kind);

  if (!credential) {
    throw new Error(`Не заполнен требуемый secret slot ${kind}.`);
  }

  return decryptSecret(credential.encryptedSecret);
}

export async function loadDataSourceAdapterConversations(input: {
  integration: IntegrationWithCredentials;
  limit: number;
}) {
  const source = input.integration.source.trim().toLowerCase();

  if (!isDataSourceSource(source)) {
    throw new Error("Неподдерживаемый data source.");
  }

  const contract = dataSourceContracts[source];

  if (input.integration.type !== contract.type) {
    throw new Error("Тип интеграции не соответствует data source contract.");
  }

  const config = parseConfig(input.integration.configJson);
  const adapter = source === "ydb" ? createYdbAdapter() : createYTsaurusAdapter();
  const [requiredSecret] = contract.requiredSecrets;
  const limit = Math.min(input.limit, contract.payloadLimits.rowLimit);

  const result = await adapter.loadRows({
    source,
    baseUrl: input.integration.baseUrl,
    config,
    credential: requiredSecret ? credentialSecret(input.integration.credentials, requiredSecret) : undefined,
    limit,
    maxResponseBytes: contract.payloadLimits.maxResponseBytes
  });

  if (result.conversations.length === 0 && !isConnectivityOnly(config)) {
    throw new Error("Источник данных не вернул обращения в поддерживаемом формате.");
  }

  return result;
}
