import { describe, expect, it } from "vitest";
import { normalizeCustomConversation, normalizeCustomMessage } from "@/lib/normalizers/custom-api";
import { customConversationSchema, customMessageSchema } from "@/lib/validation/custom-api";

describe("custom API normalizer", () => {
  it("normalizes a custom conversation payload for Prisma", () => {
    const payload = customConversationSchema.parse({
      externalSource: "custom_api",
      externalId: "conv-123",
      externalUrl: "https://example.com/conversations/conv-123",
      channel: "chat",
      subject: "Delayed shipment",
      status: "closed",
      tags: ["shipping", "vip"],
      customerName: "Ava Customer",
      assigneeName: "Sam Agent",
      samplingReason: "High-value customer",
      samplingType: "dsat",
      csatScore: 2,
      supportLine: "L1",
      teamName: "Refunds",
      riskHint: "Refund requested",
      openedAt: "2026-04-25T10:00:00.000Z",
      closedAt: "2026-04-25T10:30:00.000Z",
      messages: []
    });

    expect(normalizeCustomConversation(payload)).toEqual({
      externalSource: "custom_api",
      externalId: "conv-123",
      externalUrl: "https://example.com/conversations/conv-123",
      channel: "CHAT",
      subject: "Delayed shipment",
      status: "closed",
      tags: "shipping,vip",
      customerName: "Ava Customer",
      assigneeName: "Sam Agent",
      samplingReason: "High-value customer",
      samplingType: "DSAT",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "L1",
      teamName: "Refunds",
      riskHint: "Refund requested",
      openedAt: new Date("2026-04-25T10:00:00.000Z"),
      closedAt: new Date("2026-04-25T10:30:00.000Z")
    });
  });

  it("normalizes custom messages and defaults isPrivate to false", () => {
    const payload = customMessageSchema.parse({
      externalId: "msg-1",
      participantType: "human_agent",
      authorName: "Sam Agent",
      body: "I can help with that.",
      sentAt: "2026-04-25T10:04:00.000Z"
    });

    expect(normalizeCustomMessage(payload)).toEqual({
      externalId: "msg-1",
      participantType: "HUMAN_AGENT",
      authorName: "Sam Agent",
      body: "I can help with that.",
      sentAt: new Date("2026-04-25T10:04:00.000Z"),
      isPrivate: false
    });
  });

  it("rejects invalid external URLs", () => {
    expect(() =>
      customConversationSchema.parse({
        externalSource: "custom_api",
        externalId: "conv-123",
        externalUrl: "not-a-url",
        channel: "chat",
        subject: "Delayed shipment",
        status: "closed",
        tags: ["shipping"],
        customerName: "Ava Customer",
        samplingReason: "High-value customer",
        openedAt: "2026-04-25T10:00:00.000Z",
        messages: []
      })
    ).toThrow();
  });
});
