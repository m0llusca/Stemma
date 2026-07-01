import { apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";
import { summarizeQueueHealth } from "@/lib/jobs/health";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const now = new Date();

  const [queued, running, failed, oldestQueued] = await Promise.all([
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "QUEUED" } }),
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "RUNNING" } }),
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "FAILED" } }),
    prisma.backendJob.findFirst({
      where: { workspaceId: user.workspaceId, status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true }
    })
  ]);

  const health = summarizeQueueHealth({
    queued,
    running,
    failed,
    oldestQueuedAt: oldestQueued?.createdAt ?? null,
    now
  });

  return apiJson(health, 200, requestId);
}
