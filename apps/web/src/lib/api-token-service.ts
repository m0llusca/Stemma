import { randomBytes } from "node:crypto";
import { hashApiToken, type ApiScope } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const allowedApiScopes: ApiScope[] = [
  "all",
  "conversations:read",
  "conversations:write",
  "reviews:read",
  "reviews:write",
  "reports:read",
  "integrations:run",
  "jobs:read",
  "jobs:write"
];

export function normalizeApiScopes(scopes: string[]) {
  const uniqueScopes = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];

  if (uniqueScopes.length === 0 || uniqueScopes.includes("all")) {
    return "all";
  }

  for (const scope of uniqueScopes) {
    if (!allowedApiScopes.includes(scope as ApiScope)) {
      throw new Error(`Некорректный scope API-токена: ${scope}`);
    }
  }

  return uniqueScopes.join(",");
}

export function createPlainApiToken() {
  return `qc_${randomBytes(32).toString("base64url")}`;
}

export async function createApiToken(input: {
  workspaceId: string;
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
}) {
  const plainToken = createPlainApiToken();
  const token = await prisma.apiToken.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      tokenPrefix: `${plainToken.slice(0, 10)}...`,
      tokenHash: hashApiToken(plainToken),
      scopes: normalizeApiScopes(input.scopes),
      expiresAt: input.expiresAt ?? null
    }
  });

  return {
    plainToken,
    token
  };
}

export async function revokeApiToken(input: { workspaceId: string; tokenId: string }) {
  const token = await prisma.apiToken.findFirst({
    where: {
      id: input.tokenId,
      workspaceId: input.workspaceId
    }
  });

  if (!token) {
    throw new Error("API-токен не найден.");
  }

  return prisma.apiToken.update({
    where: { id: token.id },
    data: {
      expiresAt: new Date(),
      lastError: "Token revoked by administrator.",
      lastErrorAt: new Date()
    }
  });
}
