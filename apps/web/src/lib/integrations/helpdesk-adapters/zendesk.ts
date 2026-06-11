import { basicCredentialHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;

export function createZendeskAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = trimTrailingSlash(input.baseUrl);
      const ticketId = encodeURIComponent(input.externalId);
      const requestDefaults = {
        source: "zendesk" as const,
        method: "GET" as const,
        headers: basicCredentialHeaders(input.token),
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      };

      const ticketResponse = await client.requestJson({
        ...requestDefaults,
        operation: "ticket_get",
        url: `${baseUrl}/api/v2/tickets/${ticketId}.json`
      });
      const commentsResponse = await client.requestJson({
        ...requestDefaults,
        operation: "comments_get",
        // Sideload the `users` array so the normalizer can resolve author roles
        // (agent/admin vs end-user) and author names instead of misclassifying
        // every agent reply as a customer.
        url: `${baseUrl}/api/v2/tickets/${ticketId}/comments.json?include=users`
      });
      const payload = {
        ...recordValue(ticketResponse.body),
        ...recordValue(commentsResponse.body)
      };

      return {
        source: "zendesk",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "zendesk", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [ticketResponse.diagnostic, commentsResponse.diagnostic]
        }
      };
    }
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
