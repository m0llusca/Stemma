import { prisma } from "@/lib/db";

export async function getCurrentUser() {
  const user = await prisma.user.findFirst({
    where: { role: "QA_ANALYST" },
    include: { workspace: true }
  });

  if (!user) {
    throw new Error("Демо-пользователь QA-аналитика не найден. Запустите npm run db:seed.");
  }

  return user;
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

export function canManageScorecards(role: string) {
  return role === "ADMIN" || role === "TEAM_LEAD";
}

export function canManageIntegrations(role: string) {
  return role === "ADMIN";
}
