import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    apiRateLimit: {
      upsert: vi.fn()
    },
    conversation: {
      upsert: vi.fn()
    },
    message: {
      upsert: vi.fn(),
      deleteMany: vi.fn()
    },
    samplingRule: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

const validConversationPayload = {
  externalSource: "custom_api",
  externalId: "conv-123",
  channel: "chat",
  subject: "Refund request",
  status: "closed",
  customerName: "Ava Customer",
  samplingReason: "High-value customer",
  openedAt: "2026-04-25T10:00:00.000Z",
  messages: []
};

function jsonRequest(body: unknown, extraHeaders: HeadersInit = {}) {
  const headers = new Headers({
    "content-type": "application/json",
    authorization: "Bearer qa_test_token",
    ...extraHeaders
  });

  return new Request("http://localhost/api/conversations", {
    method: "POST",
    body: JSON.stringify(body),
    headers
  }) as NextRequest;
}

describe("legacy token API route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "api-token-1",
      workspaceId: "workspace-1",
      scopes: "conversations:write",
      expiresAt: null
    });
    mocks.prisma.apiToken.update.mockResolvedValue({});
    mocks.prisma.apiRateLimit.upsert.mockResolvedValue({ requestCount: 1 });
    mocks.prisma.samplingRule.findMany.mockResolvedValue([]);
    mocks.prisma.message.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("rejects with 429 and rate limit headers when the token bucket is exhausted", async () => {
    mocks.prisma.apiRateLimit.upsert.mockResolvedValue({ requestCount: 121 });
    const { POST } = await import("@/app/api/conversations/route");

    const response = await POST(jsonRequest(validConversationPayload));

    await expect(response.json()).resolves.toEqual({ error: "Rate limit exceeded." });
    expect(response.status).toBe(429);
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(response.headers.get("x-ratelimit-reset")).toBeTruthy();
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "api-token-1" },
      data: {
        lastErrorAt: expect.any(Date),
        lastError: "Rate limit exceeded."
      }
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("rejects with 413 before parsing when content-length exceeds 1 MB", async () => {
    const { POST, maxRequestBodyBytes } = await import("@/app/api/conversations/route");

    const response = await POST(
      jsonRequest(validConversationPayload, { "content-length": String(maxRequestBodyBytes + 1) })
    );

    await expect(response.json()).resolves.toEqual({
      error: `Request payload exceeds ${maxRequestBodyBytes} bytes.`
    });
    expect(response.status).toBe(413);
    expect(maxRequestBodyBytes).toBe(1024 * 1024);
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "api-token-1" },
      data: {
        lastErrorAt: expect.any(Date),
        lastError: "Request payload too large."
      }
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("accepts a content-length exactly at the 1 MB boundary", async () => {
    mocks.prisma.conversation.upsert.mockResolvedValue({ id: "conv-db-1" });
    const { POST, maxRequestBodyBytes } = await import("@/app/api/conversations/route");

    const response = await POST(
      jsonRequest(validConversationPayload, { "content-length": String(maxRequestBodyBytes) })
    );

    await expect(response.json()).resolves.toEqual({ id: "conv-db-1" });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
