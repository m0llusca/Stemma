import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/secrets";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    webhookEndpoint: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    webhookIngestEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    }
  },
  tx: {
    integrationRun: {
      create: vi.fn(),
      update: vi.fn()
    },
    integrationRunItem: {
      create: vi.fn()
    },
    webhookIngestEvent: {
      update: vi.fn()
    },
    integration: {
      update: vi.fn(),
      updateMany: vi.fn()
    },
    webhookEndpoint: {
      update: vi.fn()
    }
  },
  upsertCustomConversation: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/conversation-import", () => ({
  upsertCustomConversation: mocks.upsertCustomConversation
}));

function rawBody() {
  return JSON.stringify({
    eventType: "conversation.upsert",
    conversation: {
      externalSource: "generic_webhook",
      externalId: "ticket-1",
      channel: "ticket",
      subject: "Webhook ticket",
      status: "closed",
      tags: ["webhook"],
      customerName: "Customer",
      samplingReason: "Webhook import",
      openedAt: "2026-05-09T08:00:00.000Z",
      messages: [
        {
          externalId: "m1",
          participantType: "customer",
          authorName: "Customer",
          body: "Hello",
          sentAt: "2026-05-09T08:00:00.000Z",
          isPrivate: false
        }
      ]
    }
  });
}

describe("webhook ingest service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.prisma.webhookEndpoint.findFirst.mockResolvedValue({
      id: "endpoint-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integration: { id: "integration-1", type: "webhook_bridge", status: "active" },
      source: "generic_webhook",
      acceptedEvents: "conversation.upsert",
      encryptedSecret: encryptSecret("whsec_test")
    });
    mocks.prisma.webhookEndpoint.update.mockResolvedValue({});
    mocks.prisma.webhookIngestEvent.update.mockResolvedValue({ id: "event-1" });
    mocks.prisma.webhookIngestEvent.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.integrationRun.create.mockResolvedValue({ id: "run-1" });
    mocks.tx.webhookIngestEvent.update.mockResolvedValue({});
    mocks.tx.integrationRun.update.mockResolvedValue({});
    mocks.tx.integrationRunItem.create.mockResolvedValue({});
    mocks.tx.integration.update.mockResolvedValue({});
    mocks.tx.integration.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.webhookEndpoint.update.mockResolvedValue({});
    mocks.upsertCustomConversation.mockResolvedValue({
      id: "conversation-1",
      externalSource: "generic_webhook",
      externalId: "ticket-1",
      subject: "Webhook ticket",
      messageCount: 1
    });
  });

  it("reprocesses a previously failed idempotency key instead of dropping it as duplicate", async () => {
    const { ingestWebhookEvent, signWebhookPayload, webhookRequestHash } = await import("@/lib/webhooks/inbound");
    const body = rawBody();
    const timestamp = String(Date.now());
    const signature = signWebhookPayload({ secret: "whsec_test", timestamp, payload: body });
    mocks.prisma.webhookIngestEvent.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["endpointId", "idempotencyKey"] }
    });
    mocks.prisma.webhookIngestEvent.findUnique.mockResolvedValue({
      id: "event-1",
      status: "failed",
      requestHash: webhookRequestHash(body),
      conversationId: null,
      receivedAt: new Date("2026-05-09T08:00:00.000Z")
    });

    await expect(
      ingestWebhookEvent({
        endpointId: "endpoint-1",
        rawBody: body,
        idempotencyKey: "idem-1",
        timestamp,
        signature
      })
    ).resolves.toEqual({
      status: "processed",
      eventId: "event-1",
      conversationId: "conversation-1"
    });

    expect(mocks.prisma.webhookIngestEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "event-1",
        requestHash: webhookRequestHash(body),
        status: "failed"
      },
      data: expect.objectContaining({
        status: "received",
        errorMessage: null,
        processedAt: null
      })
    });
    expect(mocks.tx.integrationRunItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        integrationRunId: "run-1",
        externalId: "ticket-1",
        status: "imported",
        conversationId: "conversation-1"
      })
    });
    expect(mocks.tx.integration.updateMany).toHaveBeenCalledWith({
      where: {
        id: "integration-1",
        workspaceId: "workspace-1",
        status: "active"
      },
      data: expect.objectContaining({
        syncCursor: "ticket-1",
        syncStateJson: expect.any(String)
      })
    });
  });

  it("returns duplicate only for already processed idempotency keys", async () => {
    const { ingestWebhookEvent, signWebhookPayload, webhookRequestHash } = await import("@/lib/webhooks/inbound");
    const body = rawBody();
    const timestamp = String(Date.now());
    const signature = signWebhookPayload({ secret: "whsec_test", timestamp, payload: body });
    mocks.prisma.webhookIngestEvent.create.mockRejectedValue({ code: "P2002" });
    mocks.prisma.webhookIngestEvent.findUnique.mockResolvedValue({
      id: "event-1",
      status: "processed",
      requestHash: webhookRequestHash(body),
      conversationId: "conversation-1",
      receivedAt: new Date("2026-05-09T08:00:00.000Z")
    });

    await expect(
      ingestWebhookEvent({
        endpointId: "endpoint-1",
        rawBody: body,
        idempotencyKey: "idem-1",
        timestamp,
        signature
      })
    ).resolves.toEqual({
      status: "duplicate",
      eventId: "event-1",
      conversationId: "conversation-1"
    });
    expect(mocks.upsertCustomConversation).not.toHaveBeenCalled();
  });

  it("forces imported conversation source to match the endpoint source", async () => {
    const { ingestWebhookEvent, signWebhookPayload } = await import("@/lib/webhooks/inbound");
    const body = rawBody().replace('"externalSource":"generic_webhook"', '"externalSource":"freshdesk"');
    const timestamp = String(Date.now());
    const signature = signWebhookPayload({ secret: "whsec_test", timestamp, payload: body });
    mocks.prisma.webhookIngestEvent.findUnique.mockResolvedValue(null);
    mocks.prisma.webhookIngestEvent.create.mockResolvedValue({ id: "event-1" });

    await ingestWebhookEvent({
      endpointId: "endpoint-1",
      rawBody: body,
      idempotencyKey: "idem-source",
      timestamp,
      signature
    });

    expect(mocks.upsertCustomConversation).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        externalSource: "generic_webhook",
        externalId: "ticket-1"
      }),
      mocks.tx
    );
  });

  it("rejects linked endpoints when the integration is not active", async () => {
    const { ingestWebhookEvent } = await import("@/lib/webhooks/inbound");
    mocks.prisma.webhookEndpoint.findFirst.mockResolvedValue({
      id: "endpoint-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      integration: { id: "integration-1", type: "webhook_bridge", status: "disabled" },
      source: "generic_webhook",
      acceptedEvents: "conversation.upsert",
      encryptedSecret: encryptSecret("whsec_test")
    });

    await expect(
      ingestWebhookEvent({
        endpointId: "endpoint-1",
        rawBody: rawBody(),
        idempotencyKey: "idem-disabled",
        timestamp: null,
        signature: null
      })
    ).rejects.toThrow("Webhook endpoint not found or disabled.");

    expect(mocks.prisma.webhookIngestEvent.create).not.toHaveBeenCalled();
    expect(mocks.tx.integration.updateMany).not.toHaveBeenCalled();
  });

  it("scopes endpoint lookup to the provided workspace id", async () => {
    const { ingestWebhookEvent, signWebhookPayload } = await import("@/lib/webhooks/inbound");
    const body = rawBody();
    const timestamp = String(Date.now());
    const signature = signWebhookPayload({ secret: "whsec_test", timestamp, payload: body });
    mocks.prisma.webhookIngestEvent.findUnique.mockResolvedValue(null);
    mocks.prisma.webhookIngestEvent.create.mockResolvedValue({ id: "event-1" });

    await ingestWebhookEvent({
      endpointId: "endpoint-1",
      workspaceId: "workspace-1",
      rawBody: body,
      idempotencyKey: "idem-workspace",
      timestamp,
      signature
    });

    expect(mocks.prisma.webhookEndpoint.findFirst).toHaveBeenCalledWith({
      where: {
        id: "endpoint-1",
        workspaceId: "workspace-1",
        status: "active"
      },
      include: {
        integration: true
      }
    });
  });

  it("reclaims a stale received idempotency record with the same payload", async () => {
    const { ingestWebhookEvent, signWebhookPayload, webhookReceivedReclaimMs, webhookRequestHash } = await import("@/lib/webhooks/inbound");
    const body = rawBody();
    const now = new Date("2026-05-09T09:00:00.000Z");
    const timestamp = String(now.getTime());
    const signature = signWebhookPayload({ secret: "whsec_test", timestamp, payload: body });
    mocks.prisma.webhookIngestEvent.findUnique.mockResolvedValue({
      id: "event-1",
      status: "received",
      requestHash: webhookRequestHash(body),
      conversationId: null,
      receivedAt: new Date(now.getTime() - webhookReceivedReclaimMs - 1)
    });

    await expect(
      ingestWebhookEvent({
        endpointId: "endpoint-1",
        rawBody: body,
        idempotencyKey: "idem-stale",
        timestamp,
        signature,
        now
      })
    ).resolves.toEqual({
      status: "processed",
      eventId: "event-1",
      conversationId: "conversation-1"
    });

    expect(mocks.prisma.webhookIngestEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "event-1",
        requestHash: webhookRequestHash(body),
        status: "received",
        receivedAt: {
          lte: new Date(now.getTime() - webhookReceivedReclaimMs)
        }
      },
      data: expect.objectContaining({
        status: "received",
        receivedAt: now,
        errorMessage: null,
        processedAt: null
      })
    });
  });

  it("keeps recent received idempotency records as in-progress conflicts", async () => {
    const { ingestWebhookEvent, signWebhookPayload, webhookReceivedReclaimMs, webhookRequestHash } = await import("@/lib/webhooks/inbound");
    const body = rawBody();
    const now = new Date("2026-05-09T09:00:00.000Z");
    const timestamp = String(now.getTime());
    const signature = signWebhookPayload({ secret: "whsec_test", timestamp, payload: body });
    mocks.prisma.webhookIngestEvent.findUnique.mockResolvedValue({
      id: "event-1",
      status: "received",
      requestHash: webhookRequestHash(body),
      conversationId: null,
      receivedAt: new Date(now.getTime() - webhookReceivedReclaimMs + 1)
    });

    await expect(
      ingestWebhookEvent({
        endpointId: "endpoint-1",
        rawBody: body,
        idempotencyKey: "idem-recent",
        timestamp,
        signature,
        now
      })
    ).rejects.toThrow("Webhook idempotency key is already being processed.");

    expect(mocks.prisma.webhookIngestEvent.updateMany).not.toHaveBeenCalled();
    expect(mocks.upsertCustomConversation).not.toHaveBeenCalled();
  });
});
