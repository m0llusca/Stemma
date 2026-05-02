import type { ConversationChannel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const reviewQueueStatuses = ["all", "unreviewed", "reviewed"] as const;

const conversationChannels = ["CHAT", "EMAIL", "TICKET", "MESSENGER"] as const satisfies readonly ConversationChannel[];

export type ReviewQueueStatus = (typeof reviewQueueStatuses)[number];

export type ReviewQueueFilters = {
  q?: string;
  status: ReviewQueueStatus;
  channel?: ConversationChannel;
  source?: string;
  assignee?: string;
};

export type ReviewQueueSearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanParam(value: string | string[] | undefined) {
  const firstValue = firstParam(value)?.trim();
  return firstValue ? firstValue : undefined;
}

export function parseReviewQueueFilters(searchParams: ReviewQueueSearchParams = {}): ReviewQueueFilters {
  const requestedStatus = cleanParam(searchParams.status);
  const requestedChannel = cleanParam(searchParams.channel);

  return {
    q: cleanParam(searchParams.q),
    status: reviewQueueStatuses.includes(requestedStatus as ReviewQueueStatus)
      ? (requestedStatus as ReviewQueueStatus)
      : "all",
    channel: conversationChannels.includes(requestedChannel as ConversationChannel)
      ? (requestedChannel as ConversationChannel)
      : undefined,
    source: cleanParam(searchParams.source),
    assignee: cleanParam(searchParams.assignee)
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

  if (filters.source) {
    and.push({ externalSource: filters.source });
  }

  if (filters.assignee) {
    and.push({ assigneeName: filters.assignee });
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
        take: 1
      }
    },
    orderBy: { openedAt: "desc" }
  });
}

export async function getReviewQueueSummary(workspaceId: string) {
  const [total, unreviewed, reviewed, highRisk] = await Promise.all([
    prisma.conversation.count({
      where: { workspaceId }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
        reviews: {
          none: {
            status: "FINALIZED"
          }
        }
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId,
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
        OR: [
          { riskHint: { not: null } },
          { samplingReason: { contains: "риск" } },
          { samplingReason: { contains: "risk" } }
        ]
      }
    })
  ]);

  return {
    total,
    unreviewed,
    reviewed,
    highRisk
  };
}

export async function getReviewQueueFilterOptions(workspaceId: string) {
  const [sourceRows, assigneeRows] = await Promise.all([
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
    })
  ]);

  return {
    sources: sourceRows.map((row) => row.externalSource),
    assignees: assigneeRows
      .map((row) => row.assigneeName)
      .filter((assigneeName): assigneeName is string => Boolean(assigneeName))
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
    throw new Error("Активная скоркарта не найдена. Запустите npm run db:seed.");
  }

  return scorecard;
}
