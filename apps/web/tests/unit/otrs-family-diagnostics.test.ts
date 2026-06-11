import {
  createOtrsGenericInterfaceServer,
  type OtrsGenericInterfaceServer
} from "../fixtures/otrs-genericinterface-server";
import { createOtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { OtrsConnectorError } from "@/lib/integrations/otrs-family/errors";
import { buildDefaultOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import {
  diagnosticStepDefinitions,
  deriveDiagnosticStatus,
  runOtrsDiagnostics
} from "@/lib/integrations/otrs-family/diagnostics";
import { runOtrsConnectorDiagnostics } from "@/lib/integrations/otrs-family/service";
import { describe, expect, it, vi } from "vitest";

const workspaceId = "workspace-1";
const integrationId = "integration-1";
const actorId = "user-1";
const baseUrl = "https://support.example.com/otrs";
const userLogin = "qa_api";
const password = "super-secret-password";
const caBundle = "-----BEGIN CERTIFICATE-----\nsecret-ca\n-----END CERTIFICATE-----";

type FakeTx = ReturnType<typeof createFakeTx>;

function createFakeTx(options: { duplicateConversation?: { id: string } | null } = {}) {
  const runs: unknown[] = [];
  const steps: unknown[] = [];
  const runUpdates: unknown[] = [];
  const conversationCreates: unknown[] = [];

  return {
    runs,
    steps,
    runUpdates,
    conversationCreates,
    integrationDiagnosticRun: {
      create: vi.fn(async (args) => {
        runs.push(args);
        return {
          id: "diagnostic-run-1",
          ...args.data,
          startedAt: new Date("2026-05-07T10:00:00.000Z")
        };
      }),
      update: vi.fn(async (args) => {
        runUpdates.push(args);
        return {
          id: args.where.id,
          ...args.data
        };
      })
    },
    integrationDiagnosticStep: {
      create: vi.fn(async (args) => {
        steps.push(args.data);
        return {
          id: `step-${args.data.position}`,
          ...args.data
        };
      })
    },
    conversation: {
      findUnique: vi.fn(async () => options.duplicateConversation ?? null),
      create: vi.fn(async (args) => {
        conversationCreates.push(args);
        return { id: "conversation-created", ...args.data };
      })
    },
    integration: {
      findFirst: vi.fn()
    },
    integrationCredential: {
      findMany: vi.fn()
    }
  };
}

function ticketGetPayload(ticketId = "42", articleCount = 2) {
  return {
    Success: 1,
    Ticket: {
      TicketID: ticketId,
      TicketNumber: `202605070000${ticketId}`,
      Title: `Ticket ${ticketId}`,
      State: "open",
      Queue: "Support",
      Priority: "3 normal",
      CustomerID: "customer-1",
      Owner: "Agent",
      Created: "2026-05-07 09:00:00",
      Article: Array.from({ length: articleCount }, (_, index) => ({
        ArticleID: `${ticketId}-${index + 1}`,
        SenderType: index % 2 === 0 ? "customer" : "agent",
        From: index % 2 === 0 ? "Customer" : "Agent",
        Subject: `Ticket ${ticketId}`,
        Body: `Article ${index + 1}`,
        Created: `2026-05-07 09:0${index}:00`,
        IsVisibleForCustomer: index % 2 === 0 ? 1 : 0
      }))
    }
  };
}

function createFakeClient(responses: unknown[]) {
  const requests: unknown[] = [];

  return {
    requests,
    client: {
      requestJson: vi.fn(async (request) => {
        requests.push(request);
        const response = responses.shift();

        if (response instanceof Error) {
          throw response;
        }

        return response;
      })
    }
  };
}

function createRunInput(
  tx: FakeTx,
  client: NonNullable<Parameters<typeof runOtrsDiagnostics>[0]["client"]>,
  overrides = {}
) {
  return {
    tx,
    workspaceId,
    integrationId,
    actorId,
    integration: {
      id: integrationId,
      workspaceId,
      source: "otrs",
      displayName: "Production OTRS",
      type: "otrs_family",
      baseUrl,
      configJson: JSON.stringify(buildDefaultOtrsConnectorConfig("otrs_ce_6"))
    },
    userLogin,
    password,
    caBundle,
    client,
    ...overrides
  };
}

function parsedStepDetails(tx: FakeTx) {
  return tx.steps.map((step) => {
    const record = step as { key: string; detailJson: string };
    return {
      key: record.key,
      detail: JSON.parse(record.detailJson)
    };
  });
}

function finalRunUpdate(tx: FakeTx) {
  return tx.runUpdates.at(-1) as { data: Record<string, unknown> };
}

function allPersistedJson(tx: FakeTx) {
  return JSON.stringify({
    runs: tx.runs,
    steps: tx.steps,
    updates: tx.runUpdates
  });
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

describe("OTRS-family diagnostics", () => {
  it("runs the success diagnostic path through the real OTRS GenericInterface HTTP client", async () => {
    await withOtrsGenericInterfaceServer({ ticketIds: ["101"] }, async (server) => {
      const tx = createFakeTx();
      const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
      const client = createOtrsHttpClient({
        config,
        baseUrl: server.baseUrl,
        userLogin,
        password
      });

      await runOtrsDiagnostics(
        createRunInput(tx, client, {
          integration: {
            id: integrationId,
            workspaceId,
            source: "otrs",
            displayName: "Production OTRS",
            type: "otrs_family",
            baseUrl: server.baseUrl,
            configJson: JSON.stringify(config)
          }
        })
      );

      expect(server.requests.map((request) => request.operation)).toEqual(["TicketSearch", "TicketGet"]);
      expect(server.requests[0]).toMatchObject({
        method: "GET",
        pathname: "/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket"
      });
      expect(server.requests[1]).toMatchObject({
        method: "GET",
        ticketId: "101"
      });
      expect(finalRunUpdate(tx).data.status).toBe("succeeded");

      const summary = JSON.parse(String(finalRunUpdate(tx).data.summaryJson));
      expect(summary).toMatchObject({
        searchedTicketIds: ["101"],
        fetchedTicketIds: ["101"],
        articleCountsByTicketId: {
          "101": 2
        },
        normalizedConversationCount: 1,
        duplicateCount: 0
      });
    });
  });

  it("runs TicketSearch diagnostics through SessionCreate when configured", async () => {
    const tx = createFakeTx();
    const config = {
      ...buildDefaultOtrsConnectorConfig("otrs_ce_6"),
      auth: {
        ticketSearch: "session" as const,
        ticketGet: "credentials" as const,
        sessionCreatePath: "/Session",
        sessionCreateMethod: "POST" as const
      },
      advanced: {
        routeOverridesEnabled: true
      },
      routes: {
        ticketSearchPath: "/TicketSearch",
        ticketGetPath: "/Ticket/{TicketID}",
        ticketSearchMethod: "POST" as const,
        ticketGetMethod: "GET" as const
      },
      requestMode: {
        ticketSearch: "post_json" as const,
        ticketGet: "get_query" as const
      }
    };
    const { client, requests } = createFakeClient([{ SessionID: "session-1" }, { TicketID: ["102"] }, ticketGetPayload("102")]);

    await runOtrsDiagnostics(
      createRunInput(tx, client, {
        integration: {
          id: integrationId,
          workspaceId,
          source: "otrs",
          displayName: "Production OTRS",
          type: "otrs_family",
          baseUrl,
          configJson: JSON.stringify(config)
        }
      })
    );

    expect(requests.map((request) => (request as { operation: string }).operation)).toEqual([
      "SessionCreate",
      "TicketSearch",
      "TicketGet"
    ]);
    expect((requests[1] as { body?: unknown }).body).toMatchObject({
      SessionID: "session-1"
    });
    expect(finalRunUpdate(tx).data.status).toBe("succeeded");
  });

  it("runs the auth failure diagnostic path through the real OTRS GenericInterface HTTP client", async () => {
    await withOtrsGenericInterfaceServer({ mode: "auth_failure" }, async (server) => {
      const tx = createFakeTx();
      const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
      const client = createOtrsHttpClient({
        config,
        baseUrl: server.baseUrl,
        userLogin,
        password
      });

      await runOtrsDiagnostics(
        createRunInput(tx, client, {
          integration: {
            id: integrationId,
            workspaceId,
            source: "otrs",
            displayName: "Production OTRS",
            type: "otrs_family",
            baseUrl: server.baseUrl,
            configJson: JSON.stringify(config)
          }
        })
      );

      expect(server.requests.map((request) => request.operation)).toEqual(["TicketSearch"]);
      expect(
        tx.steps.map((step) => {
          const record = step as { key: string; status: string };
          return [record.key, record.status];
        })
      ).toEqual([
        ["config", "succeeded"],
        ["tls", "succeeded"],
        ["webservice", "succeeded"],
        ["auth", "failed"],
        ["ticket_search", "skipped"],
        ["ticket_get", "skipped"],
        ["normalize", "skipped"],
        ["db_dry_run", "skipped"]
      ]);
      expect(finalRunUpdate(tx).data).toMatchObject({
        status: "failed",
        errorCode: "auth_failed"
      });
      expect(allPersistedJson(tx)).not.toContain(password);
      expect(allPersistedJson(tx)).not.toContain(userLogin);
    });
  });

  it("starts a run as running, persists ordered steps, and finishes succeeded with a ticket summary", async () => {
    const tx = createFakeTx();
    const fakeClient = createFakeClient([{ TicketID: ["42"] }, ticketGetPayload("42", 2) ]);

    await runOtrsDiagnostics(createRunInput(tx, fakeClient.client));

    expect(tx.integrationDiagnosticRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId,
        integrationId,
        actorId,
        status: "running",
        mode: "ticket_search"
      })
    });
    expect(tx.steps.map((step) => (step as { key: string }).key)).toEqual(diagnosticStepDefinitions.map((step) => step.key));
    expect(tx.steps.map((step) => (step as { position: number }).position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(finalRunUpdate(tx).data.status).toBe("succeeded");
    expect(deriveDiagnosticStatus(tx.steps as Parameters<typeof deriveDiagnosticStatus>[0])).toBe("succeeded");

    const summary = JSON.parse(String(finalRunUpdate(tx).data.summaryJson));
    expect(summary).toMatchObject({
      searchedTicketIds: ["42"],
      fetchedTicketIds: ["42"],
      articleCountsByTicketId: {
        "42": 2
      }
    });
  });

  it("finishes warning when db_dry_run finds an existing Conversation without writing conversations", async () => {
    const tx = createFakeTx({
      duplicateConversation: {
        id: "conversation-1"
      }
    });
    const fakeClient = createFakeClient([{ TicketID: ["42"] }, ticketGetPayload("42", 1) ]);

    await runOtrsDiagnostics(createRunInput(tx, fakeClient.client));

    expect(finalRunUpdate(tx).data.status).toBe("warning");
    expect(tx.conversation.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_externalSource_externalId: {
          workspaceId,
          externalSource: "otrs",
          externalId: "42"
        }
      },
      select: {
        id: true
      }
    });
    expect(tx.conversation.create).not.toHaveBeenCalled();

    const dbStep = parsedStepDetails(tx).find((step) => step.key === "db_dry_run");
    expect(dbStep?.detail).toMatchObject({
      duplicateCount: 1,
      duplicates: [
        {
          externalSource: "otrs",
          externalId: "42",
          conversationId: "conversation-1"
        }
      ]
    });
    expect(deriveDiagnosticStatus(tx.steps as Parameters<typeof deriveDiagnosticStatus>[0])).toBe("warning");
  });

  it("records failed auth, skips later unsafe steps, and redacts all persisted JSON details", async () => {
    const tx = createFakeTx();
    const fakeClient = createFakeClient([
      new OtrsConnectorError({
        code: "auth_failed",
        safeMessage: "OTRS rejected the configured credentials.",
        redactedDetail: {
          UserLogin: userLogin,
          Password: password,
          caBundle,
          nested: {
            raw: `UserLogin=${userLogin}&Password=${password}`
          }
        }
      })
    ]);

    await runOtrsDiagnostics(createRunInput(tx, fakeClient.client));

    expect(tx.steps.map((step) => (step as { key: string; status: string }).key)).toEqual(diagnosticStepDefinitions.map((step) => step.key));
    expect(
      tx.steps.map((step) => {
        const record = step as { key: string; status: string };
        return [record.key, record.status];
      })
    ).toEqual([
      ["config", "succeeded"],
      ["tls", "succeeded"],
      ["webservice", "succeeded"],
      ["auth", "failed"],
      ["ticket_search", "skipped"],
      ["ticket_get", "skipped"],
      ["normalize", "skipped"],
      ["db_dry_run", "skipped"]
    ]);
    expect(finalRunUpdate(tx).data).toMatchObject({
      status: "failed",
      errorCode: "auth_failed",
      errorMessage: "OTRS rejected the configured credentials."
    });

    const persistedJson = allPersistedJson(tx);
    expect(persistedJson).not.toContain(password);
    expect(persistedJson).not.toContain(userLogin);
    expect(persistedJson).not.toContain("BEGIN CERTIFICATE");
    expect(persistedJson).not.toContain("secret-ca");
  });

  it("fetches a manual ticket directly and records ticket_search as skipped", async () => {
    const tx = createFakeTx();
    const fakeClient = createFakeClient([ticketGetPayload("77", 3)]);

    await runOtrsDiagnostics(createRunInput(tx, fakeClient.client, { manualTicketId: "77" }));

    expect(fakeClient.requests).toHaveLength(1);
    expect(
      tx.steps.map((step) => {
        const record = step as { key: string; status: string };
        return [record.key, record.status];
      })
    ).toContainEqual(["ticket_search", "skipped"]);
    expect(finalRunUpdate(tx).data.status).toBe("succeeded");

    const summary = JSON.parse(String(finalRunUpdate(tx).data.summaryJson));
    expect(summary).toMatchObject({
      searchedTicketIds: [],
      fetchedTicketIds: ["77"],
      articleCountsByTicketId: {
        "77": 3
      }
    });
  });

  it("sends the saved password value unchanged when it contains surrounding whitespace", async () => {
    const tx = createFakeTx();
    const savedPassword = "  whitespace-password  ";
    const requests: unknown[] = [];
    const client = {
      requestJson: vi.fn(async (request) => {
        requests.push(request);
        const body = request.body as { Password?: string } | undefined;
        const requestPassword = body?.Password ?? new URL(request.url).searchParams.get("Password") ?? undefined;

        if (requestPassword !== savedPassword) {
          throw new OtrsConnectorError({
            code: "auth_failed",
            safeMessage: "Password was not sent exactly as saved.",
            redactedDetail: {
              Password: requestPassword
            }
          });
        }

        return requests.length === 1 ? { TicketID: ["42"] } : ticketGetPayload("42", 1);
      })
    };

    await runOtrsDiagnostics(createRunInput(tx, client, { password: savedPassword }));

    expect(finalRunUpdate(tx).data.status).toBe("succeeded");
    expect(client.requestJson).toHaveBeenCalled();
    const firstRequest = requests[0] as { body?: { Password?: string }; url?: string };
    const sentPassword =
      firstRequest.body?.Password ?? (firstRequest.url ? new URL(firstRequest.url).searchParams.get("Password") ?? undefined : undefined);
    expect(sentPassword).toBe(savedPassword);
    expect(finalRunUpdate(tx).data.errorCode).toBeNull();
  });

  it("redacts known secrets from persisted run endpoint and all persisted JSON", async () => {
    const tx = createFakeTx();
    const endpointSecret = password;
    const fakeClient = createFakeClient([{ TicketID: ["42"] }, ticketGetPayload("42", 1)]);

    await runOtrsDiagnostics(
      createRunInput(tx, fakeClient.client, {
        integration: {
          id: integrationId,
          workspaceId,
          source: "otrs",
          displayName: "Production OTRS",
          type: "otrs_family",
          baseUrl: `https://support.example.com/${endpointSecret}/otrs`,
          configJson: JSON.stringify({
            ...buildDefaultOtrsConnectorConfig("otrs_ce_6"),
            webServiceName: `${endpointSecret}-GenericTicketConnectorREST`
          })
        }
      })
    );

    expect(finalRunUpdate(tx).data.status).toBe("succeeded");
    expect(finalRunUpdate(tx).data.redactedEndpoint).not.toContain(endpointSecret);
    expect(allPersistedJson(tx)).not.toContain(endpointSecret);
  });

  it("service persists a failed diagnostic instead of throwing before persistence when auth_password is missing", async () => {
    const tx = createFakeTx();
    tx.integration.findFirst.mockResolvedValue({
      id: integrationId,
      workspaceId,
      source: "otrs",
      displayName: "Production OTRS",
      type: "otrs_family",
      baseUrl,
      configJson: JSON.stringify(buildDefaultOtrsConnectorConfig("otrs_ce_6")),
      credentials: []
    });
    tx.integrationCredential.findMany.mockResolvedValue([]);

    await runOtrsConnectorDiagnostics({
      workspaceId,
      integrationId,
      actorId,
      db: tx
    });

    expect(tx.integrationDiagnosticRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "running",
        mode: "ticket_search"
      })
    });
    expect(finalRunUpdate(tx).data).toMatchObject({
      status: "failed",
      errorCode: "secret_missing"
    });
  });
});
