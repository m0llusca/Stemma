import { auditLog } from "@/lib/audit";
import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  const { sessionId } = await context.params;
  const session = await prisma.authSession.findFirst({
    where: {
      id: sessionId,
      workspaceId: user.workspaceId
    }
  });

  if (!session) {
    return apiError("not_found", "Сессия не найдена.", 404);
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

  return apiJson({
    session: {
      id: revoked.id,
      status: revoked.status,
      revokedAt: revoked.revokedAt?.toISOString() ?? null
    }
  });
}

