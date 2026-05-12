import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  auditLog: vi.fn(),
  createWebhookEndpoint: vi.fn(),
  prisma: {
    integration: {
      findFirst: vi.fn()
    },
    webhookEndpoint: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/webhooks/inbound", () => ({
  createWebhookEndpoint: mocks.createWebhookEndpoint
}));

function request(body: unknown) {
  return new Request("https://qc.example.test/api/v1/webhook-endpoints", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "req-webhook-endpoint" },
    body: JSON.stringify(body)
  });
}

describe("webhook endpoints route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: {
        id: "user-1",
        workspaceId: "workspace-1"
      }
    });
  });

  it("rejects a linked endpoint when source does not match integration source", async () => {
    const { POST } = await import("@/app/api/v1/webhook-endpoints/route");
    mocks.prisma.integration.findFirst.mockResolvedValue({
      id: "integration-1",
      source: "zendesk"
    });

    const response = await POST(
      request({
        source: "freshdesk",
        name: "Freshdesk webhook",
        integrationId: "integration-1"
      })
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "bad_request",
        message: "Webhook endpoint source must match the linked integration source.",
        details: null,
        requestId: "req-webhook-endpoint"
      }
    });
    expect(response.status).toBe(400);
    expect(mocks.createWebhookEndpoint).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("returns the full created endpoint contract with the one-time secret", async () => {
    const { POST } = await import("@/app/api/v1/webhook-endpoints/route");
    const createdAt = new Date("2026-05-09T08:00:00.000Z");
    const updatedAt = new Date("2026-05-09T08:01:00.000Z");
    mocks.prisma.integration.findFirst.mockResolvedValue({
      id: "integration-1",
      source: "freshdesk"
    });
    mocks.createWebhookEndpoint.mockResolvedValue({
      endpoint: {
        id: "endpoint-1",
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        source: "freshdesk",
        name: "Freshdesk webhook",
        status: "active",
        acceptedEvents: "conversation.upsert,conversation.deleted",
        secretPrefix: "whsec_abc...",
        encryptedSecret: "encrypted",
        signingAlgorithm: "hmac_sha256",
        lastReceivedAt: null,
        lastError: null,
        createdAt,
        updatedAt
      },
      secret: "whsec_plain"
    });
    mocks.auditLog.mockResolvedValue({});

    const response = await POST(
      request({
        source: "freshdesk",
        name: "Freshdesk webhook",
        integrationId: "integration-1",
        acceptedEvents: ["conversation.upsert", "conversation.deleted"]
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      webhookEndpoint: {
        id: "endpoint-1",
        integrationId: "integration-1",
        source: "freshdesk",
        name: "Freshdesk webhook",
        status: "active",
        acceptedEvents: ["conversation.upsert", "conversation.deleted"],
        secretPrefix: "whsec_abc...",
        signingAlgorithm: "hmac_sha256",
        lastReceivedAt: null,
        lastError: null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        secret: "whsec_plain"
      }
    });
  });
});
