import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("public webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ingestWebhookEvent.mockResolvedValue({
      status: "processed",
      eventId: "event-1",
      conversationId: "conversation-1"
    });
  });

  it("rejects oversized content-length before reading or ingesting the body", async () => {
    const { POST, maxWebhookBodyBytes } = await import("@/app/api/v1/webhooks/[endpointId]/route");
    const response = await POST(
      new Request("https://qc.example.test/api/v1/webhooks/endpoint-1", {
        method: "POST",
        headers: {
          "content-length": String(maxWebhookBodyBytes + 1),
          "idempotency-key": "idem-1",
          "x-qc-webhook-timestamp": "1750000000",
          "x-qc-webhook-signature": "v1=signature",
          "x-request-id": "req-webhook-size"
        }
      }),
      context()
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "bad_request",
        message: `Webhook payload exceeds ${maxWebhookBodyBytes} bytes.`,
        details: null,
        requestId: "req-webhook-size"
      }
    });
    expect(mocks.ingestWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects oversized raw text as a backstop after reading", async () => {
    const { POST, maxWebhookBodyBytes } = await import("@/app/api/v1/webhooks/[endpointId]/route");
    const response = await POST(
      new Request("https://qc.example.test/api/v1/webhooks/endpoint-1", {
        method: "POST",
        headers: {
          "idempotency-key": "idem-1",
          "x-qc-webhook-timestamp": "1750000000",
          "x-qc-webhook-signature": "v1=signature",
          "x-request-id": "req-webhook-raw-size"
        },
        body: "x".repeat(maxWebhookBodyBytes + 1)
      }),
      context()
    );

    expect(response.status).toBe(413);
    expect(mocks.ingestWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects requests without signature headers with explicit 400 responses", async () => {
    const { POST } = await import("@/app/api/v1/webhooks/[endpointId]/route");

    const missingTimestamp = await POST(
      new Request("https://qc.example.test/api/v1/webhooks/endpoint-1", {
        method: "POST",
        headers: {
          "idempotency-key": "idem-1",
          "x-qc-webhook-signature": "v1=signature",
          "x-request-id": "req-webhook-no-timestamp"
        },
        body: "{}"
      }),
      context()
    );

    expect(missingTimestamp.status).toBe(400);
    await expect(missingTimestamp.json()).resolves.toMatchObject({
      error: {
        code: "bad_request",
        message: "x-qc-webhook-timestamp header is required.",
        requestId: "req-webhook-no-timestamp"
      }
    });

    const missingSignature = await POST(
      new Request("https://qc.example.test/api/v1/webhooks/endpoint-1", {
        method: "POST",
        headers: {
          "idempotency-key": "idem-1",
          "x-qc-webhook-timestamp": "1750000000",
          "x-request-id": "req-webhook-no-signature"
        },
        body: "{}"
      }),
      context()
    );

    expect(missingSignature.status).toBe(400);
    await expect(missingSignature.json()).resolves.toMatchObject({
      error: {
        code: "bad_request",
        message: "x-qc-webhook-signature header is required.",
        requestId: "req-webhook-no-signature"
      }
    });

    expect(mocks.ingestWebhookEvent).not.toHaveBeenCalled();
  });
});
