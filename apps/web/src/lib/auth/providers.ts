import type { IdentityProvider, RoleName } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ExternalRoleClaims = {
  appRoles?: string[];
  groups?: string[];
};

const roleOrder: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT"];

function roleFromAppRole(value: string): RoleName | null {
  const normalized = value.trim().toUpperCase().replace(/[.\s-]+/g, "_");

  if (normalized === "ADMIN" || normalized === "QC_ADMIN") return "ADMIN";
  if (normalized === "TEAM_LEAD" || normalized === "QC_TEAM_LEAD") return "TEAM_LEAD";
  if (normalized === "QA_ANALYST" || normalized === "QC_ANALYST") return "QA_ANALYST";
  if (normalized === "SUPPORT_AGENT") return "SUPPORT_AGENT";
  return null;
}

export async function resolveRoleFromExternalClaims(workspaceId: string, providerId: string | null, claims: ExternalRoleClaims): Promise<RoleName> {
  const roleFromClaim = claims.appRoles?.map(roleFromAppRole).find((role): role is RoleName => Boolean(role));

  if (roleFromClaim) {
    return roleFromClaim;
  }

  if (!claims.groups?.length) {
    return "SUPPORT_AGENT";
  }

  const mappings = await prisma.groupRoleMapping.findMany({
    where: {
      workspaceId,
      isActive: true,
      externalGroupId: {
        in: claims.groups
      },
      ...(providerId ? { providerId } : {})
    },
    orderBy: [{ priority: "asc" }]
  });

  const mappedRoles = new Set(mappings.map((mapping) => mapping.role));
  return roleOrder.find((role) => mappedRoles.has(role)) ?? "SUPPORT_AGENT";
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
