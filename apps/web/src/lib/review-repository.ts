import type { ConversationChannel, Prisma, QaStatus, RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/db";

export const reviewQueueStatuses = ["all", "unreviewed", "reviewed"] as const;
export const qaQueueStatuses = ["all", "QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const;
export const queueSamplingTypes = ["RANDOM", "DSAT", "LEAD_SIGNAL", "NEW_HIRE", "LOW_SCORE", "MANUAL"] as const;
export const queueCsatBuckets = ["NEGATIVE", "POSITIVE", "NO_SCORE"] as const;
export const queueProcessFilters = ["critical", "reanswer", "appeal"] as const;
export const queueDueFilters = ["overdue"] as const;

const conversationChannels = ["CHAT", "EMAIL", "TICKET", "MESSENGER"] as const satisfies readonly ConversationChannel[];
const conversationQaStatuses = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const satisfies readonly QaStatus[];
const findingRiskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const satisfies readonly RiskLevel[];

export type ReviewQueueStatus = (typeof reviewQueueStatuses)[number];
export type ReviewQueueProcessFilter = (typeof queueProcessFilters)[number];
export type ReviewQueueDueFilter = (typeof queueDueFilters)[number];

export type ReviewQueueFilters = {
  q?: string;
  status: ReviewQueueStatus;
  channel?: ConversationChannel;
  qaStatus?: QaStatus;
  source?: string;
  assignee?: string;
  qaAssignee?: string;
  samplingType?: string;
  csatBucket?: string;
  supportLine?: string;
  process?: ReviewQueueProcessFilter;
  due?: ReviewQueueDueFilter;
  riskLevel?: RiskLevel;
  finalizedFrom?: Date;
  finalizedTo?: Date;
};

export type ReviewQueueSearchParams = Record<string, string | string[] | undefined>;

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
    process: queueProcessFilters.includes(requestedProcess as ReviewQueueProcessFilter)
      ? (requestedProcess as ReviewQueueProcessFilter)
      : undefined,
    due: queueDueFilters.includes(requestedDue as ReviewQueueDueFilter) ? (requestedDue as ReviewQueueDueFilter) : undefined,
    riskLevel: findingRiskLevels.includes(requestedRiskLevel as RiskLevel) ? (requestedRiskLevel as RiskLevel) : undefined,
    finalizedFrom: parseDateParam(requestedFinalizedFrom),
    finalizedTo: parseDateParam(requestedFinalizedTo, true)
  };
}

function buildReviewQueueWhere(workspaceId: string, filters: ReviewQueueFilters): Prisma.ConversationWhereInput {
  const and: Prisma.ConversationWhereInput[] = [{ workspaceId }];

  if (filters.q) {
    and.push({
      OR: [
        { subject: { contains: filters.q } },
        { customerName: { contains: filters.q } },
        { externalId: { contains: filters.q } },
        { tags: { contains: filters.q } },
        { assigneeName: { contains: filters.q } }
      ]
    });
  }

  if (filters.status === "unreviewed") {
    and.push({
      reviews: {
        none: {
          status: "FINALIZED"
        }
      }
    });
  }

  if (filters.status === "reviewed") {
    and.push({
      reviews: {
        some: {
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

  if (filters.due === "overdue") {
    and.push({
      reviewDueAt: { lt: new Date() },
      qaStatus: { not: "FINALIZED" }
    });
  }

  if (filters.process === "critical") {
    and.push({
      reviews: {
        some: {
          status: "FINALIZED",
          criticalError: true
        }
      }
    });
  }

  if (filters.process === "reanswer") {
    and.push({
      reviews: {
        some: {
          status: "FINALIZED",
          needsReanswer: true
        }
      }
    });
  }

  if (filters.process === "appeal") {
    and.push({
      reviews: {
        some: {
          status: "FINALIZED",
          appealStatus: {
            not: "none"
          }
        }
      }
    });
  }

  if (filters.riskLevel) {
    and.push({
      reviews: {
        some: {
          status: "FINALIZED",
          findings: {
            some: {
              riskLevel: filters.riskLevel
            }
          }
        }
      }
    });
  }

  if (filters.finalizedFrom || filters.finalizedTo) {
    and.push({
      reviews: {
        some: {
          status: "FINALIZED",
          finalizedAt: {
            ...(filters.finalizedFrom ? { gte: filters.finalizedFrom } : {}),
            ...(filters.finalizedTo ? { lte: filters.finalizedTo } : {})
          }
        }
      }
    });
  }

  return { AND: and };
}

export async function getReviewQueue(workspaceId: string, filters: ReviewQueueFilters) {
  return prisma.conversation.findMany({
    where: buildReviewQueueWhere(workspaceId, filters),
    include: {
      messages: {
        orderBy: { sentAt: "asc" }
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 4
      }
    },
    orderBy: { openedAt: "desc" }
  });
}

export async function getReviewQueueSummary(workspaceId: string) {
  const [total, queued, inWork, drafts, reviewed, overdue] = await Promise.all([
    prisma.conversation.count({
      where: { workspaceId }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        qaStatus: "QUEUED"
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        qaStatus: {
          in: ["ASSIGNED", "IN_PROGRESS", "REOPENED"]
        }
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        reviews: {
          some: {
            status: "DRAFT"
          }
        }
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        qaStatus: "FINALIZED",
        reviews: {
          some: {
            status: "FINALIZED"
          }
        }
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
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

export async function getReviewQueueFilterOptions(workspaceId: string) {
  const [sourceRows, assigneeRows, qaAssigneeRows, supportLineRows] = await Promise.all([
    prisma.conversation.findMany({
      where: { workspaceId },
      distinct: ["externalSource"],
      select: {
        externalSource: true
      },
      orderBy: {
        externalSource: "asc"
      }
    }),
    prisma.conversation.findMany({
      where: {
        workspaceId,
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
        workspaceId,
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
        workspaceId,
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
      .filter((supportLine): supportLine is string => Boolean(supportLine))
  };
}

export async function getConversationForReview(workspaceId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId
    },
    include: {
      messages: {
        orderBy: { sentAt: "asc" }
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
          }
        }
      }
    }
  });
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
