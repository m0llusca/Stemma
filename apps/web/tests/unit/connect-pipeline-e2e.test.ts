import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { helpdeskProfiles } from "@/lib/integrations/connect/profiles/helpdesk";
import { runConnectPipeline } from "@/lib/integrations/connect/orchestrator";

// Локальный HTTP-сервер, отвечающий как Zendesk: /api/v2/users/me.json -> 200 при
// валидном Basic-заголовке, иначе 401. Это даёт сквозную проверку конвейера
// (validate_url -> reachability -> verify_auth -> persist) на реальном HTTP.
function startZendeskLikeServer(expectedAuth: string) {
  const server = http.createServer((request, response) => {
    if (request.url?.startsWith("/api/v2/users/me.json")) {
      if (request.headers.authorization === expectedAuth) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ user: { id: 1, role: "admin" } }));
        return;
      }
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done()))
      });
    });
  });
}

describe("connect pipeline e2e (helpdesk over real HTTP)", () => {
  let env: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    // SSRF-guard блокирует приватные адреса по умолчанию — для локального сервера
    // включаем явное разрешение (как для on-prem установок).
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "1");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await env?.close();
  });

  it("connects a zendesk source end-to-end with a valid token", async () => {
    const expectedAuth = `Basic ${Buffer.from("agent@example.com/token:secret-token").toString("base64")}`;
    env = await startZendeskLikeServer(expectedAuth);

    const persist = vi.fn(async () => ({ integrationId: "int-zendesk-1" }));
    const journal = await runConnectPipeline({
      profile: helpdeskProfiles.zendesk,
      rawUrl: env.baseUrl,
      credentials: { email: "agent@example.com", apiToken: "secret-token" },
      workspaceId: "ws-1",
      actorId: "user-1",
      reachabilityCheck: async () => ({ status: "ok", detail: "ответил" }),
      persist
    });

    const statuses = Object.fromEntries(journal.steps.map((step) => [step.step, step.status]));
    expect(statuses.verify_auth).toBe("ok");
    expect(statuses.persist).toBe("ok");
    expect(journal.connected).toBe(true);
    expect(journal.integrationId).toBe("int-zendesk-1");

    expect(persist).toHaveBeenCalledOnce();
    const persistArg = (persist.mock.calls[0] as unknown[])[0] as {
      authMode: string;
      secretSlots: Array<{ kind: string; secret: string }>;
    };
    expect(persistArg.authMode).toBe("basic_api_token");
    expect(persistArg.secretSlots[0]).toEqual({ kind: "auth_password", secret: "agent@example.com/token:secret-token" });
  });

  it("fails verify_auth and does not persist with a bad token", async () => {
    const expectedAuth = `Basic ${Buffer.from("agent@example.com/token:correct").toString("base64")}`;
    env = await startZendeskLikeServer(expectedAuth);

    const persist = vi.fn();
    const journal = await runConnectPipeline({
      profile: helpdeskProfiles.zendesk,
      rawUrl: env.baseUrl,
      credentials: { email: "agent@example.com", apiToken: "wrong" },
      workspaceId: "ws-1",
      actorId: "user-1",
      reachabilityCheck: async () => ({ status: "ok" }),
      persist
    });

    expect(journal.steps.find((step) => step.step === "verify_auth")?.status).toBe("failed");
    expect(journal.connected).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
});
