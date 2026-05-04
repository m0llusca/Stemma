import { beforeEach, describe, expect, it, vi } from "vitest";
import { enforceApiRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiRateLimit: {
      upsert: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("api rate limit helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns limit metadata with remaining requests", async () => {
    mocks.prisma.apiRateLimit.upsert.mockResolvedValue({ requestCount: 3 });

    const result = await enforceApiRateLimit({
      workspaceId: "workspace-1",
      apiTokenId: "token-1",
      routeKey: "GET /api/v1/conversations",
      limit: 10,
      windowMs: 60_000
    });

    expect(result.ok).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(7);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it("builds standard rate limit headers", () => {
    const headers = rateLimitHeaders({
      ok: true,
      limit: 10,
      remaining: 7,
      resetAt: new Date("2026-05-04T12:00:00.000Z")
    });

    expect(headers).toEqual({
      "x-ratelimit-limit": "10",
      "x-ratelimit-remaining": "7",
      "x-ratelimit-reset": "2026-05-04T12:00:00.000Z"
    });
  });
});
