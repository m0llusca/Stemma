import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

type RecordedRequest = {
  pathname: string;
  query: Record<string, string>;
};

type LocalServer = {
  baseUrl: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
};

async function startServer(handler: http.RequestListener): Promise<{ server: http.Server; baseUrl: string }> {
  const server = http.createServer(handler);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("Zendesk native normalizer fixes", () => {
  it("classifies sideloaded agent/admin authors as human_agent and end-users as customers", () => {
    const conversations = normalizeNativeHelpdeskPayload(
      {
        ticket: {
          id: 35436,
          subject: "Refund request",
          status: "open",
          requester_id: 111,
          created_at: "2026-04-25T10:00:00Z"
        },
        users: [
          { id: 111, name: "Анна Смирнова", role: "end-user" },
          { id: 222, name: "Иван Петров", role: "agent" },
          { id: 333, name: "Админ", role: "admin" }
        ],
        comments: [
          { id: 501, author_id: 111, plain_body: "Клиентское сообщение.", public: true, created_at: "2026-04-25T10:00:00Z" },
          { id: 502, author_id: 222, plain_body: "Ответ оператора.", public: true, created_at: "2026-04-25T10:05:00Z" },
          { id: 503, author_id: 333, plain_body: "Ответ администратора.", public: true, created_at: "2026-04-25T10:10:00Z" }
        ]
      },
      { source: "zendesk", baseUrl: "https://example.zendesk.com" }
    );

    const [conversation] = conversations;

    expect(conversation?.messages).toEqual([
      expect.objectContaining({ externalId: "501", participantType: "customer", authorName: "Анна Смирнова" }),
      expect.objectContaining({ externalId: "502", participantType: "human_agent", authorName: "Иван Петров" }),
      expect.objectContaining({ externalId: "503", participantType: "human_agent", authorName: "Админ" })
    ]);
  });

  it("uses the ticket id (not external_id) and the agent UI URL for the conversation identifier", () => {
    const [conversation] = normalizeNativeHelpdeskPayload(
      {
        ticket: {
          id: 35436,
          external_id: "legacy-crm-99",
          subject: "Refund request",
          status: "open",
          url: "https://example.zendesk.com/api/v2/tickets/35436.json",
          requester_id: 111,
          created_at: "2026-04-25T10:00:00Z"
        },
        users: [{ id: 111, name: "Анна Смирнова", role: "end-user" }],
        comments: [
          { id: 501, author_id: 111, plain_body: "Сообщение.", public: true, created_at: "2026-04-25T10:00:00Z" }
        ]
      },
      { source: "zendesk", baseUrl: "https://example.zendesk.com" }
    );

    expect(conversation?.externalId).toBe("35436");
    expect(conversation?.externalUrl).toBe("https://example.zendesk.com/agent/tickets/35436");
  });

  it("falls back to the boolean staff flags when no role is present", () => {
    const [conversation] = normalizeNativeHelpdeskPayload(
      {
        ticket: { id: 1, subject: "Ticket", status: "open", requester_id: 11, created_at: "2026-04-25T10:00:00Z" },
        users: [
          { id: 11, name: "Клиент", is_staff: false },
          { id: 22, name: "Оператор", is_staff: true }
        ],
        comments: [
          { id: 1, author_id: 11, plain_body: "Клиент.", public: true, created_at: "2026-04-25T10:00:00Z" },
          { id: 2, author_id: 22, plain_body: "Оператор.", public: true, created_at: "2026-04-25T10:05:00Z" }
        ]
      },
      { source: "zendesk" }
    );

    expect(conversation?.messages).toEqual([
      expect.objectContaining({ externalId: "1", participantType: "customer" }),
      expect.objectContaining({ externalId: "2", participantType: "human_agent" })
    ]);
  });
});

describe("Zendesk adapter sideloads users", () => {
  it("requests the users sideload on the comments endpoint", async () => {
    const requests: RecordedRequest[] = [];
    const { server, baseUrl } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push({ pathname: url.pathname, query: Object.fromEntries(url.searchParams.entries()) });
      response.setHeader("content-type", "application/json");

      if (/\/comments\.json$/.test(url.pathname)) {
        response.end(
          JSON.stringify({
            comments: [
              { id: 501, author_id: 111, plain_body: "Клиент.", public: true, created_at: "2026-04-25T10:00:00Z" },
              { id: 502, author_id: 222, plain_body: "Оператор.", public: true, created_at: "2026-04-25T10:05:00Z" }
            ],
            users: [
              { id: 111, name: "Анна Смирнова", role: "end-user" },
              { id: 222, name: "Иван Петров", role: "agent" }
            ]
          })
        );
        return;
      }

      response.end(
        JSON.stringify({
          ticket: {
            id: 35436,
            subject: "Refund request",
            status: "open",
            requester_id: 111,
            created_at: "2026-04-25T10:00:00Z",
            via: { channel: "email" }
          }
        })
      );
    });

    const localServer: LocalServer = {
      baseUrl,
      requests,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    };

    try {
      const adapter = createHelpdeskAdapter("zendesk");
      const result = await adapter.loadConversation({
        source: "zendesk",
        baseUrl: localServer.baseUrl,
        externalId: "35436",
        token: "agent@example.com/token:secret"
      });

      const commentsRequest = localServer.requests.find((entry) => /\/comments\.json$/.test(entry.pathname));
      expect(commentsRequest?.query.include).toBe("users");
      // The agent reply must be classified as a human agent thanks to the sideloaded role.
      expect(result.conversations[0]?.messages).toEqual([
        expect.objectContaining({ participantType: "customer", authorName: "Анна Смирнова" }),
        expect.objectContaining({ participantType: "human_agent", authorName: "Иван Петров" })
      ]);
    } finally {
      await localServer.close();
    }
  });
});

describe("Freshdesk native normalizer fixes", () => {
  it("resolves customerName from the included requester object", () => {
    const [conversation] = normalizeNativeHelpdeskPayload(
      {
        ticket: {
          id: 20,
          subject: "Refund request",
          status: 4,
          requester_id: 129,
          requester: { id: 129, name: "Анна Смирнова", email: "anna@example.com" },
          created_at: "2026-04-25T10:00:00Z",
          conversations: [
            { id: 301, incoming: true, body_text: "Сообщение.", created_at: "2026-04-25T10:00:00Z" }
          ]
        }
      },
      { source: "freshdesk", baseUrl: "https://example.freshdesk.com" }
    );

    expect(conversation?.customerName).toBe("Анна Смирнова");
  });

  it("degrades to the numeric responder_id when no responder object is included", () => {
    const [conversation] = normalizeNativeHelpdeskPayload(
      {
        ticket: {
          id: 20,
          subject: "Refund request",
          status: 4,
          responder_id: 1,
          requester: { id: 129, name: "Анна Смирнова" },
          created_at: "2026-04-25T10:00:00Z",
          conversations: [
            { id: 301, incoming: true, body_text: "Сообщение.", created_at: "2026-04-25T10:00:00Z" }
          ]
        }
      },
      { source: "freshdesk" }
    );

    expect(conversation?.assigneeName).toBe("1");
  });
});

describe("Freshdesk adapter pagination", () => {
  it("pages conversations beyond the 10-item embed and merges the full set", async () => {
    const totalConversations = 25;
    const perPage = 100;
    const allConversations = Array.from({ length: totalConversations }, (_, index) => ({
      id: 300 + index,
      incoming: index % 2 === 0,
      private: false,
      body_text: `Freshdesk conversation ${index + 1}`,
      from_email: index % 2 === 0 ? "anna@example.com" : "ivan@example.com",
      created_at: `2026-04-25T10:${String(index % 60).padStart(2, "0")}:00Z`
    }));
    const requests: RecordedRequest[] = [];

    const { server, baseUrl } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push({ pathname: url.pathname, query: Object.fromEntries(url.searchParams.entries()) });
      response.setHeader("content-type", "application/json");

      if (/\/conversations$/.test(url.pathname)) {
        const page = Number(url.searchParams.get("page") ?? "1");
        const start = (page - 1) * perPage;
        response.end(JSON.stringify(allConversations.slice(start, start + perPage)));
        return;
      }

      // The ticket embed caps at 10 conversations.
      response.end(
        JSON.stringify({
          id: 20,
          subject: "Refund request",
          status: 4,
          requester_id: 129,
          requester: { id: 129, name: "Анна Смирнова", email: "anna@example.com" },
          created_at: "2026-04-25T10:00:00Z",
          conversations: allConversations.slice(0, 10)
        })
      );
    });

    const localServer: LocalServer = {
      baseUrl,
      requests,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    };

    try {
      const adapter = createHelpdeskAdapter("freshdesk");
      const result = await adapter.loadConversation({
        source: "freshdesk",
        baseUrl: localServer.baseUrl,
        externalId: "20",
        token: "freshdesk-token"
      });

      // All 25 conversations become messages, not just the 10 embedded ones.
      expect(result.conversations[0]?.messages).toHaveLength(totalConversations);
      expect(result.conversations[0]?.messages[totalConversations - 1]?.body).toBe(
        `Freshdesk conversation ${totalConversations}`
      );
      expect(result.conversations[0]?.customerName).toBe("Анна Смирнова");

      const ticketRequest = requests.find((entry) => /\/tickets\/20$/.test(entry.pathname));
      expect(ticketRequest?.query.include).toBe("conversations,requester");

      const conversationRequests = requests.filter((entry) => /\/conversations$/.test(entry.pathname));
      // 25 conversations / 100 per page => a single full page that is short, so paging stops.
      expect(conversationRequests).toHaveLength(1);
      expect(conversationRequests[0]?.query).toMatchObject({ per_page: "100", page: "1" });
    } finally {
      await localServer.close();
    }
  });

  it("stops paging at the bounded page cap for very long threads", async () => {
    const perPage = 100;
    const requests: RecordedRequest[] = [];

    const { server, baseUrl } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push({ pathname: url.pathname, query: Object.fromEntries(url.searchParams.entries()) });
      response.setHeader("content-type", "application/json");

      if (/\/conversations$/.test(url.pathname)) {
        const page = Number(url.searchParams.get("page") ?? "1");
        // Always return a full page so the adapter would page forever without a cap.
        response.end(
          JSON.stringify(
            Array.from({ length: perPage }, (_, index) => ({
              id: page * 1000 + index,
              incoming: true,
              body_text: `conversation ${page}-${index}`,
              created_at: "2026-04-25T10:00:00Z"
            }))
          )
        );
        return;
      }

      response.end(
        JSON.stringify({
          id: 20,
          subject: "Long thread",
          status: 2,
          requester: { id: 129, name: "Анна Смирнова" },
          created_at: "2026-04-25T10:00:00Z",
          conversations: []
        })
      );
    });

    const localServer: LocalServer = {
      baseUrl,
      requests,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    };

    try {
      const adapter = createHelpdeskAdapter("freshdesk");
      const result = await adapter.loadConversation({
        source: "freshdesk",
        baseUrl: localServer.baseUrl,
        externalId: "20",
        token: "freshdesk-token"
      });

      const conversationRequests = requests.filter((entry) => /\/conversations$/.test(entry.pathname));
      // Bounded at 10 pages of 100 conversations.
      expect(conversationRequests).toHaveLength(10);
      expect(result.conversations[0]?.messages).toHaveLength(10 * perPage);
    } finally {
      await localServer.close();
    }
  });
});
