import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const currentUserCookieName = "qc_current_user_id";

export async function getCurrentUser() {
  const cookieStore = await cookies();
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

export async function getWorkspaceUsers(workspaceId: string) {
  return prisma.user.findMany({
    where: { workspaceId },
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

export function canFinalizeReview(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD" || role === "QA_ANALYST";
}

export function canSaveReviewDraft(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD" || role === "QA_ANALYST";
}

export function canManageReviewWorkflow(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD" || role === "QA_ANALYST";
}

export function canManageCalibration(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD" || role === "QA_ANALYST";
}

export function canAcknowledgeFeedback(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD" || role === "QA_ANALYST" || role === "SUPPORT_AGENT";
}

export function canSelfReview(role: string) {
  return role === "SUPPORT_AGENT" || role === "TEAM_LEAD" || role === "QA_ANALYST" || role === "ADMIN";
}

export function canManageScorecards(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD";
}

export function canManageIntegrations(role: string) {
  return role === "ADMIN";
}

export function canManageSamplingRules(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD";
}

export function canManageTraining(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD" || role === "QA_ANALYST";
}

export function canViewAdmin(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD";
}
