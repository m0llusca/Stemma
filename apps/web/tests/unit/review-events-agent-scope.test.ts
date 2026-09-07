import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  prisma: {
    review: {
      findFirst: vi.fn()
    },
    conversation: {
      findFirst: vi.fn()
    },
    reviewEvent: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function agentSession(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    user: {
      id: "agent-1",
      workspaceId: "workspace-1",
      role: "SUPPORT_AGENT",
      name: "Оператор",
      ...overrides
    }
  };
}

function managerSession(overrides: Record<string, unknown> = {}) {
  return agentSession({ id: "lead-1", role: "TEAM_LEAD", name: "Тимлид", ...overrides });
}

function reviewEventsRequest(reviewId = "review-1") {
  return new Request(`https://qc.example.com/api/v1/reviews/${reviewId}/events`, {
    method: "GET",
    headers: { "x-request-id": "req-review-events-1" }
  });
}

function conversationEventsRequest(conversationId = "conversation-1") {
  return new Request(`https://qc.example.com/api/v1/conversations/${conversationId}/events`, {
    method: "GET",
    headers: { "x-request-id": "req-conversation-events-1" }
  });
}

describe("review events agent scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionApi.mockResolvedValue(agentSession());
    mocks.prisma.reviewEvent.findMany.mockResolvedValue([]);
  });

  it("returns the same not_found when SUPPORT_AGENT reads another agent's review events", async () => {
    const { GET } = await import("@/app/api/v1/reviews/[reviewId]/events/route");
    mocks.prisma.review.findFirst.mockResolvedValue({
      id: "review-1",
      conversation: { assigneeId: "agent-2" }
    });

    const response = await GET(reviewEventsRequest(), {
      params: Promise.resolve({ reviewId: "review-1" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "not_found",
        message: "Проверка не найдена."
      }
    });
    expect(mocks.prisma.reviewEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns the same not_found when SUPPORT_AGENT reads a review with null assigneeId", async () => {
    const { GET } = await import("@/app/api/v1/reviews/[reviewId]/events/route");
    mocks.prisma.review.findFirst.mockResolvedValue({
      id: "review-1",
      conversation: { assigneeId: null }
    });

    const response = await GET(reviewEventsRequest(), {
      params: Promise.resolve({ reviewId: "review-1" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found" }
    });
    expect(mocks.prisma.reviewEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns the same not_found when the review is missing", async () => {
    const { GET } = await import("@/app/api/v1/reviews/[reviewId]/events/route");
    mocks.prisma.review.findFirst.mockResolvedValue(null);

    const response = await GET(reviewEventsRequest(), {
      params: Promise.resolve({ reviewId: "missing" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "not_found",
        message: "Проверка не найдена."
      }
    });
  });

  it("allows SUPPORT_AGENT to load events for their own review", async () => {
    const { GET } = await import("@/app/api/v1/reviews/[reviewId]/events/route");
    mocks.prisma.review.findFirst.mockResolvedValue({
      id: "review-1",
      conversation: { assigneeId: "agent-1" }
    });

    const response = await GET(reviewEventsRequest(), {
      params: Promise.resolve({ reviewId: "review-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.prisma.reviewEvent.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not block managers on another assignee's review events", async () => {
    const { GET } = await import("@/app/api/v1/reviews/[reviewId]/events/route");
    mocks.requireSessionApi.mockResolvedValue(managerSession());
    mocks.prisma.review.findFirst.mockResolvedValue({
      id: "review-1",
      conversation: { assigneeId: "agent-2" }
    });

    const response = await GET(reviewEventsRequest(), {
      params: Promise.resolve({ reviewId: "review-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.prisma.reviewEvent.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("conversation events agent scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionApi.mockResolvedValue(agentSession());
    mocks.prisma.reviewEvent.findMany.mockResolvedValue([]);
  });

  it("returns the same not_found when SUPPORT_AGENT reads another agent's conversation events", async () => {
    const { GET } = await import("@/app/api/v1/conversations/[conversationId]/events/route");
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      assigneeId: "agent-2"
    });

    const response = await GET(conversationEventsRequest(), {
      params: Promise.resolve({ conversationId: "conversation-1" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "not_found",
        message: "Обращение не найдено."
      }
    });
    expect(mocks.prisma.reviewEvent.findMany).not.toHaveBeenCalled();
  });

  it("allows SUPPORT_AGENT to load events for their own conversation", async () => {
    const { GET } = await import("@/app/api/v1/conversations/[conversationId]/events/route");
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      assigneeId: "agent-1"
    });

    const response = await GET(conversationEventsRequest(), {
      params: Promise.resolve({ conversationId: "conversation-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.prisma.reviewEvent.findMany).toHaveBeenCalledTimes(1);
  });
});
