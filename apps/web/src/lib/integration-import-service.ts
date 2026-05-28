import { auditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { dataSourceContracts } from "@/lib/integrations/data-source-adapters/source-contracts";
import { phaseBSourceContracts } from "@/lib/integrations/helpdesk-adapters/source-contracts";

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

export type IntegrationJobOperation = "legacy_connector_run" | "otrs_selected_import";
const importClaimableStatuses = ["ready", "active", "error", "paused"] as const;

function assertIntegrationEnabled(integration: { status?: string | null }) {
  if (integration.status === "disabled") {
    throw new Error("Интеграция отключена.");
  }
}

function assertIntegrationImportSupported(integration: { type?: string | null }) {
  if (integration.type === "enterprise") {
    throw new Error("Корпоративные источники требуют защищенной настройки OAuth-доступов.");
  }
}

export function assertIntegrationSourceContractSupported(integration: { source?: string | null; type?: string | null }) {
  const source = integration.source?.trim().toLowerCase() ?? "";
  const type = integration.type?.trim() || "custom_api";
  const contract = phaseBSourceContracts[source as keyof typeof phaseBSourceContracts];
  const dataSourceContract = dataSourceContracts[source as keyof typeof dataSourceContracts];
  const enterpriseMessage = "Корпоративные источники требуют защищенной настройки OAuth-доступов.";

  if (dataSourceContract) {
    if (type !== dataSourceContract.type) {
      throw new Error("Тип интеграции не соответствует data source contract.");
    }

    return;
  }

  if (type === "enterprise" || contract?.type === "enterprise") {
    throw new Error(enterpriseMessage);
  }

  if (contract && type !== contract.type) {
    throw new Error("Тип источника не соответствует контракту Phase B.");
  }
}

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
  assertIntegrationEnabled(integration);
  assertIntegrationImportSupported(integration);
  assertIntegrationSourceContractSupported(integration);

  const dryRun = input.dryRun ?? false;
  const requestedLimit = input.requestedLimit ?? integration.importLimit;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const claimedIntegration = await tx.integration.updateMany({
      where: {
        id: integration.id,
        workspaceId: input.workspaceId,
        status: {
          in: [...importClaimableStatuses]
        }
      },
      data: {
        status: "queued",
        ...(dryRun ? { lastDryRunAt: now } : { lastImportAt: now }),
        lastError: null
      }
    });

    if (claimedIntegration.count !== 1) {
      throw new Error("Импорт интеграции уже стоит в очереди или выполняется.");
    }

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
          previousStatus: integration.status,
          requestedLimit,
          dryRun
        })
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

export async function queueSelectedOtrsImportJob(input: {
  workspaceId: string;
  actorId: string;
  integrationId: string;
  integrationRunId: string;
  integrationRunItemIds: string[];
  runAfter?: Date;
  priority?: number;
}): Promise<QueuedIntegrationImport> {
  const requestedIntegrationRunItemIds = input.integrationRunItemIds.map((item) => item.trim()).filter(Boolean);
  const integrationRunItemIds = Array.from(new Set(requestedIntegrationRunItemIds));

  if (integrationRunItemIds.length === 0) {
    throw new Error("Выберите обращения для импорта.");
  }

  if (integrationRunItemIds.length !== requestedIntegrationRunItemIds.length) {
    throw new Error("Список обращений для импорта содержит дубликаты.");
  }

  const integration = await prisma.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId
    }
  });

  if (!integration) {
    throw new Error("Интеграция не найдена.");
  }
  assertIntegrationEnabled(integration);

  if (integration.type !== "otrs_family") {
    throw new Error("Выборочный импорт поддерживается только для OTRS-family интеграций.");
  }

  const run = await prisma.integrationRun.findFirst({
    where: {
      id: input.integrationRunId,
      workspaceId: input.workspaceId,
      integrationId: integration.id
    }
  });

  if (!run) {
    throw new Error("Preview-run интеграции не найден.");
  }

  const validItems = await prisma.integrationRunItem.findMany({
    where: {
      workspaceId: input.workspaceId,
      integrationRunId: run.id,
      id: {
        in: integrationRunItemIds
      },
      status: "previewed"
    },
    select: {
      id: true
    }
  });
  const validItemIds = new Set(validItems.map((item) => item.id));

  if (validItemIds.size !== integrationRunItemIds.length || integrationRunItemIds.some((itemId) => !validItemIds.has(itemId))) {
    throw new Error("Выбранные обращения должны быть previewed-строками указанного preview-run.");
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const claimedRun = await tx.integrationRun.updateMany({
      where: {
        id: run.id,
        workspaceId: input.workspaceId,
        integrationId: integration.id,
        status: "previewed"
      },
      data: {
        status: "queued",
        dryRun: false,
        requestedLimit: integrationRunItemIds.length,
        errorMessage: null,
        finishedAt: null
      }
    });

    if (claimedRun.count === 0) {
      throw new Error("Preview-run уже поставлен в очередь или больше недоступен для выборочного импорта.");
    }

    const job = await tx.backendJob.create({
      data: {
        workspaceId: input.workspaceId,
        type: "INTEGRATION_IMPORT",
        status: "QUEUED",
        queueName: "integrations",
        priority: input.priority ?? 50,
        runAfter: input.runAfter ?? now,
        createdById: input.actorId,
        payloadJson: JSON.stringify({
          operation: "otrs_selected_import" satisfies IntegrationJobOperation,
          integrationId: integration.id,
          integrationRunId: run.id,
          integrationRunItemIds
        })
      }
    });

    const queuedIntegration = await tx.integration.updateMany({
      where: {
        id: integration.id,
        workspaceId: input.workspaceId,
        status: { not: "disabled" }
      },
      data: {
        status: "queued",
        lastError: null
      }
    });
    if (queuedIntegration.count !== 1) {
      throw new Error("Интеграция отключена.");
    }

    await auditLog(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "integration.otrs_selected_import_queued",
        targetType: "integration",
        targetId: integration.id,
        metadata: {
          operation: "otrs_selected_import",
          source: integration.source,
          runId: run.id,
          jobId: job.id,
          integrationRunItemIds
        }
      },
      tx
    );

    return {
      run: {
        id: run.id,
        status: "queued",
        requestedLimit: integrationRunItemIds.length,
        dryRun: false
      },
      job: {
        id: job.id,
        status: job.status
      }
    };
  });
}
