import { bearerHeaders, createHelpdeskHttpClient, type HelpdeskTransport } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;
const apiVersion = "v66.0";
// SOQL query() pages at 200/2000 records via done:false + nextRecordsUrl. Cap the loop
// defensively so a misbehaving instance cannot make us follow nextRecordsUrl forever.
const maxQueryPages = 50;

type HelpdeskHttpClient = ReturnType<typeof createHelpdeskHttpClient>;
type RequestDiagnostic = HelpdeskAdapterLoadResult["diagnostics"]["requests"][number];

export function createSalesforceAdapter(transport?: HelpdeskTransport) {
  const client = createHelpdeskHttpClient(transport ? { transport } : {});

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
      const comments = await runQuery({
        client,
        baseUrl,
        requestDefaults,
        soql: `SELECT Id,CommentBody,IsPublished,CreatedDate,CreatedBy.Name FROM CaseComment WHERE ParentId = '${escapeSoqlLiteral(
          input.externalId
        )}' ORDER BY CreatedDate ASC`
      });
      // Agent/customer email correspondence on a Case lives in EmailMessage (ParentId
      // references the Case), not CaseComment. Fetch it as a separate thread source.
      const emails = await runQuery({
        client,
        baseUrl,
        requestDefaults,
        soql: `SELECT Id,TextBody,Subject,FromAddress,FromName,Incoming,MessageDate,CreatedDate FROM EmailMessage WHERE ParentId = '${escapeSoqlLiteral(
          input.externalId
        )}' ORDER BY MessageDate ASC`
      });
      const payload = {
        case: recordValue(caseResponse.body),
        comments: comments.records,
        emails: emails.records
      };

      return {
        source: "salesforce",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "salesforce", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [caseResponse.diagnostic, ...comments.diagnostics, ...emails.diagnostics]
        }
      };
    }
  };
}

type QueryDefaults = {
  source: "salesforce";
  method: "GET";
  headers: Record<string, string>;
  timeoutMs: number;
  maxResponseBytes: number;
};

async function runQuery({
  client,
  baseUrl,
  requestDefaults,
  soql
}: {
  client: HelpdeskHttpClient;
  baseUrl: string;
  requestDefaults: QueryDefaults;
  soql: string;
}): Promise<{ records: unknown[]; diagnostics: RequestDiagnostic[] }> {
  const records: unknown[] = [];
  const diagnostics: RequestDiagnostic[] = [];

  let nextUrl: string | undefined = `${baseUrl}/services/data/${apiVersion}/query?${new URLSearchParams({
    q: soql
  }).toString()}`;

  for (let page = 0; page < maxQueryPages && nextUrl; page += 1) {
    const response = await client.requestJson({
      ...requestDefaults,
      operation: "activities_get",
      url: nextUrl
    });

    const body = recordValue(response.body);
    records.push(...arrayValue(body.records));
    diagnostics.push(response.diagnostic);

    // SOQL signals more pages with done:false plus an absolute nextRecordsUrl path.
    const nextRecordsUrl = body.done === false ? firstString(body.nextRecordsUrl) : undefined;
    nextUrl = nextRecordsUrl ? `${baseUrl}${nextRecordsUrl}` : undefined;
  }

  return { records, diagnostics };
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

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function escapeSoqlLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
