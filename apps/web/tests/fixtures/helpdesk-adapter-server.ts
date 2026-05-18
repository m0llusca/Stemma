import http from "node:http";
import type { HelpdeskAdapterOperation, PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";
import { getHelpdeskAdapterFixture } from "./helpdesk-adapter-fixtures";

export type HelpdeskAdapterServerMode = "success" | "auth_failure" | "invalid_json" | "malformed_payload" | "not_found";

export type HelpdeskAdapterStubOperation = Extract<
  HelpdeskAdapterOperation,
  "ticket_get" | "comments_get" | "conversations_get" | "activities_get" | "case_get"
> | "unknown";

export type HelpdeskAdapterRequest = {
  source: PhaseBHelpdeskSource;
  operation: HelpdeskAdapterStubOperation;
  method: string;
  url: string;
  headers: Record<string, string>;
  pathname: string;
  query: Record<string, string>;
  bodyText: string;
  bodyJson?: unknown;
};

export type HelpdeskAdapterServer = {
  origin: string;
  baseUrl: string;
  requests: HelpdeskAdapterRequest[];
  close: () => Promise<void>;
};

type HelpdeskAdapterServerOptions = {
  source: PhaseBHelpdeskSource;
  mode?: HelpdeskAdapterServerMode;
  omitInlineConversations?: boolean;
};

export async function createHelpdeskAdapterServer(options: HelpdeskAdapterServerOptions): Promise<HelpdeskAdapterServer> {
  const requests: HelpdeskAdapterRequest[] = [];
  let isClosed = false;
  const server = http.createServer(async (request, response) => {
    const requestRecord = await readRequest(request, options.source);
    requests.push(requestRecord);

    const mode = options.mode ?? "success";

    if (mode === "auth_failure") {
      writeJson(response, 401, {
        error: "Authentication failed",
        token: "fixture-token-redact-me",
        password: "fixture-password-redact-me"
      });
      return;
    }

    if (mode === "invalid_json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":');
      return;
    }

    if (mode === "not_found" || requestRecord.operation === "unknown") {
      writeJson(response, 404, { error: "Route not found" });
      return;
    }

    writeJson(response, 200, payloadFor(options.source, requestRecord, mode, options));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
  } catch (error) {
    server.close();
    throw error;
  }

  const address = server.address();

  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Expected local helpdesk adapter fixture server address.");
  }

  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    baseUrl: origin,
    requests,
    close: () => {
      if (isClosed) {
        return Promise.resolve();
      }

      isClosed = true;
      return closeServer(server);
    }
  };
}

async function readRequest(request: http.IncomingMessage, source: PhaseBHelpdeskSource): Promise<HelpdeskAdapterRequest> {
  const bodyText = await readBody(request);
  const parsedUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  return {
    source,
    operation: operationFor(source, request.method ?? "GET", parsedUrl.pathname),
    method: request.method ?? "GET",
    url: request.url ?? "/",
    headers: headerRecord(request.headers),
    pathname: parsedUrl.pathname,
    query: Object.fromEntries(parsedUrl.searchParams.entries()),
    bodyText,
    bodyJson: parseJson(bodyText)
  };
}

function operationFor(source: PhaseBHelpdeskSource, method: string, pathname: string): HelpdeskAdapterStubOperation {
  if (method !== "GET") {
    return "unknown";
  }

  if (source === "zendesk") {
    if (/^\/api\/v2\/tickets\/[^/]+\.json$/.test(pathname)) {
      return "ticket_get";
    }

    if (/^\/api\/v2\/tickets\/[^/]+\/comments\.json$/.test(pathname)) {
      return "comments_get";
    }
  }

  if (source === "freshdesk") {
    if (/^\/api\/v2\/tickets\/[^/]+$/.test(pathname)) {
      return "ticket_get";
    }

    if (/^\/api\/v2\/tickets\/[^/]+\/conversations$/.test(pathname)) {
      return "conversations_get";
    }
  }

  if (source === "intercom" && /^\/conversations\/[^/]+$/.test(pathname)) {
    return "conversations_get";
  }

  if (source === "hubspot") {
    if (/^\/crm\/v3\/objects\/tickets\/[^/]+$/.test(pathname)) {
      return "ticket_get";
    }

    if (/^\/crm\/v4\/objects\/tickets\/[^/]+\/associations\/[^/]+$/.test(pathname)) {
      return "activities_get";
    }

    if (/^\/crm\/objects\/2026-03\/(?:notes|emails|communications)\/[^/]+$/.test(pathname)) {
      return "activities_get";
    }
  }

  if (source === "salesforce") {
    if (/^\/services\/data\/v[^/]+\/sobjects\/Case\/[^/]+$/.test(pathname)) {
      return "case_get";
    }

    if (/^\/services\/data\/v[^/]+\/query\/?$/.test(pathname)) {
      return "activities_get";
    }
  }

  if (source === "servicenow") {
    if (/^\/api\/now\/table\/(?:sn_customerservice_case|case)\/[^/]+$/.test(pathname)) {
      return "case_get";
    }

    if (pathname === "/api/now/table/sys_journal_field") {
      return "activities_get";
    }
  }

  if (source === "dynamics") {
    if (/^\/api\/data\/v9\.2\/incidents(?:\/[^/]+|\([^)]+\))$/.test(pathname)) {
      return "case_get";
    }

    if (pathname === "/api/data/v9.2/activitypointers") {
      return "activities_get";
    }
  }

  return "unknown";
}

function payloadFor(
  source: PhaseBHelpdeskSource,
  request: HelpdeskAdapterRequest,
  mode: HelpdeskAdapterServerMode,
  options: HelpdeskAdapterServerOptions
) {
  const operation = request.operation;
  const fixture = getHelpdeskAdapterFixture(source, mode === "malformed_payload" ? "malformed" : "success");

  if (source === "zendesk") {
    const payload = record(fixture);

    if (operation === "ticket_get") {
      return { ticket: payload.ticket };
    }

    if (operation === "comments_get") {
      return { comments: payload.comments };
    }
  }

  if (source === "freshdesk") {
    const ticket = record(record(fixture).ticket);

    if (operation === "ticket_get") {
      if (options.omitInlineConversations) {
        const { conversations: _conversations, ...ticketWithoutConversations } = ticket;

        return ticketWithoutConversations;
      }

      return { ...ticket, conversations: ticket.conversations ?? record(fixture).conversations };
    }

    if (operation === "conversations_get") {
      return ticket.conversations ?? record(fixture).conversations ?? [];
    }
  }

  if (source === "intercom" && operation === "conversations_get") {
    return record(fixture).conversation;
  }

  if (source === "hubspot") {
    const payload = record(fixture);
    const ticket = record(payload.ticket);

    if (operation === "ticket_get") {
      return { ...ticket, activities: undefined };
    }

    if (operation === "activities_get") {
      return hubspotActivityPayload(request.pathname, ticket);
    }
  }

  if (source === "salesforce") {
    const payload = record(fixture);

    if (operation === "case_get") {
      return payload.case;
    }

    if (operation === "activities_get") {
      return { records: payload.comments ?? [] };
    }
  }

  if (source === "servicenow") {
    const payload = record(fixture);

    if (operation === "case_get") {
      return { result: payload.case };
    }

    if (operation === "activities_get") {
      return { result: payload.journal ?? [] };
    }
  }

  if (source === "dynamics") {
    const payload = record(fixture);

    if (operation === "case_get") {
      return payload.incident;
    }

    if (operation === "activities_get") {
      return { value: payload.activities ?? [] };
    }
  }

  return fixture;
}

function hubspotActivityPayload(pathname: string, ticket: Record<string, unknown>) {
  const associationMatch = pathname.match(/^\/crm\/v4\/objects\/tickets\/[^/]+\/associations\/([^/]+)$/);

  if (associationMatch) {
    const activityType = associationMatch[1];

    if (activityType === "notes") {
      return { results: [{ toObjectId: "note_1" }] };
    }

    if (activityType === "emails") {
      return { results: [{ toObjectId: "email_1" }, { toObjectId: "email_2" }] };
    }

    if (activityType === "communications") {
      return { results: [{ toObjectId: "communication_1" }] };
    }

    return { results: [] };
  }

  const objectMatch = pathname.match(/^\/crm\/objects\/2026-03\/([^/]+)\/([^/]+)$/);

  if (!objectMatch) {
    return { results: [] };
  }

  const [, activityType, activityId] = objectMatch;
  const activities = arrayRecords(ticket.activities);
  const email = activities.find((activity) => String(activity.id) === activityId);

  if (activityType === "emails" && email) {
    return {
      id: activityId,
      createdAt: email.createdAt,
      properties: {
        hs_object_id: activityId,
        hs_email_direction: email.direction,
        hs_email_text: email.body,
        hs_timestamp: email.createdAt,
        hubspot_owner_id: email.authorName
      }
    };
  }

  if (activityType === "notes" && activityId === "note_1") {
    return {
      id: activityId,
      createdAt: "2026-04-25T10:03:00.000Z",
      properties: {
        hs_object_id: activityId,
        hs_note_body: "Внутренняя заметка: клиент просит возврат.",
        hs_timestamp: "2026-04-25T10:03:00.000Z",
        hubspot_owner_id: "Иван Петров"
      }
    };
  }

  if (activityType === "communications" && activityId === "communication_1") {
    return {
      id: activityId,
      createdAt: "2026-04-25T10:12:00.000Z",
      properties: {
        hs_object_id: activityId,
        hs_communication_channel_type: "OUTBOUND",
        hs_communication_body: "Клиенту отправлено подтверждение возврата.",
        hs_timestamp: "2026-04-25T10:12:00.000Z",
        hubspot_owner_id: "Иван Петров"
      }
    };
  }

  return {};
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function headerRecord(headers: http.IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value ?? ""])
  );
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  if (response.writableEnded || response.destroyed) {
    return;
  }

  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function parseJson(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
