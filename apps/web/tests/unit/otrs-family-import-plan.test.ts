import {
  createOtrsGenericInterfaceServer,
  type OtrsGenericInterfaceServer
} from "../fixtures/otrs-genericinterface-server";
import { otrsFixtureAttachmentBase64 } from "../fixtures/otrs-ticket-fixtures";
import { createOtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { buildDefaultOtrsConnectorConfig, type OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { OtrsConnectorError } from "@/lib/integrations/otrs-family/errors";
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
    integrations: [{ id: "integration-1", workspaceId: "workspace-1", status: "ready" }] as Array<Record<string, unknown>>,
    conversations: [] as Array<Record<string, unknown>>,
    messages: [] as Array<Record<string, unknown>>,
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

    if (where.status !== undefined) {
      if (typeof where.status === "object" && where.status !== null && "in" in where.status) {
        if (!(where.status.in as string[]).includes(String(item.status))) {
          return false;
        }
      } else if (typeof where.status === "object" && where.status !== null && "not" in where.status) {
        if (item.status === where.status.not) {
          return false;
        }
      } else if (item.status !== where.status) {
        return false;
      }
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
      }),
      upsert: vi.fn(async ({ where, create, update }) => {
        const externalId = where.workspaceId_externalSource_externalId.externalId;
        const existing = state.conversations.find((conversationRow) => conversationRow.externalId === externalId);

        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const row = {
          id: `conversation-${externalId}`,
          ...create
        };
        state.conversations.push(row);
        return row;
      })
    },
    message: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const externalId = where.conversationId_externalId.externalId;
        const conversationId = where.conversationId_externalId.conversationId;
        const existing = state.messages.find(
          (messageRow) => messageRow.conversationId === conversationId && messageRow.externalId === externalId
        );

        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const row = {
          id: `message-${conversationId}-${externalId}`,
          ...create
        };
        state.messages.push(row);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const notIn = where.externalId?.notIn as string[] | undefined;
        const before = state.messages.length;
        state.messages = state.messages.filter(
          (messageRow) =>
            messageRow.conversationId !== where.conversationId || (notIn ? notIn.includes(String(messageRow.externalId)) : false)
        );
        return { count: before - state.messages.length };
      })
    },
    integration: {
      findFirst: vi.fn(async ({ where }) => state.integrations.find((integration) => matchesWhere(integration, where)) ?? null),
      updateMany: vi.fn(async ({ where, data }) => {
        const rows = state.integrations.filter((integration) => matchesWhere(integration, where));
        rows.forEach((row) => Object.assign(row, data));
        if (rows.length > 0) {
          state.integrationUpdates.push(data);
        }
        return { count: rows.length };
      })
    }
  };
  const dbWithTransaction = Object.assign(db, {
    $transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)) as unknown as (<T>(
      fn: (tx: typeof db) => Promise<T>
    ) => Promise<T>) &
      ReturnType<typeof vi.fn>
  });

  return { db: dbWithTransaction, state };
}

async function withOtrsGenericInterfaceServer<T>(
  options: Parameters<typeof createOtrsGenericInterfaceServer>[0],
  run: (server: OtrsGenericInterfaceServer) => Promise<T>
) {
  const server = await createOtrsGenericInterfaceServer(options);

  try {
    return await run(server);
  } finally {
    await server.close();
  }
}

function createRealOtrsClient(config: OtrsConnectorConfig, server: OtrsGenericInterfaceServer) {
  return createOtrsHttpClient({
    config,
    baseUrl: server.baseUrl,
    userLogin: "qa_api",
    password: "secret"
  });
}

describe("OTRS-family preview/import planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TicketSearch preview runs through the real OTRS GenericInterface HTTP client", async () => {
    await withOtrsGenericInterfaceServer({ ticketIds: ["101", "102", "103"] }, async (server) => {
      const { db, state } = createFakeDb();
      const config = configWithLimits({ searchLimit: 2 });
      const client = createRealOtrsClient(config, server);

      await createOtrsPreviewRun({
        db,
        client,
        workspaceId: "workspace-1",
        integration: {
          id: "integration-1",
          source: "otrs",
          baseUrl: server.baseUrl,
          config
        },
        userLogin: "qa_api",
        password: "secret",
        mode: "ticket_search",
        filters: {
          Queue: "Support::Contracts"
        }
      });

      expect(server.requests.map((request) => request.operation)).toEqual(["TicketSearch", "TicketGet", "TicketGet"]);
      expect(state.items.map((item) => item.externalId)).toEqual(["101", "102"]);
      expect(state.items.map((item) => item.status)).toEqual(["previewed", "previewed"]);
      expect(state.diagnosticRuns[0]).toMatchObject({
        status: "succeeded",
        mode: "ticket_search"
      });
    });
  });

  it("manual TicketID preview runs through the real OTRS GenericInterface HTTP client", async () => {
    await withOtrsGenericInterfaceServer({}, async (server) => {
      const { db, state } = createFakeDb();
      const config = configWithLimits({ manualTicketIdLimit: 2 });
      const client = createRealOtrsClient(config, server);

      await createOtrsPreviewRun({
        db,
        client,
        workspaceId: "workspace-1",
        integration: {
          id: "integration-1",
          source: "otrs",
          baseUrl: server.baseUrl,
          config
        },
        actorId: "user-1",
        userLogin: "qa_api",
        password: "secret",
        mode: "manual_ticket_ids",
        manualTicketIds: ["101", "102", "103"]
      });

      expect(server.requests.map((request) => [request.operation, request.ticketId])).toEqual([
        ["TicketGet", "101"],
        ["TicketGet", "102"]
      ]);
      expect(state.runs[0]).toMatchObject({
        dryRun: true,
        status: "previewed",
        mode: "manual_ticket_ids",
        requestedLimit: 2
      });
      expect(state.items.map((item) => item.externalId)).toEqual(["101", "102"]);
    });
  });

  it("selected import from a real OTRS preview writes conversations and discards attachment base64", async () => {
    await withOtrsGenericInterfaceServer(
      { ticketIds: ["101"], ticketGetMode: "ticket_get_attachments_base64" },
      async (server) => {
        const { db, state } = createFakeDb();
        const config = configWithLimits({ searchLimit: 1 });
        const client = createRealOtrsClient(config, server);

        const preview = await createOtrsPreviewRun({
          db,
          client,
          workspaceId: "workspace-1",
          integration: {
            id: "integration-1",
            source: "otrs",
            baseUrl: server.baseUrl,
            config
          },
          userLogin: "qa_api",
          password: "secret",
          mode: "ticket_search",
          filters: {
            Queue: "Support::Contracts"
          }
        });

        expect(preview.items).toHaveLength(1);
        expect(JSON.stringify(state)).not.toContain(otrsFixtureAttachmentBase64);
        expect(JSON.parse(String(state.items[0].warningsJson))).toEqual([
          expect.objectContaining({
            code: "attachment_external_link",
            detail: expect.objectContaining({
              contentDiscarded: true,
              filename: "ticket-101.txt"
            })
          })
        ]);

        const result = await importSelectedOtrsRunItems({
          db,
          workspaceId: "workspace-1",
          integrationId: "integration-1",
          integrationRunId: String(preview.run.id),
          selectedItemIds: [String(preview.items[0].id)]
        });

        expect(result).toEqual({
          importedCount: 1,
          errorCount: 0
        });
        expect(state.conversations).toHaveLength(1);
        expect(state.messages).toHaveLength(2);
        expect(state.conversations[0]).toMatchObject({
          externalSource: "otrs",
          externalId: "101",
          subject: "Fixture ticket 101"
        });
        expect(state.items[0]).toMatchObject({
          conversationId: "conversation-101",
          status: "imported",
          attachmentCount: 1
        });
        expect(state.runs[0]).toMatchObject({
          importedCount: 1,
          errorCount: 0,
          status: "imported",
          dryRun: false
        });
        expect(JSON.stringify(state)).not.toContain(otrsFixtureAttachmentBase64);
      }
    );
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

  it("deduplicates manual TicketID preview before fetching and creating run items", async () => {
    const { db, state } = createFakeDb();
    const client = {
      requestJson: vi.fn(async (request: OtrsOperationRequest) => ticket(request.url.includes("/102") ? "102" : "101"))
    };

    await createOtrsPreviewRun({
      db,
      client,
      workspaceId: "workspace-1",
      integration: {
        id: "integration-1",
        source: "otrs",
        baseUrl: "https://support.example.com/otrs",
        config: configWithLimits({ manualTicketIdLimit: 5 })
      },
      actorId: "user-1",
      userLogin: "qa_api",
      password: "secret",
      mode: "manual_ticket_ids",
      manualTicketIds: ["101", 101, "102"]
    });

    expect(client.requestJson).toHaveBeenCalledTimes(2);
    expect(client.requestJson.mock.calls.map(([request]) => request.url)).toEqual([
      "https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/101?UserLogin=qa_api&Password=secret&AllArticles=1&Attachments=1&GetAttachmentContents=0",
      "https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/102?UserLogin=qa_api&Password=secret&AllArticles=1&Attachments=1&GetAttachmentContents=0"
    ]);
    expect(state.items.map((item) => item.externalId)).toEqual(["101", "102"]);
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

  it("TicketSearch preview can authenticate through SessionCreate", async () => {
    const { db, state } = createFakeDb();
    const config: OtrsConnectorConfig = {
      ...configWithLimits({ searchLimit: 2 }),
      auth: {
        ticketSearch: "session",
        ticketGet: "credentials",
        sessionCreatePath: "/Session",
        sessionCreateMethod: "POST"
      },
      advanced: {
        routeOverridesEnabled: true
      },
      routes: {
        ...baseConfig.routes,
        ticketSearchPath: "/TicketSearch"
      }
    };
    const client = {
      requestJson: vi.fn(async (request: OtrsOperationRequest) => {
        if (request.operation === "SessionCreate") {
          return { SessionID: "session-1" };
        }

        if (request.operation === "TicketSearch") {
          return { TicketID: ["201", "202"] };
        }

        return ticket(request.url.includes("/202") ? "202" : "201");
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
        config
      },
      userLogin: "qa_api",
      password: "secret",
      mode: "ticket_search",
      filters: {
        Queue: "Raw"
      }
    });

    expect(client.requestJson.mock.calls.map(([request]) => request.operation)).toEqual([
      "SessionCreate",
      "TicketSearch",
      "TicketGet",
      "TicketGet"
    ]);
    expect(client.requestJson.mock.calls[1][0].body).toMatchObject({
      SessionID: "session-1"
    });
    expect(state.items.map((item) => item.externalId)).toEqual(["201", "202"]);
  });

  it("deduplicates TicketSearch results before fetching and creating run items", async () => {
    const { db, state } = createFakeDb();
    const client = {
      requestJson: vi.fn(async (request: OtrsOperationRequest) => {
        if (request.operation === "TicketSearch") {
          return { TicketID: ["201", "201", "202"] };
        }

        return ticket(request.url.includes("/202") ? "202" : "201");
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
        config: configWithLimits({ searchLimit: 5 })
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
  });

  it("updates preview run progress after creating preview items", async () => {
    const { db, state } = createFakeDb();
    const client = {
      requestJson: vi.fn(async (request: OtrsOperationRequest) => {
        if (request.url.includes("/702")) {
          return { Success: 1, Ticket: [] };
        }

        return ticket("701");
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
        config: configWithLimits({ manualTicketIdLimit: 5 })
      },
      actorId: "user-1",
      userLogin: "qa_api",
      password: "secret",
      mode: "manual_ticket_ids",
      manualTicketIds: ["701", "702"]
    });

    expect(state.items.map((item) => item.status)).toEqual(["previewed", "skipped"]);
    expect(state.runs[0]).toMatchObject({
      checkedCount: 2,
      importedCount: 0,
      skippedCount: 1,
      errorCount: 1
    });
  });

  it("marks preview diagnostic and integration run as failed when item creation aborts", async () => {
    const { db, state } = createFakeDb();
    const client = {
      requestJson: vi.fn(async () => {
        throw new Error("TicketGet timeout");
      })
    };

    await expect(
      createOtrsPreviewRun({
        db,
        client,
        workspaceId: "workspace-1",
        integration: {
          id: "integration-1",
          source: "otrs",
          baseUrl: "https://support.example.com/otrs",
          config: configWithLimits({ manualTicketIdLimit: 5 })
        },
        actorId: "user-1",
        userLogin: "qa_api",
        password: "secret",
        mode: "ticket_search",
        filters: {
          Queue: "Raw"
        }
      })
    ).rejects.toThrow("TicketGet timeout");

    expect(state.diagnosticRuns[0]).toMatchObject({
      status: "failed",
      finishedAt: expect.any(Date),
      errorMessage: "TicketGet timeout"
    });
    expect(state.runs[0]).toMatchObject({
      status: "failed",
      errorCount: 1,
      checkedCount: 0,
      errorMessage: "TicketGet timeout",
      finishedAt: expect.any(Date)
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

  it("preserves connector error codes on skipped preview items when TicketGet fails", async () => {
    const { db, state } = createFakeDb();
    const client = {
      requestJson: vi.fn(async () => {
        throw new OtrsConnectorError({
          code: "timeout",
          safeMessage: "OTRS did not respond in time."
        });
      })
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
      manualTicketIds: ["801"]
    });

    expect(state.items[0]).toMatchObject({
      externalId: "801",
      status: "skipped"
    });
    expect(JSON.parse(String(state.items[0].errorsJson))).toEqual([
      {
        code: "timeout",
        message: "TicketGet failed for TicketID 801: OTRS did not respond in time."
      }
    ]);
  });

  it("marks normalization and validation failures with a dedicated normalization_failed code", async () => {
    const { db, state } = createFakeDb();
    const client = {
      requestJson: vi.fn(async () => ticket("802"))
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
        baseUrl: "not-a-valid-base-url",
        config: configWithLimits({ manualTicketIdLimit: 5 })
      },
      userLogin: "qa_api",
      password: "secret",
      mode: "manual_ticket_ids",
      manualTicketIds: ["802"]
    });

    expect(state.items[0]).toMatchObject({
      externalId: "802",
      status: "skipped"
    });
    expect(JSON.parse(String(state.items[0].errorsJson))).toEqual([
      {
        code: "normalization_failed",
        message: "Normalization or validation failed for TicketID 802."
      }
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
        status: { in: ["previewed", "selected"] }
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
      status: "active",
      lastError: null,
      lastImportAt: expect.any(Date),
      lastSyncedAt: expect.any(Date),
      syncCursor: "401"
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      importedCount: 1,
      errorCount: 1
    });
  });

  it("finalizes the run even when the integration is disabled mid-import", async () => {
    const { db, state } = createFakeDb();
    state.runs.push({
      id: "run-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      source: "otrs",
      mode: "manual_ticket_ids",
      dryRun: true
    });
    state.items.push({
      id: "item-1",
      workspaceId: "workspace-1",
      integrationRunId: "run-1",
      externalId: "501",
      status: "previewed",
      warningsJson: "[]",
      errorsJson: "[]",
      normalizedPreviewJson: JSON.stringify(conversation("501"))
    });
    const importer = vi.fn(async (_workspaceId: string, payload: CustomConversationInput) => {
      state.integrations[0].status = "disabled";

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
      selectedItemIds: ["item-1"],
      importer
    });

    expect(result).toEqual({ importedCount: 1, errorCount: 0 });
    expect(state.runs[0]).toMatchObject({
      status: "imported",
      importedCount: 1,
      errorCount: 0,
      finishedAt: expect.any(Date)
    });
    expect(state.integrationUpdates).toEqual([]);
  });

  it("re-claims and imports items stuck in selected status after a crashed import run", async () => {
    const { db, state } = createFakeDb();
    state.runs.push({
      id: "run-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      source: "otrs",
      mode: "manual_ticket_ids",
      dryRun: true
    });
    state.items.push({
      id: "item-stuck",
      workspaceId: "workspace-1",
      integrationRunId: "run-1",
      externalId: "411",
      status: "selected",
      warningsJson: "[]",
      errorsJson: "[]",
      normalizedPreviewJson: JSON.stringify(conversation("411"))
    });

    const result = await importSelectedOtrsRunItems({
      db,
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      selectedItemIds: ["item-stuck"]
    });

    expect(result).toEqual({
      importedCount: 1,
      errorCount: 0
    });
    expect(state.items[0]).toMatchObject({
      id: "item-stuck",
      status: "imported",
      conversationId: "conversation-411"
    });
    expect(state.runs[0]).toMatchObject({
      status: "imported",
      importedCount: 1,
      errorCount: 0
    });
  });

  it("rejects selected import for disabled integrations before claiming preview rows", async () => {
    const { db, state } = createFakeDb();
    state.integrations[0].status = "disabled";
    state.runs.push({
      id: "run-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      source: "otrs",
      mode: "manual_ticket_ids",
      dryRun: true
    });
    state.items.push({
      id: "item-1",
      workspaceId: "workspace-1",
      integrationRunId: "run-1",
      externalId: "451",
      status: "previewed",
      warningsJson: "[]",
      errorsJson: "[]",
      normalizedPreviewJson: JSON.stringify(conversation("451"))
    });

    await expect(
      importSelectedOtrsRunItems({
        db,
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        integrationRunId: "run-1",
        selectedItemIds: ["item-1"]
      })
    ).rejects.toThrow("Интеграция отключена.");

    expect(db.integrationRunItem.updateMany).not.toHaveBeenCalled();
    expect(state.items[0]).toMatchObject({
      id: "item-1",
      status: "previewed"
    });
    expect(state.integrationUpdates).toEqual([]);
  });

  it("default importer uses the injected db boundary for conversation and message upserts", async () => {
    const { db, state } = createFakeDb();
    state.runs.push({
      id: "run-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      source: "otrs",
      mode: "manual_ticket_ids",
      dryRun: true
    });
    state.items.push({
      id: "item-1",
      workspaceId: "workspace-1",
      integrationRunId: "run-1",
      externalId: "501",
      status: "previewed",
      warningsJson: "[]",
      errorsJson: "[]",
      normalizedPreviewJson: JSON.stringify(conversation("501"))
    });

    await importSelectedOtrsRunItems({
      db,
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      selectedItemIds: ["item-1"]
    });

    expect(db.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_externalSource_externalId: {
            workspaceId: "workspace-1",
            externalSource: "otrs",
            externalId: "501"
          }
        }
      })
    );
    expect(db.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId_externalId: {
            conversationId: "conversation-501",
            externalId: "501-1"
          }
        }
      })
    );
    expect(state.items.find((item) => item.id === "item-1")).toMatchObject({
      conversationId: "conversation-501",
      status: "imported"
    });
  });

  it("empty selected import does not advance integration sync state or claim import success", async () => {
    const { db, state } = createFakeDb();
    state.runs.push({
      id: "run-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      source: "otrs",
      mode: "manual_ticket_ids",
      dryRun: true
    });

    const result = await importSelectedOtrsRunItems({
      db,
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      selectedItemIds: ["missing-item"]
    });

    expect(state.integrationUpdates).toEqual([
      {
        status: "ready",
        lastError: null
      }
    ]);
    expect(state.runs[0]).toMatchObject({
      importedCount: 0,
      errorCount: 0,
      status: "no_selection",
      dryRun: true,
      errorMessage: "No preview items were selected for import.",
      finishedAt: expect.any(Date)
    });
    expect(result).toEqual({
      importedCount: 0,
      errorCount: 0
    });
  });

  it("all-failed selected import does not advance integration sync state", async () => {
    const { db, state } = createFakeDb();
    state.runs.push({
      id: "run-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      source: "otrs",
      mode: "manual_ticket_ids",
      dryRun: true
    });
    state.items.push({
      id: "item-1",
      workspaceId: "workspace-1",
      integrationRunId: "run-1",
      externalId: "601",
      status: "previewed",
      warningsJson: "[]",
      errorsJson: "[]",
      normalizedPreviewJson: JSON.stringify(conversation("601"))
    });

    const result = await importSelectedOtrsRunItems({
      db,
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integrationRunId: "run-1",
      selectedItemIds: ["item-1"],
      importer: vi.fn(async () => {
        throw new Error("all failed");
      })
    });

    expect(state.integrationUpdates).toEqual([
      {
        status: "error",
        lastError: "All selected preview items failed to import."
      }
    ]);
    expect(state.items[0]).toMatchObject({
      status: "failed"
    });
    expect(state.runs[0]).toMatchObject({
      importedCount: 0,
      errorCount: 1,
      status: "failed",
      dryRun: false,
      errorMessage: "All selected preview items failed to import.",
      finishedAt: expect.any(Date)
    });
    expect(result).toEqual({
      importedCount: 0,
      errorCount: 1
    });
  });
});
