import { z } from "zod";
import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { enqueueBackendJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  format: z.enum(["csv", "xlsx", "pdf"]).optional(),
  filters: z.record(z.unknown()).optional(),
  metrics: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  const user = await requireCurrentUserPermission("reports:read");
  const body = await request.json().catch(() => null);
  const parsed = exportSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры экспорта отчета.", 400, undefined, parsed.error.flatten());
  }

  const job = await enqueueBackendJob({
    workspaceId: user.workspaceId,
    type: "REPORT_EXPORT",
    queueName: "reports",
    priority: 80,
    createdById: user.id,
    payload: parsed.data
  });

  return apiJson(
    {
      job: {
        id: job.id,
        type: job.type,
        status: job.status
      }
    },
    202
  );
}

