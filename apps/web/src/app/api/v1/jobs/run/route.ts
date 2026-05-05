import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { runDueBackendJobs } from "@/lib/jobs/queue";
import { logBackendEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";

const runJobsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  workerId: z.string().trim().min(1).max(120).optional()
});

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const body = await request.json().catch(() => ({}));
  const parsed = runJobsSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры запуска очереди.", 400, requestId, parsed.error.flatten());
  }

  const results = await runDueBackendJobs(parsed.data);
  logBackendEvent({
    requestId,
    event: "backend_jobs.run_requested",
    workspaceId: user.workspaceId,
    actorId: user.id,
    metadata: {
      processed: results.length
    }
  });

  try {
    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "backend_jobs.run_requested",
      targetType: "backend_jobs",
      targetId: parsed.data.workerId ?? "manual",
      metadata: {
        processed: results.length,
        workerId: parsed.data.workerId ?? null
      }
    });
  } catch (error) {
    logBackendEvent({
      level: "error",
      requestId,
      event: "backend_jobs.run_audit_failed",
      workspaceId: user.workspaceId,
      actorId: user.id,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown audit logging error"
      }
    });
  }

  return apiJson(
    {
      processed: results.length,
      results
    },
    200,
    requestId
  );
}
