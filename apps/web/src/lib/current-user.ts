import { prisma } from "@/lib/db";

export async function getCurrentUser() {
  const user = await prisma.user.findFirst({
    where: { role: "QA_ANALYST" },
    include: { workspace: true }
  });

  if (!user) {
    throw new Error("Seeded QA analyst is missing. Run npm run db:seed.");
  }

  return user;
}

export function canFinalizeReview(role: string) {
  return role === "ADMIN" || role === "QA_ANALYST";
}
