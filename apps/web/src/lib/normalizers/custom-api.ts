import type { ConversationChannel, ParticipantType, Prisma } from "@prisma/client";
import type { CustomConversationInput, CustomMessageInput } from "@/lib/validation/custom-api";

const channelMap: Record<CustomConversationInput["channel"], ConversationChannel> = {
  chat: "CHAT",
  email: "EMAIL",
  ticket: "TICKET",
  messenger: "MESSENGER"
};

const participantTypeMap: Record<CustomMessageInput["participantType"], ParticipantType> = {
  customer: "CUSTOMER",
  human_agent: "HUMAN_AGENT",
  ai_agent: "AI_AGENT",
  system: "SYSTEM"
};

export function normalizeCustomMessage(input: CustomMessageInput): Prisma.MessageCreateWithoutConversationInput {
  return {
    externalId: input.externalId,
    participantType: participantTypeMap[input.participantType],
    authorName: input.authorName,
    body: input.body,
    sentAt: new Date(input.sentAt),
    isPrivate: Boolean(input.isPrivate)
  };
}

export function normalizeCustomConversation(
  input: CustomConversationInput
): Omit<Prisma.ConversationUncheckedCreateInput, "workspaceId"> {
  return {
    externalSource: input.externalSource,
    externalId: input.externalId,
    externalUrl: input.externalUrl,
    channel: channelMap[input.channel],
    subject: input.subject,
    status: input.status,
    tags: input.tags.join(","),
    customerName: input.customerName,
    assigneeName: input.assigneeName,
    samplingReason: input.samplingReason,
    riskHint: input.riskHint,
    openedAt: new Date(input.openedAt),
    closedAt: input.closedAt ? new Date(input.closedAt) : null
  };
}
