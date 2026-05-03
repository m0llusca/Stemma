import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeCustomConversation, normalizeCustomMessage } from "@/lib/normalizers/custom-api";
import { customConversationLimits, type CustomConversationInput } from "@/lib/validation/custom-api";

type ConversationImportClient = Pick<Prisma.TransactionClient, "conversation" | "message">;

export type ImportedConversation = {
  id: string;
  externalSource: string;
  externalId: string;
  subject: string;
  messageCount: number;
};

export class ConversationImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationImportLimitError";
  }
}

export function assertConversationImportBatchLimit(conversations: readonly unknown[]) {
  if (conversations.length > customConversationLimits.maxConversationsPerImportRequest) {
    throw new ConversationImportLimitError(
      `За один запрос можно импортировать не более ${customConversationLimits.maxConversationsPerImportRequest} обращений.`
    );
  }
}

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

export async function upsertCustomConversationsAtomic(workspaceId: string, payloads: CustomConversationInput[]) {
  assertConversationImportBatchLimit(payloads);

  return prisma.$transaction(async (tx) => {
    const imported: ImportedConversation[] = [];

    for (const payload of payloads) {
      imported.push(await upsertCustomConversation(workspaceId, payload, tx));
    }

    return imported;
  });
}

export async function upsertCustomConversationAtomic(workspaceId: string, payload: CustomConversationInput) {
  const [conversation] = await upsertCustomConversationsAtomic(workspaceId, [payload]);

  return conversation;
}
