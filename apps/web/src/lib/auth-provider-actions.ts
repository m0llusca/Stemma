"use server";

import { Prisma, type IdentityProviderType, type RoleName } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { assertProviderEndpointUrls, assertSafeProviderConfig } from "@/lib/auth/provider-config-validation";
import { refreshIdentityPoliciesForExternalGroup } from "@/lib/auth/providers";
import { validateLdapsProviderConfigForSave } from "@/lib/auth/ldaps";
import { assertProductionSecretReference, validateOidcProviderConfigForSave } from "@/lib/auth/oidc";
import { validateSamlProviderConfigForSave } from "@/lib/auth/saml";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const providerTypes = ["MICROSOFT_ENTRA_ID", "ACTIVE_DIRECTORY_LDAPS", "OIDC", "SAML"] as const satisfies readonly IdentityProviderType[];
const roles = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"] as const satisfies readonly RoleName[];
type ConfigurableProviderType = (typeof providerTypes)[number];
type ConfigurableRole = (typeof roles)[number];

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalValue(value: string) {
  return value || null;
}

function providerTypeField(value: string) {
  if (!providerTypes.includes(value as ConfigurableProviderType)) {
    throw new Error("Некорректный тип провайдера авторизации.");
  }

  return value as ConfigurableProviderType;
}

function roleField(value: string) {
  if (!roles.includes(value as ConfigurableRole)) {
    throw new Error("Некорректная роль для группы.");
  }

  return value as ConfigurableRole;
}

function priorityField(formData: FormData) {
  const parsed = Number(stringField(formData, "priority"));
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 1000 ? parsed : 100;
}

function accessReturnSection(formData: FormData, fallback: string) {
  const section = stringField(formData, "returnSection");

  return ["overview", "provider", "mappings", "sessions", "recommendations"].includes(section) ? section : fallback;
}

function accessRedirectPath(providerId: string | undefined, section: string) {
  const params = new URLSearchParams({ section });

  if (providerId) {
    params.set("provider", providerId);
  }

  return `/admin/access?${params.toString()}`;
}

function parseConfigJson(value: string): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new Error("Дополнительная конфигурация должна быть валидным JSON-объектом.");
  }
}

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
    ("code" in error && (error as { code?: unknown }).code === "P2002")
  );
}

export async function saveIdentityProvider(formData: FormData) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  await assertCanPersistSettings(user);
  const providerId = stringField(formData, "providerId");
  const type = providerTypeField(stringField(formData, "type"));
  const name = stringField(formData, "name");
  const slug = stringField(formData, "slug");
  const status = stringField(formData, "status") || "draft";
  const scopes = stringField(formData, "scopes") || "openid profile email";
  const config = parseConfigJson(stringField(formData, "configJson"));
  const clientSecretRef = optionalValue(stringField(formData, "clientSecretRef"));
  const issuer = optionalValue(stringField(formData, "issuer"));
  const tenantId = optionalValue(stringField(formData, "tenantId"));
  const authorizationUrl = optionalValue(stringField(formData, "authorizationUrl"));
  const tokenUrl = optionalValue(stringField(formData, "tokenUrl"));
  const jwksUrl = optionalValue(stringField(formData, "jwksUrl"));
  const samlMetadataUrl = optionalValue(stringField(formData, "samlMetadataUrl"));
  const samlCertificateRef = optionalValue(stringField(formData, "samlCertificateRef"));
  const ldapsUrl = optionalValue(stringField(formData, "ldapsUrl"));
  const ldapsBindDn = optionalValue(stringField(formData, "ldapsBindDn"));
  const ldapsBindSecretRef = optionalValue(stringField(formData, "ldapsBindSecretRef"));

  if (name.length < 2 || slug.length < 2 || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Заполните название и slug латиницей в нижнем регистре.");
  }

  if (!["draft", "active", "disabled"].includes(status)) {
    throw new Error("Некорректный статус провайдера.");
  }

  assertSafeProviderConfig(config);
  assertProductionSecretReference(clientSecretRef);
  validateOidcProviderConfigForSave({
    type,
    status,
    issuer,
    tenantId
  });
  validateSamlProviderConfigForSave({
    type,
    samlCertificateRef,
    config
  });
  validateLdapsProviderConfigForSave({
    type,
    status,
    ldapsUrl,
    ldapsBindDn,
    ldapsBindSecretRef,
    config
  });
  assertProviderEndpointUrls({
    type,
    authorizationUrl,
    tokenUrl,
    jwksUrl,
    samlMetadataUrl,
    configJson: JSON.stringify(config)
  });

  const data = {
    type,
    name,
    slug,
    status,
    issuer,
    tenantId,
    clientId: optionalValue(stringField(formData, "clientId")),
    clientSecretRef,
    authorizationUrl,
    tokenUrl,
    jwksUrl,
    samlEntityId: optionalValue(stringField(formData, "samlEntityId")),
    samlMetadataUrl,
    samlCertificateRef,
    ldapsUrl,
    ldapsBindDn,
    ldapsBindSecretRef,
    scopes,
    configJson: JSON.stringify(config)
  };

  const provider = await prisma.$transaction(async (tx) => {
    const existingProvider = providerId
      ? await tx.identityProvider.findFirst({
          where: {
            id: providerId,
            workspaceId: user.workspaceId
          },
          select: { id: true }
        })
      : null;

    if (providerId && !existingProvider) {
      throw new Error("Провайдер не относится к текущему рабочему пространству.");
    }

    const result = existingProvider
      ? await tx.identityProvider.update({
          where: { id: providerId },
          data
        })
      : await tx.identityProvider.upsert({
          where: {
            workspaceId_slug: {
              workspaceId: user.workspaceId,
              slug
            }
          },
          create: {
            workspaceId: user.workspaceId,
            ...data
          },
          update: data
        });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.provider_saved",
        targetType: "identity_provider",
        targetId: result.id,
        metadata: {
          type: result.type,
          slug: result.slug,
          status: result.status,
          credentialConfigured: Boolean(result.clientSecretRef)
        }
      },
      tx
    );

    return result;
  });

  revalidatePath("/admin/access");
  revalidatePath("/admin/system");
  redirect(accessRedirectPath(provider.id, accessReturnSection(formData, "provider")));
}

export async function saveGroupRoleMapping(formData: FormData) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  await assertCanPersistSettings(user);
  const mappingId = stringField(formData, "mappingId");
  const providerId = stringField(formData, "providerId") || undefined;
  const externalGroupId = stringField(formData, "externalGroupId");
  const externalGroupName = stringField(formData, "externalGroupName") || externalGroupId;
  const role = roleField(stringField(formData, "role"));
  const priority = priorityField(formData);
  const isActive = formData.get("isActive") === "on";

  if (!externalGroupId) {
    throw new Error("Укажите идентификатор группы.");
  }

  if (providerId) {
    const provider = await prisma.identityProvider.findFirst({
      where: {
        id: providerId,
        workspaceId: user.workspaceId
      },
      select: { id: true }
    });

    if (!provider) {
      throw new Error("Провайдер авторизации не найден.");
    }
  }

  async function persistMapping() {
    return prisma.$transaction(async (tx) => {
    const existingMapping = mappingId
      ? await tx.groupRoleMapping.findFirst({
          where: {
            id: mappingId,
            workspaceId: user.workspaceId
          },
          select: { id: true, providerId: true, externalGroupId: true }
        })
      : null;

    if (mappingId && !existingMapping) {
      throw new Error("Маппинг не относится к текущему рабочему пространству.");
    }

    const duplicateMapping = !existingMapping && !providerId
      ? await tx.groupRoleMapping.findFirst({
          where: {
            workspaceId: user.workspaceId,
            providerId: null,
            externalGroupId,
            role
          },
          select: { id: true }
        })
      : null;

    const result = existingMapping
      ? await tx.groupRoleMapping.update({
          where: { id: mappingId },
          data: {
            providerId,
            externalGroupId,
            externalGroupName,
            role,
            priority,
            isActive
          }
        })
      : providerId
        ? await tx.groupRoleMapping.upsert({
            where: {
              workspaceId_providerId_externalGroupId_role: {
                workspaceId: user.workspaceId,
                providerId,
                externalGroupId,
                role
              }
            },
            create: {
              workspaceId: user.workspaceId,
              providerId,
              externalGroupId,
              externalGroupName,
              role,
              priority,
              isActive
            },
            update: {
              externalGroupName,
              priority,
              isActive
            }
          })
      : duplicateMapping
        ? await tx.groupRoleMapping.update({
            where: { id: duplicateMapping.id },
            data: {
              externalGroupName,
              priority,
              isActive
            }
          })
        : await tx.groupRoleMapping.create({
            data: {
              workspaceId: user.workspaceId,
              providerId,
              externalGroupId,
              externalGroupName,
              role,
              priority,
              isActive
            }
          });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.group_role_mapping_saved",
        targetType: "group_role_mapping",
        targetId: result.id,
        metadata: {
          providerId,
          externalGroupId,
          role,
          priority,
          isActive
        }
      },
      tx
    );

    await refreshIdentityPoliciesForExternalGroup(
      {
        workspaceId: user.workspaceId,
        providerId: result.providerId,
        externalGroupId: result.externalGroupId
      },
      tx
    );

    if (
      existingMapping &&
      (existingMapping.providerId !== result.providerId || existingMapping.externalGroupId !== result.externalGroupId)
    ) {
      await refreshIdentityPoliciesForExternalGroup(
        {
          workspaceId: user.workspaceId,
          providerId: existingMapping.providerId,
          externalGroupId: existingMapping.externalGroupId
        },
        tx
      );
    }

    return result;
    });
  }

  const mapping = await persistMapping().catch((error: unknown) => {
    if (!mappingId && !providerId && isUniqueConstraintError(error)) {
      return persistMapping();
    }

    throw error;
  });

  revalidatePath("/admin/access");
  revalidatePath("/admin/system");
  redirect(accessRedirectPath(mapping.providerId ?? providerId, accessReturnSection(formData, "mappings")));
}

export async function toggleGroupRoleMapping(formData: FormData) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  await assertCanPersistSettings(user);
  const mappingId = stringField(formData, "mappingId");
  const isActive = stringField(formData, "isActive") === "true";

  const mapping = await prisma.groupRoleMapping.findFirst({
    where: {
      id: mappingId,
      workspaceId: user.workspaceId
    }
  });

  if (!mapping) {
    throw new Error("Маппинг группы не найден.");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.groupRoleMapping.update({
      where: { id: mapping.id },
      data: { isActive }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.group_role_mapping_toggled",
        targetType: "group_role_mapping",
        targetId: updated.id,
        metadata: {
          externalGroupId: updated.externalGroupId,
          role: updated.role,
          isActive
        }
      },
      tx
    );

    await refreshIdentityPoliciesForExternalGroup(
      {
        workspaceId: user.workspaceId,
        providerId: updated.providerId,
        externalGroupId: updated.externalGroupId
      },
      tx
    );
  });

  revalidatePath("/admin/access");
  revalidatePath("/admin/system");
}

export async function revokeAuthSessionById(formData: FormData) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  await assertCanPersistSettings(user);
  const sessionId = stringField(formData, "sessionId");

  const session = await prisma.authSession.findFirst({
    where: {
      id: sessionId,
      workspaceId: user.workspaceId,
      status: "ACTIVE"
    }
  });

  if (!session) {
    throw new Error("Сессия не найдена.");
  }

  await prisma.$transaction(async (tx) => {
    const revoked = await tx.authSession.update({
      where: { id: session.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date()
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.session_revoked",
        targetType: "auth_session",
        targetId: revoked.id,
        metadata: {
          userId: revoked.userId,
          providerId: revoked.providerId
        }
      },
      tx
    );
  });

  revalidatePath("/admin/access");
  revalidatePath("/admin/system");
}
