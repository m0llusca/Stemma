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
const activityAssociationTypes = ["notes", "emails", "communications"] as const;
// HubSpot's date-versioned object surface (/crm/objects/2026-03/{object}) names the
// communication object in the SINGULAR for the by-id GET, while notes and emails stay
// plural. The association collection names (used in the v4 associations query) remain
// plural, so map the object-GET segment separately rather than reusing the association
// type string.
const objectPathSegments = {
  notes: "notes",
  emails: "emails",
  communications: "communication"
} satisfies Record<(typeof activityAssociationTypes)[number], string>;
// v4 associations paginate via paging.next.after (max 500 per page). Bound the follow-up
// to avoid unbounded loops while still covering large tickets.
const maxAssociationPages = 5;
const maxAssociationsPerType = 2_500;
const activityProperties = {
  notes: ["hs_note_body", "hs_timestamp", "hubspot_owner_id", "hs_created_by_user_id"],
  emails: ["hs_email_text", "hs_email_html", "hs_email_direction", "hs_timestamp", "hubspot_owner_id", "hs_created_by_user_id"],
  communications: [
    "hs_communication_body",
    "hs_communication_channel_type",
    "hs_timestamp",
    "hubspot_owner_id",
    "hs_created_by_user_id"
  ]
} satisfies Record<(typeof activityAssociationTypes)[number], string[]>;

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
      const associationDiagnostics: HelpdeskAdapterLoadResult["diagnostics"]["requests"] = [];
      const associationResults = await Promise.all(
        activityAssociationTypes.map(async (activityType) => {
          const ids: string[] = [];
          let after: string | undefined;
          let pages = 0;

          do {
            const associationsUrl = `${baseUrl}/crm/v4/objects/tickets/${ticketId}/associations/${activityType}${
              after ? `?after=${encodeURIComponent(after)}` : ""
            }`;
            const response = await client.requestJson({
              ...requestDefaults,
              operation: "activities_get",
              url: associationsUrl
            });

            associationDiagnostics.push(response.diagnostic);
            ids.push(...associationIds(response.body));
            after = nextAfter(response.body);
            pages += 1;
          } while (after && pages < maxAssociationPages && ids.length < maxAssociationsPerType);

          return { activityType, ids: ids.slice(0, maxAssociationsPerType) };
        })
      );
      const activityResponses = await Promise.all(
        associationResults.flatMap(({ activityType, ids }) =>
          ids.map(async (activityId) => ({
            activityType,
            response: await client.requestJson({
              ...requestDefaults,
              operation: "activities_get",
              url: `${baseUrl}/crm/objects/2026-03/${objectPathSegments[activityType]}/${encodeURIComponent(
                activityId
              )}?properties=${encodeURIComponent(activityProperties[activityType].join(","))}`
            })
          }))
        )
      );
      const activities = activityResponses.map(({ activityType, response }) => ({
        ...recordValue(response.body),
        objectType: activityType
      }));
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
          requests: [
            ticketResponse.diagnostic,
            ...associationDiagnostics,
            ...activityResponses.map(({ response }) => response.diagnostic)
          ]
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

function associationIds(value: unknown): string[] {
  const record = recordValue(value);
  const rows = Array.isArray(value)
    ? value
    : arrayValue(record.results).length > 0
      ? arrayValue(record.results)
      : arrayValue(record.value).length > 0
        ? arrayValue(record.value)
        : arrayValue(record.associations);

  return rows
    .map((row) => {
      const association = recordValue(row);
      const associatedObject = recordValue(association.to);
      return stringValue(association.toObjectId ?? associatedObject.id ?? association.id);
    })
    .filter((id): id is string => Boolean(id));
}

function nextAfter(value: unknown): string | undefined {
  const paging = recordValue(recordValue(value).paging);
  const next = recordValue(paging.next);
  return stringValue(next.after);
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}
