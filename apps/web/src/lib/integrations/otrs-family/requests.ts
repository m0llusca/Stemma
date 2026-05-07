import {
  buildOtrsWebServiceBaseUrl,
  type OtrsConnectorConfig
} from "@/lib/integrations/otrs-family/config";

export type OtrsOperation = "TicketSearch" | "TicketGet";
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
};

export type TicketSearchRequestInput = BaseRequestInput & {
  filters?: Record<string, unknown>;
  limit?: number;
};

export type TicketGetRequestInput = BaseRequestInput & {
  ticketId: string | number;
  allArticles?: boolean;
  includeAttachments?: boolean;
};

export function buildTicketSearchRequest(input: TicketSearchRequestInput): OtrsOperationRequest {
  const payload = stripUndefinedValues({
    UserLogin: input.userLogin,
    Password: input.password,
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
    mode: input.config.requestMode.ticketSearch,
    url,
    payload
  });
}

export function buildTicketGetRequest(input: TicketGetRequestInput): OtrsOperationRequest {
  const routePath = input.config.routes.ticketGetPath;
  const ticketIdIsInPath = hasTicketIdPlaceholder(routePath);
  const payload = stripUndefinedValues({
    UserLogin: input.userLogin,
    Password: input.password,
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
  const routePath = operation === "TicketSearch" ? config.routes.ticketSearchPath : config.routes.ticketGetPath;

  return `${stripTrailingSlash(serviceBaseUrl)}${buildRoutePath(routePath, ticketId)}`;
}

export function parseTicketSearchResponse(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const ticketIds = arrayFromUnknown(record.TicketID);

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
  mode: "post_json" | "get_query";
  url: string;
  payload: Record<string, unknown>;
}): OtrsOperationRequest {
  const baseRequest = {
    operation: input.operation,
    timeoutMs: input.config.limits.requestTimeoutMs,
    maxResponseBytes: input.config.limits.maxResponseBytes
  } as const;

  if (input.mode === "get_query") {
    return {
      ...baseRequest,
      method: "GET",
      url: appendQueryParams(input.url, input.payload),
      headers: {
        accept: "application/json"
      }
    };
  }

  return {
    ...baseRequest,
    method: "POST",
    url: input.url,
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: input.payload
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
