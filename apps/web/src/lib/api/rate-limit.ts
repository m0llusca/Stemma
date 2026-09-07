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

/**
 * Process-local bucket for public webhook ingress (no API token).
 * Applies before signature verification so forged/retry storms are throttled.
 * Multi-instance deploys should front this with an edge/shared limiter later.
 */
const webhookIngressBuckets = new Map<string, { windowStart: number; count: number }>();

export const defaultWebhookIngressLimit = 120;
export const defaultWebhookIngressWindowMs = 60_000;

/** Test-only: clear in-memory webhook ingress buckets. */
export function resetWebhookIngressRateLimitsForTests() {
  webhookIngressBuckets.clear();
}

export function enforceWebhookIngressRateLimit(input: {
  workspaceId: string;
  endpointId: string;
  limit?: number;
  windowMs?: number;
  nowMs?: number;
}): RateLimitResult {
  const limit = input.limit ?? defaultWebhookIngressLimit;
  const windowMs = input.windowMs ?? defaultWebhookIngressWindowMs;
  const nowMs = input.nowMs ?? Date.now();
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const resetAt = new Date(windowStartMs + windowMs);
  const key = `${input.workspaceId}:${input.endpointId}`;
  const existing = webhookIngressBuckets.get(key);

  if (!existing || existing.windowStart !== windowStartMs) {
    webhookIngressBuckets.set(key, { windowStart: windowStartMs, count: 1 });
    return { ok: true, limit, remaining: Math.max(0, limit - 1), resetAt };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);

  return existing.count <= limit
    ? { ok: true, limit, remaining, resetAt }
    : { ok: false, limit, remaining: 0, resetAt };
}
