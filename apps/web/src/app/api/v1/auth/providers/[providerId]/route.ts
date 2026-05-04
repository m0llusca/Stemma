import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const updateProviderSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["draft", "active", "disabled"]).optional(),
  issuer: z.string().trim().url().optional().or(z.literal("")),
  tenantId: z.string().trim().max(120).optional().or(z.literal("")),
  clientId: z.string().trim().max(160).optional().or(z.literal("")),
  clientSecretRef: z.string().trim().max(240).optional().or(z.literal("")),
  authorizationUrl: z.string().trim().url().optional().or(z.literal("")),
  tokenUrl: z.string().trim().url().optional().or(z.literal("")),
  jwksUrl: z.string().trim().url().optional().or(z.literal("")),
  scopes: z.string().trim().min(1).max(300).optional(),
  config: z.record(z.unknown()).optional()
});

function optionalValue(value: string | undefined) {
  return value?.trim() || null;
}

export async function PATCH(request: Request, context: { params: Promise<{ providerId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { providerId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateProviderSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      "bad_request",
      "Некорректные параметры провайдера авторизации.",
      400,
      requestId,
      parsed.error.flatten()
    );
  }

  const existingProvider = await prisma.identityProvider.findFirst({
    where: {
      id: providerId,
      workspaceId: user.workspaceId
    }
  });

  if (!existingProvider) {
    return apiError("not_found", "Провайдер авторизации не найден.", 404, requestId);
  }

  const provider = await prisma.$transaction(async (tx) => {
    const result = await tx.identityProvider.update({
      where: { id: providerId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.issuer !== undefined ? { issuer: optionalValue(parsed.data.issuer) } : {}),
        ...(parsed.data.tenantId !== undefined ? { tenantId: optionalValue(parsed.data.tenantId) } : {}),
        ...(parsed.data.clientId !== undefined ? { clientId: optionalValue(parsed.data.clientId) } : {}),
        ...(parsed.data.clientSecretRef !== undefined ? { clientSecretRef: optionalValue(parsed.data.clientSecretRef) } : {}),
        ...(parsed.data.authorizationUrl !== undefined ? { authorizationUrl: optionalValue(parsed.data.authorizationUrl) } : {}),
        ...(parsed.data.tokenUrl !== undefined ? { tokenUrl: optionalValue(parsed.data.tokenUrl) } : {}),
        ...(parsed.data.jwksUrl !== undefined ? { jwksUrl: optionalValue(parsed.data.jwksUrl) } : {}),
        ...(parsed.data.scopes !== undefined ? { scopes: parsed.data.scopes } : {}),
        ...(parsed.data.config !== undefined ? { configJson: JSON.stringify(parsed.data.config) } : {})
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.provider_updated",
        targetType: "identity_provider",
        targetId: result.id,
        metadata: {
          status: result.status,
          clientSecretRef: result.clientSecretRef
        }
      },
      tx
    );

    return result;
  });

  return apiJson(
    {
      provider: {
        id: provider.id,
        type: provider.type,
        name: provider.name,
        slug: provider.slug,
        status: provider.status
      }
    },
    200,
    requestId
  );
}
