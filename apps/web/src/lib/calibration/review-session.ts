import type { Prisma } from "@prisma/client";

export function isCalibrationSessionReview(
  review: { reviewSource: string; calibrationSessionId: string | null; scorecardId: string },
  sessionId: string,
  scorecardId: string
) {
  return review.reviewSource === "CALIBRATION" && review.calibrationSessionId === sessionId && review.scorecardId === scorecardId;
}

export async function loadCalibrationReviewSession(
  input: { sessionId: string; workspaceId: string; conversationId: string; reviewerId?: string; scorecardId?: string; activeOnly?: boolean },
  database: Pick<Prisma.TransactionClient, "calibrationSession">
) {
  return database.calibrationSession.findFirst({
    where: {
      id: input.sessionId,
      workspaceId: input.workspaceId,
      ...(input.activeOnly ? { status: "active" } : {}),
      ...(input.scorecardId ? { scorecardId: input.scorecardId } : {}),
      items: { some: { conversationId: input.conversationId } },
      ...(input.reviewerId ? { participants: { some: { userId: input.reviewerId } } } : {})
    },
    include: { scorecard: { include: { criteria: { orderBy: { order: "asc" } } } }, participants: { select: { userId: true } } }
  });
}
