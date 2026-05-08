import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    integration: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    canManageIntegrations: vi.fn(),
    createOtrsPreview: vi.fn(),
    getCurrentUser: vi.fn(),
    prisma,
    queueSelectedOtrsImportJob: vi.fn(),
    revalidatePath: vi.fn(),
    requireSessionApi: vi.fn(),
    runOtrsConnectorDiagnostics: vi.fn(),
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
  queueIntegrationImportJob: vi.fn(),
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
  runDueBackendJobs: vi.fn()
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

describe("OTRS integration actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.getCurrentUser.mockResolvedValue(authorizedUser());
    mocks.canManageIntegrations.mockReturnValue(true);
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: authorizedUser()
    });
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
    mocks.upsertIntegrationSecretSlot
      .mockResolvedValueOnce({ id: "password-slot", kind: "auth_password", fingerprint: null })
      .mockResolvedValueOnce({ id: "ca-slot", kind: "ca_bundle", fingerprint: "ca-fingerprint" });
    mocks.auditLog.mockResolvedValue({});
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
});
