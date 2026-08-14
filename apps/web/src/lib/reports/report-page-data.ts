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
      feedbackAckAt: true,
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
          sentiment: true,
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
          ownerType: true,
          category: true,
          rootCause: true,
          riskLevel: true
        }
      }
    }
  });
}

export type ReviewForReport = Awaited<ReturnType<typeof loadFinalizedReviews>>[number];

// Narrow loader for the COMPARISON (previous) period. The previous period only
// feeds score deltas (by source/assignee/team), the previous block-score rows,
// the previous average and the previous count — it is never rendered row by
// row. So we select just those columns instead of the full review shape used
// for the current period. Output of every previous-period computation stays
// identical because those computations read only these fields.
export async function loadPreviousFinalizedReviews(workspaceId: string, period: ReportPeriod) {
  return prisma.review.findMany({
    where: reviewWhere(workspaceId, period),
    select: {
      totalScore: true,
      finalizedAt: true,
      conversation: {
        select: {
          externalSource: true,
          assigneeName: true,
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
              kind: true
            }
          }
        }
      }
    }
  });
}

export type PreviousReviewForReport = Awaited<ReturnType<typeof loadPreviousFinalizedReviews>>[number];

// Narrow loader for the reason/root-cause trend. Pulls only the Finding columns
// the aggregation needs (ownerType/category/rootCause/riskLevel) for finalized
// reviews in the period, flattened across reviews. Used for both the current
// period (the count base) and the comparison period (the delta base) so neither
// pulls the full review shape just to count themes.
export async function loadPeriodFindings(workspaceId: string, period: ReportPeriod) {
  return prisma.finding.findMany({
    where: {
      review: reviewWhere(workspaceId, period)
    },
    select: {
      ownerType: true,
      category: true,
      rootCause: true,
      riskLevel: true,
      review: {
        select: {
          finalizedAt: true
        }
      }
    }
  });
}

export type PeriodFinding = Awaited<ReturnType<typeof loadPeriodFindings>>[number];
