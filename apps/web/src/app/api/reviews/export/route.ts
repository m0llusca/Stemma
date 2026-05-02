import { NextRequest, NextResponse } from "next/server";
import { requireApiToken } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function isoDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiToken(request, "reviews:read");

    if (!auth.ok) {
      return auth.response;
    }

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
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({
      reviews: reviews.map((review) => ({
        id: review.id,
        status: review.status,
        reviewSource: review.reviewSource,
        rubricVersion: review.rubricVersion,
        totalScore: review.totalScore,
        confidence: review.confidence,
        summary: review.summary,
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
          riskHint: review.conversation.riskHint,
          openedAt: review.conversation.openedAt.toISOString(),
          closedAt: isoDate(review.conversation.closedAt)
        },
        reviewer: review.reviewer.email,
        scores: review.scores.map((score) => ({
          criterion: score.criterion.key,
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
    });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
