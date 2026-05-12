import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import type { Permission } from "@/lib/auth/permissions";
import { AuthRequiredError, DemoSettingsMutationError, assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";

type SessionApiResult =
  | {
      ok: true;
      user: Awaited<ReturnType<typeof requireCurrentUserPermission>>;
    }
  | {
      ok: false;
      response: NextResponse;
    };

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const settingsMutationPermissions = new Set<Permission>([
  "api_tokens:manage",
  "appearance:manage",
  "auth_providers:manage",
  "backend_jobs:manage",
  "integrations:manage",
  "privacy:manage",
  "sampling:manage",
  "scorecards:manage",
  "training:manage",
  "users:manage"
]);
const permissionDeniedMessage = "Недостаточно прав для выполнения операции.";

function originOf(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function verifySameOrigin(request: Request) {
  if (safeMethods.has(request.method.toUpperCase())) {
    return { ok: true } as const;
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");

  if (origin) {
    return originOf(origin) === requestOrigin
      ? ({ ok: true } as const)
      : ({ ok: false, message: "Cross-origin request blocked." } as const);
  }

  const referer = request.headers.get("referer");

  if (referer) {
    return originOf(referer) === requestOrigin
      ? ({ ok: true } as const)
      : ({ ok: false, message: "Cross-origin request blocked." } as const);
  }

  return { ok: false, message: "Origin header is required." } as const;
}

export async function requireSessionApi(
  request: Request,
  permission: Permission,
  options: { requestId?: string } = {}
): Promise<SessionApiResult> {
  const csrf = verifySameOrigin(request);

  if (!csrf.ok) {
    return {
      ok: false,
      response: apiError("forbidden", csrf.message, 403, options.requestId)
    };
  }

  try {
    const user = await requireCurrentUserPermission(permission);

    if (!safeMethods.has(request.method.toUpperCase()) && settingsMutationPermissions.has(permission)) {
      await assertCanPersistSettings(user);
    }

    return { ok: true, user };
  } catch (error) {
    if (error instanceof AuthRequiredError || (error instanceof Error && error.name === "AuthRequiredError")) {
      return {
        ok: false,
        response: apiError("unauthorized", error.message, 401, options.requestId)
      };
    }

    if (error instanceof Error && error.message === permissionDeniedMessage) {
      return {
        ok: false,
        response: apiError("forbidden", error.message, 403, options.requestId)
      };
    }

    if (error instanceof DemoSettingsMutationError || (error instanceof Error && error.name === "DemoSettingsMutationError")) {
      return {
        ok: false,
        response: apiError("forbidden", error.message, 403, options.requestId)
      };
    }

    return {
      ok: false,
      response: apiError("internal_error", "Внутренняя ошибка авторизации.", 500, options.requestId)
    };
  }
}
