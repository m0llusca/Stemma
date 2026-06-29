import type { ConversationChannel, Prisma, QaStatus, RiskLevel } from "@prisma/client";
import type {
  ReviewQueueConversationDto,
  ReviewQueueDueFilter,
  ReviewQueueCoachingFilter,
  ReviewQueueFilterOptionsDto,
  ReviewQueueFilters,
  ReviewQueueProcessFilter,
  ReviewQueueRiskFilter,
  ReviewQueueSearchParams,
  ReviewQueueStatus,
  ReviewQueueSummaryDto
} from "@/lib/contracts/review-queue";
import { prisma } from "@/lib/db";

export type {
  ReviewQueueDueFilter,
  ReviewQueueCoachingFilter,
  ReviewQueueFilters,
  ReviewQueueProcessFilter,
  ReviewQueueRiskFilter,
  ReviewQueueSearchParams,
  ReviewQueueStatus
} from "@/lib/contracts/review-queue";

export const reviewQueueStatuses = ["all", "unreviewed", "reviewed"] as const;
export const qaQueueStatuses = ["all", "QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const;
export const queueSamplingTypes = ["RANDOM", "DSAT", "LEAD_SIGNAL", "NEW_HIRE", "LOW_SCORE", "MANUAL"] as const;
export const queueCsatBuckets = ["NEGATIVE", "POSITIVE", "NO_SCORE"] as const;
export const queueProcessFilters = ["critical", "reanswer", "appeal"] as const;
export const queueDueFilters = ["overdue"] as const;

const conversationChannels = ["CHAT", "EMAIL", "TICKET", "MESSENGER"] as const satisfies readonly ConversationChannel[];
const conversationQaStatuses = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const satisfies readonly QaStatus[];
const findingRiskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const satisfies readonly RiskLevel[];
const reviewQueueRiskFilters = [...findingRiskLevels, "HIGH_OR_CRITICAL"] as const satisfies readonly ReviewQueueRiskFilter[];
const reviewQueueCoachingStatuses = ["open"] as const satisfies readonly ReviewQueueCoachingFilter[];

type ReviewQueueScope = {
  assigneeName?: string;
};

type CurrentCycleReview = {
  status: string;
  reviewSource: string;
};

function currentCycleReviewsForQaStatus<T extends CurrentCycleReview>(qaStatus: QaStatus, reviews: readonly T[]) {
  if (qaStatus === "FINALIZED") {
    return [...reviews];
  }

  return reviews.filter((review) => !(review.reviewSource === "HUMAN" && review.status === "FINALIZED"));
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanParam(value: string | string[] | undefined) {
  const firstValue = firstParam(value)?.trim();
  return firstValue ? firstValue : undefined;
}

function parseDateParam(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseReviewQueueFilters(searchParams: ReviewQueueSearchParams = {}): ReviewQueueFilters {
  const requestedStatus = cleanParam(searchParams.status);
  const requestedChannel = cleanParam(searchParams.channel);
  const requestedQaStatus = cleanParam(searchParams.qaStatus);
  const requestedSamplingType = cleanParam(searchParams.samplingType);
  const requestedCsatBucket = cleanParam(searchParams.csatBucket);
  const requestedProcess = cleanParam(searchParams.process);
  const requestedDue = cleanParam(searchParams.due);
  const requestedRiskLevel = cleanParam(searchParams.riskLevel);
  const requestedCoachingStatus = cleanParam(searchParams.coachingStatus);
  const requestedFinalizedFrom = cleanParam(searchParams.finalizedFrom);
  const requestedFinalizedTo = cleanParam(searchParams.finalizedTo);

  return {
    q: cleanParam(searchParams.q),
    status: reviewQueueStatuses.includes(requestedStatus as ReviewQueueStatus)
      ? (requestedStatus as ReviewQueueStatus)
      : "all",
    channel: conversationChannels.includes(requestedChannel as ConversationChannel)
      ? (requestedChannel as ConversationChannel)
      : undefined,
    qaStatus: conversationQaStatuses.includes(requestedQaStatus as QaStatus) ? (requestedQaStatus as QaStatus) : undefined,
    source: cleanParam(searchParams.source),
    assignee: cleanParam(searchParams.assignee),
    qaAssignee: cleanParam(searchParams.qaAssignee),
    samplingType: queueSamplingTypes.includes(requestedSamplingType as (typeof queueSamplingTypes)[number])
      ? requestedSamplingType
      : undefined,
    csatBucket: queueCsatBuckets.includes(requestedCsatBucket as (typeof queueCsatBuckets)[number])
      ? requestedCsatBucket
      : undefined,
    supportLine: cleanParam(searchParams.supportLine),
    teamName: cleanParam(searchParams.teamName),
    process: queueProcessFilters.includes(requestedProcess as ReviewQueueProcessFilter)
      ? (requestedProcess as ReviewQueueProcessFilter)
      : undefined,
    due: queueDueFilters.includes(requestedDue as ReviewQueueDueFilter) ? (requestedDue as ReviewQueueDueFilter) : undefined,
    riskLevel: reviewQueueRiskFilters.includes(requestedRiskLevel as ReviewQueueRiskFilter)
      ? (requestedRiskLevel as ReviewQueueRiskFilter)
      : undefined,
    coachingStatus: reviewQueueCoachingStatuses.includes(requestedCoachingStatus as ReviewQueueCoachingFilter)
      ? (requestedCoachingStatus as ReviewQueueCoachingFilter)
      : undefined,
    findingCategory: cleanParam(searchParams.findingCategory),
    criticalCategory: cleanParam(searchParams.criticalCategory),
    feedbackStatus: cleanParam(searchParams.feedbackStatus),
    appealStatus: cleanParam(searchParams.appealStatus),
    reanswerStatus: cleanParam(searchParams.reanswerStatus),
    finalizedFrom: parseDateParam(requestedFinalizedFrom),
    finalizedTo: parseDateParam(requestedFinalizedTo, true)
  };
}

function scopedConversationWhere(workspaceId: string, scope?: ReviewQueueScope): Prisma.ConversationWhereInput {
  return {
    workspaceId,
    ...(scope?.assigneeName ? { assigneeName: scope.assigneeName } : {})
  };
}

function buildReviewQueueWhere(workspaceId: string, filters: ReviewQueueFilters, scope?: ReviewQueueScope): Prisma.ConversationWhereInput {
  const and: Prisma.ConversationWhereInput[] = [{ workspaceId }];
  const finalizedHumanReviewAnd: Prisma.ReviewWhereInput[] = [];
  const addFinalizedHumanReviewFilter = (where: Prisma.ReviewWhereInput) => {
    finalizedHumanReviewAnd.push(where);
  };

  if (scope?.assigneeName) {
    and.push({ assigneeName: scope.assigneeName });
  }

  if (filters.q) {
    and.push({
      OR: [
        { subject: { contains: filters.q } },
        { customerName: { contains: filters.q } },
        { externalId: { contains: filters.q } },
        { tags: { contains: filters.q } },
        { assigneeName: { contains: filters.q } },
        { teamName: { contains: filters.q } }
      ]
    });
  }

  if (filters.status === "unreviewed") {
    and.push({
      OR: [
        {
          qaStatus: {
            not: "FINALIZED"
          }
        },
        {
          reviews: {
            none: {
              reviewSource: "HUMAN",
              status: "FINALIZED"
            }
          }
        }
      ]
    });
  }

  if (filters.status === "reviewed") {
    and.push({ qaStatus: "FINALIZED" });
    and.push({
      reviews: {
        some: {
          reviewSource: "HUMAN",
          status: "FINALIZED"
        }
      }
    });
  }

  if (filters.channel) {
    and.push({ channel: filters.channel });
  }

  if (filters.qaStatus) {
    and.push({ qaStatus: filters.qaStatus });
  }

  if (filters.source) {
    and.push({ externalSource: filters.source });
  }

  if (filters.assignee) {
    and.push({ assigneeName: filters.assignee });
  }

  if (filters.qaAssignee) {
    and.push({ qaAssigneeName: filters.qaAssignee });
  }

  if (filters.samplingType) {
    and.push({ samplingType: filters.samplingType });
  }

  if (filters.csatBucket) {
    and.push({ csatBucket: filters.csatBucket });
  }

  if (filters.supportLine) {
    and.push({ supportLine: filters.supportLine });
  }

  if (filters.teamName) {
    and.push({ teamName: filters.teamName });
  }

  if (filters.due === "overdue") {
    and.push({
      reviewDueAt: { lt: new Date() },
      qaStatus: { not: "FINALIZED" }
    });
  }

  if (filters.process === "critical") {
    addFinalizedHumanReviewFilter({ criticalError: true });
  }

  if (filters.process === "reanswer") {
    addFinalizedHumanReviewFilter({ needsReanswer: true });
  }

  if (filters.process === "appeal") {
    addFinalizedHumanReviewFilter({
      appealStatus: {
        not: "none"
      }
    });
  }

  if (filters.riskLevel) {
    const riskLevelWhere =
      filters.riskLevel === "HIGH_OR_CRITICAL"
        ? { in: ["HIGH", "CRITICAL"] satisfies RiskLevel[] }
        : filters.riskLevel;

    addFinalizedHumanReviewFilter({
      findings: {
        some: {
          riskLevel: riskLevelWhere
        }
      }
    });
  }

  if (filters.findingCategory) {
    addFinalizedHumanReviewFilter({
      findings: {
        some: {
          category: filters.findingCategory
        }
      }
    });
  }

  if (filters.coachingStatus === "open") {
    addFinalizedHumanReviewFilter({
      findings: {
        some: {
          coachingAction: {
            status: "open"
          }
        }
      }
    });
  }

  if (filters.criticalCategory) {
    addFinalizedHumanReviewFilter({
      criticalError: true,
      criticalCategory: filters.criticalCategory
    });
  }

  if (filters.feedbackStatus) {
    addFinalizedHumanReviewFilter({
      feedbackStatus: filters.feedbackStatus
    });
  }

  if (filters.appealStatus) {
    addFinalizedHumanReviewFilter({
      appealStatus: filters.appealStatus
    });
  }

  if (filters.reanswerStatus) {
    addFinalizedHumanReviewFilter({
      reanswerStatus: filters.reanswerStatus
    });
  }

  if (filters.finalizedFrom || filters.finalizedTo) {
    addFinalizedHumanReviewFilter({
      finalizedAt: {
        ...(filters.finalizedFrom ? { gte: filters.finalizedFrom } : {}),
        ...(filters.finalizedTo ? { lte: filters.finalizedTo } : {})
      }
    });
  }

  if (finalizedHumanReviewAnd.length > 0) {
    and.push({ qaStatus: "FINALIZED" });
    and.push({
      reviews: {
        some: {
          reviewSource: "HUMAN",
          status: "FINALIZED",
          ...(finalizedHumanReviewAnd.length === 1 ? finalizedHumanReviewAnd[0] : { AND: finalizedHumanReviewAnd })
        }
      }
    });
  }

  return { AND: and };
}

export async function getReviewQueue(workspaceId: string, filters: ReviewQueueFilters, scope?: ReviewQueueScope): Promise<ReviewQueueConversationDto[]> {
  const conversations = await prisma.conversation.findMany({
    where: buildReviewQueueWhere(workspaceId, filters, scope),
    select: {
      id: true,
      subject: true,
      customerName: true,
      assigneeName: true,
      channel: true,
      externalSource: true,
      supportLine: true,
      teamName: true,
      openedAt: true,
      reviewDueAt: true,
      qaStatus: true,
      qaAssigneeName: true,
      csatBucket: true,
      samplingType: true,
      riskHint: true,
      _count: {
        select: {
          messages: true
        }
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 4,
        select: {
          id: true,
          status: true,
          reviewSource: true,
          totalScore: true,
          criticalError: true,
          needsReanswer: true,
          appealStatus: true,
          reanswerStatus: true
        }
      }
    },
    orderBy: { openedAt: "desc" }
  });

  return conversations
    .map((conversation) => {
      const reviews = currentCycleReviewsForQaStatus(conversation.qaStatus, conversation.reviews);
      const priority = reviewQueuePriority({
        qaStatus: conversation.qaStatus,
        qaAssigneeName: conversation.qaAssigneeName,
        reviewDueAt: conversation.reviewDueAt,
        csatBucket: conversation.csatBucket,
        samplingType: conversation.samplingType,
        riskHint: conversation.riskHint,
        reviews
      });

      return {
        id: conversation.id,
        subject: conversation.subject,
        customerName: conversation.customerName,
        assigneeName: conversation.assigneeName,
        messageCount: conversation._count.messages,
        channel: conversation.channel,
        externalSource: conversation.externalSource,
        supportLine: conversation.supportLine,
        teamName: conversation.teamName,
        reviewDueAt: conversation.reviewDueAt?.toISOString() ?? null,
        qaStatus: conversation.qaStatus,
        qaAssigneeName: conversation.qaAssigneeName,
        csatBucket: conversation.csatBucket,
        samplingType: conversation.samplingType,
        riskHint: conversation.riskHint,
        priorityRank: priority.rank,
        priorityReason: priority.reason,
        reviews,
        openedAt: conversation.openedAt
      };
    })
    .sort((left, right) => {
      const priorityDelta = right.priorityRank - left.priorityRank;
      if (priorityDelta !== 0) return priorityDelta;

      const leftDue = left.reviewDueAt ? new Date(left.reviewDueAt).getTime() : Number.POSITIVE_INFINITY;
      const rightDue = right.reviewDueAt ? new Date(right.reviewDueAt).getTime() : Number.POSITIVE_INFINITY;
      if (leftDue !== rightDue) return leftDue - rightDue;

      return right.openedAt.getTime() - left.openedAt.getTime();
    })
    .map(({ openedAt: _openedAt, ...conversation }) => conversation);
}

export const reviewQueueDefaultPageSize = 25;

export type ReviewQueuePage = {
  items: ReviewQueueConversationDto[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  hasMore: boolean;
};

// Parse a 1-based page number from a raw search param, clamping junk to 1.
export function parseReviewQueuePage(value: string | string[] | undefined): number {
  const raw = firstParam(value);
  const parsed = raw ? Number.parseInt(raw, 10) : 1;

  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

// Slice the already priority-sorted queue into a single page. Pagination is a
// pure rendering bound applied AFTER the global priority sort, so which rows
// rank first never changes — only how many are shown at once. `page` is 1-based
// and clamped into range; an out-of-range page returns the last page.
export function paginateReviewQueue(
  conversations: readonly ReviewQueueConversationDto[],
  page = 1,
  pageSize = reviewQueueDefaultPageSize
): ReviewQueuePage {
  const total = conversations.length;
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const start = (safePage - 1) * safePageSize;
  const items = conversations.slice(start, start + safePageSize);

  return {
    items,
    page: safePage,
    pageSize: safePageSize,
    pageCount,
    total,
    hasMore: safePage < pageCount
  };
}

function reviewQueuePriority({
  qaStatus,
  qaAssigneeName,
  reviewDueAt,
  csatBucket,
  samplingType,
  riskHint,
  reviews
}: {
  qaStatus: ReviewQueueConversationDto["qaStatus"];
  qaAssigneeName: string | null;
  reviewDueAt: Date | null;
  csatBucket: string;
  samplingType: string;
  riskHint: string | null;
  reviews: ReviewQueueConversationDto["reviews"];
}) {
  const finalizedReview = reviews.find((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN");
  const isOpen = qaStatus !== "FINALIZED";
  const isOverdue = isOpen && reviewDueAt !== null && reviewDueAt < new Date();

  if (isOverdue) return { rank: 100, reason: "SLA просрочен" };
  if (finalizedReview?.criticalError) return { rank: 95, reason: "Критическая ошибка" };
  if (finalizedReview?.needsReanswer) return { rank: 90, reason: "Нужен переответ" };
  if (finalizedReview?.appealStatus && finalizedReview.appealStatus !== "none") return { rank: 84, reason: "Открыта апелляция" };
  if (isOpen && riskHint) return { rank: 78, reason: "Риск из источника" };
  if (isOpen && csatBucket === "NEGATIVE") return { rank: 72, reason: "Негативный CSAT" };
  if (isOpen && !qaAssigneeName) return { rank: 66, reason: "Без проверяющего" };
  if (isOpen && samplingType === "LOW_SCORE") return { rank: 60, reason: "Низкая оценка" };
  if (isOpen && samplingType === "LEAD_SIGNAL") return { rank: 54, reason: "Сигнал руководителя" };
  if (isOpen && samplingType === "DSAT") return { rank: 50, reason: "DSAT выборка" };
  if (isOpen && reviewDueAt) return { rank: 42, reason: "Есть срок" };
  if (isOpen) return { rank: 36, reason: "Ожидает проверки" };

  return { rank: 10, reason: "Завершено" };
}

export async function getReviewQueueSummary(workspaceId: string, scope?: ReviewQueueScope): Promise<ReviewQueueSummaryDto> {
  const baseWhere = scopedConversationWhere(workspaceId, scope);
  const [total, queued, inWork, drafts, reviewed, overdue] = await Promise.all([
    prisma.conversation.count({
      where: baseWhere
    }),
    prisma.conversation.count({
      where: {
        ...baseWhere,
        qaStatus: "QUEUED"
      }
    }),
    prisma.conversation.count({
      where: {
        ...baseWhere,
        qaStatus: {
          in: ["ASSIGNED", "IN_PROGRESS", "REOPENED"]
        }
      }
    }),
    prisma.conversation.count({
      where: {
        ...baseWhere,
        reviews: {
          some: {
            reviewSource: "HUMAN",
            status: "DRAFT"
          }
        }
      }
    }),
    prisma.conversation.count({
      where: {
        ...baseWhere,
        qaStatus: "FINALIZED",
        reviews: {
          some: {
            reviewSource: "HUMAN",
            status: "FINALIZED"
          }
        }
      }
    }),
    prisma.conversation.count({
      where: {
        ...baseWhere,
        reviewDueAt: {
          lt: new Date()
        },
        qaStatus: {
          not: "FINALIZED"
        }
      }
    })
  ]);

  return {
    total,
    queued,
    inWork,
    drafts,
    reviewed,
    overdue
  };
}

export async function getReviewQueueFilterOptions(workspaceId: string, scope?: ReviewQueueScope): Promise<ReviewQueueFilterOptionsDto> {
  const baseWhere = scopedConversationWhere(workspaceId, scope);
  const [sourceRows, assigneeRows, qaAssigneeRows, supportLineRows, teamNameRows] = await Promise.all([
    prisma.conversation.findMany({
      where: baseWhere,
      distinct: ["externalSource"],
      select: {
        externalSource: true
      },
      orderBy: {
        externalSource: "asc"
      }
    }),
    prisma.conversation.findMany({
      where: scope?.assigneeName
        ? baseWhere
        : {
            ...baseWhere,
            assigneeName: {
              not: null
            }
          },
      distinct: ["assigneeName"],
      select: {
        assigneeName: true
      },
      orderBy: {
        assigneeName: "asc"
      }
    }),
    prisma.conversation.findMany({
      where: {
        ...baseWhere,
        qaAssigneeName: {
          not: null
        }
      },
      distinct: ["qaAssigneeName"],
      select: {
        qaAssigneeName: true
      },
      orderBy: {
        qaAssigneeName: "asc"
      }
    }),
    prisma.conversation.findMany({
      where: {
        ...baseWhere,
        supportLine: {
          not: null
        }
      },
      distinct: ["supportLine"],
      select: {
        supportLine: true
      },
      orderBy: {
        supportLine: "asc"
      }
    }),
    prisma.conversation.findMany({
      where: {
        ...baseWhere,
        teamName: {
          not: null
        }
      },
      distinct: ["teamName"],
      select: {
        teamName: true
      },
      orderBy: {
        teamName: "asc"
      }
    })
  ]);

  return {
    sources: sourceRows.map((row) => row.externalSource),
    assignees: assigneeRows
      .map((row) => row.assigneeName)
      .filter((assigneeName): assigneeName is string => Boolean(assigneeName)),
    qaAssignees: qaAssigneeRows
      .map((row) => row.qaAssigneeName)
      .filter((qaAssigneeName): qaAssigneeName is string => Boolean(qaAssigneeName)),
    supportLines: supportLineRows
      .map((row) => row.supportLine)
      .filter((supportLine): supportLine is string => Boolean(supportLine)),
    teamNames: teamNameRows
      .map((row) => row.teamName)
      .filter((teamName): teamName is string => Boolean(teamName))
  };
}

export async function getConversationForReview(workspaceId: string, conversationId: string, scope?: ReviewQueueScope) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      ...scopedConversationWhere(workspaceId, scope)
    },
    include: {
      messages: {
        orderBy: { sentAt: "asc" }
      },
      coachingPins: {
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" }
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: {
          reviewer: true,
          scores: {
            include: {
              criterion: true
            }
          },
          findings: {
            include: {
              coachingAction: true
            }
          },
          feedbackEvents: {
            include: {
              actor: true
            },
            orderBy: {
              createdAt: "desc"
            }
          },
          trainingAssignments: {
            orderBy: {
              createdAt: "desc"
            }
          }
        }
      }
    }
  });

  if (!conversation) {
    return null;
  }

  return {
    ...conversation,
    reviews: currentCycleReviewsForQaStatus(conversation.qaStatus, conversation.reviews)
  };
}

export async function getActiveScorecard(workspaceId: string) {
  const scorecard = await prisma.scorecard.findFirst({
    where: {
      workspaceId,
      isActive: true
    },
    include: {
      criteria: {
        orderBy: { order: "asc" }
      }
    }
  });

  if (!scorecard) {
    throw new Error("Активная форма оценки не найдена. Запустите npm run db:seed.");
  }

  return scorecard;
}
