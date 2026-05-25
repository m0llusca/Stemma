import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { refreshIdentityPoliciesForExternalGroup } from "@/lib/auth/providers";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const mappingSchema = z.object({
  externalGroupId: z.string().trim().min(1).max(240),
  externalGroupName: z.string().trim().min(1).max(240),
  role: z.enum(["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"]),
  priority: z.number().int().min(1).max(1000).optional(),
  isActive: z.boolean().optional()
});

export async function GET(_request: Request, context: { params: Promise<{ providerId: string }> }) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  const { providerId } = await context.params;
  const provider = await prisma.identityProvider.findFirst({
    where: {
      id: providerId,
      workspaceId: user.workspaceId
    },
    include: {
      groupRoleMappings: {
        orderBy: [{ isActive: "desc" }, { priority: "asc" }]
      }
    }
  });

  if (!provider) {
    return apiError("not_found", "Провайдер авторизации не найден.", 404);
  }

  return apiJson({
    provider: {
      id: provider.id,
      name: provider.name,
      slug: provider.slug
    },
    mappings: provider.groupRoleMappings.map((mapping) => ({
      id: mapping.id,
      externalGroupId: mapping.externalGroupId,
      externalGroupName: mapping.externalGroupName,
      role: mapping.role,
      priority: mapping.priority,
      isActive: mapping.isActive
    }))
  });
}

export async function POST(request: Request, context: { params: Promise<{ providerId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { providerId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = mappingSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректный маппинг группы в роль.", 400, requestId, parsed.error.flatten());
  }

  const provider = await prisma.identityProvider.findFirst({
    where: {
      id: providerId,
      workspaceId: user.workspaceId
    },
    select: { id: true }
  });

  if (!provider) {
    return apiError("not_found", "Провайдер авторизации не найден.", 404, requestId);
  }

  const mapping = await prisma.$transaction(async (tx) => {
    const result = await tx.groupRoleMapping.upsert({
      where: {
        workspaceId_providerId_externalGroupId_role: {
          workspaceId: user.workspaceId,
          providerId,
          externalGroupId: parsed.data.externalGroupId,
          role: parsed.data.role
        }
      },
      create: {
        workspaceId: user.workspaceId,
        providerId,
        externalGroupId: parsed.data.externalGroupId,
        externalGroupName: parsed.data.externalGroupName,
        role: parsed.data.role,
        priority: parsed.data.priority ?? 100,
        isActive: parsed.data.isActive ?? true
      },
      update: {
        externalGroupName: parsed.data.externalGroupName,
        priority: parsed.data.priority ?? 100,
        isActive: parsed.data.isActive ?? true
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.group_role_mapping_upserted",
        targetType: "group_role_mapping",
        targetId: result.id,
        metadata: {
          providerId,
          externalGroupId: result.externalGroupId,
          role: result.role,
          isActive: result.isActive
        }
      },
      tx
    );

    await refreshIdentityPoliciesForExternalGroup(
      {
        workspaceId: user.workspaceId,
        providerId,
        externalGroupId: result.externalGroupId
      },
      tx
    );

    return result;
  });

  return apiJson(
    {
      mapping: {
        id: mapping.id,
        externalGroupId: mapping.externalGroupId,
        externalGroupName: mapping.externalGroupName,
        role: mapping.role,
        priority: mapping.priority,
        isActive: mapping.isActive
      }
    },
    201,
    requestId
  );
}
