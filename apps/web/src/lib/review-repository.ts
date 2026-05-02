import { prisma } from "@/lib/db";

export async function getReviewQueue(workspaceId: string) {
  return prisma.conversation.findMany({
    where: { workspaceId },
    include: {
      messages: {
        orderBy: { sentAt: "asc" }
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { openedAt: "desc" }
  });
}

export async function getConversationForReview(workspaceId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId
    },
    include: {
      messages: {
        orderBy: { sentAt: "asc" }
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: {
          reviewer: true,
          scores: {
            include: {
              criterion: true
            }
          },
          findings: {
            include: {
              coachingAction: true
            }
          }
        }
      }
    }
  });
}

export async function getActiveScorecard(workspaceId: string) {
  const scorecard = await prisma.scorecard.findFirst({
    where: {
      workspaceId,
      isActive: true
    },
    include: {
      criteria: {
        orderBy: { order: "asc" }
      }
    }
  });

  if (!scorecard) {
    throw new Error("Активная скоркарта не найдена. Запустите npm run db:seed.");
  }

  return scorecard;
}
