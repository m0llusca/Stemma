import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import type { Permission } from "@/lib/auth/permissions";
import { AuthRequiredError, requireCurrentUserPermission } from "@/lib/current-user";

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
    return { ok: true, user };
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return {
        ok: false,
        response: apiError("unauthorized", error.message, 401, options.requestId)
      };
    }

    return {
      ok: false,
      response: apiError(
        "forbidden",
        error instanceof Error ? error.message : "Недостаточно прав для выполнения операции.",
        403,
        options.requestId
      )
    };
  }
}
