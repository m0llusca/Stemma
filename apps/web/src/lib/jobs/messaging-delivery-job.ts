import type { BackendJob } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BackendJobPayload } from "@/lib/jobs/enqueue";
import { parseMessagingDeliveryJobPayload } from "@/lib/messaging/job-contract";
import { recordMessagingDelivery } from "@/lib/messaging/delivery";
import type { SendToChannelOptions, SendToChannelResult } from "@/lib/messaging/send";
import type { MessagingTransport } from "@/lib/messaging/http";
import type { MessagingChannelKind } from "@/lib/messaging/types";

export type SendToChannelFn = (
  channel: { kind: string; configJson: string; secretRef: string | null },
  context: { title: string; body: string; href?: string },
  options?: SendToChannelOptions
) => Promise<SendToChannelResult>;

export type RunMessagingDeliveryJobOptions = {
  /**
   * Injectable webhook transport handed to the default sendToChannel so tests
   * can assert URL/body without a real network call.
   */
  transport?: MessagingTransport;
  /**
   * Injectable delivery function. Defaults to the real `sendToChannel`
   * (lazy-imported, then bound to the injected transport). Tests pass a fake to
   * assert the worker's record/update behavior independently of HTTP.
   */
  sendToChannel?: SendToChannelFn;
};

export type MessagingDeliveryJobResult = {
  eventType: string;
  channelsConsidered: number;
  sent: number;
  failed: number;
  skipped: number;
  noActiveChannels: boolean;
};

/**
 * A malformed payload is terminal: re-running the same payloadJson cannot
 * succeed. The queue caps retries via maxAttempts; this marker keeps the
 * failure explicit and avoids throwing a raw parse error.
 */
export class MessagingDeliveryMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagingDeliveryMalformedError";
  }
}

async function defaultSendToChannel(transport?: MessagingTransport): Promise<SendToChannelFn> {
  // Lazy import keeps this module loadable while sibling messaging files are
  // authored in parallel, and lets us bind the injected transport.
  const { sendToChannel } = await import("@/lib/messaging/send");
  return (channel, context, options) => sendToChannel(channel, context, { transport, ...options });
}

/**
 * MESSAGING_DELIVERY job handler: fans a prebuilt notification out to every
 * ACTIVE MessagingChannel in the workspace.
 *
 * For each active channel it records a queued MessagingDelivery row, POSTs to
 * the channel webhook, then marks the row "sent"/"failed" and updates the
 * channel's lastDeliveredAt/lastError. With no active channels it no-ops
 * gracefully (records a job event and succeeds). A malformed payload fails the
 * job cleanly via MessagingDeliveryMalformedError.
 */
export async function runMessagingDeliveryJob(
  job: BackendJob,
  payload: BackendJobPayload,
  options: RunMessagingDeliveryJobOptions = {}
): Promise<MessagingDeliveryJobResult> {
  const parsed = parseMessagingDeliveryJobPayload(payload);

  if (!parsed) {
    throw new MessagingDeliveryMalformedError("Некорректные параметры задачи доставки уведомления.");
  }

  const channels = await prisma.messagingChannel.findMany({
    where: { workspaceId: job.workspaceId, status: "active" },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, kind: true, configJson: true, secretRef: true }
  });

  if (channels.length === 0) {
    await prisma.backendJobEvent.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Нет активных каналов доставки — уведомление пропущено.",
        metadata: JSON.stringify({ eventType: parsed.eventType, recipientType: parsed.recipientType })
      }
    });

    return {
      eventType: parsed.eventType,
      channelsConsidered: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      noActiveChannels: true
    };
  }

  const send = options.sendToChannel ?? (await defaultSendToChannel(options.transport));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const channel of channels) {
    const delivery = await recordMessagingDelivery({
      workspaceId: job.workspaceId,
      channelId: channel.id,
      kind: channel.kind as MessagingChannelKind,
      eventType: parsed.eventType,
      recipientType: parsed.recipientType,
      recipientRef: parsed.recipientRef ?? null,
      message: {
        title: parsed.context.title,
        body: parsed.context.body,
        actionLabel: "Открыть",
        href: parsed.context.href ?? ""
      },
      payload: { recipientRef: parsed.recipientRef }
    });

    let result: SendToChannelResult;
    try {
      result = await send(
        { kind: channel.kind, configJson: channel.configJson, secretRef: channel.secretRef },
        parsed.context,
        { transport: options.transport }
      );
    } catch (error) {
      // sendToChannel is contractually non-throwing, but stay defensive: a
      // single channel must never abort delivery to the others.
      result = { ok: false, error: error instanceof Error ? error.message : "Неизвестная ошибка доставки." };
    }

    const now = new Date();

    if (result.ok) {
      sent += 1;
      await prisma.messagingDelivery.update({
        where: { id: delivery.id },
        data: { status: "sent", error: null, deliveredAt: now }
      });
      await prisma.messagingChannel.update({
        where: { id: channel.id },
        data: { lastDeliveredAt: now, lastError: null }
      });
    } else {
      if (result.unsupported) {
        skipped += 1;
      } else {
        failed += 1;
      }
      const errorText = result.error ?? "Не удалось отправить уведомление в канал.";
      await prisma.messagingDelivery.update({
        where: { id: delivery.id },
        data: { status: "failed", error: errorText }
      });
      await prisma.messagingChannel.update({
        where: { id: channel.id },
        data: { lastError: errorText }
      });
    }
  }

  await prisma.backendJobEvent.create({
    data: {
      jobId: job.id,
      level: failed > 0 ? "warn" : "info",
      message: "Доставка уведомления обработана.",
      metadata: JSON.stringify({
        eventType: parsed.eventType,
        recipientType: parsed.recipientType,
        channelsConsidered: channels.length,
        sent,
        failed,
        skipped
      })
    }
  });

  return {
    eventType: parsed.eventType,
    channelsConsidered: channels.length,
    sent,
    failed,
    skipped,
    noActiveChannels: false
  };
}
