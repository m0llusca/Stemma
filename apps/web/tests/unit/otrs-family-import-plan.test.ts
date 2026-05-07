import { buildDefaultOtrsConnectorConfig, type OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import {
  createOtrsPreviewItems,
  createOtrsPreviewRun,
  importSelectedOtrsRunItems
} from "@/lib/integrations/otrs-family/import-plan";
import type { OtrsOperationRequest } from "@/lib/integrations/otrs-family/requests";
import type { CustomConversationInput } from "@/lib/validation/custom-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const baseConfig = buildDefaultOtrsConnectorConfig();

function configWithLimits(limits: Partial<OtrsConnectorConfig["limits"]>): OtrsConnectorConfig {
  return {
    ...baseConfig,
    limits: {
      ...baseConfig.limits,
      ...limits
    }
  };
}

function ticket(ticketId: string, overrides: Record<string, unknown> = {}) {
  return {
    Success: 1,
    Ticket: {
      TicketID: ticketId,
      TicketNumber: `TN-${ticketId}`,
      Title: `Ticket ${ticketId}`,
      State: "open",
      Created: "2026-04-25 10:00:00",
      Article: [
        {
          ArticleID: `${ticketId}-1`,
          SenderType: "customer",
          From: "customer@example.com",
          Body: `Body ${ticketId}`,
          Created: "2026-04-25 10:01:00",
          IsVisibleForCustomer: 1
        }
      ],
      ...overrides
    }
  };
}

function conversation(externalId: string): CustomConversationInput {
  return {
    externalSource: "otrs",
    externalId,
    channel: "ticket",
    subject: `Ticket ${externalId}`,
    status: "open",
    tags: [],
    customerName: "customer@example.com",
    samplingReason: "Preview",
    openedAt: "2026-04-25T10:00:00.000Z",
    closedAt: null,
    messages: [
      {
        externalId: `${externalId}-1`,
        participantType: "customer",
        authorName: "customer@example.com",
        body: "Body",
        sentAt: "2026-04-25T10:01:00.000Z",
        isPrivate: false
      }
    ]
  };
}

function createFakeDb(existingExternalIds: string[] = []) {
  const state = {
    diagnosticRuns: [] as Array<Record<string, unknown>>,
    runs: [] as Array<Record<string, unknown>>,
    items: [] as Array<Record<string, unknown>>,
    integrationUpdates: [] as Array<Record<string, unknown>>
  };
  let diagnosticRunCount = 0;
  let runCount = 0;
  let itemCount = 0;

  const matchesWhere = (item: Record<string, unknown>, where: Record<string, unknown>) => {
    if (where.workspaceId !== undefined && item.workspaceId !== where.workspaceId) {
      return false;
    }

    if (where.integrationRunId !== undefined && item.integrationRunId !== where.integrationRunId) {
      return false;
    }

    if (where.status !== undefined && item.status !== where.status) {
      return false;
    }

    if (where.id && typeof where.id === "object" && "in" in where.id) {
      return (where.id.in as string[]).includes(String(item.id));
    }

    if (where.id !== undefined && item.id !== where.id) {
      return false;
    }

    return true;
  };

  const db = {
    integrationDiagnosticRun: {
      create: vi.fn(async ({ data }) => {
        const row = {
          id: `diagnostic-run-${++diagnosticRunCount}`,
          ...data
        };
        state.diagnosticRuns.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = state.diagnosticRuns.find((run) => run.id === where.id);
        Object.assign(row ?? {}, data);
        return row;
      })
    },
    integrationRun: {
      create: vi.fn(async ({ data }) => {
        const row = {
          id: `integration-run-${++runCount}`,
          ...data
        };
        state.runs.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }) =>
        state.runs.find(
          (run) =>
            run.id === where.id &&
            run.workspaceId === where.workspaceId &&
            (where.integrationId === undefined || run.integrationId === where.integrationId)
        ) ?? null
      ),
      update: vi.fn(async ({ where, data }) => {
        const row = state.runs.find((run) => run.id === where.id);
        Object.assign(row ?? {}, data);
        return row;
      })
    },
    integrationRunItem: {
      create: vi.fn(async ({ data }) => {
        const row = {
          id: `item-${++itemCount}`,
          ...data
        };
        state.items.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }) => state.items.filter((item) => matchesWhere(item, where))),
      update: vi.fn(async ({ where, data }) => {
        const row = state.items.find((item) => item.id === where.id);
        Object.assign(row ?? {}, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const rows = state.items.filter((item) => matchesWhere(item, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      })
    },
    conversation: {
      findUnique: vi.fn(async ({ where }) => {
        const externalId = where.workspaceId_externalSource_externalId.externalId;
        return existingExternalIds.includes(externalId) ? { id: `existing-${externalId}` } : null;
      })
    },
    integration: {
      update: vi.fn(async ({ data }) => {
        state.integrationUpdates.push(data);
        return data;
      })
    }
  };

  return { db, state };
}

describe("OTRS-family preview/import planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("manual TicketID preview fetches each ID up to the configured manual limit", async () => {
    const { db, state } = createFakeDb();
    const client = {
      requestJson: vi.fn(async (request: OtrsOperationRequest) => ticket(request.url.endsWith("/101") ? "101" : "102"))
    };

    await createOtrsPreviewRun({
      db,
      client,
      workspaceId: "workspace-1",
      integration: {
        id: "integration-1",
        source: "otrs",
        baseUrl: "https://support.example.com/otrs",
        config: configWithLimits({ manualTicketIdLimit: 2 })
      },
      actorId: "user-1",
      userLogin: "qa_api",
      password: "secret",
      mode: "manual_ticket_ids",
      manualTicketIds: ["101", "102", "103"]
    });

    expect(client.requestJson).toHaveBeenCalledTimes(2);
    expect(client.requestJson.mock.calls.map(([request]) => request.operation)).toEqual(["TicketGet", "TicketGet"]);
    expect(client.requestJson.mock.calls.map(([request]) => request.url)).toEqual([
      "https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/101?UserLogin=qa_api&Password=secret&AllArticles=1&Attachments=1&GetAttachmentContents=0",
      "https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/102?UserLogin=qa_api&Password=secret&AllArticles=1&Attachments=1&GetAttachmentContents=0"
    ]);
    expect(state.runs[0]).toMatchObject({
      dryRun: true,
      status: "previewed",
      mode: "manual_ticket_ids",
      requestedLimit: 2
    });
    expect(state.items).toHaveLength(2);
    expect(state.items.map((item) => item.status)).toEqual(["previewed", "previewed"]);
  });

  it("TicketSearch preview fetches IDs returned by search up to the configured search limit", async () => {
    const { db, state } = createFakeDb();
    const client = {
      requestJson: vi.fn(async (request: OtrsOperationRequest) => {
        if (request.operation === "TicketSearch") {
          return { TicketID: ["201", "202", "203"] };
        }

        return ticket(request.url.includes("/201") ? "201" : "202");
      })
    };

    await createOtrsPreviewRun({
      db,
      client,
      workspaceId: "workspace-1",
      integration: {
        id: "integration-1",
        source: "otrs",
        baseUrl: "https://support.example.com/otrs",
        config: configWithLimits({ searchLimit: 2 })
      },
      userLogin: "qa_api",
      password: "secret",
      mode: "ticket_search",
      filters: {
        Queue: "Raw"
      }
    });

    expect(client.requestJson.mock.calls.map(([request]) => request.operation)).toEqual(["TicketSearch", "TicketGet", "TicketGet"]);
    expect(state.items.map((item) => item.externalId)).toEqual(["201", "202"]);
    expect(state.diagnosticRuns[0]).toMatchObject({
      status: "succeeded",
      mode: "ticket_search"
    });
  });

  it("marks duplicate conversations as skipped before import", async () => {
    const { db, state } = createFakeDb(["301"]);
    const client = {
      requestJson: vi.fn(async () => ticket("301"))
    };

    await createOtrsPreviewItems({
      db,
      client,
      workspaceId: "workspace-1",
      integrationRunId: "integration-run-1",
      diagnosticRunId: "diagnostic-run-1",
      integration: {
        id: "integration-1",
        source: "otrs",
        baseUrl: "https://support.example.com/otrs",
        config: configWithLimits({ manualTicketIdLimit: 5 })
      },
      userLogin: "qa_api",
      password: "secret",
      mode: "manual_ticket_ids",
      manualTicketIds: ["301"]
    });

    expect(state.items[0]).toMatchObject({
      externalId: "301",
      status: "skipped"
    });
    expect(JSON.parse(String(state.items[0].warningsJson))).toEqual([
      expect.objectContaining({
        code: "duplicate_conversation"
      })
    ]);
  });

  it("selected import only imports selected preview rows from the same workspace and run", async () => {
    const { db, state } = createFakeDb();
    state.runs.push({
      id: "run-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      source: "otrs",
      mode: "manual_ticket_ids",
      dryRun: true
    });
    state.items.push(
      {
        id: "item-1",
        workspaceId: "workspace-1",
        integrationRunId: "run-1",
        externalId: "401",
        status: "previewed",
        warningsJson: JSON.stringify([{ code: "attachment_external_link", message: "Attachment stored as external metadata." }]),
        errorsJson: "[]",
        normalizedPreviewJson: JSON.stringify(conversation("401"))
      },
      {
        id: "item-2",
        workspaceId: "workspace-1",
        integrationRunId: "run-1",
        externalId: "402",
        status: "previewed",
        warningsJson: "[]",
        errorsJson: "[]",
        normalizedPreviewJson: JSON.stringify(conversation("402"))
      },
      {
        id: "item-other-workspace",
        workspaceId: "workspace-2",
        integrationRunId: "run-1",
        externalId: "403",
        status: "previewed",
        warningsJson: "[]",
        errorsJson: "[]",
        normalizedPreviewJson: JSON.stringify(conversation("403"))
      },
      {
        id: "item-other-run",
        workspaceId: "workspace-1",
        integrationRunId: "run-2",
        externalId: "404",
        status: "previewed",
        warningsJson: "[]",
        errorsJson: "[]",
        normalizedPreviewJson: JSON.stringify(conversation("404"))
      }
    );
    const importer = vi.fn(async (_workspaceId: string, payload: CustomConversationInput) => {
      if (payload.externalId === "402") {
        throw new Error("upstream validation failed");
      }

      return {
        id: `conversation-${payload.externalId}`,
        externalSource: payload.externalSource,
        externalId: payload.externalId,
        subject: payload.subject,
        messageCount: payload.messages.length
      };
    });

    const result = await importSelectedOtrsRunItems({
      db,
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      selectedItemIds: ["item-1", "item-2", "item-other-workspace", "item-other-run"],
      importer
    });

    expect(db.integrationRunItem.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        integrationRunId: "run-1",
        id: {
          in: ["item-1", "item-2", "item-other-workspace", "item-other-run"]
        },
        status: "previewed"
      },
      data: {
        status: "selected"
      }
    });
    expect(importer).toHaveBeenCalledTimes(2);
    expect(importer.mock.calls.map(([, payload]) => payload.externalId)).toEqual(["401", "402"]);
    expect(state.items.find((item) => item.id === "item-1")).toMatchObject({
      conversationId: "conversation-401",
      status: "imported",
      errorsJson: "[]"
    });
    expect(JSON.parse(String(state.items.find((item) => item.id === "item-1")?.warningsJson))).toEqual([
      expect.objectContaining({
        code: "attachment_external_link"
      })
    ]);
    expect(state.items.find((item) => item.id === "item-2")).toMatchObject({
      status: "failed"
    });
    expect(state.items.find((item) => item.id === "item-2")).not.toHaveProperty("conversationId");
    expect(JSON.parse(String(state.items.find((item) => item.id === "item-2")?.errorsJson))).toEqual([
      expect.objectContaining({
        code: "import_failed",
        message: "upstream validation failed"
      })
    ]);
    expect(state.items.find((item) => item.id === "item-other-workspace")?.status).toBe("previewed");
    expect(state.items.find((item) => item.id === "item-other-run")?.status).toBe("previewed");
    expect(state.runs[0]).toMatchObject({
      importedCount: 1,
      errorCount: 1,
      status: "imported",
      dryRun: false,
      finishedAt: expect.any(Date)
    });
    expect(state.integrationUpdates[0]).toMatchObject({
      lastImportAt: expect.any(Date),
      lastSyncedAt: expect.any(Date),
      syncCursor: "run-1"
    });
    expect(result).toEqual({
      importedCount: 1,
      errorCount: 1
    });
  });
});
