"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/secrets";

export type IntegrationActionState = {
  ok: boolean;
  message: string;
  integrationId?: string;
} | null;

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberField(formData: FormData, key: string, fallback: number) {
  const parsed = Number(stringField(formData, key));

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function booleanField(formData: FormData, key: string, fallback = false) {
  const value = stringField(formData, key).toLowerCase();

  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value);
}

function optionalString(value: string) {
  return value || null;
}

function validateBaseUrl(baseUrl: string, mode: string) {
  if (!baseUrl && mode !== "custom_api") {
    throw new Error("Укажите Base URL источника.");
  }

  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Base URL должен начинаться с http:// или https://.");
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("Base URL должен быть корректным URL.");
  }
}

function readIntegrationSetup(formData: FormData) {
  const source = stringField(formData, "source") || "unknown";
  const sourceLabel = stringField(formData, "sourceLabel") || source;
  const mode = stringField(formData, "mode") || "unknown";
  const baseUrl = validateBaseUrl(stringField(formData, "baseUrl"), mode);
  const maxTickets = numberField(formData, "maxTickets", 100);
  const batchSize = numberField(formData, "batchSize", 25);
  const dateRangeDays = numberField(formData, "dateRangeDays", 30);
  const ticketId = stringField(formData, "ticketId");
  const userLogin = stringField(formData, "userLogin");
  const password = stringField(formData, "password");
  const nativeToken = stringField(formData, "nativeToken");
  const queueFilter = stringField(formData, "queueFilter");
  const statusFilter = stringField(formData, "statusFilter");
  const dryRun = booleanField(formData, "dryRun", true);
  const deduplicate = booleanField(formData, "deduplicate", true);
  const credentialSecret = mode === "otrs_family" ? password : mode === "native_helpdesk" ? nativeToken : "";

  return {
    source,
    sourceLabel,
    mode,
    baseUrl,
    maxTickets,
    batchSize,
    dateRangeDays,
    ticketId,
    userLogin,
    queueFilter,
    statusFilter,
    dryRun,
    deduplicate,
    credentialSecret,
    config: {
      setupVersion: 1,
      source,
      sourceLabel,
      mode,
      ticketId,
      userLogin,
      filters: {
        queue: queueFilter,
        status: statusFilter
      },
      dryRun,
      deduplicate,
      updatedFrom: "ui_setup_wizard"
    }
  };
}

async function upsertIntegrationSetup(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  setup: ReturnType<typeof readIntegrationSetup>,
  status: string,
  dates: { lastDryRunAt?: Date; lastImportAt?: Date } = {}
) {
  const integration = await tx.integration.upsert({
    where: {
      workspaceId_source: {
        workspaceId,
        source: setup.source
      }
    },
    create: {
      workspaceId,
      source: setup.source,
      displayName: setup.sourceLabel,
      type: setup.mode,
      status,
      baseUrl: setup.baseUrl,
      importLimit: setup.maxTickets,
      batchSize: setup.batchSize,
      dateRangeDays: setup.dateRangeDays,
      configJson: JSON.stringify(setup.config),
      ...dates
    },
    update: {
      displayName: setup.sourceLabel,
      type: setup.mode,
      status,
      baseUrl: setup.baseUrl,
      importLimit: setup.maxTickets,
      batchSize: setup.batchSize,
      dateRangeDays: setup.dateRangeDays,
      configJson: JSON.stringify(setup.config),
      lastError: null,
      ...dates
    }
  });

  if (setup.credentialSecret) {
    await tx.integrationCredential.upsert({
      where: {
        integrationId: integration.id
      },
      create: {
        workspaceId,
        integrationId: integration.id,
        authMode: setup.mode === "otrs_family" ? "user_password" : "bearer_token",
        encryptedSecret: encryptSecret(setup.credentialSecret),
        keyVersion: "v1",
        lastRotatedAt: new Date()
      },
      update: {
        authMode: setup.mode === "otrs_family" ? "user_password" : "bearer_token",
        encryptedSecret: encryptSecret(setup.credentialSecret),
        keyVersion: "v1",
        lastRotatedAt: new Date()
      }
    });
  }

  return integration;
}

export async function saveIntegrationConfiguration(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageIntegrations(user.role)) {
    throw new Error("Нет прав на управление интеграциями.");
  }

  const setup = readIntegrationSetup(formData);
  const integration = await prisma.$transaction(async (tx) => {
    const existing = await tx.integration.findUnique({
      where: {
        workspaceId_source: {
          workspaceId: user.workspaceId,
          source: setup.source
        }
      },
      select: {
        status: true
      }
    });
    const saved = await upsertIntegrationSetup(tx, user.workspaceId, setup, existing?.status === "queued" ? "queued" : "ready");

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.configuration_saved",
        targetType: "integration",
        targetId: saved.id,
        metadata: {
          source: setup.source,
          sourceLabel: setup.sourceLabel,
          mode: setup.mode,
          baseUrl: setup.baseUrl,
          maxTickets: setup.maxTickets,
          batchSize: setup.batchSize,
          dateRangeDays: setup.dateRangeDays,
          hasCredential: Boolean(setup.credentialSecret)
        }
      },
      tx
    );

    return saved;
  });

  revalidatePath("/admin/integrations");
  revalidatePath("/admin/system");

  return { integrationId: integration.id };
}

export async function recordIntegrationDryRun(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageIntegrations(user.role)) {
    throw new Error("Нет прав на управление интеграциями.");
  }

  const setup = readIntegrationSetup(formData);

  const integration = await prisma.$transaction(async (tx) => {
    const integration = await upsertIntegrationSetup(tx, user.workspaceId, setup, "queued", {
      lastDryRunAt: new Date()
    });

    const run = await tx.integrationRun.create({
      data: {
        workspaceId: user.workspaceId,
        integrationId: integration.id,
        actorId: user.id,
        source: setup.source,
        mode: setup.mode,
        status: "dry_run_queued",
        dryRun: true,
        requestedLimit: setup.maxTickets,
        importedCount: 0,
        errorCount: 0
      }
    });

    const job = await tx.backendJob.create({
      data: {
        workspaceId: user.workspaceId,
        type: "INTEGRATION_IMPORT",
        status: "QUEUED",
        queueName: "integrations",
        priority: 40,
        createdById: user.id,
        payloadJson: JSON.stringify({
          integrationId: integration.id,
          integrationRunId: run.id,
          source: setup.source,
          mode: setup.mode,
          requestedLimit: setup.maxTickets,
          dryRun: true
        })
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.dry_run_queued",
        targetType: "integration",
        targetId: integration.id,
        metadata: {
          source: setup.source,
          sourceLabel: setup.sourceLabel,
          mode: setup.mode,
          baseUrl: setup.baseUrl,
          dryRun: true,
          maxTickets: setup.maxTickets,
          batchSize: setup.batchSize,
          dateRangeDays: setup.dateRangeDays,
          runId: run.id,
          jobId: job.id,
          hasCredential: Boolean(setup.credentialSecret)
        }
      },
      tx
    );
    return integration;
  });

  revalidatePath("/admin/integrations");
  revalidatePath("/admin/system");

  return {
    integrationId: integration.id
  };
}

export async function saveIntegrationConfigurationState(_state: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  try {
    const result = await saveIntegrationConfiguration(formData);

    return {
      ok: true,
      message: "Настройка сохранена. Источник появился в списке подключений.",
      integrationId: result.integrationId
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось сохранить настройку интеграции."
    };
  }
}

export async function recordIntegrationDryRunState(_state: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  try {
    const result = await recordIntegrationDryRun(formData);

    return {
      ok: true,
      message: "Проверка подключения поставлена в backend-очередь. Запуск выполнит реальный connector runner.",
      integrationId: result.integrationId
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось поставить проверку подключения в очередь."
    };
  }
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
