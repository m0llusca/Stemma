import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const { jobId } = await context.params;
  const job = await prisma.backendJob.findFirst({
    where: {
      id: jobId,
      workspaceId: user.workspaceId
    },
    include: {
      events: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!job) {
    return apiError("not_found", "Фоновая задача не найдена.", 404);
  }

  return apiJson({
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      queueName: job.queueName,
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      payload: parseJson(job.payloadJson),
      result: parseJson(job.resultJson),
      errorMessage: job.errorMessage,
      runAfter: job.runAfter.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      events: job.events.map((event) => ({
        id: event.id,
        level: event.level,
        message: event.message,
        metadata: parseJson(event.metadata),
        createdAt: event.createdAt.toISOString()
      }))
    }
  });
}

