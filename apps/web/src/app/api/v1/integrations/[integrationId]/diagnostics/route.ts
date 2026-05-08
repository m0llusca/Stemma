import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { runOtrsConnectorDiagnostics } from "@/lib/integrations/otrs-family/service";

export const dynamic = "force-dynamic";

const diagnosticsSchema = z.object({
  manualTicketId: z.union([z.string().trim().min(1), z.number().int().positive()]).optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ integrationId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "integrations:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = diagnosticsSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры диагностики OTRS.", 400, requestId, parsed.error.flatten());
  }

  const { integrationId } = await context.params;

  try {
    const diagnosticRun = await runOtrsConnectorDiagnostics({
      workspaceId: session.user.workspaceId,
      integrationId,
      actorId: session.user.id,
      manualTicketId: parsed.data.manualTicketId ?? null
    });
    const diagnosticRunId = String((diagnosticRun as { id?: unknown }).id ?? "");
    const status = String((diagnosticRun as { status?: unknown }).status ?? "unknown");

    await auditLog({
      workspaceId: session.user.workspaceId,
      actorId: session.user.id,
      action: "integration.otrs_diagnostics_run",
      targetType: "integration",
      targetId: integrationId,
      metadata: {
        diagnosticRunId,
        status,
        hasManualTicketId: parsed.data.manualTicketId !== null && parsed.data.manualTicketId !== undefined
      }
    });

    return apiJson(
      {
        diagnosticRun: {
          id: diagnosticRunId,
          status
        }
      },
      202,
      requestId
    );
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return apiError("not_found", "Интеграция не найдена.", 404, requestId);
    }

    return apiError("internal_error", "Не удалось выполнить диагностику OTRS.", 500, requestId);
  }
}
