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

export function apiRequestId(): string {
  return randomUUID();
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
  return apiJson(
    {
      error: {
        code,
        message,
        details: details ?? null
      }
    },
    status,
    requestId
  );
}
