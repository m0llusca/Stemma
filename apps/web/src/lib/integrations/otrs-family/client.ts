import http from "node:http";
import https from "node:https";
import { Buffer } from "node:buffer";
import { OtrsConnectorError, type OtrsConnectorErrorCode } from "@/lib/integrations/otrs-family/errors";
import type { OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import type { OtrsOperationRequest } from "@/lib/integrations/otrs-family/requests";

export type OtrsTransportRequest = {
  operation: OtrsOperationRequest["operation"];
  method: OtrsOperationRequest["method"];
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
  caBundle?: string;
};

export type OtrsTransportResponse = {
  statusCode: number;
  headers?: http.IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  body: string | Buffer | Uint8Array;
};

export type OtrsTransport = (request: OtrsTransportRequest) => Promise<OtrsTransportResponse>;

export type OtrsHttpClient = {
  requestJson: (operationRequest: OtrsOperationRequest) => Promise<unknown>;
};

type RequestJsonRuntime = {
  transport?: OtrsTransport;
  caBundle?: string;
  secrets?: string[];
};

const redactedValue = "[REDACTED]";
const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 5_000_000;
const tlsErrorCodes = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);

export function createOtrsHttpClient(input: {
  config: OtrsConnectorConfig;
  baseUrl: string;
  userLogin: string;
  password: string;
  caBundle?: string;
  transport?: OtrsTransport;
}): OtrsHttpClient {
  const transport = input.transport ?? nodeTransport;
  const secrets = [input.userLogin, input.password, input.caBundle].filter((value): value is string => Boolean(value));

  return {
    requestJson: (operationRequest) =>
      requestJson(
        {
          ...operationRequest,
          timeoutMs: operationRequest.timeoutMs ?? input.config.limits.requestTimeoutMs,
          maxResponseBytes: operationRequest.maxResponseBytes ?? input.config.limits.maxResponseBytes
        },
        {
          transport,
          caBundle: input.caBundle,
          secrets
        }
      )
  };
}

export async function requestJson(operationRequest: OtrsOperationRequest, runtime: RequestJsonRuntime = {}) {
  const transport = runtime.transport ?? nodeTransport;
  const request = buildTransportRequest(operationRequest, runtime.caBundle);

  try {
    const response = await transport(request);
    const responseBody = responseBodyToBuffer(response.body);

    if (responseBody.byteLength > request.maxResponseBytes) {
      throw buildConnectorError({
        code: "response_too_large",
        safeMessage: "OTRS response exceeded the configured size limit.",
        request,
        detail: {
          statusCode: response.statusCode,
          responseBytes: responseBody.byteLength,
          maxResponseBytes: request.maxResponseBytes
        },
        secrets: runtime.secrets
      });
    }

    const text = responseBody.toString("utf8");

    if (response.statusCode === 401) {
      throw buildConnectorError({
        code: "auth_failed",
        safeMessage: "OTRS rejected the configured credentials.",
        request,
        detail: {
          statusCode: response.statusCode,
          responseBody: text
        },
        secrets: runtime.secrets
      });
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw buildConnectorError({
        code: operationFailureCode(request.operation),
        safeMessage: `OTRS ${request.operation} request failed with HTTP ${response.statusCode}.`,
        request,
        detail: {
          statusCode: response.statusCode,
          responseBody: text
        },
        secrets: runtime.secrets
      });
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw buildConnectorError({
        code: "invalid_json",
        safeMessage: "OTRS returned invalid JSON.",
        request,
        detail: {
          parseError: serializeError(error),
          responseBody: text
        },
        secrets: runtime.secrets
      });
    }
  } catch (error) {
    if (error instanceof OtrsConnectorError) {
      throw error;
    }

    throw mapTransportError(error, request, runtime.secrets);
  }
}

export function redactOtrsUrl(url: string): string {
  const pemRedacted = redactPemBlocks(url);

  try {
    const parsedUrl = new URL(pemRedacted);

    if (parsedUrl.username) {
      parsedUrl.username = redactedValue;
    }

    if (parsedUrl.password) {
      parsedUrl.password = redactedValue;
    }

    for (const key of Array.from(parsedUrl.searchParams.keys())) {
      if (isSensitiveKey(key)) {
        parsedUrl.searchParams.set(key, redactedValue);
      }
    }

    return parsedUrl.toString().replaceAll("%5BREDACTED%5D", redactedValue);
  } catch {
    return redactAuthFragments(redactUrlCredentials(pemRedacted));
  }
}

export function redactOtrsPayload<T>(value: T): T {
  return redactPayloadValue(value) as T;
}

async function nodeTransport(request: OtrsTransportRequest): Promise<OtrsTransportResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(request.url);
    const isHttps = parsedUrl.protocol === "https:";
    const body = request.body;
    let settled = false;
    const headers: Record<string, string | number> = {
      ...request.headers
    };
    const settleResolve = (response: OtrsTransportResponse) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(response);
    };
    const settleReject = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    if (body !== undefined && headers["content-length"] === undefined && headers["Content-Length"] === undefined) {
      headers["content-length"] = Buffer.byteLength(body);
    }

    const client = isHttps ? https : http;
    const req = client.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        method: request.method,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers,
        agent: isHttps && request.caBundle ? new https.Agent({ ca: request.caBundle }) : undefined
      },
      (response) => {
        const chunks: Buffer[] = [];
        let responseBytes = 0;

        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          responseBytes += buffer.byteLength;

          if (responseBytes > request.maxResponseBytes) {
            const error = Object.assign(new Error("OTRS response exceeded the configured size limit."), {
              code: "OTRS_RESPONSE_TOO_LARGE",
              responseBytes,
              maxResponseBytes: request.maxResponseBytes
            });
            settleReject(error);
            req.destroy(error);
            response.destroy(error);
            return;
          }

          chunks.push(buffer);
        });
        response.on("end", () => {
          if (settled) {
            return;
          }

          settleResolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks)
          });
        });
        response.on("error", settleReject);
        response.on("aborted", () => {
          settleReject(Object.assign(new Error("OTRS response stream was aborted."), { code: "ECONNRESET" }));
        });
        response.on("close", () => {
          if (!response.complete) {
            settleReject(Object.assign(new Error("OTRS response stream closed before completion."), { code: "ECONNRESET" }));
          }
        });
      }
    );

    req.on("error", settleReject);
    req.setTimeout(request.timeoutMs, () => {
      const error = Object.assign(new Error("OTRS request timed out."), { code: "ETIMEDOUT" });
      settleReject(error);
      req.destroy(error);
    });

    if (body !== undefined) {
      req.write(body);
    }

    req.end();
  });
}

function buildTransportRequest(operationRequest: OtrsOperationRequest, caBundle?: string): OtrsTransportRequest {
  const body = operationRequest.body === undefined ? undefined : stringifyRequestBody(operationRequest.body);

  return {
    operation: operationRequest.operation,
    method: operationRequest.method,
    url: operationRequest.url,
    headers: operationRequest.headers,
    body,
    timeoutMs: operationRequest.timeoutMs ?? defaultTimeoutMs,
    maxResponseBytes: operationRequest.maxResponseBytes ?? defaultMaxResponseBytes,
    caBundle
  };
}

function stringifyRequestBody(body: unknown) {
  return typeof body === "string" ? body : JSON.stringify(body);
}

function responseBodyToBuffer(body: OtrsTransportResponse["body"]) {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  return Buffer.from(body);
}

function mapTransportError(error: unknown, request: OtrsTransportRequest, secrets: string[] = []) {
  const serializedError = serializeError(error);
  const code = typeof serializedError.code === "string" ? serializedError.code : undefined;

  if (code === "OTRS_RESPONSE_TOO_LARGE") {
    return buildConnectorError({
      code: "response_too_large",
      safeMessage: "OTRS response exceeded the configured size limit.",
      request,
      detail: serializedError,
      secrets
    });
  }

  if (isTimeoutError(serializedError)) {
    return buildConnectorError({
      code: "timeout",
      safeMessage: "OTRS request timed out.",
      request,
      detail: serializedError,
      secrets
    });
  }

  if (isTlsError(serializedError)) {
    return buildConnectorError({
      code: "tls_failed",
      safeMessage: "OTRS TLS certificate validation failed.",
      request,
      detail: serializedError,
      remediationHint:
        "Configure the OTRS connector CA bundle with the server issuing CA, or fix the server certificate chain.",
      secrets
    });
  }

  return buildConnectorError({
    code: "webservice_unreachable",
    safeMessage: "OTRS web service is unreachable.",
    request,
    detail: serializedError,
    secrets
  });
}

function buildConnectorError(input: {
  code: OtrsConnectorErrorCode;
  safeMessage: string;
  request: OtrsTransportRequest;
  detail: unknown;
  remediationHint?: string;
  secrets?: string[];
}) {
  return new OtrsConnectorError({
    code: input.code,
    safeMessage: input.safeMessage,
    remediationHint: input.remediationHint,
    redactedDetail: redactKnownSecrets(
      redactOtrsPayload({
        operation: input.request.operation,
        method: input.request.method,
        url: redactOtrsUrl(input.request.url),
        body: input.request.body ? safeJsonParse(input.request.body) ?? input.request.body : undefined,
        detail: input.detail
      }),
      input.secrets ?? []
    )
  });
}

function operationFailureCode(operation: OtrsOperationRequest["operation"]): OtrsConnectorErrorCode {
  return operation === "TicketSearch" ? "ticket_search_failed" : "ticket_get_failed";
}

function serializeError(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      message: String(error)
    };
  }

  const serialized: Record<string, unknown> = {};
  const errorRecord = error as Record<string, unknown>;

  for (const key of Object.getOwnPropertyNames(error)) {
    serialized[key] = errorRecord[key];
  }

  for (const [key, value] of Object.entries(errorRecord)) {
    serialized[key] = value;
  }

  if (error instanceof Error) {
    serialized.name = error.name;
    serialized.message = error.message;
  }

  return serialized;
}

function isTimeoutError(error: Record<string, unknown>) {
  return (
    error.code === "ETIMEDOUT" ||
    error.code === "ESOCKETTIMEDOUT" ||
    error.code === "UND_ERR_HEADERS_TIMEOUT" ||
    /timed?\s*out/i.test(String(error.message ?? ""))
  );
}

function isTlsError(error: Record<string, unknown>) {
  return (
    (typeof error.code === "string" && tlsErrorCodes.has(error.code)) ||
    /certificate|self[- ]signed|unable to verify|tls/i.test(String(error.message ?? ""))
  );
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function redactPayloadValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(redactJsonString(value));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactPayloadValue);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? redactedValue : redactPayloadValue(nestedValue)
    ])
  );
}

function redactKnownSecrets(value: unknown, secrets: string[]) {
  const uniqueSecrets = Array.from(new Set(secrets.filter((secret) => secret.length > 0)));

  if (uniqueSecrets.length === 0) {
    return value;
  }

  return replaceKnownSecrets(value, uniqueSecrets);
}

function replaceKnownSecrets(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") {
    return secrets.reduce((redacted, secret) => redacted.split(secret).join(redactedValue), value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((nestedValue) => replaceKnownSecrets(nestedValue, secrets));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, replaceKnownSecrets(nestedValue, secrets)])
  );
}

function redactString(value: string) {
  return redactAuthFragments(redactUrlCredentials(redactPemBlocks(value)));
}

function redactJsonString(value: string) {
  const trimmed = value.trim();

  if (!isJsonLikeString(trimmed)) {
    return value;
  }

  const parsed = safeJsonParse(trimmed);

  if (parsed === undefined) {
    return value;
  }

  return JSON.stringify(redactPayloadValue(parsed));
}

function isJsonLikeString(value: string) {
  return (value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"));
}

function redactPemBlocks(value: string) {
  return value.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, redactedValue);
}

function redactUrlCredentials(value: string) {
  return value.replace(/([a-z][a-z\d+\-.]*:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, `$1${redactedValue}:${redactedValue}@`);
}

function redactAuthFragments(value: string) {
  return value.replace(
    /((?:^|[?&#;\s])(?:UserLogin|Password|SessionID|token|Token|authorization|Authorization|bearerToken|accessToken|apiToken|clientSecret)=)[^&#;\s]+/g,
    `$1${redactedValue}`
  ).replace(
    /((?:^|[\r\n\s])(?:Authorization|UserLogin|Password|SessionID|token|bearerToken|accessToken|apiToken|clientSecret)\s*:\s*)[^\r\n]+/gi,
    `$1${redactedValue}`
  );
}

function isSensitiveKey(key: string) {
  return /(userlogin|password|sessionid|token|authorization|bearertoken|accesstoken|apitoken|clientsecret|secret|cabundle)/i.test(
    key
  );
}
