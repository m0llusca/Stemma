import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { RoleName } from "@prisma/client";
import { sessionRequiredMessage } from "@/lib/api/user-facing-errors";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import { demoLoginUserOrderBy, demoLoginUserWhere } from "@/lib/auth/demo-users";
import { hasPermission, type Permission, requirePermission } from "@/lib/auth/permissions";
import { getValidAuthSession, sessionCookieName } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const currentUserCookieName = "qc_current_user_id";

export class AuthRequiredError extends Error {
  constructor() {
    super(sessionRequiredMessage);
    this.name = "AuthRequiredError";
  }
}

export function isAuthRequiredError(error: unknown): error is AuthRequiredError {
  return (
    error instanceof AuthRequiredError ||
    (error instanceof Error &&
      (error.name === "AuthRequiredError" || error.message === sessionRequiredMessage))
  );
}

export class DemoSettingsMutationError extends Error {
  constructor() {
    super("Демо-пользователи не могут сохранять настройки реального окружения.");
    this.name = "DemoSettingsMutationError";
  }
}

export { isDemoAuthEnabled };

const loopbackDemoFallbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * No-cookie demo impersonation is local-only. A public QC_DEMO_AUTH stand
 * (cloudflared + Neon) must not serve the product shell from Host spoofing
 * via `x-forwarded-host` — only the request `Host` is consulted.
 */
export function isLoopbackDemoFallbackHost(hostHeader: string | null | undefined) {
  const host = (hostHeader ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (!host) {
    return false;
  }

  const hostname =
    host.startsWith("[") && host.includes("]")
      ? host.slice(1, host.indexOf("]"))
      : host.replace(/:\d+$/, "");

  return loopbackDemoFallbackHosts.has(hostname);
}

async function getAuthJsSession() {
  const { auth } = await import("../../auth");
  return auth();
}

/**
 * Per-request memo. Layout, AppNav, loading.tsx, and page gates all call this
 * on the same RSC render; without cache() each call re-imports Auth.js, re-reads
 * the session, and (legacy cookie path) writes `lastSeenAt` again.
 */
export const getCurrentUser = cache(async function getCurrentUser() {
  const authSession = await getAuthJsSession();
  const authUserId = authSession?.user?.id;

  if (authUserId) {
    const user = await prisma.user.findUnique({
      where: { id: authUserId },
      include: { workspace: true }
    });

    if (!user || user.lifecycleStatus !== "ACTIVE") {
      throw new AuthRequiredError();
    }

    return user;
  }

  const cookieStore = await cookies();
  const session = await getValidAuthSession(cookieStore.get(sessionCookieName)?.value);

  if (session) {
    if (session.providerId && !isDemoAuthEnabled()) {
      const provider = await prisma.identityProvider.findUnique({
        where: { id: session.providerId },
        select: { type: true }
      });

      if (provider?.type === "DEMO") {
        throw new AuthRequiredError();
      }
    }

    return session.user;
  }

  if (!isDemoAuthEnabled()) {
    throw new AuthRequiredError();
  }

  const requestedUserId = cookieStore.get(currentUserCookieName)?.value;
  const user = requestedUserId
    ? await prisma.user.findUnique({
        where: { id: requestedUserId },
        include: { workspace: true }
      })
    : null;

  if (user) {
    return user;
  }

  const requestHost = (await headers()).get("host");
  if (!isLoopbackDemoFallbackHost(requestHost)) {
    throw new AuthRequiredError();
  }

  const fallbackUser = await prisma.user.findFirst({
    where: { role: { in: ["QA_ANALYST", "ADMIN", "TEAM_LEAD"] } },
    orderBy: {
      role: "asc"
    },
    include: { workspace: true }
  });

  if (!fallbackUser) {
    throw new Error("Демо-пользователь для проверки не найден. Запустите npm run db:seed.");
  }

  return fallbackUser;
});

export async function requireCurrentUserPermission(permission: Permission) {
  const user = await getCurrentUser();
  requirePermission(user, permission);
  return user;
}

export async function isCurrentDemoUser(user: { id: string }) {
  const cookieStore = await cookies();
  const session = await getValidAuthSession(cookieStore.get(sessionCookieName)?.value);

  if (session?.providerId) {
    const provider = await prisma.identityProvider.findUnique({
      where: { id: session.providerId },
      select: { type: true }
    });

    if (provider?.type === "DEMO") {
      return true;
    }
  }

  if (!session && isDemoAuthEnabled()) {
    return true;
  }

  const userId = session?.userId ?? user.id;
  const demoIdentityCount = await prisma.externalIdentity.count({
    where: {
      userId,
      provider: {
        type: "DEMO",
        status: "active"
      }
    }
  });

  return demoIdentityCount > 0;
}

export async function assertCanPersistSettings(user: { id: string }) {
  if (await isCurrentDemoUser(user)) {
    throw new DemoSettingsMutationError();
  }
}

/** Demo-identity users for the nav switcher — same filter as `/auth/login`. */
export async function getDemoSwitcherUsers(workspaceId: string) {
  return prisma.user.findMany({
    where: {
      workspaceId,
      ...demoLoginUserWhere
    },
    orderBy: demoLoginUserOrderBy,
    select: {
      id: true,
      name: true
    }
  });
}

export function canFinalizeReview(role: RoleName) {
  return hasPermission(role, "reviews:finalize");
}

export function canSaveReviewDraft(role: RoleName) {
  return hasPermission(role, "reviews:write");
}

export function canManageReviewWorkflow(role: RoleName) {
  return hasPermission(role, "workflow:manage");
}

/** Appeal resolve / reanswer — TEAM_LEAD / ADMIN only (stricter than workflow:manage). */
export function canResolveAppeal(role: RoleName) {
  return role === "TEAM_LEAD" || role === "ADMIN";
}

export function canManageCalibration(role: RoleName) {
  return hasPermission(role, "calibration:manage");
}

export function canAcknowledgeFeedback(role: RoleName) {
  return hasPermission(role, "feedback:acknowledge");
}

export function canSelfReview(role: RoleName) {
  return hasPermission(role, "self_review:write");
}

export function canManageScorecards(role: RoleName) {
  return hasPermission(role, "scorecards:manage");
}

export function canManageIntegrations(role: RoleName) {
  return hasPermission(role, "integrations:manage");
}

export function canManageSamplingRules(role: RoleName) {
  return hasPermission(role, "sampling:manage");
}

export function canManageTraining(role: RoleName) {
  return hasPermission(role, "training:manage");
}

export function canConsumeTraining(role: RoleName) {
  return hasPermission(role, "training:consume");
}

/** Coaching page entry: managers (manage) or agents (consume). Mutations stay manage-only. */
export function canAccessTraining(role: RoleName) {
  return canManageTraining(role) || canConsumeTraining(role);
}
