import { basicCredentialHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;

export function createJiraAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = trimTrailingSlash(input.baseUrl);
      const issueIdOrKey = encodeURIComponent(input.externalId);
      const requestDefaults = {
        source: "jira" as const,
        method: "GET" as const,
        headers: {
          ...basicCredentialHeaders(input.token),
          accept: "application/json"
        },
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      };

      const requestResponse = await client.requestJson({
        ...requestDefaults,
        operation: "ticket_get",
        url: `${baseUrl}/rest/servicedeskapi/request/${issueIdOrKey}`
      });
      const commentsResponse = await client.requestJson({
        ...requestDefaults,
        operation: "comments_get",
        url: `${baseUrl}/rest/servicedeskapi/request/${issueIdOrKey}/comment?limit=100&start=0`
      });
      const commentsBody = recordValue(commentsResponse.body);
      const payload = {
        request: recordValue(requestResponse.body),
        comments: arrayValue(commentsBody.values ?? commentsResponse.body)
      };

      return {
        source: "jira",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "jira", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [requestResponse.diagnostic, commentsResponse.diagnostic]
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
