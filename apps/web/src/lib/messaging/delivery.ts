import { prisma } from "@/lib/db";
import type { MessagingChannelKind, MessageTemplate } from "@/lib/messaging/types";

export type MessagingDeliveryInput = {
  workspaceId: string;
  channelId?: string | null;
  kind: MessagingChannelKind;
  eventType: string;
  recipientType: "reviewer" | "manager" | "admin" | "assignee";
  recipientRef?: string | null;
  message: MessageTemplate;
  payload?: Record<string, unknown>;
};

export type MessagingDeliveryRecord = {
  id: string;
  status: string;
  channelId: string | null;
  payloadJson: string;
};

/** Payload marker written on every MESSAGING_DELIVERY attempt for retry dedupe. */
export function messagingDeliveryJobMarker(backendJobId: string) {
  return `"backendJobId":"${backendJobId}"`;
}

/**
 * Returns an existing delivery row for this backend job + channel, if any.
 * Used so job retries (stale lock / crash after webhook POST) do not fan out again.
 */
export async function findMessagingDeliveryForJobChannel(input: {
  workspaceId: string;
  channelId: string;
  backendJobId: string;
}): Promise<MessagingDeliveryRecord | null> {
  return prisma.messagingDelivery.findFirst({
    where: {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      payloadJson: { contains: messagingDeliveryJobMarker(input.backendJobId) }
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      channelId: true,
      payloadJson: true
    }
  });
}

export async function recordMessagingDelivery(input: MessagingDeliveryInput) {
  return prisma.messagingDelivery.create({
    data: {
      workspaceId: input.workspaceId,
      channelId: input.channelId ?? null,
      kind: input.kind,
      eventType: input.eventType,
      recipientType: input.recipientType,
      recipientRef: input.recipientRef ?? null,
      status: "queued",
      title: input.message.title,
      body: input.message.body,
      href: input.message.href,
      payloadJson: JSON.stringify(input.payload ?? {})
    }
  });
}
