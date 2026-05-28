import { cookies } from "next/headers";
import type { RoleName } from "@prisma/client";
import { auth } from "../../auth";
import { hasPermission, type Permission, requirePermission } from "@/lib/auth/permissions";
import { getValidAuthSession, sessionCookieName } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const currentUserCookieName = "qc_current_user_id";

export class AuthRequiredError extends Error {
  constructor() {
    super("Нет активной пользовательской сессии.");
    this.name = "AuthRequiredError";
  }
}

export class DemoSettingsMutationError extends Error {
  constructor() {
    super("Демо-пользователи не могут сохранять настройки реального окружения.");
    this.name = "DemoSettingsMutationError";
  }
}

export function isDemoAuthEnabled() {
  return process.env.QC_DEMO_AUTH === "enabled";
}

export async function getCurrentUser() {
  const authSession = await auth();
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
}

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

export async function getWorkspaceUsers(workspaceId: string) {
  return prisma.user.findMany({
    where: {
      workspaceId,
      role: {
        not: "VIEWER"
      }
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      supportLine: true,
      teamName: true
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

export function canViewAdmin(role: RoleName) {
  return role === "ADMIN" || role === "TEAM_LEAD";
}
