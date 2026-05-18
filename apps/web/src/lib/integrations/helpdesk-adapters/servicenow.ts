import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import { bearerHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;
const serviceNowSysIdPattern = /^[a-f0-9]{32}$/i;

export function createServiceNowAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = trimTrailingSlash(input.baseUrl);
      const sysId = normalizeServiceNowSysId(input.externalId);
      const caseId = encodeURIComponent(sysId);
      const requestDefaults = {
        source: "servicenow" as const,
        method: "GET" as const,
        headers: bearerHeaders(input.token),
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      };

      const caseResponse = await client.requestJson({
        ...requestDefaults,
        operation: "case_get",
        url: `${baseUrl}/api/now/table/sn_customerservice_case/${caseId}`
      });
      const journalResponse = await client.requestJson({
        ...requestDefaults,
        operation: "activities_get",
        url: `${baseUrl}/api/now/table/sys_journal_field?${new URLSearchParams({
          sysparm_query: `element_id=${sysId}^element=comments`,
          sysparm_limit: "100",
          sysparm_offset: "0"
        }).toString()}`
      });
      const payload = {
        case: resultRecord(caseResponse.body),
        journal: resultArray(journalResponse.body)
      };

      return {
        source: "servicenow",
        externalId: sysId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "servicenow", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [caseResponse.diagnostic, journalResponse.diagnostic]
        }
      };
    }
  };
}

function normalizeServiceNowSysId(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!serviceNowSysIdPattern.test(normalized)) {
    throw new HelpdeskAdapterError({
      code: "malformed_payload",
      source: "servicenow",
      operation: "case_get",
      safeMessage: "ServiceNow sys_id must be exactly 32 hexadecimal characters."
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

function resultRecord(value: unknown): Record<string, unknown> {
  const record = recordValue(value);
  const result = record.result;

  return recordValue(result).sys_id ? recordValue(result) : record;
}

function resultArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  return arrayValue(recordValue(value).result);
}
