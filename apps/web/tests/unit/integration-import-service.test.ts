import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    integration: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    integrationRun: {
      create: vi.fn(),
      findFirst: vi.fn()
    },
    backendJob: {
      create: vi.fn()
    }
  };

  return {
    prisma,
    auditLog: vi.fn()
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

describe("integration import service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("queues an integration import job for the current workspace", async () => {
    const { queueIntegrationImportJob } = await import("@/lib/integration-import-service");
    mocks.prisma.integration.findFirst.mockResolvedValue({
      id: "integration-1",
      workspaceId: "workspace-1",
      source: "zendesk",
      type: "native_helpdesk",
      importLimit: 25
    });
    mocks.prisma.integrationRun.create.mockResolvedValue({
      id: "run-1",
      status: "queued",
      requestedLimit: 25,
      dryRun: false
    });
    mocks.prisma.backendJob.create.mockResolvedValue({
      id: "job-1",
      status: "QUEUED"
    });
    mocks.prisma.integration.update.mockResolvedValue({});

    const result = await queueIntegrationImportJob({
      workspaceId: "workspace-1",
      actorId: "user-1",
      integrationId: "integration-1"
    });

    expect(mocks.prisma.integration.findFirst).toHaveBeenCalledWith({
      where: {
        id: "integration-1",
        workspaceId: "workspace-1"
      }
    });
    expect(mocks.prisma.integrationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        actorId: "user-1",
        source: "zendesk",
        mode: "native_helpdesk",
        status: "queued",
        dryRun: false,
        requestedLimit: 25
      })
    });
    expect(mocks.prisma.backendJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        type: "INTEGRATION_IMPORT",
        status: "QUEUED",
        queueName: "integrations",
        priority: 50,
        createdById: "user-1",
        payloadJson: expect.stringContaining('"integrationRunId":"run-1"')
      })
    });
    expect(mocks.prisma.integration.update).toHaveBeenCalledWith({
      where: { id: "integration-1" },
      data: expect.objectContaining({
        status: "queued",
        lastImportAt: expect.any(Date),
        lastError: null
      })
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "integration.import_queued",
        targetId: "integration-1"
      }),
      mocks.prisma
    );
    expect(result).toMatchObject({
      run: {
        id: "run-1",
        status: "queued"
      },
      job: {
        id: "job-1",
        status: "QUEUED"
      }
    });
  });

  it("throws when the integration does not belong to the workspace", async () => {
    const { queueIntegrationImportJob } = await import("@/lib/integration-import-service");
    mocks.prisma.integration.findFirst.mockResolvedValue(null);

    await expect(
      queueIntegrationImportJob({
        workspaceId: "workspace-1",
        actorId: "user-1",
        integrationId: "other-workspace-integration"
      })
    ).rejects.toThrow("Интеграция не найдена.");
  });

  it("queues a selected OTRS import job with explicit operation payload", async () => {
    const { queueSelectedOtrsImportJob } = await import("@/lib/integration-import-service");
    mocks.prisma.integration.findFirst.mockResolvedValue({
      id: "integration-1",
      workspaceId: "workspace-1",
      source: "otrs",
      type: "otrs_family",
      importLimit: 25
    });
    mocks.prisma.integrationRun.findFirst.mockResolvedValue({
      id: "run-1",
      status: "previewed",
      requestedLimit: 1,
      dryRun: true
    });
    mocks.prisma.backendJob.create.mockResolvedValue({
      id: "job-1",
      status: "QUEUED"
    });
    mocks.prisma.integration.update.mockResolvedValue({});

    const result = await queueSelectedOtrsImportJob({
      workspaceId: "workspace-1",
      actorId: "user-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      integrationRunItemIds: ["item-1"]
    });

    expect(mocks.prisma.backendJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        type: "INTEGRATION_IMPORT",
        status: "QUEUED",
        queueName: "integrations",
        priority: 50,
        createdById: "user-1",
        payloadJson: JSON.stringify({
          operation: "otrs_selected_import",
          integrationId: "integration-1",
          integrationRunId: "run-1",
          integrationRunItemIds: ["item-1"]
        })
      })
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "integration.otrs_selected_import_queued",
        targetId: "integration-1",
        metadata: expect.objectContaining({
          operation: "otrs_selected_import",
          integrationRunItemIds: ["item-1"]
        })
      }),
      mocks.prisma
    );
    expect(result).toMatchObject({
      run: {
        id: "run-1",
        status: "queued"
      },
      job: {
        id: "job-1",
        status: "QUEUED"
      }
    });
  });
});
