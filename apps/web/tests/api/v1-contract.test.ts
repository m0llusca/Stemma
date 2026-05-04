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
        requestId: "req-v1-1"
      }
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("req-v1-1");
  });
});
