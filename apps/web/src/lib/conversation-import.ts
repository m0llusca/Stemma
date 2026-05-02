import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeCustomConversation, normalizeCustomMessage } from "@/lib/normalizers/custom-api";
import type { CustomConversationInput } from "@/lib/validation/custom-api";

type ConversationImportClient = Pick<Prisma.TransactionClient, "conversation" | "message">;

export type ImportedConversation = {
  id: string;
  externalSource: string;
  externalId: string;
  subject: string;
  messageCount: number;
};

export async function upsertCustomConversation(
  workspaceId: string,
  payload: CustomConversationInput,
  client: ConversationImportClient = prisma
): Promise<ImportedConversation> {
  const conversationData = normalizeCustomConversation(payload);
  const conversation = await client.conversation.upsert({
    where: {
      workspaceId_externalSource_externalId: {
        workspaceId,
        externalSource: payload.externalSource,
        externalId: payload.externalId
      }
    },
    create: {
      ...conversationData,
      workspaceId
    },
    update: conversationData
  });

  for (const message of payload.messages) {
    const messageData = normalizeCustomMessage(message);

    await client.message.upsert({
      where: {
        conversationId_externalId: {
          conversationId: conversation.id,
          externalId: message.externalId
        }
      },
      create: {
        ...messageData,
        conversationId: conversation.id
      },
      update: messageData
    });
  }

  return {
    id: conversation.id,
    externalSource: payload.externalSource,
    externalId: payload.externalId,
    subject: payload.subject,
    messageCount: payload.messages.length
  };
}
