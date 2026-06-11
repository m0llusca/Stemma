import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    integration: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn()
    },
    integrationRun: {
      findFirst: vi.fn(),
      create: vi.fn()
    },
    backendJob: {
      create: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    assertCanPersistSettings: vi.fn(),
    canManageIntegrations: vi.fn(),
    createOtrsPreview: vi.fn(),
    getCurrentUser: vi.fn(),
    prisma,
    queueIntegrationImportJob: vi.fn(),
    queueSelectedOtrsImportJob: vi.fn(),
    revalidatePath: vi.fn(),
    requireSessionApi: vi.fn(),
    runOtrsConnectorDiagnostics: vi.fn(),
    runDueBackendJobs: vi.fn(),
    upsertIntegrationSecretSlot: vi.fn()
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  canManageIntegrations: mocks.canManageIntegrations,
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/integration-import-service", () => ({
  assertIntegrationSourceContractSupported: vi.fn(({ source, type }: { source?: string | null; type?: string | null }) => {
    if (type === "enterprise" || source === "salesforce") {
      throw new Error("Корпоративные источники требуют защищенной настройки OAuth-доступов.");
    }
  }),
  queueIntegrationImportJob: mocks.queueIntegrationImportJob,
  queueSelectedOtrsImportJob: mocks.queueSelectedOtrsImportJob
}));

vi.mock("@/lib/integrations/otrs-family/credentials", () => ({
  upsertIntegrationSecretSlot: mocks.upsertIntegrationSecretSlot
}));

vi.mock("@/lib/integrations/otrs-family/service", () => ({
  createOtrsPreview: mocks.createOtrsPreview,
  runOtrsConnectorDiagnostics: mocks.runOtrsConnectorDiagnostics
}));

vi.mock("@/lib/jobs/queue", () => ({
  runDueBackendJobs: mocks.runDueBackendJobs
}));

function authorizedUser() {
  return {
    id: "user-1",
    workspaceId: "workspace-1",
    role: "ADMIN"
  };
}

function baseOtrsForm() {
  const formData = new FormData();
  formData.set("source", "otrs");
  formData.set("displayName", "Production OTRS");
  formData.set("baseUrl", "https://support.example.com/otrs");
  formData.set("product", "otrs_ce_6");
  formData.set("userLogin", "qa-api");
  formData.set("password", "super-secret-password");
  formData.set("caBundle", "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----");
  formData.set("searchLimit", "15");
  formData.set("manualTicketIdLimit", "7");
  return formData;
}

function baseSetupForm(source: string, mode: string) {
  const formData = new FormData();
  formData.set("source", source);
  formData.set("sourceLabel", source);
  formData.set("mode", mode);
  formData.set("baseUrl", "https://support.example.com");
  formData.set("nativeToken", "secret-token");
  formData.set("ticketId", "CASE-1");
  formData.set("maxTickets", "25");
  formData.set("batchSize", "10");
  formData.set("dateRangeDays", "30");

  return formData;
}

describe("OTRS integration actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.$executeRawUnsafe.mockResolvedValue(0);
    mocks.getCurrentUser.mockResolvedValue(authorizedUser());
    mocks.canManageIntegrations.mockReturnValue(true);
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: authorizedUser()
    });
    mocks.prisma.integration.findFirst.mockResolvedValue({ id: "integration-1" });
    mocks.prisma.integration.findUnique.mockResolvedValue(null);
    mocks.prisma.integration.upsert.mockResolvedValue({
      id: "integration-1",
      source: "otrs",
      displayName: "Production OTRS",
      status: "ready",
      configJson: "{}"
    });
    mocks.prisma.integration.update.mockImplementation(async ({ data }) => ({
      id: "integration-1",
      source: "otrs",
      displayName: "Production OTRS",
      status: "ready",
      configJson: data.configJson
    }));
    mocks.prisma.integrationRun.create.mockResolvedValue({
      id: "run-1",
      status: "queued",
      requestedLimit: 25,
      dryRun: false
    });
    mocks.prisma.integrationRun.findFirst.mockResolvedValue(null);
    mocks.prisma.backendJob.create.mockResolvedValue({
      id: "job-1",
      status: "QUEUED"
    });
    mocks.upsertIntegrationSecretSlot
      .mockResolvedValueOnce({ id: "password-slot", kind: "auth_password", fingerprint: null })
      .mockResolvedValueOnce({ id: "ca-slot", kind: "ca_bundle", fingerprint: "ca-fingerprint" });
    mocks.auditLog.mockResolvedValue({});
    mocks.runDueBackendJobs.mockResolvedValue([
      { jobId: "job-1", status: "SUCCEEDED" },
      { jobId: "job-2", status: "FAILED" }
    ]);
  });

  it("saves OTRS setup as typed config and secret slots", async () => {
    const { saveOtrsIntegrationConfiguration } = await import("@/lib/integration-actions");

    const result = await saveOtrsIntegrationConfiguration(baseOtrsForm());

    expect(result).toEqual({ integrationId: "integration-1" });
    expect(mocks.prisma.integration.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_source: {
          workspaceId: "workspace-1",
          source: "otrs"
        }
      },
      create: expect.objectContaining({
        workspaceId: "workspace-1",
        source: "otrs",
        displayName: "Production OTRS",
        type: "otrs_family",
        baseUrl: "https://support.example.com/otrs",
        authMode: "user_password"
      }),
      update: expect.objectContaining({
        displayName: "Production OTRS",
        type: "otrs_family",
        baseUrl: "https://support.example.com/otrs",
        authMode: "user_password"
      })
    });
    const configJson = mocks.prisma.integration.update.mock.calls[0][0].data.configJson;
    const config = JSON.parse(configJson);

    expect(config).toMatchObject({
      connector: "otrs_family",
      configVersion: 1,
      product: "otrs_ce_6",
      userLogin: "qa-api",
      limits: {
        searchLimit: 15,
        manualTicketIdLimit: 7
      },
      tls: {
        caBundleSecretId: "ca-slot",
        caFingerprint: "ca-fingerprint"
      }
    });
    expect(config.password).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain("super-secret-password");
    expect(JSON.stringify(config)).not.toContain("BEGIN CERTIFICATE");
    expect(mocks.upsertIntegrationSecretSlot).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        kind: "auth_password",
        authMode: "user_password",
        secret: "super-secret-password"
      })
    );
    expect(mocks.upsertIntegrationSecretSlot).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        kind: "ca_bundle",
        authMode: "tls_ca_bundle",
        secret: expect.stringContaining("BEGIN CERTIFICATE")
      })
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "integration.otrs_configuration_saved",
        metadata: expect.not.objectContaining({
          password: expect.anything(),
          caBundle: expect.anything()
        })
      }),
      mocks.prisma
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/integrations");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/integrations/integration-1");
  });

  it("rejects forged enterprise setup forms before persistence", async () => {
    const { recordIntegrationDryRunState, saveIntegrationConfigurationState } = await import("@/lib/integration-actions");

    await expect(saveIntegrationConfigurationState(null, baseSetupForm("salesforce", "enterprise"))).resolves.toMatchObject({
      ok: false,
      message: "Корпоративные источники требуют защищенной настройки OAuth-доступов."
    });
    await expect(recordIntegrationDryRunState(null, baseSetupForm("salesforce", "native_helpdesk"))).resolves.toMatchObject({
      ok: false,
      message: "Корпоративные источники требуют защищенной настройки OAuth-доступов."
    });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.integration.upsert).not.toHaveBeenCalled();
    expect(mocks.upsertIntegrationSecretSlot).not.toHaveBeenCalled();
  });

  it("queues a live import when the setup wizard submits dryRun=false", async () => {
    const { recordIntegrationDryRunState } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("zendesk", "native_helpdesk");
    formData.set("dryRun", "false");

    await expect(recordIntegrationDryRunState(null, formData)).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("Импорт"),
      integrationId: "integration-1"
    });

    expect(mocks.prisma.integrationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "queued",
        dryRun: false,
        requestedLimit: 25
      })
    });
    const payloadJson = mocks.prisma.backendJob.create.mock.calls[0][0].data.payloadJson;
    expect(JSON.parse(payloadJson)).toMatchObject({
      integrationId: "integration-1",
      integrationRunId: "run-1",
      source: "zendesk",
      mode: "native_helpdesk",
      requestedLimit: 25,
      dryRun: false
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "integration.import_queued",
        metadata: expect.objectContaining({
          dryRun: false
        })
      }),
      mocks.prisma
    );
  });

  it("reuses an in-flight setup dry-run instead of creating a duplicate backend job", async () => {
    const { recordIntegrationDryRunState } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("zendesk", "native_helpdesk");
    mocks.prisma.integration.upsert.mockResolvedValueOnce({
      id: "integration-1",
      source: "zendesk",
      displayName: "Zendesk",
      status: "queued",
      configJson: "{}"
    });
    mocks.prisma.integrationRun.findFirst.mockResolvedValueOnce({
      id: "run-existing",
      status: "dry_run_queued",
      requestedLimit: 25,
      dryRun: true
    });

    await expect(recordIntegrationDryRunState(null, formData)).resolves.toMatchObject({
      ok: true,
      message: "Проверка подключения уже находится в backend-очереди.",
      integrationId: "integration-1",
      runId: "run-existing"
    });

    expect(mocks.prisma.integrationRun.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        source: "zendesk",
        mode: "native_helpdesk",
        dryRun: true,
        status: { in: ["dry_run_queued", "queued", "running"] }
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        requestedLimit: true,
        dryRun: true
      }
    });
    expect(mocks.prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "integration_setup:workspace-1:integration-1:zendesk:native_helpdesk:true"
    );
    expect(mocks.prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.integrationRun.findFirst.mock.invocationCallOrder[0]
    );
    expect(mocks.prisma.integrationRun.create).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJob.create).not.toHaveBeenCalled();
  });

  it("rejects native setup queueing without a required token before creating a run", async () => {
    const { recordIntegrationDryRunState } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("zendesk", "native_helpdesk");
    formData.delete("nativeToken");
    mocks.prisma.integration.upsert.mockResolvedValueOnce({
      id: "integration-1",
      source: "zendesk",
      displayName: "Zendesk",
      status: "queued",
      configJson: "{}"
    });

    await expect(recordIntegrationDryRunState(null, formData)).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("secret slots")
    });

    expect(mocks.prisma.integrationRun.create).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJob.create).not.toHaveBeenCalled();
  });

  it("rejects data source setup queueing without a required secret before creating a run", async () => {
    const { recordIntegrationDryRunState } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("ytsaurus", "data_source");
    formData.set("baseUrl", "https://yt.example.com");
    formData.delete("nativeToken");
    formData.delete("dataSourceSecret");
    mocks.prisma.integration.upsert.mockResolvedValueOnce({
      id: "integration-1",
      source: "ytsaurus",
      displayName: "YTsaurus",
      status: "queued",
      configJson: "{}"
    });

    await expect(recordIntegrationDryRunState(null, formData)).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("secret slots")
    });

    expect(mocks.prisma.integrationRun.create).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJob.create).not.toHaveBeenCalled();
  });

  it("preserves queued run and job ids when bridging tRPC input to the action", async () => {
    const { recordIntegrationDryRunFromInput } = await import("@/lib/integration-actions");

    await expect(
      recordIntegrationDryRunFromInput({
        source: "custom_api",
        sourceLabel: "Custom API",
        mode: "custom_api",
        baseUrl: "https://support.example.com",
        maxTickets: 25,
        batchSize: 10,
        dateRangeDays: 30,
        ticketId: "",
        userLogin: "",
        dryRun: true,
        deduplicate: true,
        config: {}
      })
    ).resolves.toEqual({
      ok: true,
      message: "Проверка подключения поставлена в backend-очередь. Запуск выполнит connector runner.",
      integrationId: "integration-1",
      runId: "run-1",
      jobId: "job-1",
      reusedQueuedRun: false
    });

    expect(mocks.prisma.integrationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        actorId: "user-1",
        source: "custom_api",
        mode: "custom_api",
        status: "dry_run_queued",
        dryRun: true,
        requestedLimit: 25
      })
    });
    expect(mocks.prisma.backendJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payloadJson: expect.stringContaining('"integrationRunId":"run-1"')
      })
    });
  });

  it("preserves reused queued run ids without inventing a backend job id", async () => {
    const { recordIntegrationDryRun } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("custom_api", "custom_api");
    formData.set("dryRun", "true");
    mocks.prisma.integrationRun.findFirst.mockResolvedValueOnce({
      id: "run-reused",
      status: "dry_run_queued",
      requestedLimit: 25,
      dryRun: true
    });

    await expect(recordIntegrationDryRun(formData)).resolves.toEqual({
      integrationId: "integration-1",
      runId: "run-reused",
      message: "Проверка подключения уже находится в backend-очереди.",
      reusedExistingRun: true,
      reusedQueuedRun: true
    });

    expect(mocks.prisma.integrationRun.create).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJob.create).not.toHaveBeenCalled();
  });

  it("accepts YDB data source setup with grpc endpoint and stores credentials in the data source slot", async () => {
    const { saveIntegrationConfigurationState } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("ydb", "data_source");
    formData.set("baseUrl", "grpc://ydb.example.com:2136/local");
    formData.set("dataSourceSecret", JSON.stringify({ username: "qa", password: "secret" }));
    formData.set("dataSourceQuery", "SELECT * FROM conversations LIMIT 100");

    await expect(saveIntegrationConfigurationState(null, formData)).resolves.toMatchObject({
      ok: true,
      integrationId: "integration-1"
    });

    expect(mocks.prisma.integration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: "ydb",
          type: "data_source",
          baseUrl: "grpc://ydb.example.com:2136/local",
          configJson: expect.stringContaining("SELECT * FROM conversations LIMIT 100")
        })
      })
    );
    expect(mocks.upsertIntegrationSecretSlot).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        kind: "data_source_credentials",
        authMode: "data_source_secret",
        secret: JSON.stringify({ username: "qa", password: "secret" })
      })
    );
  });

  it("rejects YDB data source setup with http endpoint before queueing", async () => {
    const { saveIntegrationConfigurationState } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("ydb", "data_source");
    formData.set("baseUrl", "https://ydb.example.com/local");
    formData.set("dataSourceSecret", JSON.stringify({ username: "qa", password: "secret" }));

    await expect(saveIntegrationConfigurationState(null, formData)).resolves.toMatchObject({
      ok: false,
      message: "Base URL должен начинаться с grpc:// или grpcs://."
    });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.integration.upsert).not.toHaveBeenCalled();
  });

  it("rejects YTsaurus data source setup with grpc endpoint", async () => {
    const { saveIntegrationConfigurationState } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("ytsaurus", "data_source");
    formData.set("baseUrl", "grpc://yt.example.com");
    formData.set("dataSourceSecret", "yt-token");

    await expect(saveIntegrationConfigurationState(null, formData)).resolves.toMatchObject({
      ok: false,
      message: "Base URL должен начинаться с http:// или https://."
    });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.integration.upsert).not.toHaveBeenCalled();
  });

  it("stores uppercase YTsaurus data source secrets in the token slot", async () => {
    const { saveIntegrationConfigurationState } = await import("@/lib/integration-actions");
    const formData = baseSetupForm("YTsaurus", "data_source");
    formData.set("baseUrl", "https://yt.example.com");
    formData.set("dataSourceSecret", "yt-oauth-token");
    formData.set("dataSourceTablePath", "//home/support/conversations");

    await expect(saveIntegrationConfigurationState(null, formData)).resolves.toMatchObject({
      ok: true,
      integrationId: "integration-1"
    });

    expect(mocks.upsertIntegrationSecretSlot).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        kind: "data_source_token",
        authMode: "data_source_secret",
        secret: "yt-oauth-token"
      })
    );
  });

  it("runs diagnostics only for integration managers and writes the OTRS diagnostics audit action", async () => {
    const { runOtrsDiagnosticsAction } = await import("@/lib/integration-actions");
    const formData = new FormData();
    formData.set("integrationId", "integration-1");
    formData.set("manualTicketId", "101");
    mocks.runOtrsConnectorDiagnostics.mockResolvedValue({
      id: "diagnostic-1",
      status: "succeeded",
      summary: { ok: true }
    });

    await expect(runOtrsDiagnosticsAction(formData)).resolves.toMatchObject({
      diagnosticRunId: "diagnostic-1",
      status: "succeeded"
    });

    expect(mocks.canManageIntegrations).toHaveBeenCalledWith("ADMIN");
    expect(mocks.runOtrsConnectorDiagnostics).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      actorId: "user-1",
      manualTicketId: "101"
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "integration.otrs_diagnostics_run",
        targetId: "integration-1",
        metadata: {
          diagnosticRunId: "diagnostic-1",
          status: "succeeded",
          hasManualTicketId: true
        }
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/integrations/integration-1");

    mocks.canManageIntegrations.mockReturnValueOnce(false);
    await expect(runOtrsDiagnosticsAction(formData)).rejects.toThrow("Нет прав на управление интеграциями.");
  });

  it("creates OTRS previews in manual-ticket and ticket-search modes", async () => {
    const { createOtrsPreviewAction } = await import("@/lib/integration-actions");
    const manualForm = new FormData();
    manualForm.set("integrationId", "integration-1");
    manualForm.set("mode", "manual_ticket_ids");
    manualForm.set("manualTicketIds", "101, 202\n303");
    const searchForm = new FormData();
    searchForm.set("integrationId", "integration-1");
    searchForm.set("mode", "ticket_search");
    searchForm.set("filtersJson", JSON.stringify({ QueueIDs: [1], StateType: "Open" }));
    mocks.createOtrsPreview
      .mockResolvedValueOnce({ run: { id: "run-manual" }, diagnosticRun: { id: "diagnostic-manual" }, items: [] })
      .mockResolvedValueOnce({ run: { id: "run-search" }, diagnosticRun: { id: "diagnostic-search" }, items: [] });

    await createOtrsPreviewAction(manualForm);
    await createOtrsPreviewAction(searchForm);

    expect(mocks.createOtrsPreview).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      actorId: "user-1",
      mode: "manual_ticket_ids",
      manualTicketIds: ["101", "202", "303"]
    });
    expect(mocks.createOtrsPreview).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      actorId: "user-1",
      mode: "ticket_search",
      filters: { QueueIDs: [1], StateType: "Open" }
    });
  });

  it("runs the integrations queue only for the current workspace", async () => {
    const { runIntegrationQueueState } = await import("@/lib/integration-actions");
    const formData = new FormData();
    formData.set("limit", "7");

    await expect(runIntegrationQueueState(null, formData)).resolves.toMatchObject({
      ok: true,
      processed: 2,
      succeeded: 1,
      failed: 1
    });

    expect(mocks.runDueBackendJobs).toHaveBeenCalledWith({
      limit: 7,
      queueName: "integrations",
      workerId: "ui-integrations-user-1",
      workspaceId: "workspace-1"
    });
    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      action: "backend_jobs.run_from_integrations_ui",
      targetType: "backend_job",
      targetId: "integrations",
      metadata: {
        limit: 7,
        processed: 2,
        succeeded: 1,
        failed: 1
      }
    });
  });

  it("queues selected OTRS preview items through the backend job service", async () => {
    const { queueSelectedOtrsImportAction } = await import("@/lib/integration-actions");
    const formData = new FormData();
    formData.set("integrationId", "integration-1");
    formData.set("integrationRunId", "run-1");
    formData.set("integrationRunItemIds", "item-1");
    mocks.queueSelectedOtrsImportJob.mockResolvedValue({
      run: { id: "run-1", status: "queued", requestedLimit: 1, dryRun: false },
      job: { id: "job-1", status: "QUEUED" }
    });

    await expect(queueSelectedOtrsImportAction(formData)).resolves.toMatchObject({
      run: { id: "run-1" },
      job: { id: "job-1" }
    });

    expect(mocks.queueSelectedOtrsImportJob).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      integrationRunItemIds: ["item-1"]
    });
  });

  it("does not deduplicate selected OTRS item IDs before calling the queue service", async () => {
    const { queueSelectedOtrsImportAction } = await import("@/lib/integration-actions");
    const formData = new FormData();
    formData.set("integrationId", "integration-1");
    formData.set("integrationRunId", "run-1");
    formData.append("integrationRunItemIds", "item-1");
    formData.append("integrationRunItemIds", "item-1");
    mocks.queueSelectedOtrsImportJob.mockRejectedValue(new Error("Список обращений для импорта содержит дубликаты."));

    await expect(queueSelectedOtrsImportAction(formData)).rejects.toThrow("Список обращений для импорта содержит дубликаты.");

    expect(mocks.queueSelectedOtrsImportJob).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      integrationRunItemIds: ["item-1", "item-1"]
    });
  });

  it("returns 400 from the selected OTRS import API for duplicate and invalid selections", async () => {
    const { POST } = await import("@/app/api/v1/integrations/[integrationId]/import/route");
    const context = { params: Promise.resolve({ integrationId: "integration-1" }) };

    mocks.queueSelectedOtrsImportJob.mockRejectedValueOnce(new Error("Список обращений для импорта содержит дубликаты."));
    const duplicateResponse = await POST(
      new Request("https://qc.example.test/api/v1/integrations/integration-1/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-duplicate"
        },
        body: JSON.stringify({
          integrationRunId: "run-1",
          integrationRunItemIds: ["item-1", "item-1"]
        })
      }),
      context
    );
    const duplicateBody = await duplicateResponse.json();

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.headers.get("x-request-id")).toBe("request-duplicate");
    expect(duplicateBody.error).toMatchObject({
      code: "bad_request",
      message: "Список обращений для импорта содержит дубликаты.",
      requestId: "request-duplicate"
    });

    mocks.queueSelectedOtrsImportJob.mockRejectedValueOnce(
      new Error("Выбранные обращения должны быть previewed-строками указанного preview-run.")
    );
    const invalidResponse = await POST(
      new Request("https://qc.example.test/api/v1/integrations/integration-1/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-invalid"
        },
        body: JSON.stringify({
          integrationRunId: "run-1",
          integrationRunItemIds: ["item-foreign"]
        })
      }),
      context
    );
    const invalidBody = await invalidResponse.json();

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.headers.get("x-request-id")).toBe("request-invalid");
    expect(invalidBody.error).toMatchObject({
      code: "bad_request",
      message: "Выбранные обращения должны быть previewed-строками указанного preview-run.",
      requestId: "request-invalid"
    });
  });

  it("returns 409 from the selected OTRS import API when the preview run is already queued", async () => {
    const { POST } = await import("@/app/api/v1/integrations/[integrationId]/import/route");
    mocks.queueSelectedOtrsImportJob.mockRejectedValueOnce(
      new Error("Preview-run уже поставлен в очередь или больше недоступен для выборочного импорта.")
    );

    const response = await POST(
      new Request("https://qc.example.test/api/v1/integrations/integration-1/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-conflict"
        },
        body: JSON.stringify({
          integrationRunId: "run-1",
          integrationRunItemIds: ["item-1"]
        })
      }),
      { params: Promise.resolve({ integrationId: "integration-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(response.headers.get("x-request-id")).toBe("request-conflict");
    expect(body.error).toMatchObject({
      code: "conflict",
      message: "Preview-run уже поставлен в очередь или больше недоступен для выборочного импорта.",
      requestId: "request-conflict"
    });
  });

  it("returns 409 from the selected OTRS import API when required secret slots are missing", async () => {
    const { POST } = await import("@/app/api/v1/integrations/[integrationId]/import/route");
    mocks.queueSelectedOtrsImportJob.mockRejectedValueOnce(new Error("Не заполнены требуемые secret slots: auth_password."));

    const response = await POST(
      new Request("https://qc.example.test/api/v1/integrations/integration-1/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-selected-missing-secret"
        },
        body: JSON.stringify({
          integrationRunId: "run-1",
          integrationRunItemIds: ["item-1"]
        })
      }),
      { params: Promise.resolve({ integrationId: "integration-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({
      code: "conflict",
      message: "Не заполнены требуемые secret slots: auth_password.",
      requestId: "request-selected-missing-secret"
    });
  });

  it("maps enterprise connector import guard errors to a controlled REST import response", async () => {
    const { POST } = await import("@/app/api/v1/integrations/[integrationId]/imports/route");
    mocks.queueIntegrationImportJob.mockRejectedValueOnce(
      new Error("Корпоративные источники требуют защищенной настройки OAuth-доступов.")
    );

    const response = await POST(
      new Request("https://qc.example.test/api/v1/integrations/integration-1/imports", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-enterprise-import"
        },
        body: JSON.stringify({
          dryRun: false,
          requestedLimit: 10
        })
      }),
      { params: Promise.resolve({ integrationId: "integration-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(response.headers.get("x-request-id")).toBe("request-enterprise-import");
    expect(body.error).toMatchObject({
      code: "conflict",
      message: "Корпоративные источники требуют защищенной настройки OAuth-доступов.",
      requestId: "request-enterprise-import"
    });
    expect(mocks.queueIntegrationImportJob).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      integrationId: "integration-1",
      dryRun: false,
      requestedLimit: 10,
      runAfter: undefined
    });
  });

  it("maps missing integration secret slot errors to a controlled REST import response", async () => {
    const { POST } = await import("@/app/api/v1/integrations/[integrationId]/imports/route");
    mocks.queueIntegrationImportJob.mockRejectedValueOnce(new Error("Не заполнены требуемые secret slots: auth_password."));

    const response = await POST(
      new Request("https://qc.example.test/api/v1/integrations/integration-1/imports", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-missing-secret"
        },
        body: JSON.stringify({
          dryRun: true,
          requestedLimit: 10
        })
      }),
      { params: Promise.resolve({ integrationId: "integration-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(response.headers.get("x-request-id")).toBe("request-missing-secret");
    expect(body.error).toMatchObject({
      code: "conflict",
      message: "Не заполнены требуемые secret slots: auth_password.",
      requestId: "request-missing-secret"
    });
  });
});
