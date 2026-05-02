import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function isoDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const reviews = await prisma.review.findMany({
      where: { workspaceId: user.workspaceId },
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
        reviewer: {
          id: review.reviewer.id,
          email: review.reviewer.email,
          name: review.reviewer.name,
          role: review.reviewer.role
        },
        scores: review.scores.map((score) => ({
          criterion: {
            id: score.criterion.id,
            key: score.criterion.key,
            label: score.criterion.label,
            kind: score.criterion.kind,
            weight: score.criterion.weight,
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
                dueAt: isoDate(finding.coachingAction.dueAt),
                status: finding.coachingAction.status
              }
            : null
        }))
      }))
    });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
