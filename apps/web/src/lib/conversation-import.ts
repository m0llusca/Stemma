import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueBackendJob, type EnqueueJobClient } from "@/lib/jobs/enqueue";
import { normalizeCustomConversation, normalizeCustomMessage } from "@/lib/normalizers/custom-api";
import { assignReviewerForConversation } from "@/lib/review-assignment";
import { applySamplingDecision, evaluateSamplingRules, type SamplingRuleRecord } from "@/lib/sampling-engine";
import { customConversationLimits, type CustomConversationInput } from "@/lib/validation/custom-api";

type ConversationImportClient = Pick<Prisma.TransactionClient, "conversation" | "message"> & {
  samplingRule?: Pick<Prisma.TransactionClient["samplingRule"], "findMany">;
  user?: Pick<Prisma.TransactionClient["user"], "findMany">;
  backendJob?: EnqueueJobClient["backendJob"];
};
type ConversationImportOptions = {
  samplingRules?: SamplingRuleRecord[];
};

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
  client: ConversationImportClient = prisma,
  options: ConversationImportOptions = {}
): Promise<ImportedConversation> {
  const samplingRules =
    options.samplingRules ??
    (client.samplingRule
      ? await client.samplingRule.findMany({
          where: { workspaceId, isActive: true },
          select: {
            id: true,
            name: true,
            type: true,
            conditionsJson: true,
            targetPercent: true,
            priority: true
          },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
        })
      : []);
  const samplingDecision = evaluateSamplingRules({
    workspaceId,
    conversation: payload,
    rules: samplingRules
  });
  const sampledPayload = applySamplingDecision(payload, samplingDecision);
  const conversationData = normalizeCustomConversation(sampledPayload);

  // Auto-assign a reviewer for conversations a sampling rule actively selected
  // for QA (samplingDecision.matched — the same gate as the AI_SCORE enqueue
  // below). We only assign when no reviewer is already on the existing row, so
  // re-imports never reassign work already in flight. Requires the client to
  // expose user.findMany (transaction client / prisma); skipped otherwise.
  let assignment: Record<string, string> = {};
  if (samplingDecision.matched && client.user) {
    const existing = await client.conversation.findUnique({
      where: {
        workspaceId_externalSource_externalId: {
          workspaceId,
          externalSource: sampledPayload.externalSource,
          externalId: sampledPayload.externalId
        }
      },
      select: { qaAssigneeId: true, qaAssigneeName: true }
    });

    const alreadyAssigned = Boolean(existing?.qaAssigneeId || existing?.qaAssigneeName);

    if (!alreadyAssigned) {
      const reviewer = await assignReviewerForConversation(workspaceId, {
        user: client.user,
        conversation: client.conversation
      });

      if (reviewer) {
        assignment = { qaAssigneeId: reviewer.id, qaAssigneeName: reviewer.name };
      }
    }
  }

  const conversation = await client.conversation.upsert({
    where: {
      workspaceId_externalSource_externalId: {
        workspaceId,
        externalSource: sampledPayload.externalSource,
        externalId: sampledPayload.externalId
      }
    },
    create: {
      ...conversationData,
      ...assignment,
      workspaceId
    },
    update: {
      ...conversationData,
      ...assignment
    }
  });

  for (const message of sampledPayload.messages) {
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

  await client.message.deleteMany({
    where: {
      conversationId: conversation.id,
      externalId: {
        notIn: sampledPayload.messages.map((message) => message.externalId)
      }
    }
  });

  // Gate: enqueue AI auto-scoring only for conversations a sampling rule
  // actively selected for QA (samplingDecision.matched === true) — the same
  // condition under which applySamplingDecision tagged the row above. Imports
  // that no rule matched are not queued, so the AI scorer is not run on
  // conversations the sampling step did not pick. Requires the client to expose
  // backendJob (transaction client / prisma); skipped otherwise.
  if (samplingDecision.matched && client.backendJob) {
    await enqueueBackendJob(
      {
        workspaceId,
        type: "AI_SCORE",
        payload: { conversationId: conversation.id }
      },
      { backendJob: client.backendJob }
    );
  }

  return {
    id: conversation.id,
    externalSource: sampledPayload.externalSource,
    externalId: sampledPayload.externalId,
    subject: sampledPayload.subject,
    messageCount: sampledPayload.messages.length
  };
}

export async function upsertCustomConversationsAtomic(workspaceId: string, payloads: CustomConversationInput[]) {
  assertConversationImportBatchLimit(payloads);

  return prisma.$transaction(async (tx) => {
    const imported: ImportedConversation[] = [];
    const samplingRules = await tx.samplingRule.findMany({
      where: { workspaceId, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        conditionsJson: true,
        targetPercent: true,
        priority: true
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });

    for (const payload of payloads) {
      imported.push(await upsertCustomConversation(workspaceId, payload, tx, { samplingRules }));
    }

    return imported;
  });
}

export async function upsertCustomConversationAtomic(workspaceId: string, payload: CustomConversationInput) {
  const [conversation] = await upsertCustomConversationsAtomic(workspaceId, [payload]);

  return conversation;
}
