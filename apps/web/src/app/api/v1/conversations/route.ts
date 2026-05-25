import type { ConversationChannel, Prisma, QaStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hashRequestBody, readIdempotencyKey, reserveIdempotencyKey, completeIdempotencyKey } from "@/lib/api/idempotency";
import { firstQueryParam, paginationMeta, parseIsoDateParam, parsePagination } from "@/lib/api/query";
import { enforceApiRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { apiData, apiError, requestIdFromHeaders } from "@/lib/api/response";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { upsertCustomConversationAtomic } from "@/lib/conversation-import";
import { prisma } from "@/lib/db";
import { customConversationSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";

const qaStatuses = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const satisfies readonly QaStatus[];
const channels = ["CHAT", "EMAIL", "TICKET", "MESSENGER"] as const satisfies readonly ConversationChannel[];

function enumParam<T extends string>(searchParams: URLSearchParams, key: string, allowed: readonly T[]) {
  const value = firstQueryParam(searchParams, key)?.toUpperCase();

  if (!value) {
    return { ok: true as const, value: undefined };
  }

  return allowed.includes(value as T) ? { ok: true as const, value: value as T } : { ok: false as const, value };
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers);
  const auth = await requireApiToken(request, "conversations:read", { requestId, structuredErrors: true });

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "GET /api/v1/conversations"
  });

  if (!rateLimit.ok) {
    await recordApiTokenError(auth.apiTokenId, "Rate limit exceeded.");
    return apiError("rate_limited", "Превышен лимит запросов API.", 429, {
      requestId,
      headers: rateLimitHeaders(rateLimit),
      includeDetails: false
    });
  }

  const searchParams = request.nextUrl.searchParams;
  const qaStatus = enumParam(searchParams, "qaStatus", qaStatuses);
  const channel = enumParam(searchParams, "channel", channels);

  if (!qaStatus.ok || !channel.ok) {
    await recordApiTokenError(auth.apiTokenId, "Invalid conversation filters.");
    return apiError("bad_request", "Некорректные фильтры обращений.", 400, {
      requestId,
      includeDetails: false
    });
  }

  const { page, limit, skip } = parsePagination({
    page: firstQueryParam(searchParams, "page"),
    limit: firstQueryParam(searchParams, "limit"),
    defaultLimit: 50,
    maxLimit: 100
  });
  const openedFrom = parseIsoDateParam(searchParams, "openedFrom");
  const openedTo = parseIsoDateParam(searchParams, "openedTo", true);
  const createdFrom = parseIsoDateParam(searchParams, "createdFrom");
  const createdTo = parseIsoDateParam(searchParams, "createdTo", true);
  const query = firstQueryParam(searchParams, "q");
  const where: Prisma.ConversationWhereInput = {
    workspaceId: auth.workspaceId,
    ...(qaStatus.value ? { qaStatus: qaStatus.value } : {}),
    ...(channel.value ? { channel: channel.value } : {}),
    ...(firstQueryParam(searchParams, "externalSource") ? { externalSource: firstQueryParam(searchParams, "externalSource") } : {}),
    ...(firstQueryParam(searchParams, "supportLine") ? { supportLine: firstQueryParam(searchParams, "supportLine") } : {}),
    ...(firstQueryParam(searchParams, "teamName") ? { teamName: firstQueryParam(searchParams, "teamName") } : {}),
    ...(firstQueryParam(searchParams, "qaAssigneeId") ? { qaAssigneeId: firstQueryParam(searchParams, "qaAssigneeId") } : {}),
    ...(openedFrom || openedTo
      ? {
          openedAt: {
            ...(openedFrom ? { gte: openedFrom } : {}),
            ...(openedTo ? { lte: openedTo } : {})
          }
        }
      : {}),
    ...(createdFrom || createdTo
      ? {
          createdAt: {
            ...(createdFrom ? { gte: createdFrom } : {}),
            ...(createdTo ? { lte: createdTo } : {})
          }
        }
      : {}),
    ...(query
      ? {
          OR: [
            { subject: { contains: query } },
            { externalId: { contains: query } },
            { customerName: { contains: query } },
            { assigneeName: { contains: query } }
          ]
        }
      : {})
  };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            messages: true,
            reviews: true
          }
        },
        reviews: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            status: true,
            totalScore: true,
            reviewSource: true,
            finalizedAt: true,
            createdAt: true,
            reviewer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    }),
    prisma.conversation.count({ where })
  ]);

  await recordApiTokenSuccess(auth.apiTokenId);

  return apiData(
    {
      conversations: conversations.map((conversation) => ({
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
        latestReview: conversation.reviews[0]
          ? {
              id: conversation.reviews[0].id,
              status: conversation.reviews[0].status,
              reviewSource: conversation.reviews[0].reviewSource,
              totalScore: conversation.reviews[0].totalScore,
              reviewer: conversation.reviews[0].reviewer,
              finalizedAt: conversation.reviews[0].finalizedAt?.toISOString() ?? null,
              createdAt: conversation.reviews[0].createdAt.toISOString()
            }
          : null
      }))
    },
    {
      requestId,
      meta: { pagination: paginationMeta({ page, limit, total }) },
      headers: rateLimitHeaders(rateLimit)
    }
  );
}

export async function POST(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers);
  const auth = await requireApiToken(request, "conversations:write", { requestId, structuredErrors: true });

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "POST /api/v1/conversations"
  });

  if (!rateLimit.ok) {
    await recordApiTokenError(auth.apiTokenId, "Rate limit exceeded.");
    return apiError("rate_limited", "Превышен лимит запросов API.", 429, {
      requestId,
      headers: rateLimitHeaders(rateLimit),
      includeDetails: false
    });
  }

  let reservedIdempotencyKeyId: string | null = null;

  try {
    const body = await request.json();
    const payload = customConversationSchema.parse(body);
    const idempotencyKey = readIdempotencyKey(request);
    const requestHash = hashRequestBody(payload);
    const reserved = idempotencyKey
      ? await reserveIdempotencyKey({
          workspaceId: auth.workspaceId,
          key: idempotencyKey,
          method: "POST",
          path: "/api/v1/conversations",
          requestHash
        })
      : null;

    if (reserved?.created) {
      reservedIdempotencyKeyId = reserved.record.id;
    }

    if (reserved?.isConflict) {
      await recordApiTokenError(auth.apiTokenId, "Idempotency key conflict.");
      return apiError("conflict", "Idempotency-Key уже использован для другого запроса.", 409, {
        requestId,
        includeDetails: false
      });
    }

    if (reserved?.isInProgress) {
      await recordApiTokenError(auth.apiTokenId, "Idempotency key is already in progress.");
      return apiError("conflict", "Idempotency-Key уже обрабатывается.", 409, {
        requestId,
        includeDetails: false
      });
    }

    if (reserved?.isReplay) {
      await recordApiTokenSuccess(auth.apiTokenId);
      return apiData(JSON.parse(reserved.record.responseBodyJson || "{}"), {
        status: reserved.record.responseStatus ?? 200,
        requestId,
        headers: rateLimitHeaders(rateLimit)
      });
    }

    const conversation = await upsertCustomConversationAtomic(auth.workspaceId, payload);
    const responseBody = { id: conversation.id };

    if (reserved) {
      await completeIdempotencyKey({
        id: reserved.record.id,
        responseStatus: 201,
        responseBody
      });
    }

    await recordApiTokenSuccess(auth.apiTokenId);
    return apiData(responseBody, {
      status: 201,
      requestId,
      headers: rateLimitHeaders(rateLimit)
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid custom conversation payload.");
      return apiError("bad_request", "Некорректный payload обращения.", 400, {
        requestId,
        includeDetails: false
      });
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    if (reservedIdempotencyKeyId) {
      await completeIdempotencyKey({
        id: reservedIdempotencyKeyId,
        responseStatus: 500,
        responseBody: { error: "internal_error" },
        failed: true
      }).catch(() => undefined);
    }
    return apiError("internal_error", "Внутренняя ошибка сервера.", 500, {
      requestId,
      includeDetails: false
    });
  }
}
