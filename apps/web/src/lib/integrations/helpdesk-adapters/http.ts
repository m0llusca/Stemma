import { Buffer } from "node:buffer";
import http from "node:http";
import https from "node:https";
import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import type { HelpdeskAdapterOperation, PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

type TransportRequest = {
  source: PhaseBHelpdeskSource;
  operation: HelpdeskAdapterOperation;
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

type TransportResponse = {
  statusCode: number;
  headers?: Record<string, string | string[] | undefined>;
  body: string | Buffer | Uint8Array;
};

export type HelpdeskTransport = (request: TransportRequest) => Promise<TransportResponse>;

const sensitiveKeyPattern = /authorization|password|secret|token|api[_-]?key|client[_-]?secret/i;
const sensitiveStringAssignmentPattern =
  /\b(access[_-]?token|token|password|api[_-]?key|client[_-]?secret|secret)\b(\s*[:=]\s*)(["']?)([^"',\s;&}]+)/gi;
const authorizationStringPattern = /\b(authorization)\b(\s*[:=]\s*)(["']?)(Bearer|Basic)\s+([^"',\s;&}]+)/gi;
const bareSensitiveStringPattern = /\b(secret|token|api[-_]?key|apikey|client[-_]?secret|bearer)\b/i;
const redactedValue = "[REDACTED]";
const redactedBodyValue = "[REDACTED_BODY]";
const timeoutErrorMessage = "Request timed out.";
const responseTooLargeErrorMessage = "Response exceeded maximum size.";

export function bearerHeaders(token: string | undefined): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function basicApiTokenHeaders(token: string | undefined, suffix = "X"): Record<string, string> {
  return token ? { authorization: `Basic ${Buffer.from(`${token}:${suffix}`).toString("base64")}` } : {};
}

export function redactHelpdeskDiagnostic<T>(value: T): T {
  return redactValue(value) as T;
}

export function createHelpdeskHttpClient(input: { transport?: HelpdeskTransport } = {}) {
  const transport = input.transport ?? nodeTransport;

  return {
    async requestJson(request: TransportRequest) {
      const response = await transport(request).catch((error) => {
        const timedOut = isTimeoutError(error);

        if (isResponseTooLargeError(error)) {
          throw new HelpdeskAdapterError({
            code: "response_too_large",
            source: request.source,
            operation: request.operation,
            safeMessage: "Ответ источника превышает лимит размера.",
            diagnostic: redactHelpdeskDiagnostic({
              statusCode: error.statusCode,
              responseBytes: error.responseBytes,
              request
            })
          });
        }

        throw new HelpdeskAdapterError({
          code: timedOut ? "timeout" : "network_error",
          source: request.source,
          operation: request.operation,
          safeMessage: timedOut ? "Источник не ответил за отведенное время." : "Не удалось выполнить запрос к источнику.",
          diagnostic: redactHelpdeskDiagnostic({ error: serializeError(error), request })
        });
      });
      const bodyBuffer = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);

      if (bodyBuffer.byteLength > request.maxResponseBytes) {
        throw new HelpdeskAdapterError({
          code: "response_too_large",
          source: request.source,
          operation: request.operation,
          safeMessage: "Ответ источника превышает лимит размера.",
          diagnostic: redactHelpdeskDiagnostic({
            statusCode: response.statusCode,
            responseBytes: bodyBuffer.byteLength,
            request
          })
        });
      }

      const text = bodyBuffer.toString("utf8");

      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new HelpdeskAdapterError({
          code: "auth_failed",
          source: request.source,
          operation: request.operation,
          safeMessage: "Источник отклонил учетные данные.",
          diagnostic: redactHelpdeskDiagnostic({ statusCode: response.statusCode, responseBody: safeDiagnosticBody(text), request })
        });
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new HelpdeskAdapterError({
          code: "http_error",
          source: request.source,
          operation: request.operation,
          safeMessage: `Источник вернул HTTP ${response.statusCode}.`,
          diagnostic: redactHelpdeskDiagnostic({ statusCode: response.statusCode, responseBody: safeDiagnosticBody(text), request })
        });
      }

      try {
        return {
          body: text ? (JSON.parse(text) as unknown) : {},
          diagnostic: redactHelpdeskDiagnostic({
            operation: request.operation,
            method: request.method,
            url: request.url,
            statusCode: response.statusCode
          })
        };
      } catch (error) {
        throw new HelpdeskAdapterError({
          code: "invalid_json",
          source: request.source,
          operation: request.operation,
          safeMessage: "Источник вернул ответ не в JSON-формате.",
          diagnostic: redactHelpdeskDiagnostic({ parseError: serializeError(error), responseBody: safeDiagnosticBody(text), request })
        });
      }
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
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKeyPattern.test(key) ? redactedValue : redactDiagnosticEntry(key, item)
      ])
    );
  }

  return value;
}

function redactDiagnosticEntry(key: string, value: unknown): unknown {
  if (typeof value === "string" && /body/i.test(key)) {
    return safeDiagnosticBody(value);
  }

  return redactValue(value);
}

function redactString(value: string) {
  const redactedUrl = redactUrl(value);
  const redactedFragments = redactSecretFragments(redactedUrl);

  if (redactedFragments !== redactedUrl) {
    return redactedFragments;
  }

  if (redactedUrl !== value) {
    return redactedUrl;
  }

  return bareSensitiveStringPattern.test(value) ? redactedValue : value;
}

function redactUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.username) {
      url.username = redactedValue;
    }

    if (url.password) {
      url.password = redactedValue;
    }

    for (const key of Array.from(url.searchParams.keys())) {
      if (sensitiveKeyPattern.test(key)) {
        url.searchParams.set(key, redactedValue);
      }
    }

    return url.toString().replaceAll("%5BREDACTED%5D", redactedValue);
  } catch {
    return value;
  }
}

function redactSecretFragments(value: string) {
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
    ? { name: error.name, message: safeDiagnosticText(error.message) }
    : { message: safeDiagnosticText(String(error)) };
}

function safeDiagnosticBody(text: string) {
  if (!text) {
    return "";
  }

  try {
    return redactHelpdeskDiagnostic(JSON.parse(text) as unknown);
  } catch {
    const redactedText = redactString(text);

    return redactedText === text ? { value: redactedBodyValue, bytes: Buffer.byteLength(text, "utf8") } : redactedText;
  }
}

function safeDiagnosticText(text: string) {
  const redactedText = redactString(text);

  return redactedText === text && sensitiveKeyPattern.test(text) ? redactedBodyValue : redactedText;
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

function nodeTransport(request: TransportRequest): Promise<TransportResponse> {
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
          settle(() =>
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: response.headers as Record<string, string | string[] | undefined>,
              body: Buffer.concat(chunks)
            })
          );
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
