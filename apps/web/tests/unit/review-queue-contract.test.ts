import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("review queue frontend/backend contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps backend queue rows into compact UI DTOs", async () => {
    mocks.prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conversation-1",
        subject: "Запрос на возврат",
        customerName: "Мила Петрова",
        assigneeName: "Иван Петров",
        channel: "CHAT",
        externalSource: "custom_api",
        supportLine: "1ЛП",
        teamName: "Возвраты",
        reviewDueAt: new Date("2026-05-05T12:00:00.000Z"),
        qaStatus: "FINALIZED",
        qaAssigneeName: "Проверяющий",
        csatBucket: "NEGATIVE",
        samplingType: "DSAT",
        riskHint: "VIP client",
        _count: {
          messages: 3
        },
        reviews: [
          {
            id: "review-1",
            status: "FINALIZED",
            reviewSource: "HUMAN",
            totalScore: 92,
            criticalError: false,
            needsReanswer: false,
            appealStatus: "none",
            reanswerStatus: "not_needed"
          }
        ]
      }
    ]);

    const { getReviewQueue } = await import("@/lib/review-repository");
    const conversations = await getReviewQueue("workspace-1", { status: "all" });

    expect(mocks.prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { messages: true } },
          openedAt: true,
          reviews: expect.objectContaining({
            take: 4
          })
        })
      })
    );
    expect(conversations).toEqual([
      {
        id: "conversation-1",
        subject: "Запрос на возврат",
        customerName: "Мила Петрова",
        assigneeName: "Иван Петров",
        messageCount: 3,
        channel: "CHAT",
        externalSource: "custom_api",
        supportLine: "1ЛП",
        teamName: "Возвраты",
        reviewDueAt: "2026-05-05T12:00:00.000Z",
        qaStatus: "FINALIZED",
        qaAssigneeName: "Проверяющий",
        csatBucket: "NEGATIVE",
        samplingType: "DSAT",
        riskHint: "VIP client",
        priorityRank: 10,
        priorityReason: "Завершено",
        reviews: [
          {
            id: "review-1",
            status: "FINALIZED",
            reviewSource: "HUMAN",
            totalScore: 92,
            criticalError: false,
            needsReanswer: false,
            appealStatus: "none",
            reanswerStatus: "not_needed"
          }
        ]
      }
    ]);
  });

  it("orders queue rows by operational priority before recency", async () => {
    mocks.prisma.conversation.findMany.mockResolvedValue([
      {
        id: "recent-low-risk",
        subject: "Свежий кейс",
        customerName: "Клиент",
        assigneeName: "Оператор",
        channel: "CHAT",
        externalSource: "custom_api",
        supportLine: "1ЛП",
        teamName: "Поддержка",
        reviewDueAt: null,
        openedAt: new Date("2026-06-20T12:00:00.000Z"),
        qaStatus: "QUEUED",
        qaAssigneeName: "Проверяющий",
        csatBucket: "NEUTRAL",
        samplingType: "RANDOM",
        riskHint: null,
        _count: {
          messages: 1
        },
        reviews: []
      },
      {
        id: "overdue-sla",
        subject: "Просроченный SLA",
        customerName: "Клиент",
        assigneeName: "Оператор",
        channel: "EMAIL",
        externalSource: "custom_api",
        supportLine: "2ЛП",
        teamName: "Поддержка",
        reviewDueAt: new Date("2020-01-01T12:00:00.000Z"),
        openedAt: new Date("2026-06-01T12:00:00.000Z"),
        qaStatus: "QUEUED",
        qaAssigneeName: "Проверяющий",
        csatBucket: "NEUTRAL",
        samplingType: "RANDOM",
        riskHint: null,
        _count: {
          messages: 2
        },
        reviews: []
      }
    ]);

    const { getReviewQueue } = await import("@/lib/review-repository");
    const conversations = await getReviewQueue("workspace-1", { status: "all" });

    expect(conversations.map((conversation) => conversation.id)).toEqual(["overdue-sla", "recent-low-risk"]);
    expect(conversations[0]).toMatchObject({
      priorityRank: 100,
      priorityReason: "SLA просрочен"
    });
  });

  it("does not expose finalized HUMAN reviews from a previous reopened cycle", async () => {
    mocks.prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conversation-1",
        subject: "Повторная проверка",
        customerName: "Мила Петрова",
        assigneeName: "Иван Петров",
        channel: "CHAT",
        externalSource: "custom_api",
        supportLine: "2ЛП",
        teamName: "ФГИС",
        reviewDueAt: null,
        qaStatus: "REOPENED",
        qaAssigneeName: "Проверяющий",
        csatBucket: "NEGATIVE",
        samplingType: "DSAT",
        riskHint: null,
        _count: {
          messages: 3
        },
        reviews: [
          {
            id: "old-finalized-review",
            status: "FINALIZED",
            reviewSource: "HUMAN",
            totalScore: 92,
            criticalError: true,
            needsReanswer: true,
            appealStatus: "open",
            reanswerStatus: "requested"
          },
          {
            id: "current-draft-review",
            status: "DRAFT",
            reviewSource: "HUMAN",
            totalScore: 70,
            criticalError: false,
            needsReanswer: false,
            appealStatus: "none",
            reanswerStatus: "not_needed"
          }
        ]
      }
    ]);

    const { getReviewQueue } = await import("@/lib/review-repository");
    const conversations = await getReviewQueue("workspace-1", { status: "all" });

    expect(conversations[0].reviews).toEqual([
      expect.objectContaining({
        id: "current-draft-review",
        status: "DRAFT"
      })
    ]);
  });

  it("filters previous-cycle finalized HUMAN reviews from the review detail repository", async () => {
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
      qaStatus: "REOPENED",
      messages: [],
      reviews: [
        {
          id: "old-finalized-review",
          status: "FINALIZED",
          reviewSource: "HUMAN"
        },
        {
          id: "current-draft-review",
          status: "DRAFT",
          reviewSource: "HUMAN"
        }
      ]
    });

    const { getConversationForReview } = await import("@/lib/review-repository");
    const conversation = await getConversationForReview("workspace-1", "conversation-1");

    expect(conversation?.reviews).toEqual([
      expect.objectContaining({
        id: "current-draft-review",
        status: "DRAFT"
      })
    ]);
  });

  it("keeps reviewed and unreviewed filters scoped to the active QA cycle", async () => {
    mocks.prisma.conversation.findMany.mockResolvedValue([]);
    const { getReviewQueue } = await import("@/lib/review-repository");

    await getReviewQueue("workspace-1", { status: "reviewed" });
    await getReviewQueue("workspace-1", { status: "unreviewed" });

    expect(mocks.prisma.conversation.findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        { workspaceId: "workspace-1" },
        { qaStatus: "FINALIZED" },
        {
          reviews: {
            some: {
              reviewSource: "HUMAN",
              status: "FINALIZED"
            }
          }
        }
      ])
    );
    expect(mocks.prisma.conversation.findMany.mock.calls[1][0].where.AND).toEqual(
      expect.arrayContaining([
        { workspaceId: "workspace-1" },
        {
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
        }
      ])
    );
  });

  it("turns analytics drilldown params into concrete reviewed queue filters", async () => {
    mocks.prisma.conversation.findMany.mockResolvedValue([]);
    const { getReviewQueue, parseReviewQueueFilters } = await import("@/lib/review-repository");
    const filters = parseReviewQueueFilters({
      status: "reviewed",
      riskLevel: "HIGH_OR_CRITICAL",
      coachingStatus: "open",
      findingCategory: "Маршрутизация",
      feedbackStatus: "appeal",
      appealStatus: "open",
      reanswerStatus: "requested"
    });

    await getReviewQueue("workspace-1", filters);

    const and = mocks.prisma.conversation.findMany.mock.calls[0][0].where.AND;

    expect(filters.riskLevel).toBe("HIGH_OR_CRITICAL");
    expect(filters.coachingStatus).toBe("open");
    const finalizedReviewFilters = and.filter((clause: Record<string, unknown>) => "reviews" in clause);
    expect(finalizedReviewFilters).toHaveLength(2);
    expect(finalizedReviewFilters[1]).toEqual({
      reviews: {
        some: {
          reviewSource: "HUMAN",
          status: "FINALIZED",
          AND: expect.arrayContaining([
            {
              findings: {
                some: {
                  riskLevel: {
                    in: ["HIGH", "CRITICAL"]
                  }
                }
              }
            },
            {
              findings: {
                some: {
                  coachingAction: {
                    status: "open"
                  }
                }
              }
            },
            {
              findings: {
                some: {
                  category: "Маршрутизация"
                }
              }
            },
            {
              feedbackStatus: "appeal"
            },
            {
              appealStatus: "open"
            },
            {
              reanswerStatus: "requested"
            }
          ])
        }
      }
    });
  });

  it("filters reviewed queues by support team of the checked agent", async () => {
    mocks.prisma.conversation.findMany.mockResolvedValue([]);
    const { getReviewQueue, parseReviewQueueFilters } = await import("@/lib/review-repository");
    const filters = parseReviewQueueFilters({
      teamName: "ФГИС",
      supportLine: "2ЛП"
    });

    await getReviewQueue("workspace-1", filters);

    expect(filters.teamName).toBe("ФГИС");
    expect(mocks.prisma.conversation.findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        { supportLine: "2ЛП" },
        { teamName: "ФГИС" }
      ])
    );
  });
});
