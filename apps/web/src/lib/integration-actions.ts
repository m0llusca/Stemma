"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberField(formData: FormData, key: string, fallback: number) {
  const parsed = Number(stringField(formData, key));

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function recordIntegrationDryRun(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageIntegrations(user.role)) {
    throw new Error("Нет прав на управление интеграциями.");
  }

  const source = stringField(formData, "source") || "unknown";
  const sourceLabel = stringField(formData, "sourceLabel") || source;
  const mode = stringField(formData, "mode") || "unknown";
  const baseUrl = stringField(formData, "baseUrl");
  const maxTickets = numberField(formData, "maxTickets", 100);
  const batchSize = numberField(formData, "batchSize", 25);
  const dateRangeDays = numberField(formData, "dateRangeDays", 30);

  await prisma.$transaction(async (tx) => {
    const integration = await tx.integration.upsert({
      where: {
        workspaceId_source: {
          workspaceId: user.workspaceId,
          source
        }
      },
      create: {
        workspaceId: user.workspaceId,
        source,
        displayName: sourceLabel,
        type: mode,
        status: "ready",
        baseUrl,
        importLimit: maxTickets,
        batchSize,
        dateRangeDays,
        lastDryRunAt: new Date(),
        configJson: JSON.stringify({ dryRun: true })
      },
      update: {
        displayName: sourceLabel,
        type: mode,
        status: "ready",
        baseUrl,
        importLimit: maxTickets,
        batchSize,
        dateRangeDays,
        lastDryRunAt: new Date(),
        lastError: null
      }
    });

    await tx.integrationRun.create({
      data: {
        workspaceId: user.workspaceId,
        integrationId: integration.id,
        actorId: user.id,
        source,
        mode,
        status: "dry_run_ok",
        dryRun: true,
        requestedLimit: maxTickets,
        importedCount: Math.min(maxTickets, batchSize),
        errorCount: 0,
        finishedAt: new Date()
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.dry_run_checked",
        targetType: "integration",
        targetId: source,
        metadata: {
          source,
          sourceLabel,
          mode,
          baseUrl,
          dryRun: true,
          maxTickets,
          batchSize,
          dateRangeDays,
          estimatedCount: Math.min(maxTickets, batchSize)
        }
      },
      tx
    );
  });

  revalidatePath("/admin/integrations");
}

export async function queueIntegrationImport(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageIntegrations(user.role)) {
    throw new Error("Нет прав на управление интеграциями.");
  }

  const integrationId = stringField(formData, "integrationId");

  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      workspaceId: user.workspaceId
    }
  });

  if (!integration) {
    throw new Error("Интеграция не найдена.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: {
        status: "queued",
        lastImportAt: new Date(),
        lastError: null
      }
    });

    const run = await tx.integrationRun.create({
      data: {
        workspaceId: user.workspaceId,
        integrationId: integration.id,
        actorId: user.id,
        source: integration.source,
        mode: integration.type,
        status: "queued",
        dryRun: false,
        requestedLimit: integration.importLimit,
        importedCount: 0,
        errorCount: 0
      }
    });

    await tx.backendJob.create({
      data: {
        workspaceId: user.workspaceId,
        type: "INTEGRATION_IMPORT",
        status: "QUEUED",
        queueName: "integrations",
        priority: 50,
        createdById: user.id,
        payloadJson: JSON.stringify({
          integrationId: integration.id,
          integrationRunId: run.id,
          source: integration.source,
          mode: integration.type,
          requestedLimit: integration.importLimit
        })
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.import_queued",
        targetType: "integration",
        targetId: integration.source,
        metadata: {
          source: integration.source,
          importLimit: integration.importLimit
        }
      },
      tx
    );
  });

  revalidatePath("/admin/integrations");
}
