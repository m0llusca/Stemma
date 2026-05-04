import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { allowedApiScopes, createApiToken } from "@/lib/api-token-service";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const createApiTokenSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.enum(allowedApiScopes as [string, ...string[]])).min(1).optional(),
  expiresAt: z.string().datetime().optional().nullable()
});

export async function GET() {
  const user = await requireCurrentUserPermission("api_tokens:manage");
  const tokens = await prisma.apiToken.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      rateLimits: {
        orderBy: { windowStart: "desc" },
        take: 5
      }
    }
  });

  return apiJson({
    tokens: tokens.map((token) => ({
      id: token.id,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      scopes: token.scopes.split(",").filter(Boolean),
      lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
      lastSuccessAt: token.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: token.lastErrorAt?.toISOString() ?? null,
      lastError: token.lastError,
      expiresAt: token.expiresAt?.toISOString() ?? null,
      createdAt: token.createdAt.toISOString(),
      recentRateLimits: token.rateLimits.map((bucket) => ({
        routeKey: bucket.routeKey,
        windowStart: bucket.windowStart.toISOString(),
        requestCount: bucket.requestCount
      }))
    }))
  });
}

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "api_tokens:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const body = await request.json().catch(() => null);
  const parsed = createApiTokenSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры API-токена.", 400, requestId, parsed.error.flatten());
  }

  try {
    const created = await createApiToken({
      workspaceId: user.workspaceId,
      name: parsed.data.name,
      scopes: parsed.data.scopes ?? ["all"],
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
    });

    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "api_token.created",
      targetType: "api_token",
      targetId: created.token.id,
      metadata: {
        name: created.token.name,
        scopes: created.token.scopes,
        expiresAt: created.token.expiresAt
      }
    });

    return apiJson(
      {
        token: {
          id: created.token.id,
          name: created.token.name,
          tokenPrefix: created.token.tokenPrefix,
          scopes: created.token.scopes.split(",").filter(Boolean),
          expiresAt: created.token.expiresAt?.toISOString() ?? null
        },
        plainToken: created.plainToken
      },
      201,
      requestId
    );
  } catch (error) {
    return apiError(
      "bad_request",
      error instanceof Error ? error.message : "Не удалось создать API-токен.",
      400,
      requestId
    );
  }
}
