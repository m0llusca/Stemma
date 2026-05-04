import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { revokeApiToken } from "@/lib/api-token-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ tokenId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "api_tokens:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
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
    return apiError("not_found", "API-токен не найден.", 404, requestId);
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

  return apiJson(
    {
      token: {
        id: revoked.id,
        name: revoked.name,
        tokenPrefix: revoked.tokenPrefix,
        expiresAt: revoked.expiresAt?.toISOString() ?? null
      }
    },
    200,
    requestId
  );
}
