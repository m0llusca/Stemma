import http from "node:http";
import {
  createOtrsFixtureTickets,
  createOtrsTicketGetFixtureResponse,
  otrsFixturePassword,
  otrsFixtureTicketIds,
  otrsFixtureUserLogin
} from "./otrs-ticket-fixtures";

export type OtrsGenericInterfaceServerMode =
  | "success"
  | "auth_failure"
  | "invalid_json"
  | "malformed_ticket_search"
  | "malformed_ticket_get"
  | "delayed_timeout"
  | "oversized_response"
  | "ticket_get_attachments_base64";

export type OtrsGenericInterfaceRequest = {
  method: string;
  url: string;
  pathname: string;
  operation: "TicketSearch" | "TicketGet" | "unknown";
  ticketId?: string;
  query: Record<string, string>;
  bodyText: string;
  bodyJson?: unknown;
};

export type OtrsGenericInterfaceServer = {
  origin: string;
  baseUrl: string;
  basePath: string;
  requests: OtrsGenericInterfaceRequest[];
  close: () => Promise<void>;
};

type OtrsGenericInterfaceServerOptions = {
  mode?: OtrsGenericInterfaceServerMode;
  ticketSearchMode?: OtrsGenericInterfaceServerMode;
  ticketGetMode?: OtrsGenericInterfaceServerMode;
  ticketIds?: string[];
  delayMs?: number;
  oversizedBytes?: number;
  expectedAuth?: {
    userLogin: string;
    password: string;
  };
};

const basePath = "/otrs";
const ticketRoute = "/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket";

export async function createOtrsGenericInterfaceServer(
  options: OtrsGenericInterfaceServerOptions = {}
): Promise<OtrsGenericInterfaceServer> {
  const requests: OtrsGenericInterfaceRequest[] = [];
  const server = http.createServer(async (request, response) => {
    const requestRecord = await readRequest(request);
    requests.push(requestRecord);

    if (requestRecord.operation === "unknown") {
      writeJson(response, 404, { Error: "Route not found" });
      return;
    }

    const mode = modeForOperation(requestRecord.operation, options);

    if (mode === "delayed_timeout") {
      setTimeout(() => writeSuccessResponse(response, requestRecord, options), options.delayMs ?? 250);
      return;
    }

    if (mode === "auth_failure" || authDoesNotMatch(requestRecord, options.expectedAuth)) {
      writeJson(response, 401, {
        Error: "Authentication failed",
        UserLogin: authValue(requestRecord, "UserLogin"),
        Password: authValue(requestRecord, "Password")
      });
      return;
    }

    if (mode === "invalid_json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"Success":');
      return;
    }

    if (mode === "oversized_response") {
      writeJson(response, 200, {
        Success: 1,
        Payload: "x".repeat(options.oversizedBytes ?? 1024 * 1024)
      });
      return;
    }

    if (mode === "malformed_ticket_search" && requestRecord.operation === "TicketSearch") {
      writeJson(response, 200, {
        Success: 1,
        Ticket: [{ Title: "Missing TicketID" }]
      });
      return;
    }

    if (mode === "malformed_ticket_get" && requestRecord.operation === "TicketGet") {
      writeJson(response, 200, {
        Success: 1,
        Ticket: {
          NotATicket: true
        }
      });
      return;
    }

    writeSuccessResponse(response, requestRecord, options);
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
    throw new Error("Expected local OTRS fixture server address.");
  }

  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    baseUrl: `${origin}${basePath}`,
    basePath,
    requests,
    close: () => closeServer(server)
  };
}

async function readRequest(request: http.IncomingMessage): Promise<OtrsGenericInterfaceRequest> {
  const bodyText = await readBody(request);
  const parsedUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const operation = operationFor(request.method ?? "GET", parsedUrl.pathname);
  const ticketId = operation === "TicketGet" ? decodeURIComponent(parsedUrl.pathname.slice(`${ticketRoute}/`.length)) : undefined;
  const bodyJson = parseJson(bodyText);

  return {
    method: request.method ?? "GET",
    url: request.url ?? "/",
    pathname: parsedUrl.pathname,
    operation,
    ticketId,
    query: Object.fromEntries(parsedUrl.searchParams.entries()),
    bodyText,
    bodyJson
  };
}

function operationFor(method: string, pathname: string): OtrsGenericInterfaceRequest["operation"] {
  if (method === "POST" && pathname === ticketRoute) {
    return "TicketSearch";
  }

  if (method === "GET" && pathname.startsWith(`${ticketRoute}/`) && pathname.length > ticketRoute.length + 1) {
    return "TicketGet";
  }

  return "unknown";
}

function modeForOperation(
  operation: "TicketSearch" | "TicketGet",
  options: OtrsGenericInterfaceServerOptions
): OtrsGenericInterfaceServerMode {
  if (operation === "TicketSearch") {
    return options.ticketSearchMode ?? options.mode ?? "success";
  }

  return options.ticketGetMode ?? options.mode ?? "success";
}

function writeSuccessResponse(
  response: http.ServerResponse,
  request: OtrsGenericInterfaceRequest,
  options: OtrsGenericInterfaceServerOptions
) {
  if (request.operation === "TicketSearch") {
    writeJson(response, 200, {
      Success: 1,
      TicketID: options.ticketIds ?? [...otrsFixtureTicketIds]
    });
    return;
  }

  const includeAttachmentContent = modeForOperation("TicketGet", options) === "ticket_get_attachments_base64";
  const tickets = createOtrsFixtureTickets({ includeAttachmentContent });
  const ticket = tickets[request.ticketId ?? ""] ?? tickets[otrsFixtureTicketIds[0]];

  writeJson(response, 200, createOtrsTicketGetFixtureResponse(ticket));
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
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

function authDoesNotMatch(
  request: OtrsGenericInterfaceRequest,
  expectedAuth: OtrsGenericInterfaceServerOptions["expectedAuth"]
) {
  if (!expectedAuth) {
    return false;
  }

  return authValue(request, "UserLogin") !== expectedAuth.userLogin || authValue(request, "Password") !== expectedAuth.password;
}

function authValue(request: OtrsGenericInterfaceRequest, key: "UserLogin" | "Password") {
  if (request.operation === "TicketSearch" && request.bodyJson && typeof request.bodyJson === "object") {
    const value = (request.bodyJson as Record<string, unknown>)[key];

    return value === undefined || value === null ? undefined : String(value);
  }

  return request.query[key];
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export function defaultOtrsFixtureAuth() {
  return {
    userLogin: otrsFixtureUserLogin,
    password: otrsFixturePassword
  };
}
