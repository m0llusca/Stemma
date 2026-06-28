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
