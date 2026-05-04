import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { jobId } = await context.params;
  const job = await prisma.backendJob.findFirst({
    where: {
      id: jobId,
      workspaceId: user.workspaceId
    }
  });

  if (!job) {
    return apiError("not_found", "Фоновая задача не найдена.", 404, requestId);
  }

  if (job.status !== "QUEUED") {
    return apiError("conflict", "Можно отменить только задачу в очереди.", 409, requestId);
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.backendJob.update({
      where: { id: job.id },
      data: {
        status: "CANCELLED",
        finishedAt: new Date()
      }
    });

    await tx.backendJobEvent.create({
      data: {
        jobId: job.id,
        level: "warn",
        message: "Задача отменена администратором.",
        metadata: JSON.stringify({ actorId: user.id })
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "backend_job.cancelled",
        targetType: "backend_job",
        targetId: job.id,
        metadata: {
          type: job.type
        }
      },
      tx
    );

    return updated;
  });

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
