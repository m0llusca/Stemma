import { z } from "zod";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { enqueueBackendJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

const createJobSchema = z.object({
  type: z.enum(["INTEGRATION_IMPORT", "REPORT_EXPORT", "DIRECTORY_SYNC", "RETENTION_CLEANUP"]),
  payload: z.record(z.unknown()).optional(),
  queueName: z.string().trim().min(1).max(80).optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  runAfter: z.string().datetime().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional()
});

export async function GET() {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const jobs = await prisma.backendJob.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 3
      }
    }
  });

  return apiJson({
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      runAfter: job.runAfter.toISOString(),
      errorMessage: job.errorMessage,
      payload: JSON.parse(job.payloadJson),
      result: JSON.parse(job.resultJson),
      events: job.events.map((event) => ({
        level: event.level,
        message: event.message,
        createdAt: event.createdAt.toISOString()
      }))
    }))
  });
}

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const body = await request.json().catch(() => null);
  const parsed = createJobSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры фоновой задачи.", 400, requestId, parsed.error.flatten());
  }

  const job = await enqueueBackendJob({
    workspaceId: user.workspaceId,
    type: parsed.data.type,
    payload: parsed.data.payload,
    queueName: parsed.data.queueName,
    priority: parsed.data.priority,
    runAfter: parsed.data.runAfter ? new Date(parsed.data.runAfter) : undefined,
    maxAttempts: parsed.data.maxAttempts,
    createdById: user.id
  });

  return apiJson(
    {
      job: {
        id: job.id,
        type: job.type,
        status: job.status
      }
    },
    201,
    requestId
  );
}
