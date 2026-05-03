import { apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireCurrentUserPermission("auth_providers:manage");
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

