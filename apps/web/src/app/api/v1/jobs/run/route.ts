import { z } from "zod";
import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { runDueBackendJobs } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

const runJobsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  workerId: z.string().trim().min(1).max(120).optional()
});

export async function POST(request: Request) {
  await requireCurrentUserPermission("backend_jobs:manage");
  const body = await request.json().catch(() => ({}));
  const parsed = runJobsSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры запуска очереди.", 400, undefined, parsed.error.flatten());
  }

  const results = await runDueBackendJobs(parsed.data);

  return apiJson({
    processed: results.length,
    results
  });
}

