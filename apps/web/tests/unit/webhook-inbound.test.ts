import { describe, expect, it } from "vitest";
import {
  parseWebhookConversationPayload,
  signWebhookPayload,
  verifyWebhookSignature,
  webhookRequestHash
} from "@/lib/webhooks/inbound";

const payload = JSON.stringify({
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
        sentAt: "2026-05-09T08:00:00.000Z"
      }
    ]
  }
});

describe("inbound webhooks", () => {
  it("signs and verifies timestamped webhook payloads", () => {
    const timestamp = String(new Date("2026-05-09T08:00:00.000Z").getTime());
    const signature = signWebhookPayload({
      secret: "whsec_test",
      timestamp,
      payload
    });

    expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        timestamp,
        signature,
        payload,
        now: new Date("2026-05-09T08:02:00.000Z")
      })
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        timestamp,
        signature,
        payload: `${payload}\n`,
        now: new Date("2026-05-09T08:02:00.000Z")
      })
    ).toBe(false);
  });

  it("rejects stale webhook signatures", () => {
    const timestamp = String(new Date("2026-05-09T08:00:00.000Z").getTime());

    expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        timestamp,
        signature: signWebhookPayload({ secret: "whsec_test", timestamp, payload }),
        payload,
        now: new Date("2026-05-09T08:10:01.000Z")
      })
    ).toBe(false);
  });

  it("parses envelope and direct conversation webhook payloads", () => {
    expect(parseWebhookConversationPayload(JSON.parse(payload))).toMatchObject({
      eventType: "conversation.upsert",
      conversation: {
        externalSource: "generic_webhook",
        externalId: "ticket-1"
      }
    });
    expect(
      parseWebhookConversationPayload({
        externalSource: "generic_webhook",
        externalId: "ticket-2",
        channel: "ticket",
        subject: "Direct",
        status: "closed",
        customerName: "Customer",
        samplingReason: "Webhook import",
        openedAt: "2026-05-09T08:00:00.000Z",
        messages: []
      })
    ).toMatchObject({
      eventType: "conversation.upsert",
      conversation: {
        externalId: "ticket-2"
      }
    });
  });

  it("hashes request payloads deterministically for idempotency conflict checks", () => {
    expect(webhookRequestHash(payload)).toBe(webhookRequestHash(payload));
    expect(webhookRequestHash(payload)).not.toBe(webhookRequestHash(`${payload}\n`));
  });
});
