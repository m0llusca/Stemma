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

export async function GET(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const user = await requireCurrentUserPermission("reviews:read");
  const { conversationId } = await context.params;
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: user.workspaceId
    },
    select: { id: true }
  });

  if (!conversation) {
    return apiError("not_found", "Обращение не найдено.", 404);
  }

  const events = await prisma.reviewEvent.findMany({
    where: {
      workspaceId: user.workspaceId,
      conversationId
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
      reviewId: event.reviewId,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      metadata: parseJson(event.metadata),
      actor: event.actor,
      createdAt: event.createdAt.toISOString()
    }))
  });
}

