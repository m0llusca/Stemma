import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

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

  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      workspaceId: user.workspaceId
    }
  });

  if (!integration) {
    return apiError("not_found", "Интеграция не найдена.", 404);
  }

  const requestedLimit = parsed.data.requestedLimit ?? integration.importLimit;
  const result = await prisma.$transaction(async (tx) => {
    const run = await tx.integrationRun.create({
      data: {
        workspaceId: user.workspaceId,
        integrationId: integration.id,
        actorId: user.id,
        source: integration.source,
        mode: integration.type,
        status: parsed.data.dryRun ? "dry_run_queued" : "queued",
        dryRun: parsed.data.dryRun ?? false,
        requestedLimit
      }
    });
    const job = await tx.backendJob.create({
      data: {
        workspaceId: user.workspaceId,
        type: "INTEGRATION_IMPORT",
        status: "QUEUED",
        queueName: "integrations",
        priority: 50,
        runAfter: parsed.data.runAfter ? new Date(parsed.data.runAfter) : new Date(),
        createdById: user.id,
        payloadJson: JSON.stringify({
          integrationId: integration.id,
          integrationRunId: run.id,
          source: integration.source,
          mode: integration.type,
          requestedLimit,
          dryRun: parsed.data.dryRun ?? false
        })
      }
    });

    await tx.integration.update({
      where: { id: integration.id },
      data: {
        status: "queued",
        lastImportAt: new Date(),
        lastError: null
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.import_queued",
        targetType: "integration",
        targetId: integration.id,
        metadata: {
          source: integration.source,
          runId: run.id,
          jobId: job.id,
          dryRun: run.dryRun,
          requestedLimit
        }
      },
      tx
    );

    return { run, job };
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
    202
  );
}

