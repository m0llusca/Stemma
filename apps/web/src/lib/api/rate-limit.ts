import { prisma } from "@/lib/db";

export type RateLimitResult =
  | {
      ok: true;
      limit: number;
      remaining: number;
      resetAt: Date;
    }
  | {
      ok: false;
      limit: number;
      remaining: 0;
      resetAt: Date;
    };

function floorToWindow(now: Date, windowMs: number) {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export async function enforceApiRateLimit(input: {
  workspaceId: string;
  apiTokenId: string;
  routeKey: string;
  limit?: number;
  windowMs?: number;
}): Promise<RateLimitResult> {
  const limit = input.limit ?? 120;
  const windowMs = input.windowMs ?? 60_000;
  const windowStart = floorToWindow(new Date(), windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  const bucket = await prisma.apiRateLimit.upsert({
    where: {
      apiTokenId_routeKey_windowStart: {
        apiTokenId: input.apiTokenId,
        routeKey: input.routeKey,
        windowStart
      }
    },
    create: {
      workspaceId: input.workspaceId,
      apiTokenId: input.apiTokenId,
      routeKey: input.routeKey,
      windowStart,
      requestCount: 1
    },
    update: {
      requestCount: {
        increment: 1
      }
    }
  });

  const remaining = Math.max(0, limit - bucket.requestCount);

  return bucket.requestCount <= limit
    ? {
        ok: true,
        limit,
        remaining,
        resetAt
      }
    : {
        ok: false,
        limit,
        remaining: 0,
        resetAt
      };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": result.resetAt.toISOString()
  };
}

export const defaultWebhookIngressLimit = 120;
export const defaultWebhookIngressWindowMs = 60_000;

/**
 * Shared DB bucket for public webhook ingress (no API token).
 * Applies before signature verification so forged/retry storms are throttled
 * across workers — not a process-local Map.
 */
export async function enforceWebhookIngressRateLimit(input: {
  workspaceId: string;
  endpointId: string;
  limit?: number;
  windowMs?: number;
  nowMs?: number;
}): Promise<RateLimitResult> {
  const limit = input.limit ?? defaultWebhookIngressLimit;
  const windowMs = input.windowMs ?? defaultWebhookIngressWindowMs;
  const now = new Date(input.nowMs ?? Date.now());
  const windowStart = floorToWindow(now, windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);
  const routeKey = `webhook:${input.endpointId}`;

  const bucket = await prisma.ingressRateLimit.upsert({
    where: {
      workspaceId_routeKey_windowStart: {
        workspaceId: input.workspaceId,
        routeKey,
        windowStart
      }
    },
    create: {
      workspaceId: input.workspaceId,
      routeKey,
      windowStart,
      requestCount: 1
    },
    update: {
      requestCount: {
        increment: 1
      }
    }
  });

  const remaining = Math.max(0, limit - bucket.requestCount);

  return bucket.requestCount <= limit
    ? { ok: true, limit, remaining, resetAt }
    : { ok: false, limit, remaining: 0, resetAt };
}

/** @deprecated No-op kept so older tests that clear in-memory buckets still compile. */
export function resetWebhookIngressRateLimitsForTests() {
  // Shared limiter is DB-backed; tests mock prisma.ingressRateLimit instead.
}
