import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { validateLdapsProviderConfigForSave } from "@/lib/auth/ldaps-config";
import { assertProviderEndpointUrls, assertSafeProviderConfig } from "@/lib/auth/provider-config-validation";
import { assertProductionSecretReference, validateOidcProviderConfigForSave } from "@/lib/auth/oidc";
import { getDirectoryIntegrationGuidance, buildEntraAuthorizationMetadata } from "@/lib/auth/providers";
import { buildSamlServiceProviderUrls, validateSamlProviderConfigForSave } from "@/lib/auth/saml";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";
import { resolvePublicOrigin } from "@/lib/public-origin";

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
  samlEntityId: z.string().trim().max(300).optional().or(z.literal("")),
  samlMetadataUrl: z.string().trim().url().optional().or(z.literal("")),
  samlCertificateRef: z.string().trim().max(4000).optional().or(z.literal("")),
  ldapsUrl: z.string().trim().url().optional().or(z.literal("")),
  ldapsBindDn: z.string().trim().max(500).optional().or(z.literal("")),
  ldapsBindSecretRef: z.string().trim().max(240).optional().or(z.literal("")),
  scopes: z.string().trim().min(1).max(300).optional(),
  config: z.record(z.unknown()).optional()
});

function optionalValue(value: string | undefined) {
  return value?.trim() || null;
}

function parseProviderConfigJson(value: string) {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { graphGroupFallback?: { enabled?: boolean } }) : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  let origin: string;

  try {
    origin = resolvePublicOrigin({ headers: request.headers, requestUrl: request.url });
  } catch {
    return apiError("internal_error", "Публичный HTTPS origin приложения не настроен.", 500, requestId);
  }

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
      ldapsUrl: provider.ldapsUrl,
      ldapsBindDn: provider.ldapsBindDn,
      ldapsBindSecretRef: provider.ldapsBindSecretRef,
      lastSyncStartedAt: provider.lastSyncStartedAt?.toISOString() ?? null,
      lastSyncAt: provider.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: provider.lastSyncStatus,
      lastSyncError: provider.lastSyncError,
      scim: {
        hasToken: Boolean(provider.scimTokenPrefix),
        tokenPrefix: provider.scimTokenPrefix
      },
      scopes: provider.scopes,
      entraMetadata: provider.type === "MICROSOFT_ENTRA_ID" ? buildEntraAuthorizationMetadata(provider) : null,
      sso: provider.type === "SAML" ? buildSamlServiceProviderUrls(provider, origin) : null,
      graphGroupFallback: {
        configured: Boolean(parseProviderConfigJson(provider.configJson).graphGroupFallback?.enabled),
        guidance:
          "При group overage используйте Microsoft Graph getMemberGroups только при явно настроенном fallback и нужных разрешениях, например GroupMember.Read.All или Directory.Read.All."
      },
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
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const body = await request.json().catch(() => null);
  const parsed = providerSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      "bad_request",
      "Некорректные параметры провайдера авторизации.",
      400,
      requestId,
      parsed.error.flatten()
    );
  }

  try {
    assertSafeProviderConfig(parsed.data.config ?? {});
    assertProductionSecretReference(optionalValue(parsed.data.clientSecretRef));
    validateOidcProviderConfigForSave({
      type: parsed.data.type,
      status: parsed.data.status ?? "draft",
      issuer: optionalValue(parsed.data.issuer),
      tenantId: optionalValue(parsed.data.tenantId)
    });
    validateSamlProviderConfigForSave({
      type: parsed.data.type,
      samlCertificateRef: optionalValue(parsed.data.samlCertificateRef),
      config: parsed.data.config ?? {}
    });
    validateLdapsProviderConfigForSave({
      type: parsed.data.type,
      status: parsed.data.status ?? "draft",
      ldapsUrl: optionalValue(parsed.data.ldapsUrl),
      ldapsBindDn: optionalValue(parsed.data.ldapsBindDn),
      ldapsBindSecretRef: optionalValue(parsed.data.ldapsBindSecretRef),
      config: parsed.data.config ?? {}
    });
    assertProviderEndpointUrls({
      type: parsed.data.type,
      authorizationUrl: optionalValue(parsed.data.authorizationUrl),
      tokenUrl: optionalValue(parsed.data.tokenUrl),
      jwksUrl: optionalValue(parsed.data.jwksUrl),
      samlMetadataUrl: optionalValue(parsed.data.samlMetadataUrl),
      configJson: JSON.stringify(parsed.data.config ?? {})
    });
  } catch (error) {
    return apiError(
      "bad_request",
      error instanceof Error ? error.message : "Некорректная конфигурация провайдера авторизации.",
      400,
      requestId
    );
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
        samlEntityId: optionalValue(parsed.data.samlEntityId),
        samlMetadataUrl: optionalValue(parsed.data.samlMetadataUrl),
        samlCertificateRef: optionalValue(parsed.data.samlCertificateRef),
        ldapsUrl: optionalValue(parsed.data.ldapsUrl),
        ldapsBindDn: optionalValue(parsed.data.ldapsBindDn),
        ldapsBindSecretRef: optionalValue(parsed.data.ldapsBindSecretRef),
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
        samlEntityId: optionalValue(parsed.data.samlEntityId),
        samlMetadataUrl: optionalValue(parsed.data.samlMetadataUrl),
        samlCertificateRef: optionalValue(parsed.data.samlCertificateRef),
        ldapsUrl: optionalValue(parsed.data.ldapsUrl),
        ldapsBindDn: optionalValue(parsed.data.ldapsBindDn),
        ldapsBindSecretRef: optionalValue(parsed.data.ldapsBindSecretRef),
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
          credentialConfigured: Boolean(result.clientSecretRef),
          ldapsBindCredentialConfigured: Boolean(result.ldapsBindSecretRef)
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
    201,
    requestId
  );
}
