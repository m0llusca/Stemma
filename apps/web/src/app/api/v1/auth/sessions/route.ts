import { apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const sessions = await prisma.authSession.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ lastSeenAt: "desc" }],
    take: 100,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true
        }
      },
      provider: {
        select: {
          id: true,
          name: true,
          type: true
        }
      }
    }
  });

  return apiJson({
    sessions: sessions.map((session) => ({
      id: session.id,
      status: session.status,
      user: session.user,
      provider: session.provider,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null
    }))
  });
}

