import type { Integration, IntegrationCredential } from "@prisma/client";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";
import { phaseBHelpdeskSources, phaseBSourceContracts } from "@/lib/integrations/helpdesk-adapters/source-contracts";
import type {
  HelpdeskAdapterLoadResult,
  PhaseBHelpdeskSource
} from "@/lib/integrations/helpdesk-adapters/types";
import { decryptSecret } from "@/lib/secrets";
import { customConversationSchema, type CustomConversationInput } from "@/lib/validation/custom-api";

type IntegrationWithCredentials = Integration & {
  credentials: IntegrationCredential[];
};

export type HelpdeskAdapterServiceResult = {
  conversations: CustomConversationInput[];
  diagnostics: HelpdeskAdapterLoadResult["diagnostics"];
};

function requireText(value: string | null | undefined, message: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function isPhaseBHelpdeskSource(source: string): source is PhaseBHelpdeskSource {
  return phaseBHelpdeskSources.some((item) => item === source);
}

function decryptCredentialSlot(credentials: IntegrationCredential[], kind: string) {
  const slot = credentials.find((credential) => credential.kind === kind);

  return slot ? decryptSecret(slot.encryptedSecret) : undefined;
}

function runtimeSecretKind(source: PhaseBHelpdeskSource) {
  const contract = phaseBSourceContracts[source];

  return contract.requiredSecrets[0] ?? (contract.type === "enterprise" ? "oauth_client_credentials" : "auth_password");
}

export async function loadHelpdeskAdapterConversations(input: {
  integration: IntegrationWithCredentials;
  ticketId: string;
  samplingReason?: string;
}): Promise<HelpdeskAdapterServiceResult> {
  const source = input.integration.source;

  if (!isPhaseBHelpdeskSource(source)) {
    throw new Error("Неподдерживаемый Phase B helpdesk source.");
  }

  const contract = phaseBSourceContracts[source];

  if (input.integration.type !== contract.type) {
    throw new Error("Тип интеграции не соответствует Phase B helpdesk source.");
  }

  const baseUrl = requireText(input.integration.baseUrl, "Для helpdesk-адаптера укажите Base URL.");
  const externalId = requireText(input.ticketId, "Для helpdesk-адаптера укажите ID обращения для проверки или первого импорта.");
  const token = requireText(
    decryptCredentialSlot(input.integration.credentials, runtimeSecretKind(source)),
    "Для helpdesk-адаптера сохраните API-ключ или OAuth client credentials."
  );
  const result = await createHelpdeskAdapter(source).loadConversation({
    source,
    baseUrl,
    externalId,
    token
  });
  const conversations = result.conversations.map((conversation) =>
    customConversationSchema.parse({
      ...conversation,
      samplingReason: conversation.samplingReason ?? input.samplingReason
    })
  );

  if (conversations.length === 0) {
    throw new Error("Источник не вернул обращение в поддерживаемом формате.");
  }

  return {
    conversations,
    diagnostics: result.diagnostics
  };
}
