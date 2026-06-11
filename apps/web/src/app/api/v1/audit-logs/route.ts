import type { Prisma } from "@prisma/client";
import { apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { firstQueryParam, paginationMeta, parseIsoDateParam, parsePagination, safeJsonParse } from "@/lib/api/query";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const maxFilterLength = 120;

function filterParam(searchParams: URLSearchParams, key: string) {
  return firstQueryParam(searchParams, key)?.slice(0, maxFilterLength);
}

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "audit:read", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const searchParams = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination({
    page: firstQueryParam(searchParams, "page"),
    limit: firstQueryParam(searchParams, "limit"),
    defaultLimit: 50,
    maxLimit: 100
  });
  const createdFrom = parseIsoDateParam(searchParams, "from");
  const createdTo = parseIsoDateParam(searchParams, "to", true);
  const action = filterParam(searchParams, "action");
  const targetType = filterParam(searchParams, "targetType");
  const targetId = filterParam(searchParams, "targetId");
  const actorId = filterParam(searchParams, "actorId");
  const where: Prisma.AuditLogWhereInput = {
    workspaceId: user.workspaceId,
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetId ? { targetId } : {}),
    ...(actorId ? { actorId } : {}),
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

  return apiJson(
    {
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
    },
    200,
    requestId
  );
}
