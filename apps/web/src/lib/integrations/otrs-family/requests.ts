import {
  buildOtrsWebServiceBaseUrl,
  type OtrsConnectorConfig
} from "@/lib/integrations/otrs-family/config";
import { OtrsConnectorError } from "@/lib/integrations/otrs-family/errors";

export type OtrsOperation = "SessionCreate" | "TicketSearch" | "TicketGet";
export type OtrsHttpMethod = "GET" | "POST";

export type OtrsOperationRequest = {
  operation: OtrsOperation;
  method: OtrsHttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  maxResponseBytes: number;
};

type UrlConfigInput =
  | OtrsConnectorConfig
  | {
      config: OtrsConnectorConfig;
      baseUrl?: string;
      origin?: string;
    };

type AuthInput = {
  userLogin: string;
  password: string;
};

type BaseRequestInput = AuthInput & {
  config: OtrsConnectorConfig;
  baseUrl?: string;
  origin?: string;
  sessionId?: string;
};

export type SessionCreateRequestInput = BaseRequestInput;

export type TicketSearchRequestInput = BaseRequestInput & {
  filters?: Record<string, unknown>;
  limit?: number;
};

export type TicketGetRequestInput = BaseRequestInput & {
  ticketId: string | number;
  allArticles?: boolean;
  includeAttachments?: boolean;
};

export function buildSessionCreateRequest(input: SessionCreateRequestInput): OtrsOperationRequest {
  const payload = stripUndefinedValues({
    UserLogin: input.userLogin,
    Password: input.password
  });
  const url = buildOtrsOperationUrl(
    {
      config: input.config,
      baseUrl: input.baseUrl,
      origin: input.origin
    },
    "SessionCreate"
  );

  return buildOperationRequest({
    config: input.config,
    operation: "SessionCreate",
    method: input.config.auth.sessionCreateMethod,
    mode: "post_json",
    url,
    payload
  });
}

export function buildTicketSearchRequest(input: TicketSearchRequestInput): OtrsOperationRequest {
  const payload = stripUndefinedValues({
    ...buildOperationAuthPayload(input, "ticketSearch"),
    ...(input.filters ?? {}),
    Limit: input.limit ?? valueAsNumber(input.filters?.Limit) ?? input.config.limits.searchLimit
  });
  const url = buildOtrsOperationUrl(
    {
      config: input.config,
      baseUrl: input.baseUrl,
      origin: input.origin
    },
    "TicketSearch"
  );

  return buildOperationRequest({
    config: input.config,
    operation: "TicketSearch",
    method: input.config.routes.ticketSearchMethod,
    mode: input.config.requestMode.ticketSearch,
    url,
    payload
  });
}

export function buildTicketGetRequest(input: TicketGetRequestInput): OtrsOperationRequest {
  const routePath = input.config.routes.ticketGetPath;
  const ticketIdIsInPath = hasTicketIdPlaceholder(routePath);
  const payload = stripUndefinedValues({
    ...buildOperationAuthPayload(input, "ticketGet"),
    ...(ticketIdIsInPath ? {} : { TicketID: String(input.ticketId) }),
    AllArticles: booleanFlag(input.allArticles ?? input.config.articlePolicy.importAllArticles),
    Attachments: booleanFlag(input.includeAttachments ?? true),
    GetAttachmentContents: 0
  });
  const url = buildOtrsOperationUrl(
    {
      config: input.config,
      baseUrl: input.baseUrl,
      origin: input.origin
    },
    "TicketGet",
    input.ticketId
  );

  return buildOperationRequest({
    config: input.config,
    operation: "TicketGet",
    method: input.config.routes.ticketGetMethod,
    mode: input.config.requestMode.ticketGet,
    url,
    payload
  });
}

export function buildOtrsOperationUrl(input: UrlConfigInput, operation: OtrsOperation, ticketId?: string | number) {
  const { config, baseUrl, origin } = resolveUrlConfigInput(input);
  const serviceBaseUrl = buildOtrsWebServiceBaseUrl({
    baseUrl,
    origin,
    basePath: config.basePath,
    webServiceName: config.webServiceName
  });
  const routePath =
    operation === "SessionCreate"
      ? config.auth.sessionCreatePath
      : operation === "TicketSearch"
        ? config.routes.ticketSearchPath
        : config.routes.ticketGetPath;

  return `${stripTrailingSlash(serviceBaseUrl)}${buildRoutePath(routePath, ticketId)}`;
}

export function parseSessionCreateResponse(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const sessionId = (payload as Record<string, unknown>).SessionID;

  if (typeof sessionId === "string" || typeof sessionId === "number") {
    const normalized = String(sessionId).trim();
    return normalized || undefined;
  }

  return undefined;
}

export function parseTicketSearchResponse(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  // Znuny/OTOBO docs document the response key as `TicketIDs`, while the OTRS
  // operation source returns `TicketID`. Accept both to stay robust across
  // products; prefer `TicketID` to preserve existing behavior.
  const ticketIds = arrayFromUnknown(record.TicketID ?? record.TicketIDs);

  if (ticketIds.length > 0) {
    return ticketIds.map(String).filter(Boolean);
  }

  return arrayFromUnknown(record.Ticket)
    .map((ticket) => (ticket && typeof ticket === "object" ? (ticket as Record<string, unknown>).TicketID : undefined))
    .filter((ticketId): ticketId is string | number => typeof ticketId === "string" || typeof ticketId === "number")
    .map(String)
    .filter(Boolean);
}

function buildOperationRequest(input: {
  config: OtrsConnectorConfig;
  operation: OtrsOperation;
  method: OtrsHttpMethod;
  mode: "post_json" | "get_query";
  url: string;
  payload: Record<string, unknown>;
}): OtrsOperationRequest {
  const baseRequest = {
    operation: input.operation,
    timeoutMs: input.config.limits.requestTimeoutMs,
    maxResponseBytes: input.config.limits.maxResponseBytes
  } as const;

  if (input.mode === "get_query" && input.method === "GET") {
    return {
      ...baseRequest,
      method: input.method,
      url: appendQueryParams(input.url, input.payload),
      headers: {
        accept: "application/json"
      }
    };
  }

  if (input.mode === "post_json" && input.method === "POST") {
    return {
      ...baseRequest,
      method: input.method,
      url: input.url,
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: input.payload
    };
  }

  throw new OtrsConnectorError({
    code: "config_invalid",
    safeMessage: `Unsupported OTRS ${input.operation} route method and request mode combination.`,
    redactedDetail: {
      operation: input.operation,
      method: input.method,
      requestMode: input.mode
    }
  });
}

function buildOperationAuthPayload(input: BaseRequestInput, operation: "ticketSearch" | "ticketGet") {
  if (input.config.auth[operation] !== "session") {
    return {
      UserLogin: input.userLogin,
      Password: input.password
    };
  }

  const sessionId = input.sessionId?.trim();

  if (!sessionId) {
    throw new OtrsConnectorError({
      code: "config_invalid",
      safeMessage: "OTRS SessionID is required for the configured operation auth flow.",
      redactedDetail: {
        operation,
        auth: "session"
      }
    });
  }

  return {
    SessionID: sessionId
  };
}

function resolveUrlConfigInput(input: UrlConfigInput) {
  if ("config" in input) {
    return input;
  }

  return {
    config: input,
    baseUrl: undefined,
    origin: undefined
  };
}

function buildRoutePath(routePath: string, ticketId?: string | number) {
  const normalizedRoutePath = normalizeRoutePath(routePath);

  if (!hasTicketIdPlaceholder(normalizedRoutePath)) {
    return normalizedRoutePath;
  }

  if (ticketId === undefined || ticketId === null || String(ticketId).trim() === "") {
    throw new Error("TicketID is required for OTRS TicketGet path.");
  }

  return normalizedRoutePath.replace(/\{TicketID\}/g, encodeURIComponent(String(ticketId)));
}

function hasTicketIdPlaceholder(routePath: string) {
  return /\{TicketID\}/.test(routePath);
}

function normalizeRoutePath(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function appendQueryParams(url: string, params: Record<string, unknown>) {
  const parsedUrl = new URL(url, "http://relative.local");

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        parsedUrl.searchParams.append(key, String(item));
      }
      continue;
    }

    parsedUrl.searchParams.set(key, String(value));
  }

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(url)) {
    return parsedUrl.toString();
  }

  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}

function stripUndefinedValues(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined));
}

function valueAsNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanFlag(value: boolean) {
  return value ? 1 : 0;
}

function arrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
