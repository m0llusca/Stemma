import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { BackendJobCancelConflictError, BackendJobNotFoundError, cancelBackendJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { jobId } = await context.params;
  const cancelled = await cancelBackendJob({
    workspaceId: user.workspaceId,
    jobId,
    actorId: user.id
  }).catch((error) => {
    if (error instanceof BackendJobNotFoundError) {
      return error;
    }

    if (error instanceof BackendJobCancelConflictError) {
      return error;
    }

    throw error;
  });

  if (cancelled instanceof BackendJobNotFoundError) {
    return apiError("not_found", cancelled.message, 404, requestId);
  }

  if (cancelled instanceof BackendJobCancelConflictError) {
    return apiError("conflict", cancelled.message, 409, requestId);
  }

  return apiJson(
    {
      job: {
        id: cancelled.id,
        status: cancelled.status
      }
    },
    200,
    requestId
  );
}
