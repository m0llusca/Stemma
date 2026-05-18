import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import { createHelpdeskHttpClient, redactHelpdeskDiagnostic } from "@/lib/integrations/helpdesk-adapters/http";

async function expectHelpdeskError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HelpdeskAdapterError);
    return error as HelpdeskAdapterError;
  }

  throw new Error("Expected HelpdeskAdapterError.");
}

async function listen(server: http.Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("helpdesk adapter HTTP boundary", () => {
  it("parses JSON and records safe diagnostics", async () => {
    const client = createHelpdeskHttpClient({
      transport: async (request) => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, url: request.url })
      })
    });

    const result = await client.requestJson({
      source: "zendesk",
      operation: "ticket_get",
      method: "GET",
      url: "https://example.zendesk.com/api/v2/tickets/1.json",
      headers: { authorization: "Bearer secret-token" },
      timeoutMs: 15000,
      maxResponseBytes: 500000
    });

    expect(result.body).toEqual({ ok: true, url: "https://example.zendesk.com/api/v2/tickets/1.json" });
    expect(result.diagnostic.statusCode).toBe(200);
    expect(JSON.stringify(result.diagnostic)).not.toContain("secret-token");
  });

  it("maps non-2xx, invalid JSON, and oversized responses to safe connector errors", async () => {
    const authClient = createHelpdeskHttpClient({
      transport: async () => ({
        statusCode: 401,
        body: JSON.stringify({ message: "secret-token", authHint: "Authorization: Bearer secret-token" })
      })
    });

    const authError = await expectHelpdeskError(
      authClient.requestJson({
        source: "zendesk",
        operation: "ticket_get",
        method: "GET",
        url: "https://example.zendesk.com/api/v2/tickets/1.json?token=secret-token",
        headers: {},
        timeoutMs: 15000,
        maxResponseBytes: 500000
      })
    );

    expect(authError).toMatchObject({
      code: "auth_failed",
      safeMessage: "Источник отклонил учетные данные."
    });
    expect(JSON.stringify(authError.diagnostic)).not.toContain("secret-token");
    expect(JSON.stringify(authError.diagnostic)).toContain("\"message\":\"[REDACTED]\"");

    const invalidJsonClient = createHelpdeskHttpClient({
      transport: async () => ({ statusCode: 200, body: "token=secret-token" })
    });

    const invalidJsonError = await expectHelpdeskError(
      invalidJsonClient.requestJson({
        source: "freshdesk",
        operation: "ticket_get",
        method: "GET",
        url: "https://example.freshdesk.com/api/v2/tickets/1",
        headers: {},
        timeoutMs: 15000,
        maxResponseBytes: 500000
      })
    );

    expect(invalidJsonError).toMatchObject({
      code: "invalid_json",
      safeMessage: "Источник вернул ответ не в JSON-формате."
    });
    expect(JSON.stringify(invalidJsonError.diagnostic)).not.toContain("secret-token");

    const oversizedClient = createHelpdeskHttpClient({
      transport: async () => ({ statusCode: 200, body: JSON.stringify({ ok: true, password: "secret-token" }) })
    });

    const oversizedError = await expectHelpdeskError(
      oversizedClient.requestJson({
        source: "intercom",
        operation: "ticket_get",
        method: "POST",
        url: "https://api.intercom.io/tickets/1",
        headers: {},
        body: JSON.stringify({ password: "secret-token", keep: "visible" }),
        timeoutMs: 15000,
        maxResponseBytes: 5
      })
    );

    expect(oversizedError).toMatchObject({
      code: "response_too_large",
      safeMessage: "Ответ источника превышает лимит размера."
    });
    expect(JSON.stringify(oversizedError.diagnostic)).not.toContain("secret-token");

    const networkClient = createHelpdeskHttpClient({
      transport: async () => {
        throw new Error("connection reset");
      }
    });

    const networkError = await expectHelpdeskError(
      networkClient.requestJson({
        source: "hubspot",
        operation: "ticket_get",
        method: "POST",
        url: "https://api.hubapi.com/crm/v3/objects/tickets/1?access_token=secret-token",
        headers: {},
        body: JSON.stringify({ message: "api_key=secret-token", keep: "visible" }),
        timeoutMs: 15000,
        maxResponseBytes: 500000
      })
    );

    expect(networkError).toMatchObject({
      code: "network_error",
      safeMessage: "Не удалось выполнить запрос к источнику."
    });
    expect(JSON.stringify(networkError.diagnostic)).not.toContain("secret-token");
  });

  it("redacts auth fragments from diagnostics", () => {
    expect(
      redactHelpdeskDiagnostic({
        url: "https://user:pass@example.test/path?access_token=secret-token",
        headers: { authorization: "Bearer secret-token" },
        body: {
          password: "secret-token",
          bareMessage: "secret-token",
          message: "token=secret-token",
          authorizationNote: "Authorization: Bearer secret-token",
          keep: "visible"
        },
        requestBody: JSON.stringify({ message: "secret-token", note: "api_key=secret-token", keep: "visible" }),
        responseBody: JSON.stringify({ message: "secret-token", note: "password=secret-token", keep: "visible" })
      })
    ).toEqual({
      url: "https://[REDACTED]:[REDACTED]@example.test/path?access_token=[REDACTED]",
      headers: { authorization: "[REDACTED]" },
      body: {
        password: "[REDACTED]",
        bareMessage: "[REDACTED]",
        message: "token=[REDACTED]",
        authorizationNote: "[REDACTED]",
        keep: "visible"
      },
      requestBody: { message: "[REDACTED]", note: "api_key=[REDACTED]", keep: "visible" },
      responseBody: { message: "[REDACTED]", note: "password=[REDACTED]", keep: "visible" }
    });
  });

  it("enforces response size limits while streaming with the default transport", async () => {
    const totalChunks = 25;
    let chunksAttempted = 0;
    let chunksCompleted = false;
    let serverSawCloseBeforeDone = false;
    let resolveResponseClosed: () => void;
    const responseClosed = new Promise<void>((resolve) => {
      resolveResponseClosed = resolve;
    });
    const server = http.createServer(async (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.on("close", () => {
        serverSawCloseBeforeDone = !chunksCompleted;
        resolveResponseClosed();
      });

      for (let index = 0; index < totalChunks; index += 1) {
        if (response.destroyed) {
          break;
        }

        chunksAttempted += 1;
        response.write("x".repeat(8));
        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      chunksCompleted = chunksAttempted === totalChunks;

      if (!response.destroyed) {
        response.end();
      }
    });
    const baseUrl = await listen(server);

    try {
      const client = createHelpdeskHttpClient();
      const error = await expectHelpdeskError(
        client.requestJson({
          source: "zendesk",
          operation: "ticket_get",
          method: "GET",
          url: `${baseUrl}/oversized`,
          headers: {},
          timeoutMs: 15000,
          maxResponseBytes: 10
        })
      );

      expect(error).toMatchObject({
        code: "response_too_large",
        safeMessage: "Ответ источника превышает лимит размера."
      });
      expect(error.diagnostic).toMatchObject({ statusCode: 200 });
      await responseClosed;
      expect(serverSawCloseBeforeDone).toBe(true);
      expect(chunksAttempted).toBeLessThan(totalChunks);
    } finally {
      await close(server);
    }
  });

  it("maps interrupted response streams from the default transport to network errors", async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"partial":');
      setImmediate(() => response.destroy(new Error("forced close")));
    });
    const baseUrl = await listen(server);

    try {
      const client = createHelpdeskHttpClient();
      const error = await expectHelpdeskError(
        client.requestJson({
          source: "freshdesk",
          operation: "ticket_get",
          method: "GET",
          url: `${baseUrl}/interrupted`,
          headers: {},
          timeoutMs: 15000,
          maxResponseBytes: 500000
        })
      );

      expect(error).toMatchObject({
        code: "network_error",
        safeMessage: "Не удалось выполнить запрос к источнику."
      });
    } finally {
      await close(server);
    }
  });

  it("exposes typed errors", () => {
    const error = new HelpdeskAdapterError({
      code: "invalid_json",
      source: "freshdesk",
      operation: "ticket_get",
      safeMessage: "Источник вернул ответ не в JSON-формате.",
      diagnostic: { statusCode: 200 }
    });

    expect(error.message).toBe("Источник вернул ответ не в JSON-формате.");
    expect(error.source).toBe("freshdesk");
  });
});
