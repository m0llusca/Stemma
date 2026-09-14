import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  ingestWebhookEvent: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    ingressRateLimit: {
      upsert: mocks.upsert
    }
  }
}));

vi.mock("@/lib/webhooks/inbound", () => ({
  ingestWebhookEvent: mocks.ingestWebhookEvent
}));

function context() {
  return {
    params: Promise.resolve({ endpointId: "endpoint-1" })
  };
}

function signedRequest(requestId: string) {
  return new Request("https://qc.example.test/api/v1/webhooks/endpoint-1", {
    method: "POST",
    headers: {
      "idempotency-key": `idem-${requestId}`,
      "x-qc-workspace-id": "workspace-1",
      "x-qc-webhook-timestamp": "1750000000",
      "x-qc-webhook-signature": "v1=signature",
      "x-request-id": requestId
    },
    body: "{}"
  });
}

describe("enforceWebhookIngressRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows up to the limit then rejects further requests in the window", async () => {
    const { enforceWebhookIngressRateLimit } = await import("@/lib/api/rate-limit");
    const nowMs = 1_750_000_000_000;
    let count = 0;
    mocks.upsert.mockImplementation(async () => {
      count += 1;
      return { requestCount: count };
    });

    for (let i = 0; i < 3; i += 1) {
      expect(
        (
          await enforceWebhookIngressRateLimit({
            workspaceId: "ws",
            endpointId: "ep",
            limit: 3,
            windowMs: 60_000,
            nowMs
          })
        ).ok
      ).toBe(true);
    }

    expect(
      (
        await enforceWebhookIngressRateLimit({
          workspaceId: "ws",
          endpointId: "ep",
          limit: 3,
          windowMs: 60_000,
          nowMs
        })
      ).ok
    ).toBe(false);
  });

  it("scopes buckets per workspace and endpoint", async () => {
    const { enforceWebhookIngressRateLimit } = await import("@/lib/api/rate-limit");
    const nowMs = 1_750_000_000_000;
    mocks.upsert.mockResolvedValue({ requestCount: 1 });

    expect(
      (
        await enforceWebhookIngressRateLimit({
          workspaceId: "ws-a",
          endpointId: "ep",
          limit: 1,
          nowMs
        })
      ).ok
    ).toBe(true);
    expect(
      (
        await enforceWebhookIngressRateLimit({
          workspaceId: "ws-b",
          endpointId: "ep",
          limit: 1,
          nowMs
        })
      ).ok
    ).toBe(true);

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0]?.[0]?.where?.workspaceId_routeKey_windowStart?.workspaceId).toBe(
      "ws-a"
    );
    expect(mocks.upsert.mock.calls[1]?.[0]?.where?.workspaceId_routeKey_windowStart?.workspaceId).toBe(
      "ws-b"
    );
  });
});

describe("public webhook route rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let count = 0;
    mocks.upsert.mockImplementation(async () => {
      count += 1;
      return { requestCount: count };
    });
    mocks.ingestWebhookEvent.mockResolvedValue({
      status: "processed",
      eventId: "event-1",
      conversationId: "conversation-1"
    });
  });

  it("returns 429 when the ingress bucket is exhausted", async () => {
    const { POST } = await import("@/app/api/v1/webhooks/[endpointId]/route");

    for (let i = 0; i < 120; i += 1) {
      const response = await POST(signedRequest(`req-ok-${i}`), context());
      expect(response.status).not.toBe(429);
    }

    const limited = await POST(signedRequest("req-limited"), context());
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      error: {
        code: "rate_limited",
        requestId: "req-limited"
      }
    });
    expect(mocks.ingestWebhookEvent).toHaveBeenCalledTimes(120);
  });
});
