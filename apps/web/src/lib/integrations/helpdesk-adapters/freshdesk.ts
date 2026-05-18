import { basicApiTokenHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;

export function createFreshdeskAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = trimTrailingSlash(input.baseUrl);
      const ticketId = encodeURIComponent(input.externalId);
      const requestDefaults = {
        source: "freshdesk" as const,
        method: "GET" as const,
        headers: basicApiTokenHeaders(input.token, "X"),
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      };

      const ticketResponse = await client.requestJson({
        ...requestDefaults,
        operation: "ticket_get",
        url: `${baseUrl}/api/v2/tickets/${ticketId}?include=conversations`
      });
      const ticket = recordValue(ticketResponse.body);
      const diagnostics = [ticketResponse.diagnostic];
      let conversations = arrayValue(ticket.conversations);

      if (conversations.length === 0) {
        const conversationsResponse = await client.requestJson({
          ...requestDefaults,
          operation: "conversations_get",
          url: `${baseUrl}/api/v2/tickets/${ticketId}/conversations`
        });

        diagnostics.push(conversationsResponse.diagnostic);
        conversations = arrayValue(conversationsResponse.body);
      }

      const payload = {
        ticket: {
          ...ticket,
          conversations
        },
        conversations
      };

      return {
        source: "freshdesk",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "freshdesk", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: diagnostics
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

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
