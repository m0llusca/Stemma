import { NextRequest, NextResponse } from "next/server";
import { enforceApiRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxExportRows = 5000;

function isoDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "reviews:read");

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "GET /api/reviews/export"
  });

  if (!rateLimit.ok) {
    await recordApiTokenError(auth.apiTokenId, "Rate limit exceeded.");
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const reviews = await prisma.review.findMany({
      where: { workspaceId: auth.workspaceId },
      include: {
        conversation: true,
        reviewer: true,
        scores: {
          include: {
            criterion: true
          },
          orderBy: {
            criterion: {
              order: "asc"
            }
          }
        },
        findings: {
          include: {
            coachingAction: true
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: maxExportRows
    });

    const response = NextResponse.json({
      meta: {
        count: reviews.length,
        truncated: reviews.length === maxExportRows
      },
      reviews: reviews.map((review) => ({
        id: review.id,
        status: review.status,
        reviewSource: review.reviewSource,
        rubricVersion: review.rubricVersion,
        totalScore: review.totalScore,
        confidence: review.confidence,
        summary: review.summary,
        feedbackComment: review.feedbackComment,
        positiveNotes: review.positiveNotes,
        instructionLinks: review.instructionLinks,
        feedbackStatus: review.feedbackStatus,
        appealStatus: review.appealStatus,
        appealDueAt: isoDate(review.appealDueAt),
        appealResolvedAt: isoDate(review.appealResolvedAt),
        criticalError: review.criticalError,
        criticalCategory: review.criticalCategory,
        needsReanswer: review.needsReanswer,
        reanswerStatus: review.reanswerStatus,
        calibrationStatus: review.calibrationStatus,
        calibrationNotes: review.calibrationNotes,
        finalizedAt: isoDate(review.finalizedAt),
        createdAt: review.createdAt.toISOString(),
        conversation: {
          id: review.conversation.id,
          externalSource: review.conversation.externalSource,
          externalId: review.conversation.externalId,
          externalUrl: review.conversation.externalUrl,
          channel: review.conversation.channel,
          subject: review.conversation.subject,
          status: review.conversation.status,
          tags: review.conversation.tags,
          customerName: review.conversation.customerName,
          assigneeName: review.conversation.assigneeName,
          samplingReason: review.conversation.samplingReason,
          samplingType: review.conversation.samplingType,
          csatScore: review.conversation.csatScore,
          csatBucket: review.conversation.csatBucket,
          supportLine: review.conversation.supportLine,
          teamName: review.conversation.teamName,
          riskHint: review.conversation.riskHint,
          openedAt: review.conversation.openedAt.toISOString(),
          closedAt: isoDate(review.conversation.closedAt)
        },
        reviewer: review.reviewer.email,
        scores: review.scores.map((score) => ({
          criterion: score.criterion.key,
          criterionLabel: score.criterion.label,
          criterionBlock: score.criterion.block,
          weight: score.criterion.weight,
          value: score.value,
          passed: score.passed,
          isNotApplicable: score.isNotApplicable,
          comment: score.comment
        })),
        findings: review.findings.map((finding) => ({
          ownerType: finding.ownerType,
          category: finding.category,
          rootCause: finding.rootCause,
          riskLevel: finding.riskLevel,
          coachingAction: finding.coachingAction?.action ?? null
        }))
      }))
    }, { headers: rateLimitHeaders(rateLimit) });

    await recordApiTokenSuccess(auth.apiTokenId);

    return response;
  } catch {
    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
