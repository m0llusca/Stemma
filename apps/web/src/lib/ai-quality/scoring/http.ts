import { Buffer } from "node:buffer";
import http from "node:http";
import https from "node:https";
import { ScoringProviderError } from "@/lib/ai-quality/scoring/errors";

/**
 * Minimal, self-contained HTTP transport for the AI scoring layer.
 *
 * Mirrors the helpdesk adapter transport (`@/lib/integrations/helpdesk-adapters/http`):
 * an injectable transport for tests, a request timeout, a response-size cap,
 * typed errors, and secret redaction in any diagnostics. It is intentionally
 * separate so the scoring layer does not depend on helpdesk-specific types.
 */

export type ScoringTransportRequest = {
  method: "POST" | "GET";
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type ScoringTransportResponse = {
  statusCode: number;
  body: string | Buffer | Uint8Array;
};

export type ScoringTransport = (request: ScoringTransportRequest) => Promise<ScoringTransportResponse>;

const sensitiveKeyPattern = /authorization|password|secret|token|api[_-]?key/i;
const sensitiveStringAssignmentPattern =
  /\b(access[_-]?token|token|password|api[_-]?key|client[_-]?secret|secret)\b(\s*[:=]\s*)(["']?)([^"',\s;&}]+)/gi;
const authorizationStringPattern = /\b(authorization)\b(\s*[:=]\s*)(["']?)(Api-Key|Bearer|Basic)\s+([^"',\s;&}]+)/gi;
const redactedValue = "[REDACTED]";
const timeoutErrorMessage = "Request timed out.";
const responseTooLargeErrorMessage = "Response exceeded maximum size.";

export function redactScoringDiagnostic<T>(value: T): T {
  return redactValue(value) as T;
}

export function createScoringHttpClient(input: { provider: string; transport?: ScoringTransport }) {
  const transport = input.transport ?? nodeTransport;
  const provider = input.provider;

  return {
    /** Performs the request and returns the raw (already size-checked) response text. */
    async requestText(request: ScoringTransportRequest): Promise<string> {
      const response = await transport(request).catch((error) => {
        const timedOut = isTimeoutError(error);

        if (isResponseTooLargeError(error)) {
          throw new ScoringProviderError({
            code: "response_too_large",
            provider,
            safeMessage: "Ответ модели превышает лимит размера.",
            diagnostic: redactScoringDiagnostic({ statusCode: error.statusCode, responseBytes: error.responseBytes, request })
          });
        }

        throw new ScoringProviderError({
          code: timedOut ? "timeout" : "network_error",
          provider,
          safeMessage: timedOut ? "Модель не ответила за отведенное время." : "Не удалось выполнить запрос к модели.",
          diagnostic: redactScoringDiagnostic({ error: serializeError(error), request })
        });
      });

      const bodyBuffer = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);

      if (bodyBuffer.byteLength > request.maxResponseBytes) {
        throw new ScoringProviderError({
          code: "response_too_large",
          provider,
          safeMessage: "Ответ модели превышает лимит размера.",
          diagnostic: redactScoringDiagnostic({ statusCode: response.statusCode, responseBytes: bodyBuffer.byteLength, request })
        });
      }

      const text = bodyBuffer.toString("utf8");

      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new ScoringProviderError({
          code: "auth_failed",
          provider,
          safeMessage: "Модель отклонила учетные данные.",
          diagnostic: redactScoringDiagnostic({ statusCode: response.statusCode, request })
        });
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new ScoringProviderError({
          code: "http_error",
          provider,
          safeMessage: `Сервис модели вернул HTTP ${response.statusCode}.`,
          diagnostic: redactScoringDiagnostic({ statusCode: response.statusCode, request })
        });
      }

      return text;
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

function nodeTransport(request: ScoringTransportRequest): Promise<ScoringTransportResponse> {
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
