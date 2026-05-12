import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    integration: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    integrationRun: {
      update: vi.fn()
    },
    integrationRunItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    conversation: {
      upsert: vi.fn()
    },
    message: {
      upsert: vi.fn()
    },
    samplingRule: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

const now = new Date("2026-05-09T08:00:00.000Z");

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "integration-1",
    workspaceId: "workspace-1",
    source: "custom_api",
    displayName: "Custom API",
    type: "custom_api",
    status: "ready",
    baseUrl: "https://source.example.com",
    configJson: "{}",
    syncStateJson: "{}",
    authMode: "token",
    importLimit: 100,
    batchSize: 25,
    dateRangeDays: 30,
    schedule: null,
    syncCursor: null,
    lastSyncedAt: null,
    lastDryRunAt: null,
    lastImportAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    credentials: [],
    ...overrides
  };
}

function connectorPayload() {
  return {
    conversations: [
      {
        externalSource: "custom_api",
        externalId: "conv-1",
        channel: "ticket",
        subject: "Ledger test",
        status: "closed",
        tags: ["ledger"],
        customerName: "Customer",
        samplingReason: "Runner import",
        openedAt: "2026-05-09T08:00:00.000Z",
        messages: [
          {
            externalId: "m1",
            participantType: "customer",
            authorName: "Customer",
            body: "Hello",
            sentAt: "2026-05-09T08:00:00.000Z",
            isPrivate: false
          }
        ]
      }
    ]
  };
}

function fakeClient() {
  return {
    integration: {
      findFirst: vi.fn().mockResolvedValue(integration()),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    integrationRun: {
      update: vi.fn().mockResolvedValue({})
    },
    integrationRunItem: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "item-1" }),
      update: vi.fn().mockResolvedValue({})
    },
    conversation: {
      upsert: vi.fn().mockResolvedValue({ id: "conversation-1" })
    },
    message: {
      upsert: vi.fn().mockResolvedValue({ id: "message-1" })
    },
    samplingRule: {
      findMany: vi.fn().mockResolvedValue([])
    }
  };
}

describe("integration connector run ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records imported conversations as integration run items", async () => {
    const client = fakeClient();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(connectorPayload()), { status: 200 }))
    );
    const { runIntegrationConnector } = await import("@/lib/integrations/runner");

    await expect(
      runIntegrationConnector({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        integrationRunId: "run-1",
        dryRun: false,
        client: client as never
      })
    ).resolves.toMatchObject({
      importedCount: 1,
      checkedCount: 1,
      externalIds: ["conv-1"]
    });

    expect(client.integrationRunItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        integrationRunId: "run-1",
        externalId: "conv-1",
        status: "imported",
        conversationId: "conversation-1",
        articleCount: 1,
        errorsJson: "[]"
      })
    });
    expect(client.integrationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "succeeded",
        checkedCount: 1,
        importedCount: 1
      })
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects disabled integrations before fetching connector data", async () => {
    const client = fakeClient();
    client.integration.findFirst.mockResolvedValue(integration({ status: "disabled" }));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { runIntegrationConnector } = await import("@/lib/integrations/runner");

    await expect(
      runIntegrationConnector({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        integrationRunId: "run-1",
        dryRun: false,
        client: client as never
      })
    ).rejects.toThrow("Интеграция отключена.");

    expect(fetch).not.toHaveBeenCalled();
    expect(client.integrationRun.update).not.toHaveBeenCalled();
    expect(client.integration.updateMany).not.toHaveBeenCalled();
  });

  it("writes dry-run cursor data only to the run and leaves integration sync cursor/state unchanged", async () => {
    const client = fakeClient();
    client.integration.findFirst.mockResolvedValue(
      integration({
        syncCursor: "cursor-before",
        syncStateJson: JSON.stringify({ cursor: "cursor-before" })
      })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(connectorPayload()), { status: 200 }))
    );
    const { runIntegrationConnector } = await import("@/lib/integrations/runner");

    await runIntegrationConnector({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      dryRun: true,
      client: client as never
    });

    expect(client.integrationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "dry_run_ok",
        checkedCount: 1,
        importedCount: 0,
        cursorJson: expect.stringContaining("conv-1"),
        checkpointJson: expect.stringContaining("conv-1")
      })
    });
    expect(client.integration.updateMany).toHaveBeenCalledWith({
      where: {
        id: "integration-1",
        workspaceId: "workspace-1",
        status: { not: "disabled" }
      },
      data: expect.not.objectContaining({
        syncCursor: expect.anything(),
        syncStateJson: expect.anything()
      })
    });
  });

  it("wraps post-fetch conversation, ledger, run, and integration writes in one transaction", async () => {
    const events: string[] = [];
    const tx = fakeClient();
    mocks.prisma.integration.findFirst.mockResolvedValue(integration());
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      events.push("transaction");
      return callback(tx);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        events.push("fetch");
        return new Response(JSON.stringify(connectorPayload()), { status: 200 });
      })
    );
    const { runIntegrationConnector } = await import("@/lib/integrations/runner");

    await runIntegrationConnector({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      dryRun: false
    });

    expect(events).toEqual(["fetch", "transaction"]);
    expect(tx.conversation.upsert).toHaveBeenCalled();
    expect(tx.integrationRunItem.create).toHaveBeenCalled();
    expect(tx.integrationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "succeeded",
        importedCount: 1
      })
    });
    expect(tx.integration.updateMany).toHaveBeenCalledWith({
      where: {
        id: "integration-1",
        workspaceId: "workspace-1",
        status: { not: "disabled" }
      },
      data: expect.objectContaining({
        syncCursor: "conv-1"
      })
    });
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.integrationRunItem.create).not.toHaveBeenCalled();
  });
});
