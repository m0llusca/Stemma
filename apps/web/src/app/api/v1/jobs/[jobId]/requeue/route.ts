import { auditLog } from "@/lib/audit";
import { apiData, apiError, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { requeueBackendJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { jobId } = await context.params;

  try {
    const job = await requeueBackendJob({
      workspaceId: user.workspaceId,
      jobId,
      actorId: user.id
    });

    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "backend_job.requeued",
      targetType: "backend_job",
      targetId: job.id,
      metadata: {
        status: job.status
      }
    });

    return apiData(
      {
        job: {
          id: job.id,
          status: job.status
        }
      },
      { requestId }
    );
  } catch (error) {
    return apiError(
      "conflict",
      error instanceof Error ? error.message : "Не удалось вернуть задачу в очередь.",
      409,
      requestId
    );
  }
}
