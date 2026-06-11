import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import { bearerHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;
const serviceNowSysIdPattern = /^[a-f0-9]{32}$/i;
const journalPageSize = 100;
const journalMaxPages = 50;

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
        // Request display values so reference fields (consumer, assigned_to, state, priority)
        // arrive as { display_value, value, link } — the shape the normalizer reads via
        // recordValue(caseRecord.consumer)?.display_value. Without this they render as sys_ids.
        url: `${baseUrl}/api/now/table/sn_customerservice_case/${caseId}?${new URLSearchParams({
          sysparm_display_value: "all"
        }).toString()}`
      });

      // Fetch both customer comments AND internal work notes. The normalizer maps
      // element === "work_notes" entries to private (internal) messages, so restricting
      // the journal query to comments alone silently drops every internal note.
      // ServiceNow encoded queries OR within the same field with `^OR`.
      const journalQuery = `element_id=${sysId}^element=comments^ORelement=work_notes`;
      const journalDiagnostics = [];
      const journal = [];

      for (let page = 0; page < journalMaxPages; page += 1) {
        const journalResponse = await client.requestJson({
          ...requestDefaults,
          operation: "activities_get",
          // Note: display_value=all is intentionally NOT applied here. The message body
          // lives in the journal `value` field, which the normalizer reads as a raw string;
          // display_value=all would turn it into an object and corrupt the body text.
          url: `${baseUrl}/api/now/table/sys_journal_field?${new URLSearchParams({
            sysparm_query: journalQuery,
            sysparm_limit: String(journalPageSize),
            sysparm_offset: String(page * journalPageSize)
          }).toString()}`
        });

        journalDiagnostics.push(journalResponse.diagnostic);

        const rows = resultArray(journalResponse.body);
        journal.push(...rows);

        if (rows.length < journalPageSize) {
          break;
        }
      }

      const payload = {
        case: resultRecord(caseResponse.body),
        journal
      };

      return {
        source: "servicenow",
        externalId: sysId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "servicenow", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [caseResponse.diagnostic, ...journalDiagnostics]
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
