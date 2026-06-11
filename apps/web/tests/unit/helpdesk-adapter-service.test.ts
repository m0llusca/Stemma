import http from "node:http";
import type { AddressInfo } from "node:net";
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
      // Two activities_get queries: CaseComment thread plus the EmailMessage thread.
      expect(result.diagnostics.requests.map((request) => request.operation)).toEqual([
        "case_get",
        "activities_get",
        "activities_get"
      ]);
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
      // The adapter requests requester sideloading alongside the conversations embed.
      expect(server.requests[0]?.query.include).toBe("conversations,requester");
      // Conversations are always paged via the dedicated endpoint to capture the
      // full thread (the embed caps at 10), so a paginated request follows the ticket.
      expect(server.requests.map((request) => request.operation)).toEqual(["ticket_get", "conversations_get"]);
      expect(server.requests[1]?.query).toMatchObject({ per_page: "100", page: "1" });
      expect(JSON.stringify(result.diagnostics)).not.toContain("freshdesk-token");
    } finally {
      await server.close();
    }
  });

  it("pages the Freshdesk conversations endpoint even when inline conversations are present", async () => {
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
      expect(server.requests[0]?.query.include).toBe("conversations,requester");
      expect(result.diagnostics.requests).toEqual([
        {
          operation: "ticket_get",
          method: "GET",
          url: `${server.baseUrl}/api/v2/tickets/20?include=conversations,requester`,
          statusCode: 200
        },
        {
          operation: "conversations_get",
          method: "GET",
          url: `${server.baseUrl}/api/v2/tickets/20/conversations?per_page=100&page=1`,
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
        "/crm/objects/2026-03/communication/communication_1"
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

  it("loads Jira comments across service desk paginated comment pages", async () => {
    const server = await createJiraPaginatedCommentsServer();
    const jiraCredential = "agent@example.com:jira-api-token";

    try {
      const adapter = createHelpdeskAdapter("jira");
      const result = await adapter.loadConversation({
        source: "jira",
        baseUrl: server.baseUrl,
        externalId: "SUP-101",
        token: jiraCredential
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "jira",
        externalId: "SUP-101"
      });
      expect(result.conversations[0]?.messages).toHaveLength(101);
      expect(result.conversations[0]?.messages[100]).toMatchObject({
        externalId: "10100",
        body: "Paginated Jira comment 101",
        isPrivate: false
      });
      expect(result.conversations[0]?.messages[99]).toMatchObject({
        externalId: "10099",
        isPrivate: true
      });
      expect(server.requests.map((request) => request.pathname)).toEqual([
        "/rest/servicedeskapi/request/SUP-101",
        "/rest/servicedeskapi/request/SUP-101/comment",
        "/rest/servicedeskapi/request/SUP-101/comment"
      ]);
      expect(server.requests[1]?.query).toMatchObject({ limit: "100", start: "0" });
      expect(server.requests[2]?.query).toMatchObject({ limit: "100", start: "100" });
      expect(result.diagnostics.requests.map((request) => request.operation)).toEqual([
        "ticket_get",
        "comments_get",
        "comments_get"
      ]);
      expect(decodedBasicCredential(server.requests[0]?.headers.authorization)).toBe(jiraCredential);
      expect(JSON.stringify(result.diagnostics)).not.toContain("jira-api-token");
    } finally {
      await server.close();
    }
  });

  it("enforces a local Jira comment limit when the caller provides one", async () => {
    const server = await createJiraPaginatedCommentsServer();

    try {
      const adapter = createHelpdeskAdapter("jira");
      const result = await adapter.loadConversation({
        source: "jira",
        baseUrl: server.baseUrl,
        externalId: "SUP-101",
        token: "agent@example.com:jira-api-token",
        maxComments: 75
      } as Parameters<typeof adapter.loadConversation>[0] & { maxComments: number });

      expect(result.conversations[0]?.messages).toHaveLength(75);
      expect(server.requests.map((request) => request.query)).toEqual([
        {},
        { expand: "renderedBody", limit: "75", start: "0" }
      ]);
      expect(result.diagnostics.requests.map((request) => request.operation)).toEqual(["ticket_get", "comments_get"]);
      expect(JSON.stringify(result.diagnostics)).not.toContain("jira-api-token");
    } finally {
      await server.close();
    }
  });

  it("loads a Jira request without comments from the request description fallback", async () => {
    const server = await createJiraRequestWithoutCommentsServer();
    const jiraCredential = "agent@example.com:jira-api-token";

    try {
      const adapter = createHelpdeskAdapter("jira");
      const result = await adapter.loadConversation({
        source: "jira",
        baseUrl: server.baseUrl,
        externalId: "SUP-77",
        token: jiraCredential
      });

      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0]).toMatchObject({
        externalSource: "jira",
        externalId: "SUP-77",
        subject: "Portal access issue"
      });
      expect(result.conversations[0]?.messages).toEqual([
        expect.objectContaining({
          participantType: "customer",
          body: "Customer cannot access the portal.",
          isPrivate: false
        })
      ]);
      expect(server.requests.map((request) => request.pathname)).toEqual([
        "/rest/servicedeskapi/request/SUP-77",
        "/rest/servicedeskapi/request/SUP-77/comment"
      ]);
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
        // Salesforce now issues a second SOQL query for the EmailMessage thread in addition
        // to the CaseComment query, so it reads via two activities_get requests.
        expect(server.requests.map((request) => request.operation)).toEqual(
          source === "salesforce" ? ["case_get", "activities_get", "activities_get"] : ["case_get", "activities_get"]
        );
        expect(server.requests[0]?.headers.authorization).toBe("Bearer enterprise-token");

        if (source === "salesforce") {
          expect(server.requests[1]?.query.q).toContain("FROM CaseComment");
          expect(server.requests[1]?.query.q).toContain(externalId);
          expect(server.requests[2]?.query.q).toContain("FROM EmailMessage");
          expect(server.requests[2]?.query.q).toContain(externalId);
        }

        if (source === "servicenow") {
          expect(server.requests[0]?.query.sysparm_display_value).toBe("all");
          expect(server.requests[1]?.query.sysparm_query).toBe(
            `element_id=${externalId}^elementINcomments,work_notes`
          );
          expect(server.requests[1]?.query.sysparm_limit).toBe("100");
          expect(server.requests[1]?.query.sysparm_offset).toBe("0");
        }

        if (source === "dynamics") {
          expect(server.requests[0]?.query.$select).toContain("incidentid");
          expect(server.requests[1]?.query.$filter).toBe(`_regardingobjectid_value eq ${externalId}`);
          // activitypointer has no `sender` column; selecting it would 400 in Dataverse.
          expect(server.requests[1]?.query.$select).not.toContain("sender");
          expect(server.requests[1]?.query.$select).toContain("activityid");
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

  it("accumulates Dynamics activities across OData @odata.nextLink pages", async () => {
    const server = await createDynamicsNextLinkServer({ pages: 2 });

    try {
      const adapter = createHelpdeskAdapter("dynamics");
      const result = await adapter.loadConversation({
        source: "dynamics",
        baseUrl: server.baseUrl,
        externalId: "11111111-2222-3333-4444-555555555555",
        token: "enterprise-token"
      });

      // Both pages' activities must be present in the payload
      const page = result.payload as { activities: { activityid: string }[] };
      expect(page.activities).toHaveLength(2);
      expect(page.activities.map((a) => a.activityid)).toEqual([
        "activity-page1",
        "activity-page2"
      ]);

      // Adapter must have issued three requests: case_get + 2 × activities_get
      expect(server.requests).toHaveLength(3);
      expect(server.requests[0]?.operation).toBe("case_get");
      expect(server.requests[1]?.operation).toBe("activities_get");
      expect(server.requests[2]?.operation).toBe("activities_get");
      // Second activities request must use the absolute nextLink URL
      expect(server.requests[2]?.pathname).toBe("/api/data/v9.2/activitypointers-page2");

      // Diagnostics must include one entry per activities request
      expect(result.diagnostics.requests.map((r) => r.operation)).toEqual([
        "case_get",
        "activities_get",
        "activities_get"
      ]);

      expect(JSON.stringify(result.diagnostics)).not.toContain("enterprise-token");
    } finally {
      await server.close();
    }
  });

  it("issues only one Dynamics activities request when the response has no @odata.nextLink", async () => {
    const server = await createDynamicsNextLinkServer({ pages: 1 });

    try {
      const adapter = createHelpdeskAdapter("dynamics");
      const result = await adapter.loadConversation({
        source: "dynamics",
        baseUrl: server.baseUrl,
        externalId: "11111111-2222-3333-4444-555555555555",
        token: "enterprise-token"
      });

      expect((result.payload as { activities: unknown[] }).activities).toHaveLength(1);
      expect(server.requests.filter((r) => r.operation === "activities_get")).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it("requests display values on the ServiceNow case and queries both comments and work_notes", async () => {
    const server = await createHelpdeskAdapterServer({ source: "servicenow", mode: "success" });
    const externalId = "0123456789abcdef0123456789abcdef";

    try {
      const adapter = createHelpdeskAdapter("servicenow");
      await adapter.loadConversation({
        source: "servicenow",
        baseUrl: server.baseUrl,
        externalId,
        token: "enterprise-token"
      });

      const caseRequest = server.requests.find((request) => request.operation === "case_get");
      const journalRequest = server.requests.find((request) => request.operation === "activities_get");

      // Reference fields (consumer, assigned_to, state, priority) only arrive as
      // { display_value, value } when display_value=all is requested on the case table.
      expect(caseRequest?.query.sysparm_display_value).toBe("all");

      // The journal query must include both customer comments and internal work notes.
      expect(journalRequest?.query.sysparm_query).toBe(
        `element_id=${externalId}^elementINcomments,work_notes`
      );
      expect(journalRequest?.query.sysparm_query).toContain("elementINcomments,work_notes");

      // display_value=all must NOT be applied to the journal: the body lives in the raw
      // `value` field, and an object shape would corrupt the message text.
      expect(journalRequest?.query.sysparm_display_value).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("maps ServiceNow work_notes journal entries to private internal messages", async () => {
    const server = await createServiceNowJournalServer({
      journal: [
        {
          sys_id: "journal-1",
          element: "comments",
          value: "Заказ задержан, хочу возврат.",
          sys_created_on: "2026-04-25 10:00:00",
          sys_created_by: "anna@example.com"
        },
        {
          sys_id: "journal-2",
          element: "work_notes",
          value: "Внутренняя заметка: одобрить возврат.",
          sys_created_on: "2026-04-25 10:05:00",
          sys_created_by: "agent@example.com"
        }
      ]
    });

    try {
      const adapter = createHelpdeskAdapter("servicenow");
      const result = await adapter.loadConversation({
        source: "servicenow",
        baseUrl: server.baseUrl,
        externalId: "0123456789abcdef0123456789abcdef",
        token: "enterprise-token"
      });

      const messages = result.conversations[0]?.messages ?? [];
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ body: "Заказ задержан, хочу возврат.", isPrivate: false });
      expect(messages[1]).toMatchObject({
        body: "Внутренняя заметка: одобрить возврат.",
        isPrivate: true,
        participantType: "human_agent"
      });
    } finally {
      await server.close();
    }
  });

  it("paginates the ServiceNow journal until a short page is returned", async () => {
    // 150 rows ⇒ a full first page (100) plus a short second page (50).
    const journal = Array.from({ length: 150 }, (_, index) => ({
      sys_id: `journal-${index + 1}`,
      element: index % 2 === 0 ? "comments" : "work_notes",
      value: `Message ${index + 1}`,
      sys_created_on: `2026-04-25 10:${String(index % 60).padStart(2, "0")}:00`,
      sys_created_by: index % 2 === 0 ? "anna@example.com" : "agent@example.com"
    }));
    const server = await createServiceNowJournalServer({ journal });

    try {
      const adapter = createHelpdeskAdapter("servicenow");
      const result = await adapter.loadConversation({
        source: "servicenow",
        baseUrl: server.baseUrl,
        externalId: "0123456789abcdef0123456789abcdef",
        token: "enterprise-token"
      });

      const journalRequests = server.requests.filter(
        (request) => request.pathname === "/api/now/table/sys_journal_field"
      );

      // First page at offset 0, second page at offset 100, then stop (50 < 100).
      expect(journalRequests).toHaveLength(2);
      expect(journalRequests[0]?.query.sysparm_offset).toBe("0");
      expect(journalRequests[0]?.query.sysparm_limit).toBe("100");
      expect(journalRequests[1]?.query.sysparm_offset).toBe("100");

      // Every journal row from both pages must be accumulated into the payload.
      expect((result.payload as { journal: unknown[] }).journal).toHaveLength(150);
      expect(result.conversations[0]?.messages).toHaveLength(150);
    } finally {
      await server.close();
    }
  });

  it("stops after a single ServiceNow journal request when the first page is short", async () => {
    const server = await createServiceNowJournalServer({
      journal: [
        {
          sys_id: "journal-1",
          element: "comments",
          value: "Single page message.",
          sys_created_on: "2026-04-25 10:00:00",
          sys_created_by: "anna@example.com"
        }
      ]
    });

    try {
      const adapter = createHelpdeskAdapter("servicenow");
      await adapter.loadConversation({
        source: "servicenow",
        baseUrl: server.baseUrl,
        externalId: "0123456789abcdef0123456789abcdef",
        token: "enterprise-token"
      });

      const journalRequests = server.requests.filter(
        (request) => request.pathname === "/api/now/table/sys_journal_field"
      );
      expect(journalRequests).toHaveLength(1);
      expect(journalRequests[0]?.query.sysparm_offset).toBe("0");
    } finally {
      await server.close();
    }
  });
});

function decodedBasicCredential(authorization: string | undefined) {
  expect(authorization).toMatch(/^Basic [A-Za-z0-9+/]+=*$/);
  return Buffer.from(authorization?.replace(/^Basic /, "") ?? "", "base64").toString("utf8");
}

async function createJiraPaginatedCommentsServer() {
  const comments = Array.from({ length: 101 }, (_, index) => ({
    id: String(10000 + index),
    body: `Paginated Jira comment ${index + 1}`,
    public: index === 99 ? { value: false } : { value: true },
    created: { iso8601: `2026-04-25T10:${String(index % 60).padStart(2, "0")}:00+0000` },
    author: {
      displayName: index % 2 === 0 ? "Анна Смирнова" : "Иван Петров",
      emailAddress: index % 2 === 0 ? "anna@example.com" : "ivan@example.com",
      applicationRoles: index % 2 === 0 ? { size: 0, items: [] } : { size: 1, items: [{ key: "jira-servicedesk" }] }
    }
  }));
  const requests: Array<{
    pathname: string;
    query: Record<string, string>;
    headers: Record<string, string | undefined>;
  }> = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    requests.push({
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value])
      )
    });
    response.setHeader("content-type", "application/json");

    if (url.pathname === "/rest/servicedeskapi/request/SUP-101") {
      response.end(
        JSON.stringify({
          issueId: "10100",
          issueKey: "SUP-101",
          reporter: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" },
          currentStatus: { status: "Open" },
          createdDate: { iso8601: "2026-04-25T10:00:00+0000" },
          requestFieldValues: [{ fieldId: "summary", label: "Summary", value: "Large Jira request" }]
        })
      );
      return;
    }

    if (url.pathname === "/rest/servicedeskapi/request/SUP-101/comment") {
      const start = Number(url.searchParams.get("start") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const values = comments.slice(start, start + limit);

      response.end(
        JSON.stringify({
          values,
          start,
          limit,
          size: values.length,
          isLastPage: start + values.length >= comments.length
        })
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function createJiraRequestWithoutCommentsServer() {
  const requests: Array<{
    pathname: string;
    headers: Record<string, string | undefined>;
  }> = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    requests.push({
      pathname: url.pathname,
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value])
      )
    });
    response.setHeader("content-type", "application/json");

    if (url.pathname === "/rest/servicedeskapi/request/SUP-77") {
      response.end(
        JSON.stringify({
          issueId: "10077",
          issueKey: "SUP-77",
          reporter: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" },
          currentStatus: { status: "Open" },
          createdDate: { iso8601: "2026-04-25T10:00:00+0000" },
          requestFieldValues: [
            { fieldId: "summary", label: "Summary", value: "Portal access issue" },
            { fieldId: "description", label: "Description", value: "Customer cannot access the portal." }
          ]
        })
      );
      return;
    }

    if (url.pathname === "/rest/servicedeskapi/request/SUP-77/comment") {
      response.end(JSON.stringify({ values: [], start: 0, limit: 100, isLastPage: true }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function createDynamicsNextLinkServer({ pages }: { pages: 1 | 2 }) {
  type StubRequest = {
    operation: "case_get" | "activities_get" | "unknown";
    pathname: string;
    headers: Record<string, string | undefined>;
  };
  const requests: StubRequest[] = [];

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value])
    );

    const operation: StubRequest["operation"] = /^\/api\/data\/v9\.2\/incidents(?:\/[^/]+|\([^)]+\))$/.test(url.pathname)
      ? "case_get"
      : url.pathname === "/api/data/v9.2/activitypointers" || url.pathname === "/api/data/v9.2/activitypointers-page2"
        ? "activities_get"
        : "unknown";

    requests.push({ operation, pathname: url.pathname, headers });
    response.setHeader("content-type", "application/json");

    if (operation === "case_get") {
      response.end(
        JSON.stringify({
          incidentid: "11111111-2222-3333-4444-555555555555",
          ticketnumber: "CAS-99001",
          title: "Pagination test case",
          statecode: 0,
          prioritycode: 2,
          createdon: "2026-04-25T10:00:00Z",
          modifiedon: "2026-04-25T10:18:00Z"
        })
      );
      return;
    }

    if (url.pathname === "/api/data/v9.2/activitypointers") {
      const serverAddress = server.address() as AddressInfo;
      const body: Record<string, unknown> = {
        value: [{ activityid: "activity-page1", subject: "First page", description: "desc1", createdon: "2026-04-25T10:00:00Z" }]
      };

      if (pages === 2) {
        body["@odata.nextLink"] = `http://127.0.0.1:${serverAddress.port}/api/data/v9.2/activitypointers-page2`;
      }

      response.end(JSON.stringify(body));
      return;
    }

    if (url.pathname === "/api/data/v9.2/activitypointers-page2") {
      response.end(
        JSON.stringify({
          value: [{ activityid: "activity-page2", subject: "Second page", description: "desc2", createdon: "2026-04-25T10:01:00Z" }]
        })
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function createServiceNowJournalServer({ journal }: { journal: Record<string, unknown>[] }) {
  type StubRequest = {
    operation: "case_get" | "activities_get" | "unknown";
    pathname: string;
    query: Record<string, string>;
    headers: Record<string, string | undefined>;
  };
  const requests: StubRequest[] = [];

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const operation: StubRequest["operation"] = /^\/api\/now\/table\/(?:sn_customerservice_case|case)\/[^/]+$/.test(
      url.pathname
    )
      ? "case_get"
      : url.pathname === "/api/now/table/sys_journal_field"
        ? "activities_get"
        : "unknown";

    requests.push({
      operation,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value])
      )
    });
    response.setHeader("content-type", "application/json");

    if (operation === "case_get") {
      response.end(
        JSON.stringify({
          result: {
            sys_id: "sn-case-1",
            number: "CS0001001",
            short_description: "Refund request from ServiceNow",
            state: { display_value: "Closed", value: "3" },
            priority: { display_value: "2 - High", value: "2" },
            consumer: { display_value: "Анна Смирнова", value: "consumer-sys-id" },
            assigned_to: { display_value: "Иван Петров", value: "agent-sys-id" },
            opened_at: { display_value: "2026-04-25 10:00:00", value: "2026-04-25 10:00:00" },
            sys_updated_on: { display_value: "2026-04-25 10:18:00", value: "2026-04-25 10:18:00" }
          }
        })
      );
      return;
    }

    if (operation === "activities_get") {
      const limit = Number.parseInt(url.searchParams.get("sysparm_limit") ?? "100", 10);
      const offset = Number.parseInt(url.searchParams.get("sysparm_offset") ?? "0", 10);

      response.end(JSON.stringify({ result: journal.slice(offset, offset + limit) }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}
