import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const sessionApi = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!sessionApi.ok) {
    return sessionApi.response;
  }

  const user = sessionApi.user;
  const { sessionId } = await context.params;
  const session = await prisma.authSession.findFirst({
    where: {
      id: sessionId,
      workspaceId: user.workspaceId
    }
  });

  if (!session) {
    return apiError("not_found", "Сессия не найдена.", 404, requestId);
  }

  const revoked = await prisma.$transaction(async (tx) => {
    const result = await tx.authSession.update({
      where: { id: session.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date()
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.session_revoked",
        targetType: "auth_session",
        targetId: session.id,
        metadata: {
          userId: session.userId,
          providerId: session.providerId
        }
      },
      tx
    );

    return result;
  });

  return apiJson(
    {
      session: {
        id: revoked.id,
        status: revoked.status,
        revokedAt: revoked.revokedAt?.toISOString() ?? null
      }
    },
    200,
    requestId
  );
}
