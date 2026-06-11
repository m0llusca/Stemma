import type { Prisma, ReviewSource, ReviewStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { enumParam, firstQueryParam, paginationMeta, parseIsoDateParam, parsePagination } from "@/lib/api/query";
import { enforceApiRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { apiData, apiError, requestIdFromHeaders } from "@/lib/api/response";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { formatQualityScore, qualityScoreUnit } from "@/lib/score-display";

export const dynamic = "force-dynamic";

const reviewStatuses = ["DRAFT", "FINALIZED"] as const satisfies readonly ReviewStatus[];
const reviewSources = ["HUMAN", "AI", "CALIBRATION", "SELF_REVIEW"] as const satisfies readonly ReviewSource[];

function scoreParam(searchParams: URLSearchParams, key: string) {
  const value = firstQueryParam(searchParams, key);

  if (!value) {
    return { ok: true as const, value: undefined };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { ok: false as const, value };
  }

  return { ok: true as const, value: parsed };
}

export async function GET(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers);
  const auth = await requireApiToken(request, "reviews:read", { requestId, structuredErrors: true });

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "GET /api/v1/reviews"
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
  const status = enumParam(searchParams, "status", reviewStatuses);
  const reviewSource = enumParam(searchParams, "reviewSource", reviewSources);
  const minScore = scoreParam(searchParams, "minScore");
  const maxScore = scoreParam(searchParams, "maxScore");

  if (!status.ok || !reviewSource.ok || !minScore.ok || !maxScore.ok) {
    await recordApiTokenError(auth.apiTokenId, "Invalid review filters.");
    return apiError("bad_request", "Некорректные фильтры проверок.", 400, {
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
  const finalizedFrom = parseIsoDateParam(searchParams, "finalizedFrom");
  const finalizedTo = parseIsoDateParam(searchParams, "finalizedTo", true);
  const createdFrom = parseIsoDateParam(searchParams, "createdFrom");
  const createdTo = parseIsoDateParam(searchParams, "createdTo", true);
  const query = firstQueryParam(searchParams, "q");
  const externalSource = firstQueryParam(searchParams, "externalSource");
  const where: Prisma.ReviewWhereInput = {
    workspaceId: auth.workspaceId,
    ...(status.value ? { status: status.value } : {}),
    ...(reviewSource.value ? { reviewSource: reviewSource.value } : {}),
    ...(firstQueryParam(searchParams, "reviewerId") ? { reviewerId: firstQueryParam(searchParams, "reviewerId") } : {}),
    ...(firstQueryParam(searchParams, "conversationId") ? { conversationId: firstQueryParam(searchParams, "conversationId") } : {}),
    ...(minScore.value !== undefined || maxScore.value !== undefined
      ? {
          totalScore: {
            ...(minScore.value !== undefined ? { gte: minScore.value } : {}),
            ...(maxScore.value !== undefined ? { lte: maxScore.value } : {})
          }
        }
      : {}),
    ...(finalizedFrom || finalizedTo
      ? {
          finalizedAt: {
            ...(finalizedFrom ? { gte: finalizedFrom } : {}),
            ...(finalizedTo ? { lte: finalizedTo } : {})
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
    ...(externalSource || query
      ? {
          conversation: {
            ...(externalSource ? { externalSource } : {}),
            ...(query
              ? {
                  OR: [{ subject: { contains: query } }, { externalId: { contains: query } }, { customerName: { contains: query } }]
                }
              : {})
          }
        }
      : {})
  };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        conversation: {
          select: {
            id: true,
            externalSource: true,
            externalId: true,
            channel: true,
            subject: true,
            customerName: true,
            assigneeName: true,
            qaStatus: true,
            samplingType: true,
            supportLine: true,
            teamName: true,
            openedAt: true,
            closedAt: true
          }
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        _count: {
          select: {
            scores: true,
            findings: true,
            events: true
          }
        }
      }
    }),
    prisma.review.count({ where })
  ]);

  await recordApiTokenSuccess(auth.apiTokenId);

  return apiData(
    {
      reviews: reviews.map((review) => ({
        id: review.id,
        status: review.status,
        reviewSource: review.reviewSource,
        rubricVersion: review.rubricVersion,
        totalScore: review.totalScore,
        score: {
          totalScore: review.totalScore,
          scoreUnit: qualityScoreUnit,
          scoreLabel: formatQualityScore(review.totalScore)
        },
        confidence: review.confidence,
        summary: review.summary,
        feedbackStatus: review.feedbackStatus,
        appealStatus: review.appealStatus,
        criticalError: review.criticalError,
        criticalCategory: review.criticalCategory,
        needsReanswer: review.needsReanswer,
        reanswerStatus: review.reanswerStatus,
        calibrationStatus: review.calibrationStatus,
        finalizedAt: review.finalizedAt?.toISOString() ?? null,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
        reviewer: review.reviewer,
        conversation: {
          ...review.conversation,
          openedAt: review.conversation.openedAt.toISOString(),
          closedAt: review.conversation.closedAt?.toISOString() ?? null
        },
        counts: {
          scores: review._count.scores,
          findings: review._count.findings,
          events: review._count.events
        }
      }))
    },
    {
      requestId,
      meta: { pagination: paginationMeta({ page, limit, total }) },
      headers: rateLimitHeaders(rateLimit)
    }
  );
}
