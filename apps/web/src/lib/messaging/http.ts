import { Buffer } from "node:buffer";
import http from "node:http";
import https from "node:https";

/**
 * Minimal, self-contained HTTP transport for the messaging-delivery layer.
 *
 * Mirrors the AI scoring transport (`@/lib/ai-quality/scoring/http`): an
 * injectable transport for tests, a request timeout, a response-size cap, typed
 * errors, and secret redaction in any diagnostics. It is intentionally separate
 * so the messaging layer does not depend on scoring-specific types.
 *
 * Unlike the scoring client, a webhook POST never throws on a normal HTTP
 * failure: `postWebhook` resolves to a typed result the delivery worker records
 * verbatim. Only genuinely exceptional misuse (a missing transport) would throw.
 */

export type MessagingTransportRequest = {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type MessagingTransportResponse = {
  statusCode: number;
  body: string | Buffer | Uint8Array;
};

export type MessagingTransport = (request: MessagingTransportRequest) => Promise<MessagingTransportResponse>;

export type MessagingWebhookErrorCode =
  | "http_error"
  | "auth_failed"
  | "response_too_large"
  | "timeout"
  | "network_error";

export type MessagingWebhookResult =
  | { ok: true; statusCode: number }
  | { ok: false; code: MessagingWebhookErrorCode; error: string; statusCode?: number; diagnostic?: unknown };

export const defaultMessagingTimeoutMs = 10_000;
export const defaultMessagingMaxResponseBytes = 64 * 1024;

const sensitiveKeyPattern = /authorization|password|secret|token|api[_-]?key/i;
const sensitiveStringAssignmentPattern =
  /\b(access[_-]?token|token|password|api[_-]?key|client[_-]?secret|secret)\b(\s*[:=]\s*)(["']?)([^"',\s;&}]+)/gi;
const authorizationStringPattern = /\b(authorization)\b(\s*[:=]\s*)(["']?)(Api-Key|Bearer|Basic)\s+([^"',\s;&}]+)/gi;
const redactedValue = "[REDACTED]";
const timeoutErrorMessage = "Request timed out.";
const responseTooLargeErrorMessage = "Response exceeded maximum size.";

export function redactMessagingDiagnostic<T>(value: T): T {
  return redactValue(value) as T;
}

export function createMessagingHttpClient(input: { transport?: MessagingTransport } = {}) {
  const transport = input.transport ?? nodeTransport;

  return {
    /**
     * POSTs the webhook body and returns a typed result. Never throws on a
     * normal HTTP failure (non-2xx, network error, timeout, oversize response);
     * the worker records the failure result against the delivery row.
     */
    async postWebhook(request: MessagingTransportRequest): Promise<MessagingWebhookResult> {
      let response: MessagingTransportResponse;

      try {
        response = await transport(request);
      } catch (error) {
        if (isResponseTooLargeError(error)) {
          return {
            ok: false,
            code: "response_too_large",
            error: "Ответ канала превышает лимит размера.",
            statusCode: error.statusCode,
            diagnostic: redactMessagingDiagnostic({ responseBytes: error.responseBytes, request })
          };
        }

        const timedOut = isTimeoutError(error);
        return {
          ok: false,
          code: timedOut ? "timeout" : "network_error",
          error: timedOut ? "Канал не ответил за отведенное время." : "Не удалось отправить уведомление в канал.",
          diagnostic: redactMessagingDiagnostic({ error: serializeError(error), request })
        };
      }

      const bodyBuffer = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);

      if (bodyBuffer.byteLength > request.maxResponseBytes) {
        return {
          ok: false,
          code: "response_too_large",
          error: "Ответ канала превышает лимит размера.",
          statusCode: response.statusCode,
          diagnostic: redactMessagingDiagnostic({ responseBytes: bodyBuffer.byteLength, request })
        };
      }

      if (response.statusCode === 401 || response.statusCode === 403) {
        return {
          ok: false,
          code: "auth_failed",
          error: "Канал отклонил учетные данные.",
          statusCode: response.statusCode,
          diagnostic: redactMessagingDiagnostic({ request })
        };
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return {
          ok: false,
          code: "http_error",
          error: `Канал вернул HTTP ${response.statusCode}.`,
          statusCode: response.statusCode,
          diagnostic: redactMessagingDiagnostic({ request })
        };
      }

      return { ok: true, statusCode: response.statusCode };
    }
  };
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sensitiveKeyPattern.test(key) ? redactedValue : redactValue(item)])
    );
  }

  return value;
}

function redactString(value: string) {
  return value
    .replace(authorizationStringPattern, (_match, key: string, separator: string, quote: string, scheme: string) => {
      return `${key}${separator}${quote}${scheme} ${redactedValue}`;
    })
    .replace(sensitiveStringAssignmentPattern, (_match, key: string, separator: string, quote: string) => {
      return `${key}${separator}${quote}${redactedValue}`;
    });
}

function serializeError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: redactString(error.message) }
    : { message: redactString(String(error)) };
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.message === timeoutErrorMessage;
}

class ResponseTooLargeTransportError extends Error {
  readonly statusCode: number;
  readonly responseBytes: number;

  constructor(statusCode: number, responseBytes: number) {
    super(responseTooLargeErrorMessage);
    this.name = "ResponseTooLargeTransportError";
    this.statusCode = statusCode;
    this.responseBytes = responseBytes;
  }
}

function isResponseTooLargeError(error: unknown): error is ResponseTooLargeTransportError {
  return error instanceof ResponseTooLargeTransportError;
}

function nodeTransport(request: MessagingTransportRequest): Promise<MessagingTransportResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const client = url.protocol === "https:" ? https : http;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      callback();
    };

    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: request.headers
      },
      (response) => {
        const chunks: Buffer[] = [];
        let responseBytes = 0;

        response.on("data", (chunk) => {
          const buffer = Buffer.from(chunk);
          responseBytes += buffer.byteLength;

          if (responseBytes > request.maxResponseBytes) {
            const error = new ResponseTooLargeTransportError(response.statusCode ?? 0, responseBytes);
            settle(() => reject(error));
            response.destroy(error);
            req.destroy(error);
            return;
          }

          chunks.push(buffer);
        });
        response.on("end", () => {
          settle(() => resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks) }));
        });
        response.on("error", (error) => {
          settle(() => reject(error));
        });
        response.on("close", () => {
          if (!response.readableEnded) {
            settle(() => reject(new Error("Response stream closed before completion.")));
          }
        });
      }
    );
    timer = setTimeout(() => {
      req.destroy(new Error(timeoutErrorMessage));
    }, request.timeoutMs);

    req.on("error", (error) => {
      settle(() => reject(error));
    });

    if (request.body) {
      req.write(request.body);
    }

    req.end();
  });
}
