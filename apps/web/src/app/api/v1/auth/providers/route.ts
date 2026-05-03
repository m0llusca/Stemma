import { getDirectoryIntegrationGuidance, buildEntraAuthorizationMetadata } from "@/lib/auth/providers";
import { apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  const providers = await prisma.identityProvider.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      groupRoleMappings: {
        where: { isActive: true },
        orderBy: [{ priority: "asc" }]
      }
    }
  });

  return apiJson({
    guidance: getDirectoryIntegrationGuidance(),
    providers: providers.map((provider) => ({
      id: provider.id,
      type: provider.type,
      name: provider.name,
      slug: provider.slug,
      status: provider.status,
      issuer: provider.issuer,
      tenantId: provider.tenantId,
      clientId: provider.clientId,
      scopes: provider.scopes,
      entraMetadata: provider.type === "MICROSOFT_ENTRA_ID" ? buildEntraAuthorizationMetadata(provider) : null,
      mappings: provider.groupRoleMappings.map((mapping) => ({
        externalGroupId: mapping.externalGroupId,
        externalGroupName: mapping.externalGroupName,
        role: mapping.role,
        priority: mapping.priority
      }))
    }))
  });
}

