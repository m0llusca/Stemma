import { z } from "zod";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { queueSelectedOtrsImportJob } from "@/lib/integration-import-service";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  integrationRunId: z.string().trim().min(1),
  integrationRunItemIds: z.array(z.string().trim().min(1)).min(1)
});

export async function POST(request: Request, context: { params: Promise<{ integrationId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "integrations:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры выборочного OTRS-импорта.", 400, requestId, parsed.error.flatten());
  }

  const { integrationId } = await context.params;

  try {
    const result = await queueSelectedOtrsImportJob({
      workspaceId: session.user.workspaceId,
      actorId: session.user.id,
      integrationId,
      integrationRunId: parsed.data.integrationRunId,
      integrationRunItemIds: parsed.data.integrationRunItemIds
    });

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
      202,
      requestId
    );
  } catch (error) {
    if (error instanceof Error && /не найд|not found/i.test(error.message)) {
      return apiError("not_found", "Интеграция или preview-run не найдены.", 404, requestId);
    }

    if (error instanceof Error && /уже поставлен|недоступен/i.test(error.message)) {
      return apiError("conflict", error.message, 409, requestId);
    }

    if (error instanceof Error && /Выберите|дубликаты|previewed-строками|поддерживается/i.test(error.message)) {
      return apiError("bad_request", error.message, 400, requestId);
    }

    return apiError("internal_error", "Не удалось запланировать выборочный OTRS-импорт.", 500, requestId);
  }
}
