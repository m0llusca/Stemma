import { requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";
import { formatQueueMetrics } from "@/lib/observability/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const workspaceId = session.user.workspaceId;

  const [queued, running, failed, succeeded, oldestQueued] = await Promise.all([
    prisma.backendJob.count({ where: { workspaceId, status: "QUEUED" } }),
    prisma.backendJob.count({ where: { workspaceId, status: "RUNNING" } }),
    prisma.backendJob.count({ where: { workspaceId, status: "FAILED" } }),
    prisma.backendJob.count({ where: { workspaceId, status: "SUCCEEDED" } }),
    prisma.backendJob.findFirst({
      where: { workspaceId, status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true }
    })
  ]);

  const oldestQueuedAgeSeconds = oldestQueued
    ? Math.max(0, Math.floor((Date.now() - oldestQueued.createdAt.getTime()) / 1000))
    : null;

  const body = formatQueueMetrics({ queued, running, failed, succeeded, oldestQueuedAgeSeconds });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; version=0.0.4",
      "x-request-id": requestId
    }
  });
}
