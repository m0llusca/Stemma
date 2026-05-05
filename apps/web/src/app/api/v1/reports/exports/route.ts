import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
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
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "reports:read", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const body = await request.json().catch(() => null);
  const parsed = exportSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры экспорта отчета.", 400, requestId, parsed.error.flatten());
  }

  const job = await enqueueBackendJob({
    workspaceId: user.workspaceId,
    type: "REPORT_EXPORT",
    queueName: "reports",
    priority: 80,
    createdById: user.id,
    payload: parsed.data
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "report_export.queued",
    targetType: "backend_job",
    targetId: job.id,
    metadata: {
      format: parsed.data.format ?? null,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd
    }
  });

  return apiJson(
    {
      job: {
        id: job.id,
        type: job.type,
        status: job.status
      }
    },
    202,
    requestId
  );
}
