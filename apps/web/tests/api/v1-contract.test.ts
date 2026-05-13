import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    apiRateLimit: {
      upsert: vi.fn()
    },
    conversation: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    review: {
      findMany: vi.fn(),
      count: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function v1Request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: {
      authorization: "Bearer qa_demo_dev_token",
      "x-request-id": "req-v1-1"
    }
  });
}

describe("public v1 API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "api-token-1",
      workspaceId: "workspace-1",
      scopes: "all",
      expiresAt: null
    });
    mocks.prisma.apiToken.update.mockResolvedValue({});
    mocks.prisma.apiRateLimit.upsert.mockResolvedValue({
      requestCount: 1
    });
  });

  it("wraps empty conversation lists with pagination metadata and rate-limit headers", async () => {
    const { GET } = await import("@/app/api/v1/conversations/route");
    mocks.prisma.conversation.findMany.mockResolvedValue([]);
    mocks.prisma.conversation.count.mockResolvedValue(0);

    const response = await GET(v1Request("/api/v1/conversations"));

    await expect(response.json()).resolves.toEqual({
      data: { conversations: [] },
      meta: {
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false
        }
      },
      requestId: "req-v1-1"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-v1-1");
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("119");
  });

  it("returns structured errors for invalid review filters", async () => {
    const { GET } = await import("@/app/api/v1/reviews/route");

    const response = await GET(v1Request("/api/v1/reviews?status=unknown"));

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "bad_request",
        message: "Некорректные фильтры проверок.",
        details: null,
        requestId: "req-v1-1"
      }
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("req-v1-1");
  });

  it("returns review scores with explicit point-unit summary", async () => {
    const { GET } = await import("@/app/api/v1/reviews/route");
    mocks.prisma.review.findMany.mockResolvedValue([
      {
        id: "review-1",
        status: "FINALIZED",
        reviewSource: "HUMAN",
        rubricVersion: 1,
        totalScore: 21,
        confidence: null,
        summary: "Resolved.",
        feedbackStatus: "pending",
        appealStatus: "none",
        criticalError: false,
        criticalCategory: null,
        needsReanswer: false,
        reanswerStatus: "not_needed",
        calibrationStatus: "none",
        finalizedAt: new Date("2026-04-26T12:00:00.000Z"),
        createdAt: new Date("2026-04-26T11:50:00.000Z"),
        updatedAt: new Date("2026-04-26T12:05:00.000Z"),
        reviewer: {
          id: "user-1",
          name: "QA Analyst",
          email: "qa@example.com",
          role: "QA_ANALYST"
        },
        conversation: {
          id: "conv-1",
          externalSource: "custom_api",
          externalId: "ticket-1",
          channel: "CHAT",
          subject: "Refund",
          customerName: "Ava Customer",
          assigneeName: "Sam Agent",
          qaStatus: "reviewed",
          samplingType: "DSAT",
          supportLine: "L1",
          teamName: "Refunds",
          openedAt: new Date("2026-04-25T10:00:00.000Z"),
          closedAt: null
        },
        _count: {
          scores: 4,
          findings: 1,
          events: 3
        }
      }
    ]);
    mocks.prisma.review.count.mockResolvedValue(1);

    const response = await GET(v1Request("/api/v1/reviews"));

    await expect(response.json()).resolves.toMatchObject({
      data: {
        reviews: [
          {
            id: "review-1",
            totalScore: 21,
            score: {
              totalScore: 21,
              scoreUnit: "points",
              scoreLabel: "21 балл"
            }
          }
        ]
      },
      meta: {
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false
        }
      },
      requestId: "req-v1-1"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-v1-1");
  });
});
