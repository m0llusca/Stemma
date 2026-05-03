import type { IdentityProvider, Prisma } from "@prisma/client";
import { resolveRoleFromExternalClaims, type ExternalRoleClaims } from "@/lib/auth/providers";
import { prisma } from "@/lib/db";

type DirectorySyncClient = Pick<Prisma.TransactionClient, "identityProvider" | "externalIdentity" | "user">;

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function claimsFromRawJson(value: string): ExternalRoleClaims {
  const claims = parseJsonRecord(value);

  return {
    appRoles: stringArray(claims.roles ?? claims.appRoles),
    groups: stringArray(claims.groups)
  };
}

function assertProviderCanSync(provider: IdentityProvider) {
  if (provider.type === "DEMO") {
    throw new Error("Демо-провайдер не синхронизируется с каталогом.");
  }

  if (provider.status !== "active") {
    throw new Error("Синхронизация каталога доступна только для активного провайдера.");
  }
}

export async function syncDirectoryProvider(input: {
  workspaceId: string;
  providerId: string;
  client?: DirectorySyncClient;
}) {
  const db = input.client ?? prisma;
  const provider = await db.identityProvider.findFirst({
    where: {
      id: input.providerId,
      workspaceId: input.workspaceId
    }
  });

  if (!provider) {
    throw new Error("Провайдер авторизации не найден в рабочем пространстве задачи.");
  }

  assertProviderCanSync(provider);

  const identities = await db.externalIdentity.findMany({
    where: {
      providerId: provider.id
    },
    include: {
      user: true
    }
  });

  if (identities.length === 0) {
    throw new Error("Нет связанных пользователей для синхронизации. Сначала выполните вход через SSO или загрузите каталог через API.");
  }

  let updatedUsers = 0;

  for (const identity of identities) {
    const role = await resolveRoleFromExternalClaims(provider.workspaceId, provider.id, claimsFromRawJson(identity.rawClaimsJson));

    if (identity.user.role !== role || identity.user.email !== identity.email || identity.user.name !== (identity.displayName ?? identity.email)) {
      await db.user.update({
        where: { id: identity.userId },
        data: {
          email: identity.email,
          name: identity.displayName ?? identity.email,
          role
        }
      });
      updatedUsers += 1;
    }
  }

  await db.identityProvider.update({
    where: { id: provider.id },
    data: {
      lastSyncAt: new Date()
    }
  });

  return {
    providerId: provider.id,
    identities: identities.length,
    updatedUsers
  };
}
