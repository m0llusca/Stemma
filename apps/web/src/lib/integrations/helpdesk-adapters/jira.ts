import { basicCredentialHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
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
const jiraCommentPageSize = 100;
const defaultMaxComments = 1_000;

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
      const maxComments = commentLimit(input);

      const requestResponse = await client.requestJson({
        ...requestDefaults,
        operation: "ticket_get",
        url: `${baseUrl}/rest/servicedeskapi/request/${issueIdOrKey}`
      });
      const commentDiagnostics: HelpdeskAdapterLoadResult["diagnostics"]["requests"] = [];
      const comments: unknown[] = [];
      let start = 0;

      while (comments.length < maxComments) {
        const remaining = maxComments - comments.length;
        const limit = Math.min(jiraCommentPageSize, remaining);
        const commentsResponse = await client.requestJson({
          ...requestDefaults,
          operation: "comments_get",
          url: `${baseUrl}/rest/servicedeskapi/request/${issueIdOrKey}/comment?${new URLSearchParams({
            // Request HTML-rendered comment bodies so the normalizer can prefer renderedBody
            // over the raw wiki-markup body.
            expand: "renderedBody",
            limit: String(limit),
            start: String(start)
          })}`
        });
        const commentsBody = recordValue(commentsResponse.body);
        const pageComments = arrayValue(commentsBody.values ?? commentsResponse.body);

        commentDiagnostics.push(commentsResponse.diagnostic);

        if (pageComments.length === 0) {
          break;
        }

        comments.push(...pageComments.slice(0, remaining));

        if (comments.length >= maxComments || boolValue(commentsBody.isLastPage)) {
          break;
        }

        start = pageStart(commentsBody, start) + pageSize(commentsBody, pageComments.length);
      }
      const payload = {
        request: recordValue(requestResponse.body),
        comments
      };

      return {
        source: "jira",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "jira", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [requestResponse.diagnostic, ...commentDiagnostics]
        }
      };
    },

    async probeCapabilities(input: HelpdeskAdapterProbeInput): Promise<HelpdeskCapabilityProbeResult> {
      if (!input.externalId) {
        return {
          status: "warning",
          operations: [],
          detail: "Для проверки Jira Service Management нужен тестовый request key.",
          hint: "Укажите request key и повторите проверку.",
          diagnostics: { requests: [] }
        };
      }

      const loaded = await this.loadConversation({
        ...input,
        externalId: input.externalId
      });
      return capabilityProbeFromLoadResult(input, loaded, ["ticket_get", "comments_get"]);
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

function boolValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "y"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function integerValue(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.floor(numberValue) : undefined;
}

function commentLimit(input: HelpdeskAdapterLoadInput) {
  const callerLimit = integerValue((input as { maxComments?: unknown; commentLimit?: unknown }).maxComments) ??
    integerValue((input as { maxComments?: unknown; commentLimit?: unknown }).commentLimit);

  return callerLimit ?? defaultMaxComments;
}

function pageStart(page: Record<string, unknown>, fallback: number) {
  return integerValue(page.start) ?? fallback;
}

function pageSize(page: Record<string, unknown>, fallback: number) {
  const value = integerValue(page.size);

  return value && value > 0 ? value : fallback;
}
