import type { ApiErrorCode } from "@/lib/api/response";

/**
 * Fail-closed UI copy for session vs permission failures.
 * 401 = no usable session (sign in again); 403 = signed in but not allowed.
 */
export const sessionRequiredMessage =
  "Нет активной сессии. Войдите снова, чтобы продолжить.";

export const permissionDeniedMessage = "Недостаточно прав для выполнения операции.";

const codeMessages: Partial<Record<ApiErrorCode, string>> = {
  unauthorized: sessionRequiredMessage,
  forbidden: permissionDeniedMessage
};

export function userFacingApiErrorMessage(input: {
  status?: number | null;
  code?: string | null;
  message?: string | null;
  fallback?: string;
}): string {
  const code = input.code?.trim();
  if (code && code in codeMessages) {
    return codeMessages[code as ApiErrorCode] ?? input.fallback ?? "Запрос отклонён.";
  }

  if (input.status === 401) {
    return sessionRequiredMessage;
  }

  if (input.status === 403) {
    return permissionDeniedMessage;
  }

  const message = input.message?.trim();
  if (message) {
    return message;
  }

  return input.fallback ?? "Запрос отклонён.";
}

export function parseApiErrorPayload(payload: unknown): {
  code?: string;
  message?: string;
} {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const root = payload as { error?: unknown; message?: unknown; code?: unknown };
  if (root.error && typeof root.error === "object") {
    const error = root.error as { code?: unknown; message?: unknown };
    return {
      code: typeof error.code === "string" ? error.code : undefined,
      message: typeof error.message === "string" ? error.message : undefined
    };
  }

  return {
    code: typeof root.code === "string" ? root.code : undefined,
    message: typeof root.message === "string" ? root.message : undefined
  };
}
