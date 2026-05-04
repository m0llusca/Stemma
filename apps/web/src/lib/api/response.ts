import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal_error";

export type ApiResponseOptions = {
  status?: number;
  requestId?: string;
  meta?: unknown;
  headers?: HeadersInit;
};

function mergeHeaders(headers: HeadersInit | undefined, requestId: string) {
  const merged = new Headers(headers);
  merged.set("x-request-id", requestId);
  return merged;
}

export function apiRequestId(): string {
  return randomUUID();
}

export function requestIdFromHeaders(headers: Headers) {
  return headers.get("x-request-id")?.trim() || apiRequestId();
}

export function apiData<T>(data: T, options: ApiResponseOptions = {}) {
  const requestId = options.requestId ?? apiRequestId();

  return NextResponse.json(
    {
      data,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
      requestId
    },
    {
      status: options.status ?? 200,
      headers: mergeHeaders(options.headers, requestId)
    }
  );
}

export function apiJson<T>(data: T, status = 200, requestId: string = apiRequestId()) {
  return NextResponse.json(data, {
    status,
    headers: {
      "x-request-id": requestId
    }
  });
}

export function apiError(code: ApiErrorCode, message: string, status: number, requestId: string = apiRequestId(), details?: unknown) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? null,
        requestId
      }
    },
    {
      status,
      headers: mergeHeaders(undefined, requestId)
    }
  );
}
