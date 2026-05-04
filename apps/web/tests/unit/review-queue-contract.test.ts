import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    conversation: {
      findMany: vi.fn()
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
        reviewDueAt: new Date("2026-05-05T12:00:00.000Z"),
        qaStatus: "ASSIGNED",
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
        reviewDueAt: "2026-05-05T12:00:00.000Z",
        qaStatus: "ASSIGNED",
        qaAssigneeName: "Проверяющий",
        csatBucket: "NEGATIVE",
        samplingType: "DSAT",
        riskHint: "VIP client",
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
});
