import { bearerHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;
const apiVersion = "v66.0";

export function createSalesforceAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = trimTrailingSlash(input.baseUrl);
      const caseId = encodeURIComponent(input.externalId);
      const requestDefaults = {
        source: "salesforce" as const,
        method: "GET" as const,
        headers: bearerHeaders(input.token),
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      };

      const caseResponse = await client.requestJson({
        ...requestDefaults,
        operation: "case_get",
        url: `${baseUrl}/services/data/${apiVersion}/sobjects/Case/${caseId}`
      });
      const commentsResponse = await client.requestJson({
        ...requestDefaults,
        operation: "activities_get",
        url: `${baseUrl}/services/data/${apiVersion}/query?${new URLSearchParams({
          q: `SELECT Id,CommentBody,CreatedDate,CreatedBy.Name FROM CaseComment WHERE ParentId = '${escapeSoqlLiteral(
            input.externalId
          )}' ORDER BY CreatedDate ASC`
        }).toString()}`
      });
      const payload = {
        case: recordValue(caseResponse.body),
        comments: recordsValue(commentsResponse.body)
      };

      return {
        source: "salesforce",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "salesforce", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [caseResponse.diagnostic, commentsResponse.diagnostic]
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

function recordsValue(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  return arrayValue(recordValue(value).records);
}

function escapeSoqlLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
