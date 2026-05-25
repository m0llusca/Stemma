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
    idempotencyKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    $transaction: vi.fn(),
    conversation: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn()
    },
    message: {
      upsert: vi.fn()
    },
    samplingRule: {
      findMany: vi.fn()
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
      authorization: "Bearer qa_test_token",
      "x-request-id": "req-v1-1"
    }
  });
}

function v1JsonRequest(path: string, body: unknown, headers: HeadersInit = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer qa_test_token",
      "content-type": "application/json",
      "x-request-id": "req-v1-1",
      ...headers
    }
  });
}

const conversationPayload = {
  externalSource: "custom_api",
  externalId: "conv-123",
  channel: "chat",
  subject: "Refund request",
  status: "closed",
  tags: [],
  customerName: "Ava Customer",
  samplingReason: "High-value customer",
  openedAt: "2026-04-25T10:00:00.000Z",
  messages: []
};

async function requestHashFor(body: unknown) {
  const [{ customConversationSchema }, { hashRequestBody }] = await Promise.all([
    import("@/lib/validation/custom-api"),
    import("@/lib/api/idempotency")
  ]);

  return hashRequestBody(customConversationSchema.parse(body));
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
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValue(null);
    mocks.prisma.idempotencyKey.create.mockResolvedValue({
      id: "idem-1",
      status: "IN_PROGRESS",
      requestHash: "new-request-hash",
      method: "POST",
      path: "/api/v1/conversations",
      responseStatus: null,
      responseBodyJson: null
    });
    mocks.prisma.idempotencyKey.update.mockResolvedValue({});
    mocks.prisma.samplingRule.findMany.mockResolvedValue([]);
    mocks.prisma.conversation.upsert.mockResolvedValue({ id: "conv-db-1" });
    mocks.prisma.message.upsert.mockResolvedValue({ id: "msg-db-1" });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
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

  it("returns a 409 conflict instead of processing an in-progress idempotency key with the same request hash", async () => {
    const { POST } = await import("@/app/api/v1/conversations/route");
    const requestHash = await requestHashFor(conversationPayload);
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: "idem-1",
      status: "IN_PROGRESS",
      requestHash,
      method: "POST",
      path: "/api/v1/conversations",
      responseStatus: null,
      responseBodyJson: null
    });

    const response = await POST(v1JsonRequest("/api/v1/conversations", conversationPayload, { "idempotency-key": "idem-1" }));

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "conflict",
        requestId: "req-v1-1"
      }
    });
    expect(response.status).toBe(409);
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it("replays a completed idempotency key with the same request hash", async () => {
    const { POST } = await import("@/app/api/v1/conversations/route");
    const requestHash = await requestHashFor(conversationPayload);
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: "idem-1",
      status: "COMPLETED",
      requestHash,
      method: "POST",
      path: "/api/v1/conversations",
      responseStatus: 201,
      responseBodyJson: JSON.stringify({ id: "conv-db-existing" })
    });

    const response = await POST(v1JsonRequest("/api/v1/conversations", conversationPayload, { "idempotency-key": "idem-1" }));

    await expect(response.json()).resolves.toEqual({
      data: { id: "conv-db-existing" },
      requestId: "req-v1-1"
    });
    expect(response.status).toBe(201);
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it("rejects a reused idempotency key with a different request payload", async () => {
    const { POST } = await import("@/app/api/v1/conversations/route");
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: "idem-1",
      status: "COMPLETED",
      requestHash: "different-request-hash",
      method: "POST",
      path: "/api/v1/conversations",
      responseStatus: 201,
      responseBodyJson: JSON.stringify({ id: "conv-db-existing" })
    });

    const response = await POST(v1JsonRequest("/api/v1/conversations", conversationPayload, { "idempotency-key": "idem-1" }));

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "conflict",
        requestId: "req-v1-1"
      }
    });
    expect(response.status).toBe(409);
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it("re-reads an idempotency reservation after a unique create race and returns the in-progress conflict", async () => {
    const { POST } = await import("@/app/api/v1/conversations/route");
    const requestHash = await requestHashFor(conversationPayload);
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "idem-1",
      status: "IN_PROGRESS",
      requestHash,
      method: "POST",
      path: "/api/v1/conversations",
      responseStatus: null,
      responseBodyJson: null
    });
    mocks.prisma.idempotencyKey.create.mockRejectedValueOnce({
      code: "P2002",
      meta: { target: ["workspaceId", "key"] }
    });

    const response = await POST(v1JsonRequest("/api/v1/conversations", conversationPayload, { "idempotency-key": "idem-1" }));

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "conflict",
        requestId: "req-v1-1"
      }
    });
    expect(response.status).toBe(409);
    expect(mocks.prisma.idempotencyKey.findUnique).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("marks a newly reserved idempotency key as failed when processing returns a 500", async () => {
    const { POST } = await import("@/app/api/v1/conversations/route");
    mocks.prisma.conversation.upsert.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(v1JsonRequest("/api/v1/conversations", conversationPayload, { "idempotency-key": "idem-1" }));

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "internal_error",
        requestId: "req-v1-1"
      }
    });
    expect(response.status).toBe(500);
    expect(mocks.prisma.idempotencyKey.update).toHaveBeenCalledWith({
      where: { id: "idem-1" },
      data: {
        responseStatus: 500,
        responseBodyJson: JSON.stringify({ error: "internal_error" }),
        status: "FAILED"
      }
    });
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
