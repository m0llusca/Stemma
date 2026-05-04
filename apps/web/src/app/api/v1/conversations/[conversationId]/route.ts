import { NextRequest } from "next/server";
import { firstQueryParam, parsePositiveInteger } from "@/lib/api/query";
import { enforceApiRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { apiData, apiError, requestIdFromHeaders } from "@/lib/api/response";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const auth = await requireApiToken(request, "conversations:read", { requestId, structuredErrors: true });

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "GET /api/v1/conversations/{conversationId}"
  });

  if (!rateLimit.ok) {
    await recordApiTokenError(auth.apiTokenId, "Rate limit exceeded.");
    return apiError("rate_limited", "Превышен лимит запросов API.", 429, {
      requestId,
      headers: rateLimitHeaders(rateLimit),
      includeDetails: false
    });
  }

  const { conversationId } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const messageLimit = parsePositiveInteger(firstQueryParam(searchParams, "messageLimit"), 200, 500);
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: auth.workspaceId
    },
    include: {
      messages: {
        orderBy: [{ sentAt: "asc" }],
        take: messageLimit
      },
      reviews: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          status: true,
          reviewSource: true,
          totalScore: true,
          summary: true,
          feedbackStatus: true,
          appealStatus: true,
          criticalError: true,
          finalizedAt: true,
          createdAt: true,
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      },
      _count: {
        select: {
          messages: true,
          reviews: true
        }
      }
    }
  });

  if (!conversation) {
    await recordApiTokenError(auth.apiTokenId, "Conversation not found.");
    return apiError("not_found", "Обращение не найдено.", 404, {
      requestId,
      includeDetails: false
    });
  }

  await recordApiTokenSuccess(auth.apiTokenId);

  return apiData(
    {
      conversation: {
        id: conversation.id,
        externalSource: conversation.externalSource,
        externalId: conversation.externalId,
        externalUrl: conversation.externalUrl,
        channel: conversation.channel,
        subject: conversation.subject,
        status: conversation.status,
        tags: splitTags(conversation.tags),
        customerName: conversation.customerName,
        assigneeName: conversation.assigneeName,
        qaStatus: conversation.qaStatus,
        qaAssigneeId: conversation.qaAssigneeId,
        qaAssigneeName: conversation.qaAssigneeName,
        reviewDueAt: conversation.reviewDueAt?.toISOString() ?? null,
        samplingReason: conversation.samplingReason,
        samplingType: conversation.samplingType,
        csatScore: conversation.csatScore,
        csatBucket: conversation.csatBucket,
        supportLine: conversation.supportLine,
        teamName: conversation.teamName,
        riskHint: conversation.riskHint,
        openedAt: conversation.openedAt.toISOString(),
        closedAt: conversation.closedAt?.toISOString() ?? null,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        counts: {
          messages: conversation._count.messages,
          reviews: conversation._count.reviews
        },
        messages: conversation.messages.map((message) => ({
          id: message.id,
          externalId: message.externalId,
          participantType: message.participantType,
          authorName: message.authorName,
          body: message.body,
          isPrivate: message.isPrivate,
          sentAt: message.sentAt.toISOString(),
          createdAt: message.createdAt.toISOString()
        })),
        reviews: conversation.reviews.map((review) => ({
          id: review.id,
          status: review.status,
          reviewSource: review.reviewSource,
          totalScore: review.totalScore,
          summary: review.summary,
          feedbackStatus: review.feedbackStatus,
          appealStatus: review.appealStatus,
          criticalError: review.criticalError,
          reviewer: review.reviewer,
          finalizedAt: review.finalizedAt?.toISOString() ?? null,
          createdAt: review.createdAt.toISOString()
        }))
      }
    },
    {
      requestId,
      headers: rateLimitHeaders(rateLimit)
    }
  );
}
