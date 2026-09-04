import { basicApiTokenHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
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
// The `include=conversations` embed caps at 10 conversations, so we always
// page the dedicated conversations endpoint to capture the full thread. Bound
// the paging so a runaway ticket cannot make unbounded requests.
const conversationsPerPage = 100;
const maxConversationPages = 10;

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
        // `include=requester` embeds the requester object so the normalizer can
        // resolve customerName instead of degrading to the numeric requester_id.
        // `include=conversations` embeds the first conversations (capped at 10).
        url: `${baseUrl}/api/v2/tickets/${ticketId}?include=conversations,requester`
      });
      const ticket = recordValue(ticketResponse.body);
      const diagnostics = [ticketResponse.diagnostic];
      const embeddedConversations = arrayValue(ticket.conversations);

      // The embed caps at 10 conversations, so always page the dedicated
      // conversations endpoint to capture the full thread. The paged result
      // supersedes the (possibly truncated) embedded set when it returns data.
      const pagedConversations: unknown[] = [];

      for (let page = 1; page <= maxConversationPages; page += 1) {
        const conversationsResponse = await client.requestJson({
          ...requestDefaults,
          operation: "conversations_get",
          url: `${baseUrl}/api/v2/tickets/${ticketId}/conversations?per_page=${conversationsPerPage}&page=${page}`
        });

        diagnostics.push(conversationsResponse.diagnostic);

        const pageConversations = arrayValue(conversationsResponse.body);
        pagedConversations.push(...pageConversations);

        // Stop once a short page (or empty page) signals the end of the list.
        if (pageConversations.length < conversationsPerPage) {
          break;
        }
      }

      const conversations = pagedConversations.length > 0 ? pagedConversations : embeddedConversations;

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
    },

    async probeCapabilities(input: HelpdeskAdapterProbeInput): Promise<HelpdeskCapabilityProbeResult> {
      if (!input.externalId) {
        return {
          status: "warning",
          operations: [],
          detail: "Для проверки Freshdesk нужен тестовый ticket ID.",
          hint: "Укажите ticket ID и повторите проверку.",
          diagnostics: { requests: [] }
        };
      }

      const loaded = await this.loadConversation({
        ...input,
        externalId: input.externalId
      });
      return capabilityProbeFromLoadResult(input, loaded, ["ticket_get", "conversations_get"]);
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
