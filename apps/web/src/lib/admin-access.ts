import type { RoleName } from "@prisma/client";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

/**
 * Permissions that unlock at least one `/admin/*` section.
 * Holding any of these is the source of truth for an honest home in admin IA
 * (Settings top-nav, `/admin` hub, overview rail). Mirrors the rail item
 * permissions in `admin-subnav.tsx` — keep the two lists in lockstep.
 */
export const adminHubPermissions = [
  "scorecards:manage",
  "sampling:manage",
  "backend_jobs:manage",
  "users:manage",
  "auth_providers:manage",
  "api_tokens:manage",
  "integrations:manage",
  "reports:manage",
  "appearance:manage",
  "audit:read"
] as const satisfies readonly Permission[];

export function canAccessAdminHub(role: RoleName) {
  return adminHubPermissions.some((permission) => hasPermission(role, permission));
}
