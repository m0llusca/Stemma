import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";
import { redactText, redactedPayloadJson, redactedText } from "@/lib/privacy";
import { recordReviewEvent } from "@/lib/review-events";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "privacy:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { conversationId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 240) : "Не указана";
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: user.workspaceId
    },
    select: {
      id: true,
      subject: true,
      customerName: true,
      messages: {
        select: { id: true }
      }
    }
  });

  if (!conversation) {
    return apiError("not_found", "Обращение не найдено.", 404, requestId);
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        subject: redactText(conversation.subject),
        tags: redactedText,
        customerName: redactText(conversation.customerName),
        externalUrl: null,
        riskHint: redactedText
      }
    });

    const messages = await tx.message.updateMany({
      where: { conversationId: conversation.id },
      data: {
        authorName: redactedText,
        body: redactedText
      }
    });

    const ingestEvents = await tx.webhookIngestEvent.updateMany({
      where: { conversationId: conversation.id, workspaceId: user.workspaceId },
      data: { payloadJson: redactedPayloadJson }
    });

    const runItems = await tx.integrationRunItem.updateMany({
      where: { conversationId: conversation.id, workspaceId: user.workspaceId },
      data: { normalizedPreviewJson: redactedPayloadJson }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "privacy.conversation_redacted",
        targetType: "conversation",
        targetId: conversation.id,
        metadata: {
          reason,
          redactedMessages: messages.count,
          redactedIngestEvents: ingestEvents.count,
          redactedRunItems: runItems.count
        }
      },
      tx
    );

    await recordReviewEvent(tx, {
      workspaceId: user.workspaceId,
      conversationId: conversation.id,
      actorId: user.id,
      action: "privacy.conversation_redacted",
      metadata: {
        reason,
        redactedMessages: messages.count,
        redactedIngestEvents: ingestEvents.count,
        redactedRunItems: runItems.count
      }
    });

    return {
      redactedMessages: messages.count
    };
  });

  return apiJson(
    {
      conversation: {
        id: conversation.id,
        redacted: true,
        redactedMessages: result.redactedMessages
      }
    },
    200,
    requestId
  );
}
