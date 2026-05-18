import { bearerHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;
const ticketProperties = [
  "subject",
  "content",
  "hs_ticket_priority",
  "hs_pipeline_stage",
  "hubspot_owner_id",
  "customer_email",
  "createdate",
  "hs_lastmodifieddate"
];

export function createHubspotAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = trimTrailingSlash(input.baseUrl);
      const ticketId = encodeURIComponent(input.externalId);
      const requestDefaults = {
        source: "hubspot" as const,
        method: "GET" as const,
        headers: bearerHeaders(input.token),
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      };

      const ticketResponse = await client.requestJson({
        ...requestDefaults,
        operation: "ticket_get",
        url: `${baseUrl}/crm/v3/objects/tickets/${ticketId}?properties=${encodeURIComponent(ticketProperties.join(","))}&associations=${encodeURIComponent("notes,emails,communications")}`
      });
      const activitiesResponse = await client.requestJson({
        ...requestDefaults,
        operation: "activities_get",
        url: `${baseUrl}/crm/v4/objects/tickets/${ticketId}/associations/notes`
      });
      const activities = activityRecords(activitiesResponse.body);
      const payload = {
        ticket: {
          ...recordValue(ticketResponse.body),
          activities
        },
        activities
      };

      return {
        source: "hubspot",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "hubspot", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [ticketResponse.diagnostic, activitiesResponse.diagnostic]
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

function activityRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = recordValue(value);

  return arrayValue(record.results).length > 0
    ? arrayValue(record.results)
    : arrayValue(record.value).length > 0
      ? arrayValue(record.value)
      : arrayValue(record.activities);
}
