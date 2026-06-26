import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { validateLdapsProviderConfigForSave } from "@/lib/auth/ldaps-config";
import { assertProviderEndpointUrls, assertSafeProviderConfig } from "@/lib/auth/provider-config-validation";
import { assertProductionSecretReference, validateOidcProviderConfigForSave } from "@/lib/auth/oidc";
import { validateSamlProviderConfigForSave } from "@/lib/auth/saml";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const updateProviderSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
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

function parseConfigJson(value: string) {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ providerId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { providerId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateProviderSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      "bad_request",
      "Некорректные параметры провайдера авторизации.",
      400,
      requestId,
      parsed.error.flatten()
    );
  }

  const existingProvider = await prisma.identityProvider.findFirst({
    where: {
      id: providerId,
      workspaceId: user.workspaceId
    }
  });

  if (!existingProvider) {
    return apiError("not_found", "Провайдер авторизации не найден.", 404, requestId);
  }

  try {
    if (parsed.data.config !== undefined) {
      assertSafeProviderConfig(parsed.data.config);
    }
    if (parsed.data.clientSecretRef !== undefined) {
      assertProductionSecretReference(optionalValue(parsed.data.clientSecretRef));
    }
    validateOidcProviderConfigForSave({
      type: existingProvider.type,
      status: parsed.data.status ?? existingProvider.status,
      issuer: parsed.data.issuer !== undefined ? optionalValue(parsed.data.issuer) : existingProvider.issuer,
      tenantId: parsed.data.tenantId !== undefined ? optionalValue(parsed.data.tenantId) : existingProvider.tenantId
    });
    validateSamlProviderConfigForSave({
      type: existingProvider.type,
      samlCertificateRef:
        parsed.data.samlCertificateRef !== undefined ? optionalValue(parsed.data.samlCertificateRef) : existingProvider.samlCertificateRef,
      config: parsed.data.config ?? parseConfigJson(existingProvider.configJson)
    });
    validateLdapsProviderConfigForSave({
      type: existingProvider.type,
      status: parsed.data.status ?? existingProvider.status,
      ldapsUrl: parsed.data.ldapsUrl !== undefined ? optionalValue(parsed.data.ldapsUrl) : existingProvider.ldapsUrl,
      ldapsBindDn: parsed.data.ldapsBindDn !== undefined ? optionalValue(parsed.data.ldapsBindDn) : existingProvider.ldapsBindDn,
      ldapsBindSecretRef:
        parsed.data.ldapsBindSecretRef !== undefined ? optionalValue(parsed.data.ldapsBindSecretRef) : existingProvider.ldapsBindSecretRef,
      config: parsed.data.config ?? parseConfigJson(existingProvider.configJson)
    });
    assertProviderEndpointUrls({
      type: existingProvider.type,
      authorizationUrl:
        parsed.data.authorizationUrl !== undefined ? optionalValue(parsed.data.authorizationUrl) : existingProvider.authorizationUrl,
      tokenUrl: parsed.data.tokenUrl !== undefined ? optionalValue(parsed.data.tokenUrl) : existingProvider.tokenUrl,
      jwksUrl: parsed.data.jwksUrl !== undefined ? optionalValue(parsed.data.jwksUrl) : existingProvider.jwksUrl,
      samlMetadataUrl:
        parsed.data.samlMetadataUrl !== undefined ? optionalValue(parsed.data.samlMetadataUrl) : existingProvider.samlMetadataUrl,
      configJson: parsed.data.config !== undefined ? JSON.stringify(parsed.data.config) : existingProvider.configJson
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
    const result = await tx.identityProvider.update({
      where: { id: providerId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.issuer !== undefined ? { issuer: optionalValue(parsed.data.issuer) } : {}),
        ...(parsed.data.tenantId !== undefined ? { tenantId: optionalValue(parsed.data.tenantId) } : {}),
        ...(parsed.data.clientId !== undefined ? { clientId: optionalValue(parsed.data.clientId) } : {}),
        ...(parsed.data.clientSecretRef !== undefined ? { clientSecretRef: optionalValue(parsed.data.clientSecretRef) } : {}),
        ...(parsed.data.authorizationUrl !== undefined ? { authorizationUrl: optionalValue(parsed.data.authorizationUrl) } : {}),
        ...(parsed.data.tokenUrl !== undefined ? { tokenUrl: optionalValue(parsed.data.tokenUrl) } : {}),
        ...(parsed.data.jwksUrl !== undefined ? { jwksUrl: optionalValue(parsed.data.jwksUrl) } : {}),
        ...(parsed.data.samlEntityId !== undefined ? { samlEntityId: optionalValue(parsed.data.samlEntityId) } : {}),
        ...(parsed.data.samlMetadataUrl !== undefined ? { samlMetadataUrl: optionalValue(parsed.data.samlMetadataUrl) } : {}),
        ...(parsed.data.samlCertificateRef !== undefined ? { samlCertificateRef: optionalValue(parsed.data.samlCertificateRef) } : {}),
        ...(parsed.data.ldapsUrl !== undefined ? { ldapsUrl: optionalValue(parsed.data.ldapsUrl) } : {}),
        ...(parsed.data.ldapsBindDn !== undefined ? { ldapsBindDn: optionalValue(parsed.data.ldapsBindDn) } : {}),
        ...(parsed.data.ldapsBindSecretRef !== undefined ? { ldapsBindSecretRef: optionalValue(parsed.data.ldapsBindSecretRef) } : {}),
        ...(parsed.data.scopes !== undefined ? { scopes: parsed.data.scopes } : {}),
        ...(parsed.data.config !== undefined ? { configJson: JSON.stringify(parsed.data.config) } : {})
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.provider_updated",
        targetType: "identity_provider",
        targetId: result.id,
        metadata: {
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
    200,
    requestId
  );
}
