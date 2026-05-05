import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { BackendJobRequeueConflictError, requeueBackendJob } from "@/lib/jobs/queue";

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

    return apiJson(
      {
        job: {
          id: job.id,
          status: job.status
        }
      },
      200,
      requestId
    );
  } catch (error) {
    if (error instanceof BackendJobRequeueConflictError) {
      return apiError("conflict", error.message, 409, requestId);
    }

    return apiError("internal_error", "Внутренняя ошибка сервера.", 500, requestId);
  }
}
