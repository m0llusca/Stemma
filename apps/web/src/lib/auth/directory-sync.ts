import type { IdentityProvider, Prisma } from "@prisma/client";
import { resolveIdentityPolicyForUser, type ExternalRoleClaims } from "@/lib/auth/providers";
import { syncActiveDirectoryLdapsProvider, type LdapsClientFactory } from "@/lib/auth/ldaps";
import { prisma } from "@/lib/db";

type DirectorySyncClient = Pick<
  Prisma.TransactionClient,
  | "identityProvider"
  | "externalIdentity"
  | "identityGroup"
  | "userIdentityGroup"
  | "user"
  | "groupRoleMapping"
  | "authSession"
  | "auditLog"
>;

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
    groups: stringArray(claims.groups),
    supportLine: typeof claims.supportLine === "string" ? claims.supportLine : null,
    teamName: typeof claims.teamName === "string" ? claims.teamName : null,
    attributes: claims
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
  dryRun?: boolean;
  client?: DirectorySyncClient;
  ldapClientFactory?: LdapsClientFactory;
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

  if (provider.type === "ACTIVE_DIRECTORY_LDAPS") {
    return syncActiveDirectoryLdapsProvider({
      provider,
      client: db,
      dryRun: input.dryRun,
      ldapClientFactory: input.ldapClientFactory
    });
  }

  assertProviderCanSync(provider);

  if (input.dryRun) {
    throw new Error("Dry-run синхронизации пока поддерживается только для Active Directory LDAPS.");
  }

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
    const policy = await resolveIdentityPolicyForUser(provider.workspaceId, provider.id, identity.userId, claimsFromRawJson(identity.rawClaimsJson));
    const name = identity.displayName ?? identity.email;
    const supportLine = policy.supportLine ?? identity.user.supportLine;
    const teamName = policy.teamName ?? identity.user.teamName;
    const userAttributesChanged =
      identity.user.role !== policy.role ||
      identity.user.email !== identity.email ||
      identity.user.name !== name ||
      identity.user.supportLine !== supportLine ||
      identity.user.teamName !== teamName ||
      identity.user.sourceOfTruthProviderId !== provider.id;

    await db.user.update({
      where: { id: identity.userId },
      data: {
        ...(userAttributesChanged
          ? {
              email: identity.email,
              name,
              role: policy.role,
              supportLine,
              teamName,
              sourceOfTruthProviderId: provider.id
            }
          : {}),
        lastDirectorySyncAt: new Date()
      }
    });

    if (userAttributesChanged) {
      updatedUsers += 1;
    }

    await db.externalIdentity.update({
      where: { id: identity.id },
      data: {
        lastSyncAt: new Date()
      }
    });
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
