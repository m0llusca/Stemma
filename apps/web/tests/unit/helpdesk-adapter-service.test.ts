import { describe, expect, it, vi } from "vitest";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";
import { loadHelpdeskAdapterConversations } from "@/lib/integrations/helpdesk-adapters/service";
import { encryptSecret } from "@/lib/secrets";
import { customConversationSchema } from "@/lib/validation/custom-api";
import { createHelpdeskAdapterServer } from "../fixtures/helpdesk-adapter-server";

const now = new Date("2026-05-09T08:00:00.000Z");

function credential(kind: string, secret: string) {
  return {
    id: `${kind}-credential`,
    workspaceId: "workspace-1",
    integrationId: "integration-1",
    kind,
    authMode: "token",
    encryptedSecret: encryptSecret(secret),
    keyVersion: "v1",
    fingerprint: null,
    lastRotatedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "integration-1",
    workspaceId: "workspace-1",
    source: "zendesk",
    displayName: "Zendesk",
    type: "native_helpdesk",
    status: "ready",
    baseUrl: "http://127.0.0.1",
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
    credentials: [credential("auth_password", "native-token")],
    ...overrides
  } as Parameters<typeof loadHelpdeskAdapterConversations>[0]["integration"];
}

describe("helpdesk adapter runner service", () => {
  it("decrypts native auth_password credentials, validates conversations, and returns safe diagnostics", async () => {
    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });
    const zendeskCredential = "agent@example.com/token:native-token";

    try {
      const result = await loadHelpdeskAdapterConversations({
        integration: integration({
          source: "zendesk",
          displayName: "Zendesk",
          type: "native_helpdesk",
          baseUrl: server.baseUrl,
          credentials: [credential("auth_password", zendeskCredential)]
        }),
        ticketId: "35436",
        samplingReason: "Service import"
      });

      expect(result.conversations.map((conversation) => customConversationSchema.parse(conversation).externalId)).toEqual([
        "35436"
      ]);
      expect(result.conversations[0]).toMatchObject({
        externalSource: "zendesk",
        externalId: "35436",
        samplingReason: expect.any(String)
      });
      expect(result.diagnostics.requests.map((request) => request.operation)).toEqual(["ticket_get", "comments_get"]);
      expect(decodedBasicCredential(server.requests[0]?.headers.authorization)).toBe(zendeskCredential);
      expect(JSON.stringify(result.diagnostics)).not.toContain(zendeskCredential);
    } finally {
      await server.close();
    }
  });

  it("decrypts enterprise oauth_client_credentials credentials and returns safe diagnostics", async () => {
    const server = await createHelpdeskAdapterServer({ source: "salesforce", mode: "success" });

    try {
      const result = await loadHelpdeskAdapterConversations({
        integration: integration({
          source: "salesforce",
          displayName: "Salesforce",
          type: "enterprise",
          baseUrl: server.baseUrl,
          credentials: [credential("oauth_client_credentials", "enterprise-token")]
        }),
        ticketId: "500xx0000012345"
      });

      expect(result.conversations.map((conversation) => customConversationSchema.parse(conversation).externalSource)).toEqual([
        "salesforce"
      ]);
      expect(result.conversations[0]?.messages.length).toBeGreaterThan(0);
      expect(result.diagnostics.requests.map((request) => request.operation)).toEqual(["case_get", "activities_get"]);
      expect(server.requests[0]?.headers.authorization).toBe("Bearer enterprise-token");
      expect(JSON.stringify(result.diagnostics)).not.toContain("enterprise-token");
    } finally {
      await server.close();
    }
  });

  it("rejects unsupported sources before making adapter requests", async () => {
    await expect(
      loadHelpdeskAdapterConversations({
        integration: integration({
          source: "legacy_helpdesk",
          credentials: [credential("auth_password", "native-token")]
        }),
        ticketId: "35436"
      })
    ).rejects.toThrow("Неподдерживаемый Phase B helpdesk source.");
  });

  it("rejects integration rows whose type does not match the source contract", async () => {
    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });

    try {
      await expect(
        loadHelpdeskAdapterConversations({
          integration: integration({
            source: "zendesk",
            type: "enterprise",
            baseUrl: server.baseUrl,
            credentials: [credential("auth_password", "native-token")]
          }),
          ticketId: "35436"
        })
      ).rejects.toThrow("Тип интеграции не соответствует Phase B helpdesk source.");
      expect(server.requests).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it("rejects adapter output that fails the custom conversation schema", async () => {
    vi.resetModules();
    vi.doMock("@/lib/integrations/helpdesk-adapters", () => ({
      createHelpdeskAdapter: () => ({
        loadConversation: vi.fn().mockResolvedValue({
          conversations: [
            {
              externalSource: "zendesk",
              externalId: "35436",
              channel: "phone",
              subject: "Invalid channel",
              status: "open",
              customerName: "Customer",
              samplingReason: "Invalid fixture",
              openedAt: "2026-05-09T08:00:00.000Z",
              messages: []
            }
          ],
          diagnostics: {
            requests: []
          }
        })
      })
    }));

    try {
      const { loadHelpdeskAdapterConversations: loadServiceWithMockedAdapter } = await import(
        "@/lib/integrations/helpdesk-adapters/service"
      );

      await expect(
        loadServiceWithMockedAdapter({
          integration: integration({
            source: "zendesk",
            type: "native_helpdesk",
            credentials: [credential("auth_password", "native-token")]
          }),
          ticketId: "35436"
        })
      ).rejects.toThrow("Invalid enum value");
    } finally {
      vi.doUnmock("@/lib/integrations/helpdesk-adapters");
      vi.resetModules();
    }
  });
});

describe("native helpdesk adapters", () => {
  it("loads a Zendesk ticket and comments through the source-specific endpoints", async () => {
    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });
    const zendeskCredential = "agent@example.com/token:test-token";

    try {
      const adapter = createHelpdeskAdapter("zendesk");
      const result = await adapter.loadConversation({
        source: "zendesk",
        baseUrl: server.baseUrl,
        externalId: "35436",
        token: zendeskCredential
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "zendesk",
        externalId: "35436",
        channel: "email"
      });
      expect(result.conversations[0]?.messages.length).toBeGreaterThan(1);
      expect(server.requests.map((request) => request.operation)).toEqual(["ticket_get", "comments_get"]);
      expect(decodedBasicCredential(server.requests[0]?.headers.authorization)).toBe(zendeskCredential);
      expect(JSON.stringify(result.diagnostics)).not.toContain(zendeskCredential);
    } finally {
      await server.close();
    }
  });

  it("loads a Freshdesk ticket with conversations", async () => {
    const server = await createHelpdeskAdapterServer({ source: "freshdesk", mode: "success" });

    try {
      const adapter = createHelpdeskAdapter("freshdesk");
      const result = await adapter.loadConversation({
        source: "freshdesk",
        baseUrl: server.baseUrl,
        externalId: "20",
        token: "freshdesk-token"
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "freshdesk",
        externalId: "20",
        status: "resolved"
      });
      expect(server.requests[0]?.query.include).toBe("conversations");
      expect(server.requests.map((request) => request.operation)).toContain("ticket_get");
      expect(JSON.stringify(result.diagnostics)).not.toContain("freshdesk-token");
    } finally {
      await server.close();
    }
  });

  it("falls back to Freshdesk conversations endpoint when inline conversations are missing", async () => {
    const server = await createHelpdeskAdapterServer({
      source: "freshdesk",
      mode: "success",
      omitInlineConversations: true
    });

    try {
      const adapter = createHelpdeskAdapter("freshdesk");
      const result = await adapter.loadConversation({
        source: "freshdesk",
        baseUrl: server.baseUrl,
        externalId: "20",
        token: "freshdesk-token"
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "freshdesk",
        externalId: "20",
        status: "resolved"
      });
      expect(server.requests.map((request) => request.operation)).toEqual(["ticket_get", "conversations_get"]);
      expect(server.requests[0]?.query.include).toBe("conversations");
      expect(result.diagnostics.requests).toEqual([
        {
          operation: "ticket_get",
          method: "GET",
          url: `${server.baseUrl}/api/v2/tickets/20?include=conversations`,
          statusCode: 200
        },
        {
          operation: "conversations_get",
          method: "GET",
          url: `${server.baseUrl}/api/v2/tickets/20/conversations`,
          statusCode: 200
        }
      ]);
      expect(JSON.stringify(result.diagnostics)).not.toContain("freshdesk-token");
    } finally {
      await server.close();
    }
  });

  it("loads an Intercom conversation with source and conversation parts", async () => {
    const server = await createHelpdeskAdapterServer({ source: "intercom", mode: "success" });

    try {
      const adapter = createHelpdeskAdapter("intercom");
      const result = await adapter.loadConversation({
        source: "intercom",
        baseUrl: server.baseUrl,
        externalId: "conv_123",
        token: "intercom-token"
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "intercom",
        externalId: "conv_123",
        channel: "messenger"
      });
      expect(result.conversations[0]?.messages.length).toBeGreaterThan(1);
      expect(server.requests[0]).toMatchObject({
        operation: "conversations_get"
      });
      expect(server.requests[0]?.headers.authorization).toBe("Bearer intercom-token");
      expect(server.requests[0]?.headers["intercom-version"]).toBeTruthy();
      expect(result.diagnostics.requests).toEqual([
        {
          operation: "conversations_get",
          method: "GET",
          url: `${server.baseUrl}/conversations/conv_123`,
          statusCode: 200
        }
      ]);
      expect(JSON.stringify(result.diagnostics)).not.toContain("intercom-token");
    } finally {
      await server.close();
    }
  });

  it("loads a HubSpot ticket and associated activities", async () => {
    const server = await createHelpdeskAdapterServer({ source: "hubspot", mode: "success" });

    try {
      const adapter = createHelpdeskAdapter("hubspot");
      const result = await adapter.loadConversation({
        source: "hubspot",
        baseUrl: server.baseUrl,
        externalId: "987654321",
        token: "hubspot-token"
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "hubspot",
        externalId: "987654321"
      });
      expect(result.conversations[0]?.tags).toContain("HIGH");
      expect(result.conversations[0]?.messages.length).toBeGreaterThan(1);
      expect(server.requests.map((request) => request.operation)).toEqual([
        "ticket_get",
        "activities_get",
        "activities_get",
        "activities_get",
        "activities_get",
        "activities_get",
        "activities_get",
        "activities_get"
      ]);
      expect(server.requests[0]?.headers.authorization).toBe("Bearer hubspot-token");
      expect(server.requests[0]?.query.properties).toContain("subject");
      expect(server.requests[0]?.query.associations).toBe("notes,emails,communications");
      expect(server.requests[1]?.pathname).toBe("/crm/v4/objects/tickets/987654321/associations/notes");
      expect(server.requests[2]?.pathname).toBe("/crm/v4/objects/tickets/987654321/associations/emails");
      expect(server.requests[3]?.pathname).toBe("/crm/v4/objects/tickets/987654321/associations/communications");
      expect(server.requests.slice(4).map((request) => request.pathname)).toEqual([
        "/crm/objects/2026-03/notes/note_1",
        "/crm/objects/2026-03/emails/email_1",
        "/crm/objects/2026-03/emails/email_2",
        "/crm/objects/2026-03/communications/communication_1"
      ]);
      expect(server.requests[4]?.query.properties).toContain("hs_note_body");
      expect(server.requests[5]?.query.properties).toContain("hs_email_text");
      expect(server.requests[7]?.query.properties).toContain("hs_communication_body");
      expect(JSON.stringify(result.diagnostics)).not.toContain("hubspot-token");
    } finally {
      await server.close();
    }
  });

  it("loads a Jira Service Management request and comments", async () => {
    const server = await createHelpdeskAdapterServer({ source: "jira", mode: "success" });
    const jiraCredential = "agent@example.com:jira-api-token";

    try {
      const adapter = createHelpdeskAdapter("jira");
      const result = await adapter.loadConversation({
        source: "jira",
        baseUrl: server.baseUrl,
        externalId: "SUP-42",
        token: jiraCredential
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "jira",
        externalId: "SUP-42",
        channel: "ticket",
        status: "Resolved"
      });
      expect(result.conversations[0]?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ externalId: "10001", isPrivate: false }),
          expect.objectContaining({ externalId: "10002", isPrivate: true })
        ])
      );
      expect(server.requests.map((request) => request.operation)).toEqual(["ticket_get", "comments_get"]);
      expect(server.requests[1]?.query).toMatchObject({ limit: "100", start: "0" });
      expect(decodedBasicCredential(server.requests[0]?.headers.authorization)).toBe(jiraCredential);
      expect(JSON.stringify(result.diagnostics)).not.toContain("jira-api-token");
    } finally {
      await server.close();
    }
  });

  for (const source of ["salesforce", "servicenow", "dynamics"] as const) {
    it(`loads ${source} fixture through a contract-certified enterprise adapter`, async () => {
      const server = await createHelpdeskAdapterServer({ source, mode: "success" });
      const externalId =
        source === "salesforce"
          ? "500xx0000012345"
          : source === "servicenow"
            ? "0123456789abcdef0123456789abcdef"
            : "11111111-2222-3333-4444-555555555555";

      try {
        const adapter = createHelpdeskAdapter(source);
        const result = await adapter.loadConversation({
          source,
          baseUrl: server.baseUrl,
          externalId,
          token: "enterprise-token"
        });

        expect(result.conversations[0]?.externalSource).toBe(source);
        expect(result.conversations[0]?.messages.length).toBeGreaterThan(0);
        expect(server.requests.map((request) => request.operation)).toEqual(["case_get", "activities_get"]);
        expect(server.requests[0]?.headers.authorization).toBe("Bearer enterprise-token");

        if (source === "salesforce") {
          expect(server.requests[1]?.query.q).toContain("FROM CaseComment");
          expect(server.requests[1]?.query.q).toContain(externalId);
        }

        if (source === "servicenow") {
          expect(server.requests[1]?.query.sysparm_query).toBe(`element_id=${externalId}^element=comments`);
          expect(server.requests[1]?.query.sysparm_limit).toBe("100");
          expect(server.requests[1]?.query.sysparm_offset).toBe("0");
        }

        if (source === "dynamics") {
          expect(server.requests[0]?.query.$select).toContain("incidentid");
          expect(server.requests[1]?.query.$filter).toBe(`_regardingobjectid_value eq ${externalId}`);
        }

        expect(JSON.stringify(result.diagnostics)).not.toContain("enterprise-token");
      } finally {
        await server.close();
      }
    });
  }

  for (const externalId of [
    "0123456789abcdef0123456789abcde^",
    "0123456789abcdef0123456789abcd^OR",
    "0123456789abcdef0123456789abcd^NQ"
  ]) {
    it(`rejects unsafe ServiceNow sys_id ${externalId} before making requests`, async () => {
      const server = await createHelpdeskAdapterServer({ source: "servicenow", mode: "success" });

      try {
        const adapter = createHelpdeskAdapter("servicenow");

        await expect(
          adapter.loadConversation({
            source: "servicenow",
            baseUrl: server.baseUrl,
            externalId,
            token: "enterprise-token"
          })
        ).rejects.toThrow("ServiceNow sys_id");
        expect(server.requests).toEqual([]);
      } finally {
        await server.close();
      }
    });
  }

  for (const externalId of [
    "11111111-2222-3333-4444-555555555555 or statecode eq 0",
    "11111111-2222-3333-4444-555555555555' or '1' eq '1",
    "11111111-2222-3333-4444-555555555555 or prioritycode eq 1",
    "(11111111-2222-3333-4444-555555555555)"
  ]) {
    it(`rejects unsafe Dynamics incident id ${externalId} before making requests`, async () => {
      const server = await createHelpdeskAdapterServer({ source: "dynamics", mode: "success" });

      try {
        const adapter = createHelpdeskAdapter("dynamics");

        await expect(
          adapter.loadConversation({
            source: "dynamics",
            baseUrl: server.baseUrl,
            externalId,
            token: "enterprise-token"
          })
        ).rejects.toThrow("Dynamics incident id");
        expect(server.requests).toEqual([]);
      } finally {
        await server.close();
      }
    });
  }
});

function decodedBasicCredential(authorization: string | undefined) {
  expect(authorization).toMatch(/^Basic [A-Za-z0-9+/]+=*$/);
  return Buffer.from(authorization?.replace(/^Basic /, "") ?? "", "base64").toString("utf8");
}
