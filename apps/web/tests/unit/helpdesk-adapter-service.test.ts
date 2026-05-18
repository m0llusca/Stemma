import { describe, expect, it } from "vitest";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";
import { createHelpdeskAdapterServer } from "../fixtures/helpdesk-adapter-server";

describe("Zendesk and Freshdesk adapters", () => {
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
});
