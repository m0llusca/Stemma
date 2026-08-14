import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { createOtrsPreview } from "@/lib/integrations/otrs-family/service";

export const dynamic = "force-dynamic";

const previewSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("manual_ticket_ids"),
    manualTicketIds: z.array(z.union([z.string().trim().min(1), z.number().int().positive()])).min(1).max(500)
  }),
  z.object({
    mode: z.literal("ticket_search"),
    filters: z.record(z.unknown()).optional()
  })
]);

export async function POST(request: Request, context: { params: Promise<{ integrationId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "integrations:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = previewSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры preview OTRS.", 400, requestId, parsed.error.flatten());
  }

  const { integrationId } = await context.params;

  try {
    const preview =
      parsed.data.mode === "manual_ticket_ids"
        ? await createOtrsPreview({
            workspaceId: session.user.workspaceId,
            integrationId,
            actorId: session.user.id,
            mode: parsed.data.mode,
            manualTicketIds: parsed.data.manualTicketIds
          })
        : await createOtrsPreview({
            workspaceId: session.user.workspaceId,
            integrationId,
            actorId: session.user.id,
            mode: parsed.data.mode,
            filters: parsed.data.filters ?? {}
          });
    const diagnosticRunId = String((preview.diagnosticRun as { id?: unknown }).id ?? "");
    const runId = String((preview.run as { id?: unknown }).id ?? "");

    await auditLog({
      workspaceId: session.user.workspaceId,
      actorId: session.user.id,
      action: "integration.otrs_preview_created",
      targetType: "integration",
      targetId: integrationId,
      metadata: {
        mode: parsed.data.mode,
        diagnosticRunId,
        integrationRunId: runId,
        itemCount: preview.items.length
      }
    });

    return apiJson(
      {
        diagnosticRun: {
          id: diagnosticRunId
        },
        run: {
          id: runId
        },
        items: preview.items.map((item) => ({
          id: String((item as { id?: unknown }).id ?? ""),
          externalId: String((item as { externalId?: unknown }).externalId ?? ""),
          status: String((item as { status?: unknown }).status ?? "")
        }))
      },
      201,
      requestId
    );
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return apiError("not_found", "Интеграция не найдена.", 404, requestId);
    }

    return apiError("internal_error", "Не удалось создать preview OTRS.", 500, requestId);
  }
}
