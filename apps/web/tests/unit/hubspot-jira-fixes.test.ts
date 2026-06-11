import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createHubspotAdapter } from "@/lib/integrations/helpdesk-adapters/hubspot";
import { createJiraAdapter } from "@/lib/integrations/helpdesk-adapters/jira";

type RecordedRequest = {
  method: string;
  pathname: string;
  query: Record<string, string>;
};

type TestServer = {
  baseUrl: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
};

async function startServer(handler: (request: RecordedRequest, response: http.ServerResponse) => void): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const recorded: RecordedRequest = {
      method: req.method ?? "GET",
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries())
    };
    requests.push(recorded);
    handler(recorded, res);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
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

function writeJson(response: http.ServerResponse, payload: unknown) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

describe("HubSpot adapter HTTP fixes", () => {
  it("fetches the communications activity object via the singular `communication` segment", async () => {
    const server = await startServer((request, response) => {
      if (/^\/crm\/v3\/objects\/tickets\/[^/]+$/.test(request.pathname)) {
        writeJson(response, { id: "1", properties: { subject: "Тикет" } });
        return;
      }

      const associationMatch = request.pathname.match(/^\/crm\/v4\/objects\/tickets\/[^/]+\/associations\/([^/]+)$/);
      if (associationMatch) {
        const type = associationMatch[1];
        if (type === "communications") {
          writeJson(response, { results: [{ toObjectId: "communication_1" }] });
          return;
        }
        writeJson(response, { results: [] });
        return;
      }

      if (/^\/crm\/objects\/2026-03\/communication\/[^/]+$/.test(request.pathname)) {
        writeJson(response, {
          id: "communication_1",
          properties: { hs_communication_body: "Привет", hs_timestamp: "2026-04-25T10:12:00.000Z" }
        });
        return;
      }

      // Singular path is the only accepted shape: reject plural to prove the fix.
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "not found" }));
    });

    try {
      const result = await createHubspotAdapter().loadConversation({
        source: "hubspot",
        baseUrl: server.baseUrl,
        externalId: "1",
        token: "hubspot-token"
      });

      const objectGets = server.requests.filter((request) => request.pathname.startsWith("/crm/objects/2026-03/"));
      expect(objectGets.map((request) => request.pathname)).toEqual(["/crm/objects/2026-03/communication/communication_1"]);
      // No plural communications object GET should ever be issued.
      expect(server.requests.some((request) => request.pathname.includes("/2026-03/communications/"))).toBe(false);
      expect(result.source).toBe("hubspot");
    } finally {
      await server.close();
    }
  });

  it("follows v4 association pagination via paging.next.after", async () => {
    const associationCalls: Record<string, RecordedRequest[]> = {};
    const server = await startServer((request, response) => {
      if (/^\/crm\/v3\/objects\/tickets\/[^/]+$/.test(request.pathname)) {
        writeJson(response, { id: "1", properties: { subject: "Тикет" } });
        return;
      }

      const associationMatch = request.pathname.match(/^\/crm\/v4\/objects\/tickets\/[^/]+\/associations\/([^/]+)$/);
      if (associationMatch) {
        const type = associationMatch[1];
        (associationCalls[type] ??= []).push(request);

        if (type === "notes") {
          // First page returns one id plus a next cursor; second page finishes.
          if (!request.query.after) {
            writeJson(response, { results: [{ toObjectId: "note_1" }], paging: { next: { after: "cursor-2" } } });
            return;
          }
          if (request.query.after === "cursor-2") {
            writeJson(response, { results: [{ toObjectId: "note_2" }] });
            return;
          }
        }

        writeJson(response, { results: [] });
        return;
      }

      const objectMatch = request.pathname.match(/^\/crm\/objects\/2026-03\/([^/]+)\/([^/]+)$/);
      if (objectMatch) {
        writeJson(response, {
          id: objectMatch[2],
          properties: { hs_note_body: `body ${objectMatch[2]}`, hs_timestamp: "2026-04-25T10:00:00.000Z" }
        });
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "not found" }));
    });

    try {
      await createHubspotAdapter().loadConversation({
        source: "hubspot",
        baseUrl: server.baseUrl,
        externalId: "1",
        token: "hubspot-token"
      });

      // Two notes association pages were requested, the second carrying the after cursor.
      expect(associationCalls.notes).toHaveLength(2);
      expect(associationCalls.notes?.[0]?.query.after).toBeUndefined();
      expect(associationCalls.notes?.[1]?.query.after).toBe("cursor-2");
      // Both paginated ids were resolved to object GETs.
      const noteObjectGets = server.requests
        .filter((request) => /^\/crm\/objects\/2026-03\/notes\/[^/]+$/.test(request.pathname))
        .map((request) => request.pathname);
      expect(noteObjectGets).toEqual(
        expect.arrayContaining(["/crm/objects/2026-03/notes/note_1", "/crm/objects/2026-03/notes/note_2"])
      );
    } finally {
      await server.close();
    }
  });

  it("bounds association pagination so a never-ending cursor cannot loop forever", async () => {
    let notePageCalls = 0;
    const server = await startServer((request, response) => {
      if (/^\/crm\/v3\/objects\/tickets\/[^/]+$/.test(request.pathname)) {
        writeJson(response, { id: "1", properties: { subject: "Тикет" } });
        return;
      }

      const associationMatch = request.pathname.match(/^\/crm\/v4\/objects\/tickets\/[^/]+\/associations\/([^/]+)$/);
      if (associationMatch) {
        if (associationMatch[1] === "notes") {
          notePageCalls += 1;
          // Always return another cursor — the adapter must stop on its own bound.
          writeJson(response, { results: [], paging: { next: { after: `cursor-${notePageCalls}` } } });
          return;
        }
        writeJson(response, { results: [] });
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "not found" }));
    });

    try {
      await createHubspotAdapter().loadConversation({
        source: "hubspot",
        baseUrl: server.baseUrl,
        externalId: "1",
        token: "hubspot-token"
      });

      // Bounded to 5 pages per association type.
      expect(notePageCalls).toBe(5);
    } finally {
      await server.close();
    }
  });
});

describe("Jira adapter HTTP fixes", () => {
  it("requests renderedBody on the comment fetch alongside start/limit", async () => {
    const server = await startServer((request, response) => {
      if (/^\/rest\/servicedeskapi\/request\/[^/]+$/.test(request.pathname)) {
        writeJson(response, {
          issueId: "10000",
          issueKey: "SUP-1",
          requestFieldValues: [{ fieldId: "summary", value: "Запрос" }],
          currentStatus: { status: "Resolved" }
        });
        return;
      }

      if (/^\/rest\/servicedeskapi\/request\/[^/]+\/comment$/.test(request.pathname)) {
        writeJson(response, {
          values: [
            {
              id: "10001",
              public: true,
              body: "*wiki* body",
              renderedBody: "<p><em>wiki</em> body</p>"
            }
          ],
          isLastPage: true
        });
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "not found" }));
    });

    try {
      await createJiraAdapter().loadConversation({
        source: "jira",
        baseUrl: server.baseUrl,
        externalId: "SUP-1",
        token: "agent@example.com:jira-api-token"
      });

      const commentRequest = server.requests.find((request) => request.pathname.endsWith("/comment"));
      expect(commentRequest).toBeDefined();
      expect(commentRequest?.query).toMatchObject({ expand: "renderedBody", limit: "100", start: "0" });
    } finally {
      await server.close();
    }
  });
});
