import { z } from "zod";
import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { runDueBackendJobs } from "@/lib/jobs/queue";
import { logBackendEvent, requestIdFromHeaders } from "@/lib/observability";

export const dynamic = "force-dynamic";

const runJobsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  workerId: z.string().trim().min(1).max(120).optional()
});

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const user = await requireCurrentUserPermission("backend_jobs:manage");
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

  return apiJson(
    {
      processed: results.length,
      results
    },
    200,
    requestId
  );
}
