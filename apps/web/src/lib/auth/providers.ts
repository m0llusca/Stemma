import type { IdentityProvider, RoleName } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ExternalRoleClaims = {
  appRoles?: string[];
  groups?: string[];
  supportLine?: string | null;
  teamName?: string | null;
  attributes?: Record<string, unknown>;
};

export type ResolvedIdentityPolicy = {
  role: RoleName;
  supportLine?: string;
  teamName?: string;
  roleSource: "app_role" | "group_mapping" | "fallback";
  matchedMappingId?: string;
  matchedProviderScopedMapping?: boolean;
};

type GroupRoleMappingCandidate = {
  id: string;
  providerId: string | null;
  externalGroupId: string;
  role: RoleName;
  priority: number;
};

type IdentityPolicyClient = Pick<Prisma.TransactionClient, "groupRoleMapping" | "userIdentityGroup">;

const roleOrder: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"];
const attributeKeys = {
  supportLine: ["supportLine", "support_line", "department", "extensionAttribute1"],
  teamName: ["teamName", "team_name", "team", "division", "extensionAttribute2"]
};

function roleFromAppRole(value: string): RoleName | null {
  const normalized = value.trim().toUpperCase().replace(/[.\s-]+/g, "_");

  if (normalized === "ADMIN" || normalized === "QC_ADMIN") return "ADMIN";
  if (normalized === "TEAM_LEAD" || normalized === "QC_TEAM_LEAD") return "TEAM_LEAD";
  if (normalized === "QA_ANALYST" || normalized === "QC_ANALYST") return "QA_ANALYST";
  if (normalized === "SUPPORT_AGENT") return "SUPPORT_AGENT";
  if (normalized === "VIEWER" || normalized === "QC_VIEWER") return "VIEWER";
  return null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function firstAttributeString(attributes: Record<string, unknown> | undefined, keys: string[]) {
  if (!attributes) {
    return "";
  }

  for (const key of keys) {
    const value = normalizeText(attributes[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function resolveDirectoryAttributes(claims: ExternalRoleClaims) {
  const supportLine = normalizeText(claims.supportLine) || firstAttributeString(claims.attributes, attributeKeys.supportLine);
  const teamName = normalizeText(claims.teamName) || firstAttributeString(claims.attributes, attributeKeys.teamName);

  return {
    ...(supportLine ? { supportLine } : {}),
    ...(teamName ? { teamName } : {})
  };
}

function sortMappings(mappings: GroupRoleMappingCandidate[]) {
  return [...mappings].sort((left, right) => {
    const priority = left.priority - right.priority;
    if (priority !== 0) return priority;

    const group = left.externalGroupId.localeCompare(right.externalGroupId);
    if (group !== 0) return group;

    const role = roleOrder.indexOf(left.role) - roleOrder.indexOf(right.role);
    if (role !== 0) return role;

    return left.id.localeCompare(right.id);
  });
}

function candidateMappings(providerId: string | null, mappings: GroupRoleMappingCandidate[]) {
  if (!providerId) {
    return mappings.filter((mapping) => mapping.providerId === null);
  }

  const providerMappings = mappings.filter((mapping) => mapping.providerId === providerId);
  return providerMappings.length > 0 ? providerMappings : mappings.filter((mapping) => mapping.providerId === null);
}

function appRoleFromClaims(appRoles: string[] | undefined) {
  const roles = appRoles?.map(roleFromAppRole).filter((role): role is RoleName => Boolean(role)) ?? [];
  return roleOrder.find((role) => roles.includes(role)) ?? null;
}

export async function resolveIdentityPolicyFromExternalClaims(
  workspaceId: string,
  providerId: string | null,
  claims: ExternalRoleClaims,
  client: IdentityPolicyClient = prisma
): Promise<ResolvedIdentityPolicy> {
  const attributes = resolveDirectoryAttributes(claims);
  const roleFromClaim = appRoleFromClaims(claims.appRoles);

  if (roleFromClaim) {
    return {
      role: roleFromClaim,
      roleSource: "app_role",
      ...attributes
    };
  }

  if (!claims.groups?.length) {
    return {
      role: "SUPPORT_AGENT",
      roleSource: "fallback",
      ...attributes
    };
  }

  const mappings = await client.groupRoleMapping.findMany({
    where: {
      workspaceId,
      isActive: true,
      externalGroupId: {
        in: claims.groups
      },
      ...(providerId
        ? {
            OR: [{ providerId }, { providerId: null }]
          }
        : { providerId: null })
    },
    orderBy: [{ priority: "asc" }, { externalGroupId: "asc" }, { role: "asc" }, { id: "asc" }],
    select: {
      id: true,
      providerId: true,
      externalGroupId: true,
      role: true,
      priority: true
    }
  });
  const mapping = sortMappings(candidateMappings(providerId, mappings))[0];

  if (!mapping) {
    return {
      role: "SUPPORT_AGENT",
      roleSource: "fallback",
      ...attributes
    };
  }

  return {
    role: mapping.role,
    roleSource: "group_mapping",
    matchedMappingId: mapping.id,
    matchedProviderScopedMapping: Boolean(providerId && mapping.providerId === providerId),
    ...attributes
  };
}

export async function resolveIdentityPolicyForUser(
  workspaceId: string,
  providerId: string,
  userId: string,
  claims: ExternalRoleClaims,
  client: IdentityPolicyClient = prisma
): Promise<ResolvedIdentityPolicy> {
  const persistedGroups = await client.userIdentityGroup.findMany({
    where: {
      workspaceId,
      providerId,
      userId
    },
    select: {
      externalGroupId: true
    }
  });
  const groups = [
    ...new Set([...(claims.groups ?? []), ...persistedGroups.map((group) => group.externalGroupId)].map((group) => group.trim()).filter(Boolean))
  ];

  return resolveIdentityPolicyFromExternalClaims(
    workspaceId,
    providerId,
    {
      ...claims,
      groups
    },
    client
  );
}

export async function resolveRoleFromExternalClaims(workspaceId: string, providerId: string | null, claims: ExternalRoleClaims): Promise<RoleName> {
  const policy = await resolveIdentityPolicyFromExternalClaims(workspaceId, providerId, claims);
  return policy.role;
}

export function buildEntraAuthorizationMetadata(provider: Pick<IdentityProvider, "tenantId" | "clientId" | "authorizationUrl" | "tokenUrl" | "jwksUrl" | "scopes">) {
  const tenantId = provider.tenantId?.trim() || "{tenantId}";

  return {
    authorizationUrl: (provider.authorizationUrl || "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize").replace("{tenantId}", tenantId),
    tokenUrl: (provider.tokenUrl || "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token").replace("{tenantId}", tenantId),
    jwksUrl: (provider.jwksUrl || "https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys").replace("{tenantId}", tenantId),
    clientId: provider.clientId,
    scopes: provider.scopes || "openid profile email",
    recommendedFlow: "authorization_code_pkce"
  };
}

export function getDirectoryIntegrationGuidance() {
  return {
    preferred: "Microsoft Entra ID через OIDC Authorization Code + PKCE",
    onPremDirectory: "Синхронизировать on-prem Active Directory через Microsoft Entra Connect или Cloud Sync",
    authorization: "Назначать AD/Entra группы на app roles, а внутри приложения маппить роли на разрешения",
    fallback: "LDAPS использовать только для закрытых on-prem установок с TLS и сервисной учетной записью"
  };
}
