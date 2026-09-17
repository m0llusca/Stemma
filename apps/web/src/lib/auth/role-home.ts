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
 * This is «Сегодня» / role home. QA stays in DASHBOARD_ROLES so «Проверки»
 * nav stays on. Bare `/dashboard` remaps via `canLandOnDashboard` — see
 * navigation.ts and dashboard/page.tsx.
 */
export function analystMineOverdueHref(qaAssigneeName: string) {
  return `/reviews?qaAssignee=${encodeURIComponent(qaAssigneeName)}&due=overdue`;
}

/**
 * Collapse open-redirect attempts to `/` so role home applies.
 * Rejects scheme-relative URLs, backslash IE/WHATWG edge cases, control chars,
 * percent-encoded `//` / `\`, and any path that WHATWG URL resolution would take
 * off a same-origin base.
 */
export function sanitizeReturnTo(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";

  if (
    !text.startsWith("/") ||
    text.startsWith("//") ||
    text.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(text)
  ) {
    return "/";
  }

  try {
    const base = "https://stemma.invalid";
    const resolved = new URL(text, base);

    // Username/password in the path (e.g. `/@evil` tricks) or off-origin → reject.
    if (resolved.origin !== base || resolved.username || resolved.password) {
      return "/";
    }

    let decodedPath = resolved.pathname;
    try {
      decodedPath = decodeURIComponent(resolved.pathname);
    } catch {
      return "/";
    }

    if (!decodedPath.startsWith("/") || decodedPath.startsWith("//") || decodedPath.includes("\\")) {
      return "/";
    }

    const safe = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    if (!safe.startsWith("/") || safe.startsWith("//") || safe.includes("\\")) {
      return "/";
    }

    return safe || "/";
  } catch {
    return "/";
  }
}

export function isGenericPostLoginPath(path: string) {
  const withoutHash = (path.split("#")[0] || path).trim();

  if (withoutHash.includes("?")) {
    return false;
  }

  let pathname = withoutHash;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.replace(/\/+$/, "") || "/";
  }

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
 * Roles whose product home is `/dashboard`. QA may open queue chrome
 * (`canAccessDashboard`) but a typed `/dashboard` remaps to the inbox —
 * one home, no dual-home residual.
 */
export function canLandOnDashboard(role: RoleName): boolean {
  switch (role) {
    case "ADMIN":
    case "TEAM_LEAD":
    case "EXEC":
      return true;
    case "QA_ANALYST":
    case "SUPPORT_AGENT":
    case "VIEWER":
      return false;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export type DashboardSkeletonVariant = "dashboard" | "exec";

/** Ops pulse is 4-KPI; EXEC live home is ExecRiskHome (3-KPI, no dual panels). */
export function dashboardSkeletonVariantForRole(role: RoleName): DashboardSkeletonVariant {
  return role === "EXEC" ? "exec" : "dashboard";
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

/**
 * Inbox «Сбросить фильтры» target. Always the unfiltered queue — including QA.
 * Role home (login / «Сегодня») stays mine+overdue via `roleHomePath`.
 */
export function queueFilterResetHref(_role?: RoleName, _options?: { name?: string }) {
  return "/reviews";
}

export type WelcomeBackSurface = "reviews" | "dashboard";

/**
 * Welcome-back «очередь дня». Dashboard → role home. Reviews → Analyst
 * mine+overdue inbox; others `/reviews`. Distinct from «Сбросить фильтры»,
 * which always clears to `/reviews`.
 */
export function welcomeBackResetHref(
  surface: WelcomeBackSurface,
  role: RoleName,
  options?: { name?: string }
) {
  if (surface === "dashboard" || role === "QA_ANALYST") {
    return roleHomePath(role, options);
  }

  return "/reviews";
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
