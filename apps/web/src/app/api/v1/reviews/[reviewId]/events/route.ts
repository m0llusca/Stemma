import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export async function GET(request: Request, context: { params: Promise<{ reviewId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "reviews:read", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { reviewId } = await context.params;
  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      workspaceId: user.workspaceId
    },
    select: { id: true }
  });

  if (!review) {
    return apiError("not_found", "Проверка не найдена.", 404);
  }

  const events = await prisma.reviewEvent.findMany({
    where: {
      workspaceId: user.workspaceId,
      reviewId
    },
    orderBy: [{ createdAt: "asc" }],
    take: 500,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      }
    }
  });

  return apiJson({
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      metadata: parseJson(event.metadata),
      actor: event.actor,
      createdAt: event.createdAt.toISOString()
    }))
  });
}

