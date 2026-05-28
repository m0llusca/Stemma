"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  assertIntegrationSourceContractSupported,
  queueIntegrationImportJob,
  queueSelectedOtrsImportJob
} from "@/lib/integration-import-service";
import {
  integrationQueueImportOutputSchema,
  integrationSetupInputSchema,
  type IntegrationQueueImportOutput,
  type IntegrationSetupInput
} from "@/lib/integration-setup-schema";
import { parseOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { upsertIntegrationSecretSlot } from "@/lib/integrations/otrs-family/credentials";
import { createOtrsPreview, runOtrsConnectorDiagnostics } from "@/lib/integrations/otrs-family/service";
import { runDueBackendJobs } from "@/lib/jobs/queue";

export type IntegrationActionState = {
  ok: boolean;
  message: string;
  integrationId?: string;
  runId?: string;
  jobId?: string;
  reusedExistingRun?: boolean;
} | null;

export type IntegrationImportActionState = {
  ok: boolean;
  message: string;
  integrationId?: string;
  runId?: string;
  jobId?: string;
  reusedExistingRun?: boolean;
  reusedQueuedRun?: boolean;
} | null;

export type OtrsDiagnosticsActionState = {
  ok: boolean;
  message: string;
  integrationId?: string;
  diagnosticRunId?: string;
  status?: string;
} | null;

export type OtrsPreviewActionState = {
  ok: boolean;
  message: string;
  integrationId?: string;
  diagnosticRunId?: string;
  runId?: string;
  itemCount?: number;
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

function jsonField(formData: FormData, key: string, fallback: Record<string, unknown> = {}) {
  const value = stringField(formData, key);

  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : fallback;
  } catch {
    throw new Error(`${key} должен быть валидным JSON-объектом.`);
  }
}

async function requireIntegrationSettingsUser() {
  const user = await getCurrentUser();

  if (!canManageIntegrations(user.role)) {
    throw new Error("Нет прав на управление интеграциями.");
  }

  await assertCanPersistSettings(user);

  return user;
}

function splitStringList(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formStringList(formData: FormData, key: string) {
  const values = formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" ? splitStringList(value) : []));

  return Array.from(new Set(values));
}

function rawFormStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" ? splitStringList(value) : []));
}

function revalidateIntegrationAdminPaths(integrationId: string) {
  revalidatePath("/admin/integrations");
  revalidatePath(`/admin/integrations/${integrationId}`);
}

function allowedBaseUrlProtocols(source: string, mode: string) {
  const normalizedSource = source.trim().toLowerCase();

  if (mode === "data_source" && normalizedSource === "ydb") {
    return ["grpc:", "grpcs:"];
  }

  return ["http:", "https:"];
}

function baseUrlProtocolMessage(allowedProtocols: readonly string[]) {
  if (allowedProtocols.length === 2 && allowedProtocols.includes("grpc:") && allowedProtocols.includes("grpcs:")) {
    return "Base URL должен начинаться с grpc:// или grpcs://.";
  }

  return allowedProtocols.includes("grpc:")
    ? "Base URL должен начинаться с http://, https://, grpc:// или grpcs://."
    : "Base URL должен начинаться с http:// или https://.";
}

function validateBaseUrl(baseUrl: string, mode: string, source: string) {
  if (!baseUrl && mode !== "custom_api") {
    throw new Error("Укажите Base URL источника.");
  }

  if (!baseUrl) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Base URL должен быть корректным URL.");
  }

  const allowedProtocols = allowedBaseUrlProtocols(source, mode);

  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error(baseUrlProtocolMessage(allowedProtocols));
  }

  return url.toString().replace(/\/$/, "");
}

function assertSupportedSourceMode(source: string, mode: string) {
  assertIntegrationSourceContractSupported({ source, type: mode });
}

function readIntegrationSetup(formData: FormData) {
  const source = stringField(formData, "source") || "unknown";
  const sourceLabel = stringField(formData, "sourceLabel") || source;
  const mode = stringField(formData, "mode") || "unknown";
  assertSupportedSourceMode(source, mode);
  const baseUrl = validateBaseUrl(stringField(formData, "baseUrl"), mode, source);
  const maxTickets = numberField(formData, "maxTickets", 100);
  const batchSize = numberField(formData, "batchSize", 25);
  const dateRangeDays = numberField(formData, "dateRangeDays", 30);
  const ticketId = stringField(formData, "ticketId");
  const userLogin = stringField(formData, "userLogin");
  const password = stringField(formData, "password");
  const nativeToken = stringField(formData, "nativeToken");
  const dataSourceSecret = stringField(formData, "dataSourceSecret");
  const configJson = jsonField(formData, "configJson", {});
  const dataSourceTablePath =
    stringField(formData, "dataSourceTablePath") ||
    (typeof configJson.tablePath === "string" ? configJson.tablePath.trim() : "");
  const dataSourceQuery =
    stringField(formData, "dataSourceQuery") ||
    (typeof configJson.query === "string" ? configJson.query.trim() : "");
  const caBundle = stringField(formData, "caBundle");
  const queueFilter = stringField(formData, "queueFilter");
  const statusFilter = stringField(formData, "statusFilter");
  const dryRun = booleanField(formData, "dryRun", true);
  const deduplicate = booleanField(formData, "deduplicate", true);
  const credentialSecret =
    mode === "otrs_family"
      ? password
      : mode === "native_helpdesk"
        ? nativeToken
        : mode === "data_source"
          ? dataSourceSecret
          : "";

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
      tablePath: dataSourceTablePath,
      query: dataSourceQuery,
      dryRun,
      deduplicate,
      updatedFrom: "ui_setup_wizard"
    }
  };
}

function assertSupportedSetupContract(setup: ReturnType<typeof readIntegrationSetup>) {
  assertSupportedSourceMode(setup.source, setup.mode);
}

const inFlightSetupRunStatuses = ["dry_run_queued", "queued", "running"] as const;

function setupQueueMessage(dryRun: boolean, reusedExistingRun: boolean) {
  if (reusedExistingRun) {
    return dryRun ? "Проверка подключения уже находится в backend-очереди." : "Импорт уже находится в backend-очереди.";
  }

  return dryRun
    ? "Проверка подключения поставлена в backend-очередь. Запуск выполнит connector runner."
    : "Импорт поставлен в backend-очередь. Запуск выполнит connector runner.";
}

const otrsSourceSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9_-]+$/);

function readOtrsIntegrationSetup(formData: FormData) {
  const source = otrsSourceSchema.parse(stringField(formData, "source") || "otrs");
  const displayName = stringField(formData, "displayName") || stringField(formData, "sourceLabel") || "OTRS";
  const baseUrl = validateBaseUrl(stringField(formData, "baseUrl"), "otrs_family", source);
  const product = stringField(formData, "product") || "otrs_ce_6";
  const userLogin = stringField(formData, "userLogin");
  const password = stringField(formData, "password");
  const caBundle = stringField(formData, "caBundle");
  const rawConfig = jsonField(formData, "configJson", {});
  const configInput: Record<string, unknown> = {
    ...rawConfig,
    product,
    ...(stringField(formData, "webServiceName") ? { webServiceName: stringField(formData, "webServiceName") } : {}),
    ...(stringField(formData, "basePath") ? { basePath: stringField(formData, "basePath") } : {}),
    limits: {
      ...(rawConfig.limits && typeof rawConfig.limits === "object" && !Array.isArray(rawConfig.limits) ? rawConfig.limits : {}),
      searchLimit: numberField(formData, "searchLimit", 50),
      manualTicketIdLimit: numberField(formData, "manualTicketIdLimit", 20),
      batchSize: numberField(formData, "batchSize", 25),
      requestTimeoutMs: numberField(formData, "requestTimeoutMs", 15000),
      maxResponseBytes: numberField(formData, "maxResponseBytes", 5_000_000)
    }
  };
  const parsedConfig = parseOtrsConnectorConfig(configInput);

  if (!userLogin) {
    throw new Error("Укажите UserLogin для OTRS.");
  }

  return {
    source,
    displayName,
    baseUrl,
    userLogin,
    password,
    caBundle,
    importLimit: numberField(formData, "importLimit", parsedConfig.limits.searchLimit),
    batchSize: numberField(formData, "batchSize", parsedConfig.limits.batchSize),
    dateRangeDays: numberField(formData, "dateRangeDays", 30),
    config: {
      ...parsedConfig,
      userLogin
    }
  };
}

function mergeExistingCaBundleReference(
  config: ReturnType<typeof readOtrsIntegrationSetup>["config"],
  existingConfigJson: string | undefined,
  existingCaBundleSlot: { id: string; fingerprint: string | null } | undefined
) {
  if (!existingCaBundleSlot) {
    return config;
  }

  let existingTls: Record<string, unknown> = {};

  try {
    const existing = JSON.parse(existingConfigJson ?? "{}") as unknown;
    existingTls =
      existing && typeof existing === "object" && !Array.isArray(existing) && "tls" in existing
        ? ((existing as { tls?: unknown }).tls as Record<string, unknown>) ?? {}
        : {};
  } catch {
    existingTls = {};
  }

  return {
    ...config,
    tls: {
      ...config.tls,
      caBundleSecretId:
        typeof existingTls.caBundleSecretId === "string" && existingTls.caBundleSecretId.trim()
          ? existingTls.caBundleSecretId
          : existingCaBundleSlot.id,
      caFingerprint:
        typeof existingTls.caFingerprint === "string" && existingTls.caFingerprint.trim()
          ? existingTls.caFingerprint
          : existingCaBundleSlot.fingerprint
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
    const secretKind = setupCredentialSecretKind(setup);

    if (secretKind) {
      await upsertIntegrationSecretSlot(tx, {
        workspaceId,
        integrationId: integration.id,
        kind: secretKind,
        authMode: setup.mode === "otrs_family" ? "user_password" : setup.mode === "data_source" ? "data_source_secret" : "bearer_token",
        secret: setup.credentialSecret
      });
    }
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

function setupCredentialSecretKind(setup: Pick<ReturnType<typeof readIntegrationSetup>, "mode" | "source">) {
  const source = setup.source.trim().toLowerCase();

  if (setup.mode === "data_source") {
    return source === "ytsaurus" ? "data_source_token" : "data_source_credentials";
  }

  if (setup.mode === "native_helpdesk" || setup.mode === "otrs_family") {
    return "auth_password";
  }

  return null;
}

async function assertSetupRequiredSecretSlots(
  tx: Prisma.TransactionClient,
  integrationId: string,
  setup: ReturnType<typeof readIntegrationSetup>
) {
  const requiredKind = setupCredentialSecretKind(setup);

  if (!requiredKind || setup.credentialSecret) {
    return;
  }

  const existing = await tx.integration.findUnique({
    where: { id: integrationId },
    select: {
      credentials: {
        select: {
          kind: true
        }
      }
    }
  });
  const hasRequiredSlot = existing?.credentials.some((credential) => credential.kind === requiredKind) ?? false;

  if (!hasRequiredSlot) {
    throw new Error(`Не заполнены требуемые secret slots: ${requiredKind}.`);
  }
}

async function lockSetupRunClaim(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; integrationId: string; source: string; mode: string; dryRun: boolean }
) {
  const key = `integration_setup:${input.workspaceId}:${input.integrationId}:${input.source}:${input.mode}:${input.dryRun}`;

  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", key);
}

export async function saveIntegrationConfiguration(formData: FormData) {
  const user = await requireIntegrationSettingsUser();

  const setup = readIntegrationSetup(formData);
  assertSupportedSetupContract(setup);
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

type RecordedIntegrationDryRun = {
  integrationId: string;
  runId?: string;
  jobId?: string;
  reusedExistingRun: boolean;
  reusedQueuedRun: boolean;
  message: string;
};

export async function recordIntegrationDryRun(formData: FormData): Promise<RecordedIntegrationDryRun> {
  const user = await requireIntegrationSettingsUser();

  const setup = readIntegrationSetup(formData);
  assertSupportedSetupContract(setup);
  const runStatus = setup.dryRun ? "dry_run_queued" : "queued";
  const queuedAction = setup.dryRun ? "integration.dry_run_queued" : "integration.import_queued";
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const integration = await upsertIntegrationSetup(
      tx,
      user.workspaceId,
      setup,
      "queued",
      setup.dryRun ? { lastDryRunAt: now } : { lastImportAt: now }
    );

    await assertSetupRequiredSecretSlots(tx, integration.id, setup);
    await lockSetupRunClaim(tx, {
      workspaceId: user.workspaceId,
      integrationId: integration.id,
      source: setup.source,
      mode: setup.mode,
      dryRun: setup.dryRun
    });

    const existingRun = await tx.integrationRun.findFirst({
      where: {
        workspaceId: user.workspaceId,
        integrationId: integration.id,
        source: setup.source,
        mode: setup.mode,
        dryRun: setup.dryRun,
        status: { in: [...inFlightSetupRunStatuses] }
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        requestedLimit: true,
        dryRun: true
      }
    });

    if (existingRun) {
      return {
        integrationId: integration.id,
        runId: existingRun.id,
        reusedExistingRun: true,
        reusedQueuedRun: true,
        message: setupQueueMessage(setup.dryRun, true)
      };
    }

    const run = await tx.integrationRun.create({
      data: {
        workspaceId: user.workspaceId,
        integrationId: integration.id,
        actorId: user.id,
        source: setup.source,
        mode: setup.mode,
        status: runStatus,
        dryRun: setup.dryRun,
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
        priority: setup.dryRun ? 40 : 50,
        createdById: user.id,
        payloadJson: JSON.stringify({
          integrationId: integration.id,
          integrationRunId: run.id,
          source: setup.source,
          mode: setup.mode,
          requestedLimit: setup.maxTickets,
          dryRun: setup.dryRun
        })
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: queuedAction,
        targetType: "integration",
        targetId: integration.id,
        metadata: {
          source: setup.source,
          sourceLabel: setup.sourceLabel,
          mode: setup.mode,
          baseUrl: setup.baseUrl,
          dryRun: setup.dryRun,
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
    return {
      integrationId: integration.id,
      runId: run.id,
      jobId: job.id,
      reusedExistingRun: false,
      reusedQueuedRun: false,
      message: setupQueueMessage(setup.dryRun, false)
    };
  });

  revalidatePath("/admin/integrations");
  revalidatePath("/admin/system");

  return result;
}

export async function recordIntegrationDryRunFromInput(input: IntegrationSetupInput): Promise<IntegrationQueueImportOutput> {
  const parsed = integrationSetupInputSchema.parse(input);
  const formData = new FormData();

  for (const [key, value] of Object.entries(parsed)) {
    if (key === "config") {
      formData.set("configJson", JSON.stringify(value));
    } else if (typeof value === "boolean") {
      formData.set(key, value ? "true" : "false");
    } else if (value !== null && value !== undefined) {
      formData.set(key, String(value));
    }
  }

  const result = await recordIntegrationDryRun(formData);

  return integrationQueueImportOutputSchema.parse({
    ok: true,
    message: result.message,
    integrationId: result.integrationId,
    runId: result.runId,
    jobId: result.jobId,
    reusedQueuedRun: result.reusedQueuedRun
  });
}

export async function saveOtrsIntegrationConfiguration(formData: FormData) {
  const user = await requireIntegrationSettingsUser();

  const setup = readOtrsIntegrationSetup(formData);
  const integration = await prisma.$transaction(async (tx) => {
    const existing = await tx.integration.findUnique({
      where: {
        workspaceId_source: {
          workspaceId: user.workspaceId,
          source: setup.source
        }
      },
      select: {
        status: true,
        configJson: true,
        credentials: {
          select: {
            id: true,
            kind: true,
            fingerprint: true
          }
        }
      }
    });
    const existingCaBundleSlot = existing?.credentials.find((credential) => credential.kind === "ca_bundle");
    const initialConfig = !setup.caBundle
      ? mergeExistingCaBundleReference(setup.config, existing?.configJson, existingCaBundleSlot)
      : setup.config;
    const saved = await tx.integration.upsert({
      where: {
        workspaceId_source: {
          workspaceId: user.workspaceId,
          source: setup.source
        }
      },
      create: {
        workspaceId: user.workspaceId,
        source: setup.source,
        displayName: setup.displayName,
        type: "otrs_family",
        status: existing?.status === "queued" ? "queued" : "ready",
        baseUrl: setup.baseUrl,
        authMode: "user_password",
        importLimit: setup.importLimit,
        batchSize: setup.batchSize,
        dateRangeDays: setup.dateRangeDays,
        configJson: JSON.stringify(initialConfig)
      },
      update: {
        displayName: setup.displayName,
        type: "otrs_family",
        status: existing?.status === "queued" ? "queued" : "ready",
        baseUrl: setup.baseUrl,
        authMode: "user_password",
        importLimit: setup.importLimit,
        batchSize: setup.batchSize,
        dateRangeDays: setup.dateRangeDays,
        configJson: JSON.stringify(initialConfig),
        lastError: null
      }
    });
    let finalConfig = initialConfig;

    if (setup.password) {
      await upsertIntegrationSecretSlot(tx, {
        workspaceId: user.workspaceId,
        integrationId: saved.id,
        kind: "auth_password",
        authMode: "user_password",
        secret: setup.password
      });
    }

    if (setup.caBundle) {
      const caBundleSlot = await upsertIntegrationSecretSlot(tx, {
        workspaceId: user.workspaceId,
        integrationId: saved.id,
        kind: "ca_bundle",
        authMode: "tls_ca_bundle",
        secret: setup.caBundle
      });
      finalConfig = {
        ...setup.config,
        tls: {
          ...setup.config.tls,
          caBundleSecretId: caBundleSlot.id,
          caFingerprint: caBundleSlot.fingerprint
        }
      };

      await tx.integration.update({
        where: { id: saved.id },
        data: {
          configJson: JSON.stringify(finalConfig)
        }
      });
    }

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.otrs_configuration_saved",
        targetType: "integration",
        targetId: saved.id,
        metadata: {
          source: setup.source,
          displayName: setup.displayName,
          baseUrl: setup.baseUrl,
          product: finalConfig.product,
          webServiceName: finalConfig.webServiceName,
          hasCredential: Boolean(setup.password),
          hasCaBundle: Boolean(setup.caBundle)
        }
      },
      tx
    );

    return {
      ...saved,
      configJson: JSON.stringify(finalConfig)
    };
  });

  revalidateIntegrationAdminPaths(integration.id);

  return { integrationId: integration.id };
}

export async function runOtrsDiagnosticsAction(formData: FormData) {
  const user = await requireIntegrationSettingsUser();

  const integrationId = stringField(formData, "integrationId");
  const manualTicketId = stringField(formData, "manualTicketId") || null;

  if (!integrationId) {
    throw new Error("Укажите интеграцию OTRS.");
  }

  const diagnosticRun = await runOtrsConnectorDiagnostics({
    workspaceId: user.workspaceId,
    integrationId,
    actorId: user.id,
    manualTicketId
  });
  const diagnosticRunId = String((diagnosticRun as { id?: unknown }).id ?? "");
  const status = String((diagnosticRun as { status?: unknown }).status ?? "unknown");

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "integration.otrs_diagnostics_run",
    targetType: "integration",
    targetId: integrationId,
    metadata: {
      diagnosticRunId,
      status,
      hasManualTicketId: Boolean(manualTicketId)
    }
  });

  revalidateIntegrationAdminPaths(integrationId);

  return {
    integrationId,
    diagnosticRunId,
    status,
    diagnosticRun
  };
}

export async function createOtrsPreviewAction(formData: FormData) {
  const user = await requireIntegrationSettingsUser();

  const integrationId = stringField(formData, "integrationId");
  const mode = stringField(formData, "mode") || "manual_ticket_ids";

  if (!integrationId) {
    throw new Error("Укажите интеграцию OTRS.");
  }

  const preview =
    mode === "manual_ticket_ids"
      ? await createOtrsPreview({
          workspaceId: user.workspaceId,
          integrationId,
          actorId: user.id,
          mode,
          manualTicketIds: formStringList(formData, "manualTicketIds")
        })
      : mode === "ticket_search"
        ? await createOtrsPreview({
            workspaceId: user.workspaceId,
            integrationId,
            actorId: user.id,
            mode,
            filters: jsonField(formData, "filtersJson", {})
          })
        : null;

  if (!preview) {
    throw new Error("Некорректный режим preview для OTRS.");
  }

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "integration.otrs_preview_created",
    targetType: "integration",
    targetId: integrationId,
    metadata: {
      mode,
      diagnosticRunId: String((preview.diagnosticRun as { id?: unknown }).id ?? ""),
      integrationRunId: String((preview.run as { id?: unknown }).id ?? ""),
      itemCount: preview.items.length
    }
  });

  revalidateIntegrationAdminPaths(integrationId);

  return {
    integrationId,
    diagnosticRunId: String((preview.diagnosticRun as { id?: unknown }).id ?? ""),
    runId: String((preview.run as { id?: unknown }).id ?? ""),
    itemCount: preview.items.length,
    preview
  };
}

export async function queueSelectedOtrsImportAction(formData: FormData) {
  const user = await requireIntegrationSettingsUser();

  const integrationId = stringField(formData, "integrationId");
  const integrationRunId = stringField(formData, "integrationRunId");

  if (!integrationId || !integrationRunId) {
    throw new Error("Укажите preview-run OTRS для импорта.");
  }

  const result = await queueSelectedOtrsImportJob({
    workspaceId: user.workspaceId,
    actorId: user.id,
    integrationId,
    integrationRunId,
    integrationRunItemIds: rawFormStringList(formData, "integrationRunItemIds")
  });

  revalidateIntegrationAdminPaths(integrationId);

  return result;
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
      message: result.message,
      integrationId: result.integrationId,
      runId: result.runId,
      jobId: result.jobId,
      reusedExistingRun: result.reusedExistingRun
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось поставить проверку подключения в очередь."
    };
  }
}

export async function saveOtrsIntegrationConfigurationState(
  _state: IntegrationActionState,
  formData: FormData
): Promise<IntegrationActionState> {
  try {
    const result = await saveOtrsIntegrationConfiguration(formData);

    return {
      ok: true,
      message: "Настройка OTRS сохранена.",
      integrationId: result.integrationId
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось сохранить настройку OTRS."
    };
  }
}

export async function runOtrsDiagnosticsActionState(
  _state: OtrsDiagnosticsActionState,
  formData: FormData
): Promise<OtrsDiagnosticsActionState> {
  try {
    const result = await runOtrsDiagnosticsAction(formData);

    return {
      ok: true,
      message: "Диагностика OTRS выполнена.",
      integrationId: result.integrationId,
      diagnosticRunId: result.diagnosticRunId,
      status: result.status
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось выполнить диагностику OTRS."
    };
  }
}

export async function createOtrsPreviewActionState(
  _state: OtrsPreviewActionState,
  formData: FormData
): Promise<OtrsPreviewActionState> {
  try {
    const result = await createOtrsPreviewAction(formData);

    return {
      ok: true,
      message: "Preview OTRS создан.",
      integrationId: result.integrationId,
      diagnosticRunId: result.diagnosticRunId,
      runId: result.runId,
      itemCount: result.itemCount
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось создать preview OTRS."
    };
  }
}

export async function queueIntegrationImport(formData: FormData) {
  const user = await requireIntegrationSettingsUser();

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

export async function queueSelectedOtrsImportActionState(
  _state: IntegrationImportActionState,
  formData: FormData
): Promise<IntegrationImportActionState> {
  try {
    const result = await queueSelectedOtrsImportAction(formData);

    return {
      ok: true,
      message: "Выбранные OTRS-обращения поставлены в backend-очередь.",
      runId: result.run.id,
      jobId: result.job.id
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось запланировать выборочный OTRS-импорт."
    };
  }
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
    const user = await requireIntegrationSettingsUser();

    const limit = numberField(formData, "limit", 5);
    const results = await runDueBackendJobs({
      limit,
      queueName: "integrations",
      workerId: `ui-integrations-${user.id.slice(0, 8)}`,
      workspaceId: user.workspaceId
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
