import type { BackendJob } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagingDeliveryJobPayload } from "@/lib/messaging/job-contract";
import type { SendToChannelResult } from "@/lib/messaging/send";
import type { SendToChannelFn } from "@/lib/jobs/messaging-delivery-job";

const mocks = vi.hoisted(() => ({
  prisma: {
    messagingChannel: {
      findMany: vi.fn(),
      update: vi.fn()
    },
    messagingDelivery: {
      update: vi.fn()
    },
    backendJobEvent: {
      create: vi.fn()
    }
  },
  recordMessagingDelivery: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/messaging/delivery", () => ({
  recordMessagingDelivery: mocks.recordMessagingDelivery
}));

function backendJob(overrides: Partial<BackendJob> = {}): BackendJob {
  const now = new Date("2026-06-29T08:00:00.000Z");

  return {
    id: "job-1",
    workspaceId: "workspace-1",
    type: "MESSAGING_DELIVERY",
    status: "RUNNING",
    queueName: "default",
    priority: 100,
    payloadJson: "{}",
    resultJson: "{}",
    errorMessage: null,
    attempts: 1,
    maxAttempts: 3,
    runAfter: now,
    lockedAt: now,
    lockedBy: "worker-1",
    startedAt: now,
    finishedAt: null,
    createdById: "user-1",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function payload(overrides: Partial<MessagingDeliveryJobPayload> = {}): MessagingDeliveryJobPayload {
  return {
    eventType: "review.finalized",
    recipientType: "manager",
    recipientRef: "user-9",
    context: {
      title: "Проверка финализирована",
      body: "Оценка по обращению готова.",
      href: "https://app.example.com/reviews/rev-1"
    },
    ...overrides
  };
}

function fakeSend(result: SendToChannelResult) {
  return vi.fn<SendToChannelFn>(async () => result);
}

beforeEach(() => {
  vi.clearAllMocks();
  let counter = 0;
  mocks.recordMessagingDelivery.mockImplementation(async () => {
    counter += 1;
    return { id: `delivery-${counter}` };
  });
  mocks.prisma.messagingDelivery.update.mockResolvedValue({});
  mocks.prisma.messagingChannel.update.mockResolvedValue({});
  mocks.prisma.backendJobEvent.create.mockResolvedValue({});
});

describe("runMessagingDeliveryJob", () => {
  it("records a queued delivery and marks it delivered on success", async () => {
    mocks.prisma.messagingChannel.findMany.mockResolvedValue([
      { id: "chan-1", kind: "slack", configJson: JSON.stringify({ webhookUrl: "https://x" }), secretRef: null }
    ]);
    const send = fakeSend({ ok: true });
    const { runMessagingDeliveryJob } = await import("@/lib/jobs/messaging-delivery-job");

    const result = await runMessagingDeliveryJob(backendJob(), payload(), { sendToChannel: send });

    // A queued row was created with the prebuilt context.
    expect(mocks.recordMessagingDelivery).toHaveBeenCalledTimes(1);
    const recordInput = mocks.recordMessagingDelivery.mock.calls[0][0];
    expect(recordInput).toMatchObject({
      workspaceId: "workspace-1",
      channelId: "chan-1",
      kind: "slack",
      eventType: "review.finalized",
      recipientType: "manager"
    });
    expect(recordInput.message.title).toBe("Проверка финализирована");

    // sendToChannel received the channel + the verbatim context.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toMatchObject({ title: "Проверка финализирована" });

    // The row is flipped to "delivered" and the channel stamped lastDeliveredAt.
    expect(mocks.prisma.messagingDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "delivery-1" }, data: expect.objectContaining({ status: "delivered" }) })
    );
    expect(mocks.prisma.messagingChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "chan-1" }, data: expect.objectContaining({ lastError: null }) })
    );

    expect(result).toMatchObject({ sent: 1, failed: 0, noActiveChannels: false });
  });

  it("marks the delivery failed and records the channel error on transport failure", async () => {
    mocks.prisma.messagingChannel.findMany.mockResolvedValue([
      { id: "chan-1", kind: "slack", configJson: JSON.stringify({ webhookUrl: "https://x" }), secretRef: null }
    ]);
    const send = fakeSend({ ok: false, error: "Канал вернул HTTP 500." });
    const { runMessagingDeliveryJob } = await import("@/lib/jobs/messaging-delivery-job");

    const result = await runMessagingDeliveryJob(backendJob(), payload(), { sendToChannel: send });

    expect(mocks.prisma.messagingDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery-1" },
        data: expect.objectContaining({ status: "failed", error: "Канал вернул HTTP 500." })
      })
    );
    expect(mocks.prisma.messagingChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "chan-1" }, data: { lastError: "Канал вернул HTTP 500." } })
    );
    expect(result).toMatchObject({ sent: 0, failed: 1 });
  });

  it("no-ops gracefully (records an event, succeeds) when there are no active channels", async () => {
    mocks.prisma.messagingChannel.findMany.mockResolvedValue([]);
    const send = fakeSend({ ok: true });
    const { runMessagingDeliveryJob } = await import("@/lib/jobs/messaging-delivery-job");

    const result = await runMessagingDeliveryJob(backendJob(), payload(), { sendToChannel: send });

    expect(send).not.toHaveBeenCalled();
    expect(mocks.recordMessagingDelivery).not.toHaveBeenCalled();
    expect(mocks.prisma.backendJobEvent.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ noActiveChannels: true, channelsConsidered: 0, sent: 0 });
  });

  it("fails cleanly on a malformed payload without touching channels", async () => {
    const { runMessagingDeliveryJob } = await import("@/lib/jobs/messaging-delivery-job");

    await expect(runMessagingDeliveryJob(backendJob(), { eventType: "not.an.event" })).rejects.toThrow();
    expect(mocks.prisma.messagingChannel.findMany).not.toHaveBeenCalled();
    expect(mocks.recordMessagingDelivery).not.toHaveBeenCalled();
  });
});
