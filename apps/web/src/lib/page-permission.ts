import type { RoleName } from "@prisma/client";
import { forbidden, redirect, unauthorized } from "next/navigation";
import { isPermissionDeniedError, type Permission } from "@/lib/auth/permissions";
import { getCurrentUser, isAuthRequiredError, requireCurrentUserPermission } from "@/lib/current-user";

function denyOrPendingAccess(role?: RoleName): never {
  if (role === "VIEWER") {
    redirect("/auth/pending-access");
  }

  forbidden();
}

/**
 * Page/RSC authz gate.
 * Missing/invalid session → Next.js `unauthorized()` (`unauthorized.tsx`, 401).
 * VIEWER (no product permissions) → `/auth/pending-access`, not a 403 wall.
 * Other permission denials → `forbidden()` (`forbidden.tsx`, 403).
 * Neither path hits the generic `error.tsx` «Что-то пошло не так».
 * API routes and server actions keep `requireCurrentUserPermission`.
 */
export async function requirePagePermission(permission: Permission) {
  try {
    return await requireCurrentUserPermission(permission);
  } catch (error) {
    if (isAuthRequiredError(error)) {
      return unauthorized();
    }

    if (isPermissionDeniedError(error)) {
      let role: RoleName | undefined;
      try {
        const user = await getCurrentUser();
        role = user.role;
      } catch {
        return forbidden();
      }

      return denyOrPendingAccess(role);
    }

    throw error;
  }
}

/**
 * Page/RSC session gate for surfaces that only need a signed-in user
 * (role checks happen separately). Invalid cookies still map to 401, not 500.
 */
export async function requirePageUser() {
  try {
    return await getCurrentUser();
  } catch (error) {
    if (isAuthRequiredError(error)) {
      return unauthorized();
    }

    throw error;
  }
}

/** Fail closed on a page when a custom role check already decided deny. */
export function denyPageAccess(user?: { role: RoleName }): never {
  return denyOrPendingAccess(user?.role);
}
