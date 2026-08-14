import { beforeEach, describe, expect, it, vi } from "vitest";
import { redactMetadata, redactText, redactedText } from "@/lib/privacy";

const routeMocks = vi.hoisted(() => {
  const tx = {
    conversation: { update: vi.fn() },
    message: { updateMany: vi.fn() },
    webhookIngestEvent: { updateMany: vi.fn() },
    integrationRunItem: { updateMany: vi.fn() }
  };

  return {
    requireSessionApi: vi.fn(),
    auditLog: vi.fn(),
    recordReviewEvent: vi.fn(),
    tx,
    prisma: {
      conversation: { findFirst: vi.fn() },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
    }
  };
});

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: routeMocks.requireSessionApi
}));

vi.mock("@/lib/db", () => ({
  prisma: routeMocks.prisma
}));

vi.mock("@/lib/audit", () => ({
  auditLog: routeMocks.auditLog
}));

vi.mock("@/lib/review-events", () => ({
  recordReviewEvent: routeMocks.recordReviewEvent
}));

describe("privacy helpers", () => {
  it("redacts text fields without losing object shape", () => {
    expect(redactText("Петр Иванов")).toBe(redactedText);
    expect(
      redactMetadata({
        customerName: "Петр",
        nested: {
          body: "secret",
          status: "closed"
        }
      })
    ).toEqual({
      customerName: redactedText,
      nested: {
        body: redactedText,
        status: "closed"
      }
    });
  });

  it("preserves null and undefined in redactText", () => {
    expect(redactText(null)).toBeNull();
    expect(redactText(undefined)).toBeUndefined();
    expect(redactText("")).toBe("");
  });

  it("keeps numbers, booleans and null untouched under sensitive keys", () => {
    expect(
      redactMetadata({
        customerId: 42,
        phoneVerified: true,
        customerName: null,
        messageCount: 0
      })
    ).toEqual({
      customerId: 42,
      phoneVerified: true,
      customerName: null,
      messageCount: 0
    });
  });

  it("redacts nested string values under sensitive keys", () => {
    expect(
      redactMetadata({
        customer: {
          address: "Москва, ул. Ленина",
          age: 30
        },
        messages: ["привет", 5]
      })
    ).toEqual({
      customer: {
        address: redactedText,
        age: 30
      },
      messages: [redactedText, 5]
    });
  });
});

describe("conversation redaction API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: { id: "user-1", workspaceId: "workspace-1" }
    });
    routeMocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      subject: "Вопрос о доставке",
      customerName: "Петр Иванов",
      messages: [{ id: "message-1" }]
    });
    routeMocks.tx.message.updateMany.mockResolvedValue({ count: 1 });
    routeMocks.tx.webhookIngestEvent.updateMany.mockResolvedValue({ count: 2 });
    routeMocks.tx.integrationRunItem.updateMany.mockResolvedValue({ count: 3 });
  });

  it("scrubs webhook ingest payloads and run item previews linked to the conversation", async () => {
    const { POST } = await import("@/app/api/v1/privacy/conversations/[conversationId]/redact/route");
    const response = await POST(
      new Request("https://example.test/api/v1/privacy/conversations/conversation-1/redact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Запрос клиента" })
      }),
      { params: Promise.resolve({ conversationId: "conversation-1" }) }
    );

    expect(response.status).toBe(200);

    const redactedPayloadJson = JSON.stringify({ redacted: redactedText });
    expect(routeMocks.tx.webhookIngestEvent.updateMany).toHaveBeenCalledWith({
      where: { conversationId: "conversation-1", workspaceId: "workspace-1" },
      data: { payloadJson: redactedPayloadJson }
    });
    expect(routeMocks.tx.integrationRunItem.updateMany).toHaveBeenCalledWith({
      where: { conversationId: "conversation-1", workspaceId: "workspace-1" },
      data: { normalizedPreviewJson: redactedPayloadJson }
    });
    expect(routeMocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          redactedMessages: 1,
          redactedIngestEvents: 2,
          redactedRunItems: 3
        })
      }),
      routeMocks.tx
    );
  });
});
