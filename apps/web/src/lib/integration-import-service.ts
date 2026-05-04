import { auditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";

export type QueuedIntegrationImport = {
  run: {
    id: string;
    status: string;
    requestedLimit: number;
    dryRun: boolean;
  };
  job: {
    id: string;
    status: string;
  };
};

export async function queueIntegrationImportJob(input: {
  workspaceId: string;
  actorId: string;
  integrationId: string;
  dryRun?: boolean;
  requestedLimit?: number;
  runAfter?: Date;
  priority?: number;
}): Promise<QueuedIntegrationImport> {
  const integration = await prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId
    }
  });

  if (!integration) {
    throw new Error("Интеграция не найдена.");
  }

  const dryRun = input.dryRun ?? false;
  const requestedLimit = input.requestedLimit ?? integration.importLimit;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const run = await tx.integrationRun.create({
      data: {
        workspaceId: input.workspaceId,
        integrationId: integration.id,
        actorId: input.actorId,
        source: integration.source,
        mode: integration.type,
        status: dryRun ? "dry_run_queued" : "queued",
        dryRun,
        requestedLimit,
        importedCount: 0,
        errorCount: 0
      }
    });
    const job = await tx.backendJob.create({
      data: {
        workspaceId: input.workspaceId,
        type: "INTEGRATION_IMPORT",
        status: "QUEUED",
        queueName: "integrations",
        priority: input.priority ?? (dryRun ? 40 : 50),
        runAfter: input.runAfter ?? now,
        createdById: input.actorId,
        payloadJson: JSON.stringify({
          integrationId: integration.id,
          integrationRunId: run.id,
          source: integration.source,
          mode: integration.type,
          requestedLimit,
          dryRun
        })
      }
    });

    await tx.integration.update({
      where: { id: integration.id },
      data: {
        status: "queued",
        ...(dryRun ? { lastDryRunAt: now } : { lastImportAt: now }),
        lastError: null
      }
    });

    await auditLog(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: dryRun ? "integration.dry_run_queued" : "integration.import_queued",
        targetType: "integration",
        targetId: integration.id,
        metadata: {
          source: integration.source,
          runId: run.id,
          jobId: job.id,
          dryRun,
          requestedLimit
        }
      },
      tx
    );

    return {
      run: {
        id: run.id,
        status: run.status,
        requestedLimit: run.requestedLimit,
        dryRun: run.dryRun
      },
      job: {
        id: job.id,
        status: job.status
      }
    };
  });
}
