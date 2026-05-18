import { describe, expect, it } from "vitest";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";
import { createHelpdeskAdapterServer } from "../fixtures/helpdesk-adapter-server";

describe("native helpdesk adapters", () => {
  it("loads a Zendesk ticket and comments through the source-specific endpoints", async () => {
    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });

    try {
      const adapter = createHelpdeskAdapter("zendesk");
      const result = await adapter.loadConversation({
        source: "zendesk",
        baseUrl: server.baseUrl,
        externalId: "35436",
        token: "test-token"
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "zendesk",
        externalId: "35436",
        channel: "email"
      });
      expect(result.conversations[0]?.messages.length).toBeGreaterThan(1);
      expect(server.requests.map((request) => request.operation)).toEqual(["ticket_get", "comments_get"]);
      expect(JSON.stringify(result.diagnostics)).not.toContain("test-token");
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
      expect(server.requests.map((request) => request.operation)).toEqual(["ticket_get", "activities_get"]);
      expect(server.requests[0]?.headers.authorization).toBe("Bearer hubspot-token");
      expect(server.requests[0]?.query.properties).toContain("subject");
      expect(server.requests[0]?.query.associations).toBe("notes,emails,communications");
      expect(server.requests[1]?.pathname).toBe("/crm/v4/objects/tickets/987654321/associations/notes");
      expect(JSON.stringify(result.diagnostics)).not.toContain("hubspot-token");
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
