import { auditLog } from "@/lib/audit";
import { apiError, apiJson } from "@/lib/api/response";
import { revokeApiToken } from "@/lib/api-token-service";
import { requireCurrentUserPermission } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ tokenId: string }> }) {
  const user = await requireCurrentUserPermission("api_tokens:manage");
  const { tokenId } = await context.params;
  const revoked = await revokeApiToken({
    workspaceId: user.workspaceId,
    tokenId
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "API-токен не найден.") {
      return null;
    }

    throw error;
  });

  if (!revoked) {
    return apiError("not_found", "API-токен не найден.", 404);
  }

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
