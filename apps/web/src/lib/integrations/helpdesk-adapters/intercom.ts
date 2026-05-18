import { bearerHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;
const defaultIntercomVersion = "2.15";

export function createIntercomAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = trimTrailingSlash(input.baseUrl);
      const conversationId = encodeURIComponent(input.externalId);
      const conversationResponse = await client.requestJson({
        source: "intercom",
        operation: "conversations_get",
        method: "GET",
        url: `${baseUrl}/conversations/${conversationId}`,
        headers: {
          ...bearerHeaders(input.token),
          "Intercom-Version": process.env.INTERCOM_VERSION ?? process.env.INTERCOM_API_VERSION ?? defaultIntercomVersion
        },
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      });
      const payload = {
        conversation: conversationResponse.body
      };

      return {
        source: "intercom",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "intercom", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [conversationResponse.diagnostic]
        }
      };
    }
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
