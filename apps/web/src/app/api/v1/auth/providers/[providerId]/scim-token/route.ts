import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import {
  ScimTokenLifecycleError,
  issueScimProvisioningToken,
  revokeScimProvisioningToken,
  rotateScimProvisioningToken
} from "@/lib/auth/scim";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const secretResponseHeaders = {
  "Cache-Control": "no-store"
};

type RouteContext = {
  params: Promise<{ providerId: string }>;
};

function scimTokenPayload(provider: {
  id: string;
  name: string;
  type: string;
  scimTokenPrefix: string | null;
  updatedAt: Date;
}) {
  return {
    provider: {
      id: provider.id,
      name: provider.name,
      type: provider.type
    },
    token: {
      hasToken: Boolean(provider.scimTokenPrefix),
      tokenPrefix: provider.scimTokenPrefix,
      updatedAt: provider.updatedAt.toISOString()
    }
  };
}

function handleLifecycleError(error: unknown, requestId: string) {
  if (error instanceof ScimTokenLifecycleError) {
    if (error.code === "conflict") {
      return apiError("conflict", "SCIM-токен уже выпущен. Используйте ротацию.", 409, {
        requestId,
        includeDetails: false
      });
    }

    if (error.code === "stale") {
      return apiError("conflict", "SCIM-токен изменен другим запросом. Обновите состояние и повторите действие.", 409, {
        requestId,
        includeDetails: false
      });
    }

    return apiError("not_found", "SCIM-токен или провайдер не найден.", 404, {
      requestId,
      includeDetails: false
    });
  }

  return apiError("internal_error", "Не удалось обновить SCIM-токен.", 500, {
    requestId,
    includeDetails: false
  });
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const { providerId } = await context.params;
  const provider = await prisma.identityProvider.findFirst({
    where: {
      id: providerId,
      workspaceId: session.user.workspaceId,
      type: {
        not: "DEMO"
      }
    },
    select: {
      id: true,
      name: true,
      type: true,
      scimTokenPrefix: true,
      updatedAt: true
    }
  });

  if (!provider) {
    return apiError("not_found", "Провайдер авторизации не найден.", 404, {
      requestId,
      includeDetails: false
    });
  }

  return apiJson(scimTokenPayload(provider), 200, requestId);
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const { providerId } = await context.params;

  try {
    const result = await issueScimProvisioningToken({
      workspaceId: session.user.workspaceId,
      providerId,
      actorId: session.user.id
    });

    return apiJson(
      {
        ...scimTokenPayload(result.provider),
        plainToken: result.plainToken
      },
      201,
      requestId,
      secretResponseHeaders
    );
  } catch (error) {
    return handleLifecycleError(error, requestId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const { providerId } = await context.params;

  try {
    const result = await rotateScimProvisioningToken({
      workspaceId: session.user.workspaceId,
      providerId,
      actorId: session.user.id
    });

    return apiJson(
      {
        ...scimTokenPayload(result.provider),
        plainToken: result.plainToken
      },
      200,
      requestId,
      secretResponseHeaders
    );
  } catch (error) {
    return handleLifecycleError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const { providerId } = await context.params;

  try {
    const provider = await revokeScimProvisioningToken({
      workspaceId: session.user.workspaceId,
      providerId,
      actorId: session.user.id
    });

    return apiJson(scimTokenPayload(provider), 200, requestId);
  } catch (error) {
    return handleLifecycleError(error, requestId);
  }
}
