import { z } from "zod";
import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { queueIntegrationImportJob } from "@/lib/integration-import-service";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  dryRun: z.boolean().optional(),
  requestedLimit: z.number().int().min(1).max(10000).optional(),
  runAfter: z.string().datetime().optional()
});

export async function POST(request: Request, context: { params: Promise<{ integrationId: string }> }) {
  const user = await requireCurrentUserPermission("integrations:manage");
  const { integrationId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры запуска импорта.", 400, undefined, parsed.error.flatten());
  }

  const result = await queueIntegrationImportJob({
    workspaceId: user.workspaceId,
    actorId: user.id,
    integrationId,
    dryRun: parsed.data.dryRun ?? false,
    requestedLimit: parsed.data.requestedLimit,
    runAfter: parsed.data.runAfter ? new Date(parsed.data.runAfter) : undefined
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Интеграция не найдена.") {
      return null;
    }

    throw error;
  });

  if (!result) {
    return apiError("not_found", "Интеграция не найдена.", 404);
  }

  return apiJson(
    {
      run: {
        id: result.run.id,
        status: result.run.status,
        requestedLimit: result.run.requestedLimit
      },
      job: {
        id: result.job.id,
        status: result.job.status
      }
    },
    202
  );
}
