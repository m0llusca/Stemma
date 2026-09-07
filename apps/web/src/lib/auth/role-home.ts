import type { RoleName } from "@prisma/client";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Paths treated as "no explicit destination" after login / demo switch.
 * Deep links (including `/reviews?...` with filters) are kept as-is.
 */
const GENERIC_LANDING_PATHNAMES = new Set([
  "/",
  "/reviews",
  "/dashboard",
  "/auth/login",
  "/auth/pending-access"
]);

/**
 * Analyst inbox default: assigned to me AND overdue SLA.
 * Matches existing queue filter model (`qaAssignee` + `due=overdue`).
 */
export function analystMineOverdueHref(qaAssigneeName: string) {
  return `/reviews?qaAssignee=${encodeURIComponent(qaAssigneeName)}&due=overdue`;
}

export function sanitizeReturnTo(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.startsWith("/") && !text.startsWith("//")) {
    return text;
  }

  // Invalid / open-redirect attempts collapse to a generic sentinel so role home applies.
  return "/";
}

export function isGenericPostLoginPath(path: string) {
  if (path.includes("?")) {
    return false;
  }

  const pathname = path.split("?")[0] || path;
  return GENERIC_LANDING_PATHNAMES.has(pathname);
}

/**
 * Roles that may open `/dashboard`.
 * SUPPORT_AGENT holds `reviews:read` (so a permission gate alone is not enough)
 * but their product home is `/self-review`. VIEWER has neither.
 * EXEC lands on the same route with a risk-only chrome (ops pulse hidden).
 */
export const DASHBOARD_ROLES = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "EXEC"] as const satisfies readonly RoleName[];

export function canAccessDashboard(role: RoleName) {
  return (DASHBOARD_ROLES as readonly RoleName[]).includes(role);
}

/**
 * Top-nav «Проверки». Writers and dashboard roles (ADMIN / TEAM_LEAD / QA_ANALYST / EXEC).
 * SUPPORT_AGENT holds `reviews:read` for scoped deep links, but chrome must not
 * sell the ops queue — their JTBD is self-review and coaching.
 */
export function canSeeReviewsQueueNav(role: RoleName) {
  return canAccessDashboard(role);
}

/**
 * Topbar pulse «Очередь» / «Риск». Review writers only.
 * EXEC has `reviews:read` for SLA drill from ExecRiskHome, but docs say
 * без ops-хрома — a permission gate alone would still sell the queue.
 */
export function canSeeOpsQueuePulse(role: RoleName) {
  return hasPermission(role, "reviews:write");
}

/**
 * Role-gated product home after login when the caller did not request a specific page.
 * VIEWER lands on `/auth/pending-access` (no product permissions) instead of a deny page.
 */
export function roleHomePath(role: RoleName, options?: { name?: string }) {
  switch (role) {
    case "QA_ANALYST": {
      const name = options?.name?.trim();
      return name ? analystMineOverdueHref(name) : "/reviews?due=overdue";
    }
    case "TEAM_LEAD":
    case "ADMIN":
    case "EXEC":
      return "/dashboard";
    case "SUPPORT_AGENT":
      return "/self-review";
    case "VIEWER":
      return "/auth/pending-access";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function resolvePostLoginPath(returnTo: string | null | undefined, user: { role: RoleName; name: string }) {
  // VIEWER has no product permissions — never honor deep-link returnTo into deny pages.
  if (user.role === "VIEWER") {
    return roleHomePath("VIEWER");
  }

  const safe = sanitizeReturnTo(returnTo);
  if (isGenericPostLoginPath(safe)) {
    return roleHomePath(user.role, { name: user.name });
  }

  return safe;
}
