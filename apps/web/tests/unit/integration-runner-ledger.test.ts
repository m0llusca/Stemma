import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadHelpdeskAdapterConversations: vi.fn(),
  loadDataSourceAdapterConversations: vi.fn(),
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

vi.mock("@/lib/integrations/helpdesk-adapters/service", () => ({
  loadHelpdeskAdapterConversations: mocks.loadHelpdeskAdapterConversations
}));

vi.mock("@/lib/integrations/data-source-adapters/service", () => ({
  loadDataSourceAdapterConversations: mocks.loadDataSourceAdapterConversations
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

  it("rejects unsupported source-contract integration jobs before fetching connector data", async () => {
    const client = fakeClient();
    client.integration.findFirst.mockResolvedValue(
      integration({
        source: "salesforce",
        displayName: "Salesforce",
        type: "enterprise",
        baseUrl: "https://example.my.salesforce.com"
      })
    );
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
    ).rejects.toThrow("Корпоративные источники требуют защищенной настройки OAuth-доступов.");

    expect(fetch).not.toHaveBeenCalled();
    expect(client.integrationRun.update).not.toHaveBeenCalled();
    expect(client.integration.updateMany).not.toHaveBeenCalled();
  });

  it("routes native helpdesk runs through the adapter service without inline fetches", async () => {
    const client = fakeClient();
    client.integration.findFirst.mockResolvedValue(
      integration({
        source: "zendesk",
        displayName: "Zendesk",
        type: "native_helpdesk",
        baseUrl: "https://example.zendesk.com",
        configJson: JSON.stringify({ ticketId: "35436" })
      })
    );
    mocks.loadHelpdeskAdapterConversations.mockResolvedValue({
      conversations: [
        {
          externalSource: "zendesk",
          externalId: "35436",
          channel: "email",
          subject: "Zendesk ticket",
          status: "open",
          tags: ["zendesk"],
          customerName: "Customer",
          samplingReason: "Runner import",
          openedAt: "2026-05-09T08:00:00.000Z",
          messages: [
            {
              externalId: "35436-1",
              participantType: "customer",
              authorName: "Customer",
              body: "Hello from Zendesk",
              sentAt: "2026-05-09T08:00:00.000Z",
              isPrivate: false
            }
          ]
        }
      ],
      diagnostics: {
        requests: []
      }
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { runIntegrationConnector } = await import("@/lib/integrations/runner");

    const result = await runIntegrationConnector({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      dryRun: false,
      client: client as never
    });

    expect(mocks.loadHelpdeskAdapterConversations).toHaveBeenCalledWith({
      integration: expect.objectContaining({
        source: "zendesk",
        type: "native_helpdesk"
      }),
      ticketId: "35436",
      samplingReason: "Импорт Zendesk: обращение 35436."
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.source).toBe("zendesk");
    expect(result.mode).toBe("native_helpdesk");
    expect(result.checkedCount).toBe(1);
    expect(result.importedCount).toBe(1);
    expect(result.externalIds).toEqual(["35436"]);
  });

  it("routes data_source integrations through the data source service", async () => {
    const client = fakeClient();
    client.integration.findFirst.mockResolvedValue(
      integration({
        source: "ytsaurus",
        displayName: "YTsaurus/YT",
        type: "data_source",
        baseUrl: "https://yt.example.com",
        configJson: JSON.stringify({ tablePath: "//home/qc/conversations" })
      })
    );
    mocks.loadDataSourceAdapterConversations.mockResolvedValue({
      conversations: [
        {
          externalSource: "ytsaurus",
          externalId: "yt-conv-1",
          channel: "ticket",
          subject: "YTsaurus refund",
          status: "imported",
          customerName: "Анна",
          samplingReason: "Импорт YTsaurus.",
          openedAt: "2026-04-25T10:00:00.000Z",
          closedAt: null,
          messages: [
            {
              externalId: "yt-msg-1",
              participantType: "customer",
              authorName: "Анна",
              body: "Нужен возврат.",
              sentAt: "2026-04-25T10:00:00.000Z",
              isPrivate: false
            }
          ]
        }
      ],
      diagnostics: { requests: [] }
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { runIntegrationConnector } = await import("@/lib/integrations/runner");

    const result = await runIntegrationConnector({
      workspaceId: "workspace-1",
      integrationId: "integration-ytsaurus",
      dryRun: true,
      requestedLimit: 10,
      client: client as never
    });

    expect(mocks.loadDataSourceAdapterConversations).toHaveBeenCalledWith({
      integration: expect.objectContaining({
        source: "ytsaurus",
        type: "data_source"
      }),
      limit: 10
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: "ytsaurus",
      mode: "data_source",
      dryRun: true,
      checkedCount: 1,
      importedCount: 0,
      externalIds: ["yt-conv-1"]
    });
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

  it("runs a connector write guard inside the transaction before ledger side effects", async () => {
    const events: string[] = [];
    const tx = fakeClient();
    tx.conversation.upsert.mockImplementation(async () => {
      events.push("conversation-write");
      return { id: "conversation-1" };
    });
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
    const beforeWrite = vi.fn(async (client) => {
      expect(client).toBe(tx);
      events.push("guard");
    });
    const { runIntegrationConnector } = await import("@/lib/integrations/runner");

    await runIntegrationConnector({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      dryRun: false,
      beforeWrite
    });

    expect(events).toEqual(["fetch", "transaction", "guard", "conversation-write"]);
    expect(beforeWrite).toHaveBeenCalledTimes(1);
  });
});
