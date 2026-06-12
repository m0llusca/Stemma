import { prisma } from "@/lib/db";
import type { ReportPeriod } from "@/lib/report-period";

export function reviewWhere(workspaceId: string, period: ReportPeriod) {
  return {
    workspaceId,
    status: "FINALIZED" as const,
    finalizedAt: {
      gte: period.start,
      lte: period.end
    }
  };
}

export async function loadFinalizedReviews(workspaceId: string, period: ReportPeriod) {
  return prisma.review.findMany({
    where: reviewWhere(workspaceId, period),
    select: {
      id: true,
      totalScore: true,
      finalizedAt: true,
      criticalError: true,
      criticalCategory: true,
      needsReanswer: true,
      reanswerStatus: true,
      appealStatus: true,
      feedbackStatus: true,
      reviewer: {
        select: {
          name: true
        }
      },
      conversation: {
        select: {
          externalSource: true,
          assigneeName: true,
          samplingType: true,
          csatBucket: true,
          csatScore: true,
          supportLine: true,
          teamName: true
        }
      },
      scores: {
        select: {
          value: true,
          passed: true,
          isNotApplicable: true,
          criterion: {
            select: {
              block: true,
              kind: true,
              weight: true
            }
          }
        }
      },
      findings: {
        select: {
          category: true,
          riskLevel: true
        }
      }
    }
  });
}

export type ReviewForReport = Awaited<ReturnType<typeof loadFinalizedReviews>>[number];
