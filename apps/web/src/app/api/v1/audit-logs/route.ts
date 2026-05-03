import type { Prisma } from "@prisma/client";
import { apiJson } from "@/lib/api/response";
import { firstQueryParam, paginationMeta, parseIsoDateParam, parsePagination, safeJsonParse } from "@/lib/api/query";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireCurrentUserPermission("audit:read");
  const searchParams = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination({
    page: firstQueryParam(searchParams, "page"),
    limit: firstQueryParam(searchParams, "limit"),
    defaultLimit: 50,
    maxLimit: 100
  });
  const createdFrom = parseIsoDateParam(searchParams, "from");
  const createdTo = parseIsoDateParam(searchParams, "to", true);
  const where: Prisma.AuditLogWhereInput = {
    workspaceId: user.workspaceId,
    ...(firstQueryParam(searchParams, "action") ? { action: firstQueryParam(searchParams, "action") } : {}),
    ...(firstQueryParam(searchParams, "targetType") ? { targetType: firstQueryParam(searchParams, "targetType") } : {}),
    ...(firstQueryParam(searchParams, "targetId") ? { targetId: firstQueryParam(searchParams, "targetId") } : {}),
    ...(firstQueryParam(searchParams, "actorId") ? { actorId: firstQueryParam(searchParams, "actorId") } : {}),
    ...(createdFrom || createdTo
      ? {
          createdAt: {
            ...(createdFrom ? { gte: createdFrom } : {}),
            ...(createdTo ? { lte: createdTo } : {})
          }
        }
      : {})
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        }
      }
    }),
    prisma.auditLog.count({ where })
  ]);

  return apiJson({
    pagination: paginationMeta({ page, limit, total }),
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      actor: log.actor,
      metadata: safeJsonParse(log.metadata),
      createdAt: log.createdAt.toISOString()
    }))
  });
}
