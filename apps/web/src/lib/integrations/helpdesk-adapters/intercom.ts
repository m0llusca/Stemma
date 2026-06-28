import { bearerHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import { capabilityProbeFromLoadResult } from "@/lib/integrations/helpdesk-adapters/probes";
import type {
  HelpdeskAdapterLoadInput,
  HelpdeskAdapterLoadResult,
  HelpdeskAdapterProbeInput,
  HelpdeskCapabilityProbeResult
} from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;
// Pins the Intercom REST API version sent via the Intercom-Version header. Can be
// overridden per-environment with INTERCOM_VERSION / INTERCOM_API_VERSION.
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
    },

    async probeCapabilities(input: HelpdeskAdapterProbeInput): Promise<HelpdeskCapabilityProbeResult> {
      if (!input.externalId) {
        return {
          status: "warning",
          operations: [],
          detail: "Для проверки Intercom нужен тестовый conversation ID.",
          hint: "Укажите conversation ID и повторите проверку.",
          diagnostics: { requests: [] }
        };
      }

      const loaded = await this.loadConversation({
        ...input,
        externalId: input.externalId
      });
      return capabilityProbeFromLoadResult(input, loaded, ["conversations_get"]);
    }
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
