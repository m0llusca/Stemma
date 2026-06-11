import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import { bearerHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;
const maxActivityPages = 50;
const incidentColumns = ["incidentid", "ticketnumber", "title", "statecode", "prioritycode", "createdon", "modifiedon"];
const activityColumns = ["activityid", "subject", "description", "createdon"];
const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDynamicsAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = trimTrailingSlash(input.baseUrl);
      const incidentId = normalizeDynamicsGuid(input.externalId);
      const encodedIncidentId = encodeURIComponent(incidentId);
      const requestDefaults = {
        source: "dynamics" as const,
        method: "GET" as const,
        headers: bearerHeaders(input.token),
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      };

      const incidentResponse = await client.requestJson({
        ...requestDefaults,
        operation: "case_get",
        url: `${baseUrl}/api/data/v9.2/incidents(${encodedIncidentId})?${new URLSearchParams({
          $select: incidentColumns.join(",")
        }).toString()}`
      });
      const activityDiagnostics = [];
      const allActivities: unknown[] = [];
      let activitiesUrl: string | undefined = `${baseUrl}/api/data/v9.2/activitypointers?${new URLSearchParams({
        $filter: `_regardingobjectid_value eq ${incidentId}`,
        $select: activityColumns.join(",")
      }).toString()}`;

      for (let page = 0; page < maxActivityPages && activitiesUrl !== undefined; page++) {
        const activitiesResponse = await client.requestJson({
          ...requestDefaults,
          operation: "activities_get",
          url: activitiesUrl
        });

        activityDiagnostics.push(activitiesResponse.diagnostic);
        allActivities.push(...valueArray(activitiesResponse.body));

        const nextLink = recordValue(activitiesResponse.body)["@odata.nextLink"];

        activitiesUrl = typeof nextLink === "string" ? nextLink : undefined;
      }

      const payload = {
        incident: recordValue(incidentResponse.body),
        activities: allActivities
      };

      return {
        source: "dynamics",
        externalId: incidentId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "dynamics", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [incidentResponse.diagnostic, ...activityDiagnostics]
        }
      };
    }
  };
}

function normalizeDynamicsGuid(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!guidPattern.test(normalized)) {
    throw new HelpdeskAdapterError({
      code: "malformed_payload",
      source: "dynamics",
      operation: "case_get",
      safeMessage: "Dynamics incident id must be a standard GUID."
    });
  }

  return normalized;
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

function valueArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  return arrayValue(recordValue(value).value);
}
