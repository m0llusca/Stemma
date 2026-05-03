import { NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api/rate-limit";
import { apiError, apiJson } from "@/lib/api/response";
import { safeJsonParse } from "@/lib/api/query";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  const auth = await requireApiToken(request, "reviews:read");

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "GET /api/v1/reviews/{reviewId}"
  });

  if (!rateLimit.ok) {
    await recordApiTokenError(auth.apiTokenId, "Rate limit exceeded.");
    return apiError("rate_limited", "Превышен лимит запросов API.", 429);
  }

  const { reviewId } = await context.params;
  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      workspaceId: auth.workspaceId
    },
    include: {
      conversation: true,
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      scores: {
        orderBy: {
          criterion: {
            order: "asc"
          }
        },
        include: {
          criterion: true
        }
      },
      findings: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          coachingAction: true
        }
      },
      feedbackEvents: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      },
      trainingAssignments: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      },
      events: {
        orderBy: [{ createdAt: "asc" }],
        take: 100,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      }
    }
  });

  if (!review) {
    await recordApiTokenError(auth.apiTokenId, "Review not found.");
    return apiError("not_found", "Проверка не найдена.", 404);
  }

  await recordApiTokenSuccess(auth.apiTokenId);

  return apiJson({
    review: {
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
      feedbackAckAt: review.feedbackAckAt?.toISOString() ?? null,
      feedbackAckBy: review.feedbackAckBy,
      appealStatus: review.appealStatus,
      appealDueAt: review.appealDueAt?.toISOString() ?? null,
      appealResolvedAt: review.appealResolvedAt?.toISOString() ?? null,
      criticalError: review.criticalError,
      criticalCategory: review.criticalCategory,
      needsReanswer: review.needsReanswer,
      reanswerStatus: review.reanswerStatus,
      calibrationStatus: review.calibrationStatus,
      calibrationNotes: review.calibrationNotes,
      selfReviewNotes: review.selfReviewNotes,
      finalizedAt: review.finalizedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      reviewer: review.reviewer,
      conversation: {
        id: review.conversation.id,
        externalSource: review.conversation.externalSource,
        externalId: review.conversation.externalId,
        externalUrl: review.conversation.externalUrl,
        channel: review.conversation.channel,
        subject: review.conversation.subject,
        status: review.conversation.status,
        tags: splitTags(review.conversation.tags),
        customerName: review.conversation.customerName,
        assigneeName: review.conversation.assigneeName,
        qaStatus: review.conversation.qaStatus,
        samplingReason: review.conversation.samplingReason,
        samplingType: review.conversation.samplingType,
        csatScore: review.conversation.csatScore,
        csatBucket: review.conversation.csatBucket,
        supportLine: review.conversation.supportLine,
        teamName: review.conversation.teamName,
        openedAt: review.conversation.openedAt.toISOString(),
        closedAt: review.conversation.closedAt?.toISOString() ?? null
      },
      scores: review.scores.map((score) => ({
        id: score.id,
        criterion: {
          id: score.criterion.id,
          key: score.criterion.key,
          label: score.criterion.label,
          block: score.criterion.block,
          kind: score.criterion.kind,
          weight: score.criterion.weight,
          required: score.criterion.required,
          order: score.criterion.order
        },
        value: score.value,
        passed: score.passed,
        isNotApplicable: score.isNotApplicable,
        comment: score.comment,
        evidenceMessageId: score.evidenceMessageId
      })),
      findings: review.findings.map((finding) => ({
        id: finding.id,
        ownerType: finding.ownerType,
        category: finding.category,
        rootCause: finding.rootCause,
        riskLevel: finding.riskLevel,
        evidenceSummary: finding.evidenceSummary,
        coachingAction: finding.coachingAction
          ? {
              assignee: finding.coachingAction.assignee,
              action: finding.coachingAction.action,
              dueAt: finding.coachingAction.dueAt?.toISOString() ?? null,
              status: finding.coachingAction.status
            }
          : null,
        createdAt: finding.createdAt.toISOString()
      })),
      feedbackEvents: review.feedbackEvents.map((event) => ({
        id: event.id,
        action: event.action,
        comment: event.comment,
        actor: event.actor,
        createdAt: event.createdAt.toISOString()
      })),
      trainingAssignments: review.trainingAssignments.map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        status: assignment.status,
        assigneeName: assignment.assigneeName,
        assignee: assignment.assignee,
        dueAt: assignment.dueAt?.toISOString() ?? null,
        createdAt: assignment.createdAt.toISOString()
      })),
      events: review.events.map((event) => ({
        id: event.id,
        action: event.action,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        metadata: safeJsonParse(event.metadata),
        actor: event.actor,
        createdAt: event.createdAt.toISOString()
      }))
    }
  });
}
