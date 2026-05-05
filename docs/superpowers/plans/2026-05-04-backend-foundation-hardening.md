# Backend Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing backend foundation so `/api/v1`, auth, jobs, OpenAPI, auditability, and local docs are consistent enough for the next integration and QA workflow phases.

**Architecture:** Keep the current Next.js App Router backend in `apps/web`, Prisma/PostgreSQL, and the existing domain modules. Add small shared API/auth/job utilities, migrate routes incrementally to those utilities, and keep legacy `/api/...` endpoints as compatibility endpoints backed by existing services. Do not rewrite the app or move backend code into a separate service.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, Zod, Vitest, Playwright, npm.

---

## Scope

This plan implements Phase 1 of `docs/superpowers/specs/2026-05-04-backend-roadmap-design.md`.

The approved roadmap includes integration engine, QA product backend, and AutoQA readiness. Those are separate implementation plans because they are independent subsystems. This plan only builds the foundation that those phases depend on.

## File Structure

Create or modify these backend units:

- Modify `apps/web/src/lib/api/response.ts`: keep legacy `apiJson`, add standardized `/api/v1` success/error helpers.
- Modify `apps/web/src/lib/api/rate-limit.ts`: include limit metadata and header helpers.
- Modify `apps/web/src/lib/api-auth.ts`: return structured auth errors with request IDs while preserving API token success/error diagnostics.
- Create `apps/web/src/lib/api/session.ts`: session-auth API guard and CSRF/origin checks for cookie-auth mutations.
- Create `apps/web/src/lib/auth/cookies.ts`: shared secure cookie options for auth and OIDC cookies.
- Create `apps/web/src/lib/api/openapi.ts`: OpenAPI document builder and shared schemas.
- Modify `apps/web/src/app/api/v1/openapi/route.ts`: serve the OpenAPI builder output.
- Modify `/api/v1` public API routes for conversations and reviews to use standardized response helpers.
- Modify `/api/v1` session-auth mutation routes to use `requireSessionApi`.
- Modify `apps/web/src/lib/jobs/queue.ts`: queue metrics and failed-job requeue.
- Modify `apps/web/src/scripts/run-jobs.ts`: worker loop options.
- Create `apps/web/src/app/api/v1/jobs/[jobId]/requeue/route.ts`: admin requeue endpoint.
- Modify `AGENTS.md`: align local database notes with PostgreSQL.
- Add focused tests under `apps/web/tests/unit` and `apps/web/tests/api`.

## Task 1: Standardize API Response Helpers

**Files:**

- Modify: `apps/web/src/lib/api/response.ts`
- Test: `apps/web/tests/unit/api-response.test.ts`

- [x] **Step 1: Write failing tests for standardized responses**

Create `apps/web/tests/unit/api-response.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { apiData, apiError, apiRequestId, requestIdFromHeaders } from "@/lib/api/response";

describe("api response helpers", () => {
  it("uses caller request id when present", () => {
    const headers = new Headers({ "x-request-id": "req-client-1" });

    expect(requestIdFromHeaders(headers)).toBe("req-client-1");
  });

  it("generates a request id when none is present", () => {
    expect(apiRequestId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFromHeaders(new Headers())).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("wraps successful v1 data with metadata and request id", async () => {
    const response = apiData(
      { ok: true },
      {
        status: 201,
        requestId: "req-123",
        meta: { page: 1 },
        headers: { "x-custom": "yes" }
      }
    );

    await expect(response.json()).resolves.toEqual({
      data: { ok: true },
      meta: { page: 1 },
      requestId: "req-123"
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("req-123");
    expect(response.headers.get("x-custom")).toBe("yes");
  });

  it("wraps v1 errors with code, message, details and request id", async () => {
    const response = apiError("bad_request", "Invalid payload.", 400, "req-456", {
      fieldErrors: { name: ["Required"] }
    });

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "bad_request",
        message: "Invalid payload.",
        details: { fieldErrors: { name: ["Required"] } },
        requestId: "req-456"
      }
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("req-456");
  });
});
```

- [x] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd apps/web
npm run test -- tests/unit/api-response.test.ts
```

Expected: FAIL because `apiData` and `requestIdFromHeaders` are not exported from `@/lib/api/response`.

- [x] **Step 3: Implement standardized helpers while preserving legacy `apiJson`**

Replace `apps/web/src/lib/api/response.ts` with:

```ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal_error";

export type ApiResponseOptions = {
  status?: number;
  requestId?: string;
  meta?: unknown;
  headers?: HeadersInit;
};

function mergeHeaders(headers: HeadersInit | undefined, requestId: string) {
  const merged = new Headers(headers);
  merged.set("x-request-id", requestId);
  return merged;
}

export function apiRequestId(): string {
  return randomUUID();
}

export function requestIdFromHeaders(headers: Headers) {
  return headers.get("x-request-id")?.trim() || apiRequestId();
}

export function apiData<T>(data: T, options: ApiResponseOptions = {}) {
  const requestId = options.requestId ?? apiRequestId();

  return NextResponse.json(
    {
      data,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
      requestId
    },
    {
      status: options.status ?? 200,
      headers: mergeHeaders(options.headers, requestId)
    }
  );
}

export function apiJson<T>(data: T, status = 200, requestId: string = apiRequestId()) {
  return NextResponse.json(data, {
    status,
    headers: {
      "x-request-id": requestId
    }
  });
}

export function apiError(code: ApiErrorCode, message: string, status: number, requestId: string = apiRequestId(), details?: unknown) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? null,
        requestId
      }
    },
    {
      status,
      headers: mergeHeaders(undefined, requestId)
    }
  );
}
```

- [x] **Step 4: Run response helper tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/api-response.test.ts
```

Expected: PASS.

- [x] **Step 5: Run existing API helper tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/api-query.test.ts tests/api/conversations.test.ts
```

Expected: PASS. The legacy `apiJson` helper still returns unwrapped bodies, so existing routes are not broken by this task.

- [x] **Step 6: Commit response helper changes**

Run:

```bash
git add apps/web/src/lib/api/response.ts apps/web/tests/unit/api-response.test.ts
git commit -m "add standardized api response helpers"
```

## Task 2: Add Rate Limit Headers And Structured API Token Auth Errors

**Files:**

- Modify: `apps/web/src/lib/api/rate-limit.ts`
- Modify: `apps/web/src/lib/api-auth.ts`
- Test: `apps/web/tests/unit/api-rate-limit.test.ts`
- Test: `apps/web/tests/unit/api-auth.test.ts`

- [x] **Step 1: Write failing rate limit helper tests**

Create `apps/web/tests/unit/api-rate-limit.test.ts`:

```ts
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
```

- [x] **Step 2: Write failing API token auth tests**

Create `apps/web/tests/unit/api-auth.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiToken } from "@/lib/api-auth";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function request(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/v1/conversations", { headers }) as never;
}

describe("api token auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured unauthorized error with request id", async () => {
    const auth = await requireApiToken(request({ "x-request-id": "req-auth-1" }), "conversations:read", {
      structuredErrors: true
    });

    expect(auth.ok).toBe(false);

    if (!auth.ok) {
      await expect(auth.response.json()).resolves.toEqual({
        error: {
          code: "unauthorized",
          message: "API token is required.",
          details: null,
          requestId: "req-auth-1"
        }
      });
      expect(auth.response.status).toBe(401);
      expect(auth.response.headers.get("x-request-id")).toBe("req-auth-1");
    }
  });

  it("accepts all scope and updates last used timestamp", async () => {
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "token-1",
      workspaceId: "workspace-1",
      scopes: "all",
      expiresAt: null
    });
    mocks.prisma.apiToken.update.mockResolvedValue({});

    const auth = await requireApiToken(request({ authorization: "Bearer plain-token" }), "reviews:read", {
      structuredErrors: true
    });

    expect(auth).toEqual({ ok: true, workspaceId: "workspace-1", apiTokenId: "token-1" });
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { lastUsedAt: expect.any(Date) }
    });
  });
});
```

- [x] **Step 3: Run new tests and verify they fail**

Run:

```bash
cd apps/web
npm run test -- tests/unit/api-rate-limit.test.ts tests/unit/api-auth.test.ts
```

Expected: FAIL because rate limit metadata, `rateLimitHeaders`, and `structuredErrors` are not implemented.

- [x] **Step 4: Add rate limit metadata and headers**

Update `apps/web/src/lib/api/rate-limit.ts`:

```ts
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

export function rateLimitHeaders(result: Pick<RateLimitResult, "limit" | "remaining" | "resetAt">): Record<string, string> {
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": result.resetAt.toISOString()
  };
}
```

- [x] **Step 5: Add structured API token auth errors**

Modify `apps/web/src/lib/api-auth.ts`:

```ts
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError, requestIdFromHeaders } from "@/lib/api/response";
import { prisma } from "@/lib/db";

export type ApiScope =
  | "all"
  | "conversations:read"
  | "conversations:write"
  | "reviews:read"
  | "reviews:write"
  | "reports:read"
  | "integrations:run"
  | "jobs:read"
  | "jobs:write";

type RequireApiTokenOptions = {
  requestId?: string;
  structuredErrors?: boolean;
};

type ApiAuthResult =
  | {
      ok: true;
      workspaceId: string;
      apiTokenId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function readApiToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.headers.get("x-api-key")?.trim();
}

function hasScope(scopes: string, requiredScope: ApiScope) {
  const scopeSet = new Set(
    scopes
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean)
  );

  return scopeSet.has("all") || scopeSet.has(requiredScope);
}

function errorResponse(message: string, status: number, options: Required<RequireApiTokenOptions>) {
  if (!options.structuredErrors) {
    return NextResponse.json({ error: message }, { status });
  }

  return apiError(status === 403 ? "forbidden" : "unauthorized", message, status, options.requestId);
}

export async function requireApiToken(
  request: NextRequest,
  requiredScope: ApiScope,
  options: RequireApiTokenOptions = {}
): Promise<ApiAuthResult> {
  const normalizedOptions = {
    requestId: options.requestId ?? requestIdFromHeaders(request.headers),
    structuredErrors: options.structuredErrors ?? false
  };
  const token = readApiToken(request);

  if (!token) {
    return {
      ok: false,
      response: errorResponse("API token is required.", 401, normalizedOptions)
    };
  }

  const apiToken = await prisma.apiToken.findUnique({
    where: {
      tokenHash: hashApiToken(token)
    },
    select: {
      id: true,
      workspaceId: true,
      scopes: true,
      expiresAt: true
    }
  });

  if (!apiToken || (apiToken.expiresAt && apiToken.expiresAt < new Date())) {
    return {
      ok: false,
      response: errorResponse("API token is invalid or expired.", 401, normalizedOptions)
    };
  }

  if (!hasScope(apiToken.scopes, requiredScope)) {
    return {
      ok: false,
      response: errorResponse("API token does not have the required scope.", 403, normalizedOptions)
    };
  }

  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() }
  });

  return {
    ok: true,
    workspaceId: apiToken.workspaceId,
    apiTokenId: apiToken.id
  };
}

export async function recordApiTokenSuccess(apiTokenId: string) {
  await prisma.apiToken.update({
    where: { id: apiTokenId },
    data: {
      lastSuccessAt: new Date(),
      lastError: null
    }
  });
}

export async function recordApiTokenError(apiTokenId: string, error: string) {
  await prisma.apiToken.update({
    where: { id: apiTokenId },
    data: {
      lastErrorAt: new Date(),
      lastError: error.slice(0, 240)
    }
  });
}
```

- [x] **Step 6: Run auth and rate limit tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/api-rate-limit.test.ts tests/unit/api-auth.test.ts tests/api/conversations.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit auth and rate limit changes**

Run:

```bash
git add apps/web/src/lib/api/rate-limit.ts apps/web/src/lib/api-auth.ts apps/web/tests/unit/api-rate-limit.test.ts apps/web/tests/unit/api-auth.test.ts
git commit -m "standardize api auth and rate limit metadata"
```

## Task 3: Migrate Public `/api/v1` Conversation And Review Routes To The Contract

**Files:**

- Modify: `apps/web/src/app/api/v1/conversations/route.ts`
- Modify: `apps/web/src/app/api/v1/conversations/[conversationId]/route.ts`
- Modify: `apps/web/src/app/api/v1/reviews/route.ts`
- Modify: `apps/web/src/app/api/v1/reviews/[reviewId]/route.ts`
- Test: `apps/web/tests/api/v1-contract.test.ts`

- [x] **Step 1: Write failing contract tests for public API routes**

Create `apps/web/tests/api/v1-contract.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

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
      count: vi.fn(),
      findFirst: vi.fn()
    },
    review: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function apiRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    headers: {
      authorization: "Bearer qa-demo-token",
      "x-request-id": "req-v1-1"
    }
  }) as NextRequest;
}

describe("v1 public API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "api-token-1",
      workspaceId: "workspace-1",
      scopes: "all",
      expiresAt: null
    });
    mocks.prisma.apiToken.update.mockResolvedValue({});
    mocks.prisma.apiRateLimit.upsert.mockResolvedValue({ requestCount: 1 });
  });

  it("wraps conversation list data with pagination metadata and rate limit headers", async () => {
    const { GET } = await import("@/app/api/v1/conversations/route");
    mocks.prisma.conversation.findMany.mockResolvedValue([]);
    mocks.prisma.conversation.count.mockResolvedValue(0);

    const response = await GET(apiRequest("/api/v1/conversations"));

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
    expect(response.headers.get("x-request-id")).toBe("req-v1-1");
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("119");
  });

  it("uses structured validation errors on invalid filters", async () => {
    const { GET } = await import("@/app/api/v1/reviews/route");

    const response = await GET(apiRequest("/api/v1/reviews?status=unknown"));

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "bad_request",
        message: "Некорректные фильтры проверок.",
        requestId: "req-v1-1"
      }
    });
    expect(response.status).toBe(400);
  });
});
```

- [x] **Step 2: Run contract test and verify it fails**

Run:

```bash
cd apps/web
npm run test -- tests/api/v1-contract.test.ts
```

Expected: FAIL because route success bodies are not wrapped under `data`/`meta`, and rate-limit headers are not forwarded.

- [x] **Step 3: Update `GET /api/v1/conversations` response handling**

In `apps/web/src/app/api/v1/conversations/route.ts`:

- Import `apiData`, `requestIdFromHeaders`, and `rateLimitHeaders`.
- Create `const requestId = requestIdFromHeaders(request.headers);` at the start of each handler.
- Call `requireApiToken(request, "conversations:read", { requestId, structuredErrors: true })`.
- Pass `requestId` into every `apiError`.
- Return successful list responses with:

```ts
return apiData(
  {
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      externalSource: conversation.externalSource,
      externalId: conversation.externalId,
      externalUrl: conversation.externalUrl,
      channel: conversation.channel,
      subject: conversation.subject,
      status: conversation.status,
      tags: splitTags(conversation.tags),
      customerName: conversation.customerName,
      assigneeName: conversation.assigneeName,
      qaStatus: conversation.qaStatus,
      qaAssigneeId: conversation.qaAssigneeId,
      qaAssigneeName: conversation.qaAssigneeName,
      reviewDueAt: conversation.reviewDueAt?.toISOString() ?? null,
      samplingReason: conversation.samplingReason,
      samplingType: conversation.samplingType,
      csatScore: conversation.csatScore,
      csatBucket: conversation.csatBucket,
      supportLine: conversation.supportLine,
      teamName: conversation.teamName,
      riskHint: conversation.riskHint,
      openedAt: conversation.openedAt.toISOString(),
      closedAt: conversation.closedAt?.toISOString() ?? null,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      counts: {
        messages: conversation._count.messages,
        reviews: conversation._count.reviews
      },
      latestReview: conversation.reviews[0]
        ? {
            id: conversation.reviews[0].id,
            status: conversation.reviews[0].status,
            reviewSource: conversation.reviews[0].reviewSource,
            totalScore: conversation.reviews[0].totalScore,
            reviewer: conversation.reviews[0].reviewer,
            finalizedAt: conversation.reviews[0].finalizedAt?.toISOString() ?? null,
            createdAt: conversation.reviews[0].createdAt.toISOString()
          }
        : null
    }))
  },
  {
    requestId,
    meta: {
      pagination: paginationMeta({ page, limit, total })
    },
    headers: rateLimitHeaders(rateLimit)
  }
);
```

- [x] **Step 4: Update `POST /api/v1/conversations` response handling**

In the same file:

- Use `requestIdFromHeaders`.
- Call `requireApiToken(request, "conversations:write", { requestId, structuredErrors: true })`.
- Return replay responses with `apiData(JSON.parse(...), { status, requestId, headers: rateLimitHeaders(rateLimit) })`.
- Return create responses with:

```ts
return apiData(responseBody, {
  status: 201,
  requestId,
  headers: rateLimitHeaders(rateLimit)
});
```

- Pass `requestId` into conflict, validation, rate limit, and internal error responses.

- [x] **Step 5: Update conversation detail, reviews list, and review detail routes**

Apply the same pattern to:

- `apps/web/src/app/api/v1/conversations/[conversationId]/route.ts`
- `apps/web/src/app/api/v1/reviews/route.ts`
- `apps/web/src/app/api/v1/reviews/[reviewId]/route.ts`

Use these response shapes:

```ts
return apiData({ conversation: serializedConversation }, { requestId, headers: rateLimitHeaders(rateLimit) });
return apiData({ reviews: serializedReviews }, { requestId, meta: { pagination }, headers: rateLimitHeaders(rateLimit) });
return apiData({ review: serializedReview }, { requestId, headers: rateLimitHeaders(rateLimit) });
```

- [x] **Step 6: Run public API contract tests**

Run:

```bash
cd apps/web
npm run test -- tests/api/v1-contract.test.ts tests/api/conversations.test.ts
```

Expected: PASS after updating `tests/api/conversations.test.ts` expectations for any `/api/v1` assertions affected by structured responses. Legacy `/api/...` assertions should remain unchanged.

- [x] **Step 7: Commit public API contract migration**

Run:

```bash
git add apps/web/src/app/api/v1/conversations apps/web/src/app/api/v1/reviews apps/web/tests/api/v1-contract.test.ts apps/web/tests/api/conversations.test.ts
git commit -m "standardize public v1 api contract"
```

## Task 4: Add Session API Guard And CSRF Protection

**Files:**

- Create: `apps/web/src/lib/api/session.ts`
- Modify: `apps/web/src/app/api/v1/api-tokens/route.ts`
- Modify: `apps/web/src/app/api/v1/api-tokens/[tokenId]/revoke/route.ts`
- Modify: `apps/web/src/app/api/v1/integrations/route.ts`
- Modify: `apps/web/src/app/api/v1/integrations/[integrationId]/imports/route.ts`
- Modify: `apps/web/src/app/api/v1/jobs/route.ts`
- Modify: `apps/web/src/app/api/v1/jobs/run/route.ts`
- Modify: `apps/web/src/app/api/v1/jobs/[jobId]/cancel/route.ts`
- Modify: `apps/web/src/app/api/v1/auth/providers/route.ts`
- Modify: `apps/web/src/app/api/v1/auth/providers/[providerId]/route.ts`
- Modify: `apps/web/src/app/api/v1/auth/providers/[providerId]/mappings/route.ts`
- Modify: `apps/web/src/app/api/v1/auth/providers/[providerId]/sync/route.ts`
- Modify: `apps/web/src/app/api/v1/privacy/conversations/[conversationId]/redact/route.ts`
- Modify: `apps/web/src/app/api/v1/reports/exports/route.ts`
- Test: `apps/web/tests/unit/api-session.test.ts`

- [x] **Step 1: Write failing CSRF/session guard tests**

Create `apps/web/tests/unit/api-session.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSessionApi, verifySameOrigin } from "@/lib/api/session";

const mocks = vi.hoisted(() => ({
  requireCurrentUserPermission: vi.fn()
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

function request(method: string, headers: HeadersInit = {}) {
  return new Request("https://qc.example.com/api/v1/api-tokens", {
    method,
    headers: {
      host: "qc.example.com",
      ...headers
    }
  });
}

describe("session api guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "ADMIN"
    });
  });

  it("allows same-origin state-changing requests", () => {
    expect(verifySameOrigin(request("POST", { origin: "https://qc.example.com" }))).toEqual({ ok: true });
  });

  it("blocks cross-origin state-changing requests", () => {
    expect(verifySameOrigin(request("POST", { origin: "https://evil.example.com" }))).toEqual({
      ok: false,
      message: "Cross-origin request blocked."
    });
  });

  it("does not require origin for GET requests", () => {
    expect(verifySameOrigin(request("GET"))).toEqual({ ok: true });
  });

  it("returns structured forbidden response before loading user on CSRF failure", async () => {
    const result = await requireSessionApi(request("POST", { origin: "https://evil.example.com" }), "api_tokens:manage", {
      requestId: "req-session-1"
    });

    expect(result.ok).toBe(false);
    expect(mocks.requireCurrentUserPermission).not.toHaveBeenCalled();

    if (!result.ok) {
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: "forbidden",
          message: "Cross-origin request blocked.",
          requestId: "req-session-1"
        }
      });
    }
  });
});
```

- [x] **Step 2: Run session guard test and verify it fails**

Run:

```bash
cd apps/web
npm run test -- tests/unit/api-session.test.ts
```

Expected: FAIL because `@/lib/api/session` does not exist.

- [x] **Step 3: Implement session API guard**

Create `apps/web/src/lib/api/session.ts`:

```ts
import type { Permission, AuthUser } from "@/lib/auth/permissions";
import { apiError, requestIdFromHeaders } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";

type SessionApiResult =
  | {
      ok: true;
      user: AuthUser;
    }
  | {
      ok: false;
      response: Response;
    };

type SessionApiOptions = {
  requestId?: string;
};

function isStateChangingMethod(method: string) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function originFromRequest(request: Request) {
  const origin = request.headers.get("origin")?.trim();

  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer")?.trim();
  return referer ? new URL(referer).origin : null;
}

export function verifySameOrigin(request: Request): { ok: true } | { ok: false; message: string } {
  if (!isStateChangingMethod(request.method)) {
    return { ok: true };
  }

  const sourceOrigin = originFromRequest(request);

  if (!sourceOrigin) {
    return { ok: false, message: "Origin header is required." };
  }

  const targetOrigin = new URL(request.url).origin;

  return sourceOrigin === targetOrigin ? { ok: true } : { ok: false, message: "Cross-origin request blocked." };
}

export async function requireSessionApi(request: Request, permission: Permission, options: SessionApiOptions = {}): Promise<SessionApiResult> {
  const requestId = options.requestId ?? requestIdFromHeaders(request.headers);
  const origin = verifySameOrigin(request);

  if (!origin.ok) {
    return {
      ok: false,
      response: apiError("forbidden", origin.message, 403, requestId)
    };
  }

  try {
    const user = await requireCurrentUserPermission(permission);

    return {
      ok: true,
      user
    };
  } catch (error) {
    return {
      ok: false,
      response: apiError(
        error instanceof Error && error.name === "AuthRequiredError" ? "unauthorized" : "forbidden",
        error instanceof Error ? error.message : "Недостаточно прав для выполнения операции.",
        error instanceof Error && error.name === "AuthRequiredError" ? 401 : 403,
        requestId
      )
    };
  }
}
```

- [x] **Step 4: Migrate session-auth mutation routes**

For every mutation route listed in this task:

- Import `requestIdFromHeaders` from `@/lib/api/response`.
- Import `requireSessionApi` from `@/lib/api/session`.
- Replace `const user = await requireCurrentUserPermission("permission:name");` with:

```ts
const requestId = requestIdFromHeaders(request.headers);
const session = await requireSessionApi(request, "api_tokens:manage", { requestId });

if (!session.ok) {
  return session.response;
}

const user = session.user;
```

Use the route's actual permission string instead of `"api_tokens:manage"`.

For route handlers that currently receive `_request: Request`, rename it to `request: Request` so the guard can inspect method, URL, and headers.

Pass `requestId` into every `apiError` and `apiData` call in modified files.

- [x] **Step 5: Run focused session tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/api-session.test.ts tests/unit/auth-entry.test.ts
```

Expected: PASS.

- [x] **Step 6: Run API route typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: PASS. If a route context type fails, keep Next.js App Router signatures unchanged and only rename the request variable.

- [x] **Step 7: Commit session guard changes**

Run:

```bash
git add apps/web/src/lib/api/session.ts apps/web/src/app/api/v1
git commit -m "add csrf guard for session api mutations"
```

## Task 5: Share Production Cookie Policy

**Files:**

- Create: `apps/web/src/lib/auth/cookies.ts`
- Modify: `apps/web/src/app/auth/sso/route.ts`
- Modify: `apps/web/src/app/auth/callback/route.ts`
- Modify: `apps/web/src/app/auth/logout/route.ts`
- Test: `apps/web/tests/unit/auth-cookies.test.ts`

- [x] **Step 1: Write failing cookie policy tests**

Create `apps/web/tests/unit/auth-cookies.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { authCookieOptions, oidcFlowCookieOptions, expiredCookieOptions } from "@/lib/auth/cookies";

describe("auth cookie policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses secure cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(authCookieOptions(60)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60
    });
    expect(oidcFlowCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 600
    });
  });

  it("does not force secure cookies in local development", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(authCookieOptions(60).secure).toBe(false);
  });

  it("expires cookies with path and max age", () => {
    expect(expiredCookieOptions()).toEqual({
      path: "/",
      maxAge: 0
    });
  });
});
```

- [x] **Step 2: Run cookie tests and verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/auth-cookies.test.ts
```

Expected: FAIL because `@/lib/auth/cookies` does not exist.

- [x] **Step 3: Implement shared cookie policy**

Create `apps/web/src/lib/auth/cookies.ts`:

```ts
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function authCookieOptions(maxAge: number): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge
  };
}

export function oidcFlowCookieOptions(): Partial<ResponseCookie> {
  return authCookieOptions(60 * 10);
}

export function expiredCookieOptions(): Partial<ResponseCookie> {
  return {
    path: "/",
    maxAge: 0
  };
}
```

- [x] **Step 4: Replace inline cookie options**

Update:

- `apps/web/src/app/auth/sso/route.ts`: replace the local `cookieOptions` object with `oidcFlowCookieOptions()`.
- `apps/web/src/app/auth/callback/route.ts`: replace session cookie options with `authCookieOptions(60 * 60 * 12)` and clear OIDC cookies with `expiredCookieOptions()`.
- `apps/web/src/app/auth/logout/route.ts`: clear session cookie with `expiredCookieOptions()`.

Use these imports:

```ts
import { authCookieOptions, expiredCookieOptions, oidcFlowCookieOptions } from "@/lib/auth/cookies";
```

- [x] **Step 5: Run auth tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/auth-cookies.test.ts tests/unit/oidc.test.ts tests/unit/auth-entry.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit cookie policy changes**

Run:

```bash
git add apps/web/src/lib/auth/cookies.ts apps/web/src/app/auth apps/web/tests/unit/auth-cookies.test.ts
git commit -m "share secure auth cookie policy"
```

## Task 6: Move OpenAPI Into A Contract Module

**Files:**

- Create: `apps/web/src/lib/api/openapi.ts`
- Modify: `apps/web/src/app/api/v1/openapi/route.ts`
- Test: `apps/web/tests/unit/openapi.test.ts`

- [x] **Step 1: Write failing OpenAPI contract tests**

Create `apps/web/tests/unit/openapi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "@/lib/api/openapi";

describe("openapi document", () => {
  it("publishes shared error and pagination schemas", () => {
    const document = buildOpenApiDocument();

    expect(document.openapi).toBe("3.1.0");
    expect(document.components.schemas.ApiError).toEqual({
      type: "object",
      required: ["error"],
      properties: {
        error: {
          type: "object",
          required: ["code", "message", "details", "requestId"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: {},
            requestId: { type: "string" }
          }
        }
      }
    });
    expect(document.components.schemas.PaginationMeta.required).toEqual([
      "page",
      "limit",
      "total",
      "totalPages",
      "hasNextPage",
      "hasPreviousPage"
    ]);
  });

  it("documents the core v1 paths", () => {
    const document = buildOpenApiDocument();

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/health",
        "/readiness",
        "/conversations",
        "/conversations/{conversationId}",
        "/reviews",
        "/reviews/{reviewId}",
        "/integrations",
        "/jobs",
        "/api-tokens",
        "/audit-logs"
      ])
    );
  });
});
```

- [x] **Step 2: Run OpenAPI tests and verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/openapi.test.ts
```

Expected: FAIL because `@/lib/api/openapi` does not exist.

- [x] **Step 3: Create OpenAPI contract module**

Create `apps/web/src/lib/api/openapi.ts` with:

```ts
export function buildOpenApiDocument() {
  const apiErrorSchema = {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message", "details", "requestId"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          details: {},
          requestId: { type: "string" }
        }
      }
    }
  };
  const paginationSchema = {
    type: "object",
    required: ["page", "limit", "total", "totalPages", "hasNextPage", "hasPreviousPage"],
    properties: {
      page: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
      total: { type: "integer", minimum: 0 },
      totalPages: { type: "integer", minimum: 1 },
      hasNextPage: { type: "boolean" },
      hasPreviousPage: { type: "boolean" }
    }
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Support QA Platform API",
      version: "1.0.0",
      description: "Backend API для контроля качества ответов поддержки."
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerApiToken: [] }],
    components: {
      securitySchemes: {
        bearerApiToken: {
          type: "http",
          scheme: "bearer"
        }
      },
      schemas: {
        ApiError: apiErrorSchema,
        PaginationMeta: paginationSchema
      }
    },
    paths: {
      "/health": { get: { security: [], summary: "Database-backed health check", responses: { "200": { description: "Healthy" }, "503": { description: "Degraded" } } } },
      "/readiness": { get: { summary: "Runtime and workspace readiness diagnostics", responses: { "200": { description: "Readiness state" }, "401": { description: "Unauthorized" }, "403": { description: "Forbidden" } } } },
      "/me": { get: { summary: "Current user profile and permissions", responses: { "200": { description: "Current user" }, "401": { description: "Unauthorized" } } } },
      "/conversations": { get: { summary: "List conversations", responses: { "200": { description: "Conversation page" }, "400": { description: "Invalid filters" } } }, post: { summary: "Ingest or update one conversation", responses: { "201": { description: "Conversation ingested" }, "409": { description: "Idempotency conflict" } } } },
      "/conversations/{conversationId}": { get: { summary: "Get one conversation", responses: { "200": { description: "Conversation details" }, "404": { description: "Conversation not found" } } } },
      "/reviews": { get: { summary: "List reviews", responses: { "200": { description: "Review page" }, "400": { description: "Invalid filters" } } } },
      "/reviews/{reviewId}": { get: { summary: "Get one review", responses: { "200": { description: "Review details" }, "404": { description: "Review not found" } } } },
      "/integrations": { get: { summary: "List integrations", responses: { "200": { description: "Integrations" } } }, post: { summary: "Create or update integration", responses: { "201": { description: "Integration saved" }, "400": { description: "Invalid integration payload" } } } },
      "/jobs": { get: { summary: "List jobs", responses: { "200": { description: "Jobs" } } }, post: { summary: "Create backend job", responses: { "201": { description: "Job created" }, "400": { description: "Invalid job payload" } } } },
      "/api-tokens": { get: { summary: "List API tokens", responses: { "200": { description: "API tokens" } } }, post: { summary: "Create API token", responses: { "201": { description: "Token created" }, "400": { description: "Invalid token payload" } } } },
      "/audit-logs": { get: { summary: "List audit logs", responses: { "200": { description: "Audit log page" } } } }
    }
  };
}
```

- [x] **Step 4: Serve OpenAPI from the module**

Replace `apps/web/src/app/api/v1/openapi/route.ts` with:

```ts
import { apiData } from "@/lib/api/response";
import { buildOpenApiDocument } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiData(buildOpenApiDocument());
}
```

- [x] **Step 5: Run OpenAPI tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/openapi.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit OpenAPI module**

Run:

```bash
git add apps/web/src/lib/api/openapi.ts apps/web/src/app/api/v1/openapi/route.ts apps/web/tests/unit/openapi.test.ts
git commit -m "move openapi document into contract module"
```

## Task 7: Improve Jobs Reliability Operations

**Files:**

- Modify: `apps/web/src/lib/jobs/queue.ts`
- Modify: `apps/web/src/scripts/run-jobs.ts`
- Create: `apps/web/src/app/api/v1/jobs/[jobId]/requeue/route.ts`
- Test: `apps/web/tests/unit/job-queue.test.ts`

- [x] **Step 1: Add failing queue operation tests**

Append to `apps/web/tests/unit/job-queue.test.ts`:

```ts
it("summarizes queue metrics by status", async () => {
  const { getBackendQueueMetrics } = await import("@/lib/jobs/queue");
  mocks.prisma.backendJob.groupBy.mockResolvedValue([
    { queueName: "integrations", status: "QUEUED", _count: { _all: 2 } },
    { queueName: "integrations", status: "FAILED", _count: { _all: 1 } }
  ]);

  await expect(getBackendQueueMetrics("workspace-1")).resolves.toEqual([
    { queueName: "integrations", status: "QUEUED", count: 2 },
    { queueName: "integrations", status: "FAILED", count: 1 }
  ]);
});

it("requeues failed jobs and records an event", async () => {
  const { requeueBackendJob } = await import("@/lib/jobs/queue");
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.prisma.backendJob.findFirst.mockResolvedValue({
    id: "job-1",
    workspaceId: "workspace-1",
    status: "FAILED"
  });
  mocks.prisma.backendJob.update.mockResolvedValue({ id: "job-1", status: "QUEUED" });
  mocks.prisma.backendJobEvent.create.mockResolvedValue({});

  await expect(
    requeueBackendJob({
      workspaceId: "workspace-1",
      jobId: "job-1",
      actorId: "user-1"
    })
  ).resolves.toEqual({ id: "job-1", status: "QUEUED" });

  expect(mocks.prisma.backendJob.update).toHaveBeenCalledWith({
    where: { id: "job-1" },
    data: {
      status: "QUEUED",
      attempts: 0,
      runAfter: expect.any(Date),
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      finishedAt: null,
      errorMessage: null
    }
  });
});
```

Update the mocked Prisma shape at the top of the test file to include:

```ts
groupBy: vi.fn(),
update: vi.fn()
```

inside `backendJob`, if those functions are not already present.

- [x] **Step 2: Run job queue tests and verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/job-queue.test.ts
```

Expected: FAIL because `getBackendQueueMetrics` and `requeueBackendJob` are not implemented.

- [x] **Step 3: Implement queue metrics and requeue**

Add to `apps/web/src/lib/jobs/queue.ts`:

```ts
export async function getBackendQueueMetrics(workspaceId: string) {
  const groups = await prisma.backendJob.groupBy({
    by: ["queueName", "status"],
    where: { workspaceId },
    _count: { _all: true },
    orderBy: [{ queueName: "asc" }, { status: "asc" }]
  });

  return groups.map((group) => ({
    queueName: group.queueName,
    status: group.status,
    count: group._count._all
  }));
}

export async function requeueBackendJob(input: { workspaceId: string; jobId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.backendJob.findFirst({
      where: {
        id: input.jobId,
        workspaceId: input.workspaceId,
        status: "FAILED"
      }
    });

    if (!job) {
      throw new Error("Можно вернуть в очередь только ошибочную задачу текущего рабочего пространства.");
    }

    const updated = await tx.backendJob.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        attempts: 0,
        runAfter: new Date(),
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        finishedAt: null,
        errorMessage: null
      }
    });

    await recordJobEvent(tx, job.id, "warn", "Задача возвращена в очередь администратором.", {
      actorId: input.actorId
    });

    return updated;
  });
}
```

- [x] **Step 4: Add requeue route**

Create `apps/web/src/app/api/v1/jobs/[jobId]/requeue/route.ts`:

```ts
import { auditLog } from "@/lib/audit";
import { apiData, apiError, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { requeueBackendJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const { jobId } = await context.params;

  try {
    const job = await requeueBackendJob({
      workspaceId: session.user.workspaceId,
      jobId,
      actorId: session.user.id
    });

    await auditLog({
      workspaceId: session.user.workspaceId,
      actorId: session.user.id,
      action: "backend_job.requeued",
      targetType: "backend_job",
      targetId: job.id,
      metadata: {
        status: job.status
      }
    });

    return apiData({ job: { id: job.id, status: job.status } }, { requestId });
  } catch (error) {
    return apiError("conflict", error instanceof Error ? error.message : "Не удалось вернуть задачу в очередь.", 409, requestId);
  }
}
```

- [x] **Step 5: Add worker loop flags**

Replace `apps/web/src/scripts/run-jobs.ts` with:

```ts
import { runDueBackendJobs } from "@/lib/jobs/queue";

function argValue(name: string) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

const limitArg = Number(argValue("limit") ?? 10);
const intervalMs = Number(argValue("interval-ms") ?? 5000);
const queueName = argValue("queue");
const once = hasFlag("once");
const workerId = argValue("worker-id") ?? `cli-${process.pid}`;

async function runOnce() {
  const results = await runDueBackendJobs({
    limit: Number.isFinite(limitArg) ? limitArg : 10,
    workerId,
    queueName
  });

  process.stdout.write(`${JSON.stringify({ processed: results.length, results }, null, 2)}\n`);
  return results;
}

async function main() {
  if (once) {
    await runOnce();
    return;
  }

  process.stdout.write(`${JSON.stringify({ workerId, queueName: queueName ?? "all", intervalMs }, null, 2)}\n`);

  for (;;) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(intervalMs) ? intervalMs : 5000));
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
```

- [x] **Step 6: Run job tests and typecheck**

Run:

```bash
cd apps/web
npm run test -- tests/unit/job-queue.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit jobs reliability changes**

Run:

```bash
git add apps/web/src/lib/jobs/queue.ts apps/web/src/scripts/run-jobs.ts apps/web/src/app/api/v1/jobs apps/web/tests/unit/job-queue.test.ts
git commit -m "improve backend job operations"
```

## Task 8: Fill Audit And Observability Gaps For Backend Mutations

**Files:**

- Modify: `apps/web/src/app/api/v1/jobs/route.ts`
- Modify: `apps/web/src/app/api/v1/jobs/run/route.ts`
- Modify: `apps/web/src/app/api/v1/reports/exports/route.ts`
- Test: `apps/web/tests/api/admin-mutations-audit.test.ts`

- [x] **Step 1: Write failing audit tests for mutation routes without persistent audit events**

Create `apps/web/tests/api/admin-mutations-audit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  auditLog: vi.fn(),
  enqueueBackendJob: vi.fn(),
  runDueBackendJobs: vi.fn()
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueBackendJob: mocks.enqueueBackendJob,
  runDueBackendJobs: mocks.runDueBackendJobs
}));

const user = {
  id: "user-1",
  workspaceId: "workspace-1",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN"
};

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://qc.example.com${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://qc.example.com",
      "x-request-id": "req-audit-1"
    },
    body: JSON.stringify(body)
  });
}

describe("admin mutation audit events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionApi.mockResolvedValue({ ok: true, user });
    mocks.enqueueBackendJob.mockResolvedValue({
      id: "job-1",
      type: "REPORT_EXPORT",
      status: "QUEUED"
    });
    mocks.runDueBackendJobs.mockResolvedValue([{ jobId: "job-1", status: "SUCCEEDED" }]);
  });

  it("audits report export queueing", async () => {
    const { POST } = await import("@/app/api/v1/reports/exports/route");

    await POST(
      jsonRequest("/api/v1/reports/exports", {
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-05-04T23:59:59.999Z",
        format: "xlsx"
      })
    );

    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      action: "report_export.queued",
      targetType: "backend_job",
      targetId: "job-1",
      metadata: {
        format: "xlsx",
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-05-04T23:59:59.999Z"
      }
    });
  });

  it("audits backend job creation", async () => {
    const { POST } = await import("@/app/api/v1/jobs/route");

    await POST(
      jsonRequest("/api/v1/jobs", {
        type: "RETENTION_CLEANUP",
        queueName: "maintenance"
      })
    );

    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      action: "backend_job.created",
      targetType: "backend_job",
      targetId: "job-1",
      metadata: {
        type: "REPORT_EXPORT",
        status: "QUEUED"
      }
    });
  });

  it("audits manual backend job runner requests", async () => {
    const { POST } = await import("@/app/api/v1/jobs/run/route");

    await POST(jsonRequest("/api/v1/jobs/run", { limit: 1, workerId: "manual-admin" }));

    expect(mocks.auditLog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      action: "backend_jobs.run_requested",
      targetType: "backend_jobs",
      targetId: "manual-admin",
      metadata: {
        processed: 1,
        workerId: "manual-admin"
      }
    });
  });
});
```

- [x] **Step 2: Run audit route tests and verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/api/admin-mutations-audit.test.ts
```

Expected: FAIL because these routes do not write the asserted audit events.

- [x] **Step 3: Audit report export queueing**

In `apps/web/src/app/api/v1/reports/exports/route.ts`:

- Import `auditLog`.
- Use `requestIdFromHeaders` and `requireSessionApi` if Task 4 has already migrated this route.
- After `enqueueBackendJob`, add:

```ts
await auditLog({
  workspaceId: user.workspaceId,
  actorId: user.id,
  action: "report_export.queued",
  targetType: "backend_job",
  targetId: job.id,
  metadata: {
    format: parsed.data.format ?? null,
    periodStart: parsed.data.periodStart,
    periodEnd: parsed.data.periodEnd
  }
});
```

- [x] **Step 4: Audit backend job creation**

In `apps/web/src/app/api/v1/jobs/route.ts`, after `enqueueBackendJob`, add:

```ts
await auditLog({
  workspaceId: user.workspaceId,
  actorId: user.id,
  action: "backend_job.created",
  targetType: "backend_job",
  targetId: job.id,
  metadata: {
    type: job.type,
    status: job.status
  }
});
```

- [x] **Step 5: Audit manual backend job runner requests**

In `apps/web/src/app/api/v1/jobs/run/route.ts`, after `runDueBackendJobs(parsed.data)`, add:

```ts
await auditLog({
  workspaceId: user.workspaceId,
  actorId: user.id,
  action: "backend_jobs.run_requested",
  targetType: "backend_jobs",
  targetId: parsed.data.workerId ?? "manual",
  metadata: {
    processed: results.length,
    workerId: parsed.data.workerId ?? null
  }
});
```

Keep the existing `logBackendEvent` call so the request is visible in logs as well as persistent audit history.

- [x] **Step 6: Run audit tests**

Run:

```bash
cd apps/web
npm run test -- tests/api/admin-mutations-audit.test.ts tests/unit/audit.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit audit gap changes**

Run:

```bash
git add apps/web/src/app/api/v1/jobs apps/web/src/app/api/v1/reports/exports/route.ts apps/web/tests/api/admin-mutations-audit.test.ts
git commit -m "audit backend mutation operations"
```

## Task 9: Align Project Docs With PostgreSQL And Verify The Full Foundation

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-05-04-backend-foundation-hardening.md`

- [x] **Step 1: Update project notes**

In `AGENTS.md`, replace:

```md
- Local database is SQLite via Prisma at `apps/web/prisma/dev.db`.
```

with:

```md
- Local database is PostgreSQL via Docker Compose at `localhost:55432`; Prisma schema and migrations live in `apps/web/prisma`.
```

- [x] **Step 2: Run complete verification**

Run:

```bash
cd apps/web
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected:

- `npm run typecheck` exits `0`.
- `npm run test` exits `0`.
- `npm run build` exits `0`.
- `npm run test:e2e` exits `0` when the PostgreSQL service from `compose.yaml` is healthy on `localhost:55432`.

- [x] **Step 3: Confirm route inventory**

Run:

```bash
cd /Users/dubrsky/Downloads/qc_app
find apps/web/src/app/api/v1 -name route.ts -maxdepth 8 -print | sort
```

Expected: output includes the new route:

```text
apps/web/src/app/api/v1/jobs/[jobId]/requeue/route.ts
```

- [x] **Step 4: Commit documentation and plan progress**

Run:

```bash
git add AGENTS.md docs/superpowers/plans/2026-05-04-backend-foundation-hardening.md
git commit -m "document postgres backend foundation"
```

## Completion Criteria

Phase 1 is complete when:

- `/api/v1` public routes use structured `data`/`meta`/`requestId` success bodies and structured error bodies.
- Public API token failures include structured codes and request IDs.
- Rate-limited responses and successful public responses expose `x-ratelimit-*` headers.
- Browser cookie-auth mutations use `requireSessionApi` and reject cross-origin state-changing requests.
- Auth and OIDC cookies share production-safe options.
- OpenAPI is served from `src/lib/api/openapi.ts`.
- Failed jobs can be requeued through code and an admin API endpoint.
- The worker script can run once or in a loop.
- Project notes no longer claim the local database is SQLite.
- `npm run typecheck`, `npm run test`, `npm run build`, and `npm run test:e2e` pass.
