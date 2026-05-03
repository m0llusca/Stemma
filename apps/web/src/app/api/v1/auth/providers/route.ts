import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { getDirectoryIntegrationGuidance, buildEntraAuthorizationMetadata } from "@/lib/auth/providers";
import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const providerSchema = z.object({
  type: z.enum(["MICROSOFT_ENTRA_ID", "ACTIVE_DIRECTORY_LDAPS", "OIDC", "SAML"]),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
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

export async function POST(request: Request) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  const body = await request.json().catch(() => null);
  const parsed = providerSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры провайдера авторизации.", 400, undefined, parsed.error.flatten());
  }

  const provider = await prisma.$transaction(async (tx) => {
    const result = await tx.identityProvider.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: user.workspaceId,
          slug: parsed.data.slug
        }
      },
      create: {
        workspaceId: user.workspaceId,
        type: parsed.data.type,
        name: parsed.data.name,
        slug: parsed.data.slug,
        status: parsed.data.status ?? "draft",
        issuer: optionalValue(parsed.data.issuer),
        tenantId: optionalValue(parsed.data.tenantId),
        clientId: optionalValue(parsed.data.clientId),
        clientSecretRef: optionalValue(parsed.data.clientSecretRef),
        authorizationUrl: optionalValue(parsed.data.authorizationUrl),
        tokenUrl: optionalValue(parsed.data.tokenUrl),
        jwksUrl: optionalValue(parsed.data.jwksUrl),
        scopes: parsed.data.scopes ?? "openid profile email",
        configJson: JSON.stringify(parsed.data.config ?? {})
      },
      update: {
        type: parsed.data.type,
        name: parsed.data.name,
        status: parsed.data.status ?? "draft",
        issuer: optionalValue(parsed.data.issuer),
        tenantId: optionalValue(parsed.data.tenantId),
        clientId: optionalValue(parsed.data.clientId),
        clientSecretRef: optionalValue(parsed.data.clientSecretRef),
        authorizationUrl: optionalValue(parsed.data.authorizationUrl),
        tokenUrl: optionalValue(parsed.data.tokenUrl),
        jwksUrl: optionalValue(parsed.data.jwksUrl),
        scopes: parsed.data.scopes ?? "openid profile email",
        configJson: JSON.stringify(parsed.data.config ?? {})
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.provider_upserted",
        targetType: "identity_provider",
        targetId: result.id,
        metadata: {
          type: result.type,
          slug: result.slug,
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
    201
  );
}
