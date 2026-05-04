import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError, requestIdFromHeaders } from "@/lib/api/response";
import { prisma } from "@/lib/db";

export type ApiScope =
  | "all"
  | "conversations:read"
  | "conversations:write"
  | "reviews:read"
  | "reviews:write"
  | "reports:read"
  | "integrations:run"
  | "jobs:read"
  | "jobs:write";

type ApiAuthResult =
  | {
      ok: true;
      workspaceId: string;
      apiTokenId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type RequireApiTokenOptions = {
  requestId?: string;
  structuredErrors?: boolean;
};

export function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function readApiToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.headers.get("x-api-key")?.trim();
}

function hasScope(scopes: string, requiredScope: ApiScope) {
  const scopeSet = new Set(
    scopes
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean)
  );

  return scopeSet.has("all") || scopeSet.has(requiredScope);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authErrorResponse(request: NextRequest, message: string, status: 401 | 403, options: RequireApiTokenOptions) {
  if (!options.structuredErrors) {
    return errorResponse(message, status);
  }

  const requestId = options.requestId ?? requestIdFromHeaders(request.headers);
  return apiError(status === 401 ? "unauthorized" : "forbidden", message, status, requestId);
}

export async function requireApiToken(
  request: NextRequest,
  requiredScope: ApiScope,
  options: RequireApiTokenOptions = {}
): Promise<ApiAuthResult> {
  const token = readApiToken(request);

  if (!token) {
    return {
      ok: false,
      response: authErrorResponse(request, "API token is required.", 401, options)
    };
  }

  const apiToken = await prisma.apiToken.findUnique({
    where: {
      tokenHash: hashApiToken(token)
    },
    select: {
      id: true,
      workspaceId: true,
      scopes: true,
      expiresAt: true
    }
  });

  if (!apiToken || (apiToken.expiresAt && apiToken.expiresAt < new Date())) {
    return {
      ok: false,
      response: authErrorResponse(request, "API token is invalid or expired.", 401, options)
    };
  }

  if (!hasScope(apiToken.scopes, requiredScope)) {
    return {
      ok: false,
      response: authErrorResponse(request, "API token does not have the required scope.", 403, options)
    };
  }

  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() }
  });

  return {
    ok: true,
    workspaceId: apiToken.workspaceId,
    apiTokenId: apiToken.id
  };
}

export async function recordApiTokenSuccess(apiTokenId: string) {
  await prisma.apiToken.update({
    where: { id: apiTokenId },
    data: {
      lastSuccessAt: new Date(),
      lastError: null
    }
  });
}

export async function recordApiTokenError(apiTokenId: string, error: string) {
  await prisma.apiToken.update({
    where: { id: apiTokenId },
    data: {
      lastErrorAt: new Date(),
      lastError: error.slice(0, 240)
    }
  });
}
