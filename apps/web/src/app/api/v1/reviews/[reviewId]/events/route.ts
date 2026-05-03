import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export async function GET(_request: Request, context: { params: Promise<{ reviewId: string }> }) {
  const user = await requireCurrentUserPermission("reviews:read");
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
    orderBy: { createdAt: "asc" },
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

