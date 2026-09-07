import { forbidden } from "next/navigation";
import { isPermissionDeniedError, type Permission } from "@/lib/auth/permissions";
import { requireCurrentUserPermission } from "@/lib/current-user";

/**
 * Page/RSC authz gate. Permission denials use Next.js `forbidden()` so the
 * product renders `forbidden.tsx` (403) instead of the generic error boundary.
 * API routes and server actions keep `requireCurrentUserPermission`.
 */
export async function requirePagePermission(permission: Permission) {
  try {
    return await requireCurrentUserPermission(permission);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return forbidden();
    }

    throw error;
  }
}

/** Fail closed on a page when a custom role check already decided deny. */
export function denyPageAccess(): never {
  forbidden();
}
