import { auditLog } from "@/lib/audit";
import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ tokenId: string }> }) {
  const user = await requireCurrentUserPermission("api_tokens:manage");
  const { tokenId } = await context.params;
  const token = await prisma.apiToken.findFirst({
    where: {
      id: tokenId,
      workspaceId: user.workspaceId
    }
  });

  if (!token) {
    return apiError("not_found", "API-токен не найден.", 404);
  }

  const revoked = await prisma.apiToken.update({
    where: { id: token.id },
    data: {
      expiresAt: new Date(),
      lastError: "Token revoked by administrator.",
      lastErrorAt: new Date()
    }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "api_token.revoked",
    targetType: "api_token",
    targetId: revoked.id,
    metadata: {
      name: revoked.name,
      tokenPrefix: revoked.tokenPrefix
    }
  });

  return apiJson({
    token: {
      id: revoked.id,
      name: revoked.name,
      tokenPrefix: revoked.tokenPrefix,
      expiresAt: revoked.expiresAt?.toISOString() ?? null
    }
  });
}

