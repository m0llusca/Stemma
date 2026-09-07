import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceWebhookIngressRateLimit,
  resetWebhookIngressRateLimitsForTests
} from "@/lib/api/rate-limit";

const mocks = vi.hoisted(() => ({
  ingestWebhookEvent: vi.fn()
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
    resetWebhookIngressRateLimitsForTests();
  });

  it("allows up to the limit then rejects further requests in the window", () => {
    const nowMs = 1_750_000_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect(
        enforceWebhookIngressRateLimit({
          workspaceId: "ws",
          endpointId: "ep",
          limit: 3,
          windowMs: 60_000,
          nowMs
        }).ok
      ).toBe(true);
    }

    expect(
      enforceWebhookIngressRateLimit({
        workspaceId: "ws",
        endpointId: "ep",
        limit: 3,
        windowMs: 60_000,
        nowMs
      }).ok
    ).toBe(false);
  });

  it("scopes buckets per workspace and endpoint", () => {
    const nowMs = 1_750_000_000_000;
    expect(
      enforceWebhookIngressRateLimit({
        workspaceId: "ws-a",
        endpointId: "ep",
        limit: 1,
        nowMs
      }).ok
    ).toBe(true);
    expect(
      enforceWebhookIngressRateLimit({
        workspaceId: "ws-b",
        endpointId: "ep",
        limit: 1,
        nowMs
      }).ok
    ).toBe(true);
  });
});

describe("public webhook route rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWebhookIngressRateLimitsForTests();
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
