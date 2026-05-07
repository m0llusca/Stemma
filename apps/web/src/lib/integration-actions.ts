"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { queueIntegrationImportJob } from "@/lib/integration-import-service";
import { upsertIntegrationSecretSlot } from "@/lib/integrations/otrs-family/credentials";
import { runDueBackendJobs } from "@/lib/jobs/queue";

export type IntegrationActionState = {
  ok: boolean;
  message: string;
  integrationId?: string;
} | null;

export type IntegrationImportActionState = {
  ok: boolean;
  message: string;
  runId?: string;
  jobId?: string;
} | null;

export type IntegrationQueueRunActionState = {
  ok: boolean;
  message: string;
  processed: number;
  succeeded: number;
  failed: number;
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
  const caBundle = stringField(formData, "caBundle");
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
    caBundle: mode === "otrs_family" ? caBundle : "",
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
    await upsertIntegrationSecretSlot(tx, {
      workspaceId,
      integrationId: integration.id,
      kind: "auth_password",
      authMode: setup.mode === "otrs_family" ? "user_password" : "bearer_token",
      secret: setup.credentialSecret
    });
  }

  if (setup.caBundle) {
    const caBundleSlot = await upsertIntegrationSecretSlot(tx, {
      workspaceId,
      integrationId: integration.id,
      kind: "ca_bundle",
      authMode: "tls_ca_bundle",
      secret: setup.caBundle
    });
    const configJson = JSON.stringify({
      ...setup.config,
      tls: {
        caBundleSecretId: caBundleSlot.id,
        caFingerprint: caBundleSlot.fingerprint
      }
    });

    await tx.integration.update({
      where: { id: integration.id },
      data: { configJson }
    });

    return {
      ...integration,
      configJson
    };
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
  const result = await queueIntegrationImportJob({
    workspaceId: user.workspaceId,
    actorId: user.id,
    integrationId
  });

  revalidatePath("/admin/integrations");
  revalidatePath("/admin/system");

  return result;
}

export async function queueIntegrationImportState(
  _state: IntegrationImportActionState,
  formData: FormData
): Promise<IntegrationImportActionState> {
  try {
    const result = await queueIntegrationImport(formData);

    return {
      ok: true,
      message: "Импорт поставлен в backend-очередь.",
      runId: result.run.id,
      jobId: result.job.id
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось запланировать импорт."
    };
  }
}

export async function runIntegrationQueueState(
  _state: IntegrationQueueRunActionState,
  formData: FormData
): Promise<IntegrationQueueRunActionState> {
  try {
    const user = await getCurrentUser();

    if (!canManageIntegrations(user.role)) {
      return {
        ok: false,
        message: "Нет прав на управление интеграциями.",
        processed: 0,
        succeeded: 0,
        failed: 0
      };
    }

    const limit = numberField(formData, "limit", 5);
    const results = await runDueBackendJobs({
      limit,
      queueName: "integrations",
      workerId: `ui-integrations-${user.id.slice(0, 8)}`
    });
    const succeeded = results.filter((result) => result.status === "SUCCEEDED").length;
    const failed = results.filter((result) => result.status === "FAILED").length;

    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "backend_jobs.run_from_integrations_ui",
      targetType: "backend_job",
      targetId: "integrations",
      metadata: {
        limit,
        processed: results.length,
        succeeded,
        failed
      }
    });

    revalidatePath("/admin/integrations");
    revalidatePath("/admin/system");

    return {
      ok: true,
      message:
        results.length === 0
          ? "В очереди интеграций нет задач для запуска."
          : `Запущено задач: ${results.length}. Успешно: ${succeeded}. С ошибками: ${failed}.`,
      processed: results.length,
      succeeded,
      failed
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось запустить очередь интеграций.",
      processed: 0,
      succeeded: 0,
      failed: 0
    };
  }
}
