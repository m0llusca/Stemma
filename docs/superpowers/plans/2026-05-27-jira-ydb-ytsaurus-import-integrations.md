# Jira, YDB, and YTsaurus Import Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Jira Service Management, YDB, and YTsaurus import integrations, while introducing tRPC/TanStack Query for new internal integration workflows.

**Architecture:** Jira extends the existing Phase B helpdesk adapter layer. YDB and YTsaurus use a new `data_source` adapter layer that converts tabular rows into the existing `CustomConversationInput` import pipeline. Public API contracts remain REST/OpenAPI; new internal admin integration interactions use tRPC with TanStack Query.

**Tech Stack:** Next.js 16, React 19, Prisma/PostgreSQL, Zod, tRPC, TanStack Query, optional Zustand for wizard-local state, YDB JS SDK, Vitest, Playwright.

---

## Working Context

- Work in `/Users/dubrsky/Downloads/qc_app`.
- App code lives in `apps/web`.
- There are existing uncommitted app changes from the prior review-fix work. Do not revert them.
- The approved design is `docs/superpowers/specs/2026-05-27-jira-ydb-ytsaurus-import-integrations-design.md`.
- Run app commands from `apps/web`.

## File Structure

Create:

- `apps/web/src/server/trpc/context.ts` - builds tRPC context from request headers and current user.
- `apps/web/src/server/trpc/init.ts` - shared tRPC initialization and procedure helpers.
- `apps/web/src/server/trpc/root.ts` - app router and root procedure registration.
- `apps/web/src/server/trpc/routers/integrations.ts` - internal integration catalog/run procedures.
- `apps/web/src/app/api/trpc/[trpc]/route.ts` - App Router tRPC HTTP handler.
- `apps/web/src/lib/trpc/client.ts` - typed browser client helpers.
- `apps/web/src/components/trpc-provider.tsx` - QueryClient/tRPC provider.
- `apps/web/src/lib/integrations/helpdesk-adapters/jira.ts` - Jira adapter.
- `apps/web/src/lib/integrations/data-source-adapters/types.ts` - data source adapter contracts.
- `apps/web/src/lib/integrations/data-source-adapters/source-contracts.ts` - YDB/YTsaurus evidence and limits.
- `apps/web/src/lib/integrations/data-source-adapters/service.ts` - loads data source conversations from integration rows.
- `apps/web/src/lib/integrations/data-source-adapters/ydb.ts` - YDB adapter.
- `apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts` - YTsaurus HTTP adapter.
- `apps/web/src/lib/normalizers/tabular-conversations.ts` - row grouping and validation.
- `apps/web/tests/fixtures/ytsaurus-server.ts` - local HTTP fixture for YTsaurus adapter tests.
- `apps/web/tests/unit/trpc-foundation.test.ts`
- `apps/web/tests/unit/integration-trpc-router.test.ts`
- `apps/web/tests/unit/tabular-conversation-normalizer.test.ts`
- `apps/web/tests/unit/data-source-adapter-contracts.test.ts`
- `apps/web/tests/unit/ytsaurus-adapter.test.ts`
- `apps/web/tests/unit/ydb-adapter.test.ts`

Modify:

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/lib/api/openapi.ts`
- `apps/web/src/lib/integration-actions.ts`
- `apps/web/src/lib/integration-import-service.ts`
- `apps/web/src/lib/integrations/capabilities.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/types.ts`
- `apps/web/src/lib/integrations/runner.ts`
- `apps/web/src/lib/normalizers/native-helpdesk.ts`
- `apps/web/src/components/integrations/integration-setup-workspace.tsx`
- `apps/web/tests/fixtures/helpdesk-adapter-fixtures.ts`
- `apps/web/tests/fixtures/helpdesk-adapter-server.ts`
- `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts`
- `apps/web/tests/unit/helpdesk-adapter-service.test.ts`
- `apps/web/tests/unit/integration-capabilities.test.ts`
- `apps/web/tests/unit/integration-import-service.test.ts`
- `apps/web/tests/unit/integration-runner-ledger.test.ts`
- `apps/web/tests/unit/integration-setup-workspace.test.tsx`
- `apps/web/tests/unit/openapi.test.ts`

---

### Task 1: tRPC and TanStack Query Foundation

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/server/trpc/context.ts`
- Create: `apps/web/src/server/trpc/init.ts`
- Create: `apps/web/src/server/trpc/root.ts`
- Create: `apps/web/src/app/api/trpc/[trpc]/route.ts`
- Create: `apps/web/src/lib/trpc/client.ts`
- Create: `apps/web/src/components/trpc-provider.tsx`
- Test: `apps/web/tests/unit/trpc-foundation.test.ts`

- [ ] **Step 1: Write the failing foundation test**

Create `apps/web/tests/unit/trpc-foundation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("tRPC foundation", () => {
  it("exposes a typed health procedure", async () => {
    const { appRouter } = await import("@/server/trpc/root");
    const caller = appRouter.createCaller({ user: null });

    await expect(caller.health()).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/web
npm run test -- tests/unit/trpc-foundation.test.ts
```

Expected: FAIL because `@/server/trpc/root` does not exist.

- [ ] **Step 3: Install dependencies**

Run:

```bash
cd apps/web
npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query superjson zustand
```

Expected: `package.json` and `package-lock.json` update.

- [ ] **Step 4: Create tRPC context**

Create `apps/web/src/server/trpc/context.ts`:

```ts
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";

export type TrpcContext = {
  user: Awaited<ReturnType<typeof getCurrentUser>> | null;
};

export async function createTRPCContext(): Promise<TrpcContext> {
  const user = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  return { user };
}
```

- [ ] **Step 5: Create shared tRPC initialization and the root router**

Create `apps/web/src/server/trpc/init.ts`:

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "@/server/trpc/context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Нет активной пользовательской сессии." });
  }

  return next({
    ctx: {
      user: ctx.user
    }
  });
});
```

Create `apps/web/src/server/trpc/root.ts`:

```ts
import { createTRPCRouter, publicProcedure } from "@/server/trpc/init";

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => ({ ok: true }))
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 6: Add the App Router tRPC handler**

Create `apps/web/src/app/api/trpc/[trpc]/route.ts`:

```ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/root";

const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: createTRPCContext
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 7: Add the browser client and provider**

Create `apps/web/src/lib/trpc/client.ts`:

```ts
"use client";

import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/root";

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  return trpc.createClient({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: "/api/trpc"
      })
    ]
  });
}
```

Create `apps/web/src/components/trpc-provider.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createTrpcClient, trpc } from "@/lib/trpc/client";

export function TrpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

Modify `apps/web/src/app/layout.tsx`:

```tsx
import { TrpcProvider } from "@/components/trpc-provider";
```

Wrap `{children}`:

```tsx
<TrpcProvider>{children}</TrpcProvider>
```

- [ ] **Step 8: Run the foundation test**

Run:

```bash
cd apps/web
npm run test -- tests/unit/trpc-foundation.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/app/layout.tsx apps/web/src/server/trpc apps/web/src/app/api/trpc apps/web/src/lib/trpc apps/web/src/components/trpc-provider.tsx apps/web/tests/unit/trpc-foundation.test.ts
git commit -m "feat: add typed integration api foundation"
```

---

### Task 2: Internal Integration tRPC Router

**Files:**
- Modify: `apps/web/src/server/trpc/root.ts`
- Create: `apps/web/src/server/trpc/routers/integrations.ts`
- Test: `apps/web/tests/unit/integration-trpc-router.test.ts`

- [ ] **Step 1: Write the failing router test**

Create `apps/web/tests/unit/integration-trpc-router.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/capabilities", () => ({
  listIntegrationCapabilities: () => [
    {
      source: "custom_api",
      displayName: "Custom API",
      type: "custom_api",
      certification: { summary: { productionReady: true } }
    }
  ]
}));

describe("integration tRPC router", () => {
  it("returns the integration catalog for authenticated users", async () => {
    const { appRouter } = await import("@/server/trpc/root");
    const caller = appRouter.createCaller({
      user: { id: "user-1", workspaceId: "workspace-1", role: "ADMIN" } as never
    });

    await expect(caller.integrations.catalog()).resolves.toEqual([
      expect.objectContaining({ source: "custom_api", displayName: "Custom API" })
    ]);
  });

  it("rejects unauthenticated catalog access", async () => {
    const { appRouter } = await import("@/server/trpc/root");
    const caller = appRouter.createCaller({ user: null });

    await expect(caller.integrations.catalog()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-trpc-router.test.ts
```

Expected: FAIL because `integrations.catalog` is not registered.

- [ ] **Step 3: Create the integrations router**

Create `apps/web/src/server/trpc/routers/integrations.ts`:

```ts
import { listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";

export const integrationsRouter = createTRPCRouter({
  catalog: protectedProcedure.query(() => listIntegrationCapabilities())
});
```

- [ ] **Step 4: Register the router**

Modify `apps/web/src/server/trpc/root.ts`:

```ts
import { integrationsRouter } from "@/server/trpc/routers/integrations";
```

Change `appRouter`:

```ts
export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => ({ ok: true })),
  integrations: integrationsRouter
});
```

- [ ] **Step 5: Run the router test**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-trpc-router.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/trpc/root.ts apps/web/src/server/trpc/routers/integrations.ts apps/web/tests/unit/integration-trpc-router.test.ts
git commit -m "feat: expose integration catalog over trpc"
```

---

### Task 3: Jira Phase B Contract, Adapter, and Normalizer

**Files:**
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/types.ts`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/jira.ts`
- Modify: `apps/web/src/lib/normalizers/native-helpdesk.ts`
- Modify: `apps/web/tests/fixtures/helpdesk-adapter-fixtures.ts`
- Modify: `apps/web/tests/fixtures/helpdesk-adapter-server.ts`
- Modify: `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts`
- Modify: `apps/web/tests/unit/helpdesk-adapter-service.test.ts`

- [ ] **Step 1: Write the failing Jira contract assertions**

Modify `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts` expected order:

```ts
expect(phaseBHelpdeskSources).toEqual([
  "zendesk",
  "freshdesk",
  "intercom",
  "hubspot",
  "jira",
  "salesforce",
  "servicenow",
  "dynamics"
]);
```

Add:

```ts
it("records Jira Service Management request and comment coverage", () => {
  expect(phaseBSourceContracts.jira).toMatchObject({
    source: "jira",
    displayName: "Jira Service Management",
    type: "native_helpdesk",
    authModes: ["basic_api_token"],
    requiredSecrets: ["auth_password"]
  });
  expect(phaseBSourceContracts.jira.operations).toEqual(
    expect.arrayContaining(["ticket_get", "comments_get", "diagnostics", "fixture_import"])
  );
  expect(phaseBSourceContracts.jira.certification.gates.live).toBe("waiting_for_access");
});
```

- [ ] **Step 2: Write the failing Jira adapter test**

Add to `apps/web/tests/unit/helpdesk-adapter-service.test.ts`:

```ts
it("loads a Jira Service Management request and comments", async () => {
  const server = await createHelpdeskAdapterServer({ source: "jira", mode: "success" });
  const jiraCredential = "agent@example.com:jira-api-token";

  try {
    const adapter = createHelpdeskAdapter("jira");
    const result = await adapter.loadConversation({
      source: "jira",
      baseUrl: server.baseUrl,
      externalId: "SUP-42",
      token: jiraCredential
    });

    expect(result.conversations[0]).toMatchObject({
      externalSource: "jira",
      externalId: "SUP-42",
      channel: "ticket",
      status: "Resolved"
    });
    expect(result.conversations[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalId: "10001", isPrivate: false }),
        expect.objectContaining({ externalId: "10002", isPrivate: true })
      ])
    );
    expect(server.requests.map((request) => request.operation)).toEqual(["ticket_get", "comments_get"]);
    expect(decodedBasicCredential(server.requests[0]?.headers.authorization)).toBe(jiraCredential);
    expect(JSON.stringify(result.diagnostics)).not.toContain("jira-api-token");
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
cd apps/web
npm run test -- tests/unit/helpdesk-adapter-contracts.test.ts tests/unit/helpdesk-adapter-service.test.ts
```

Expected: FAIL because Jira is not in the source union and adapter index.

- [ ] **Step 4: Add Jira to source types and contracts**

Modify `apps/web/src/lib/integrations/helpdesk-adapters/types.ts`:

```ts
export type PhaseBHelpdeskSource =
  | "zendesk"
  | "freshdesk"
  | "intercom"
  | "hubspot"
  | "jira"
  | "salesforce"
  | "servicenow"
  | "dynamics";
```

Modify `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`:

```ts
export const phaseBHelpdeskSources = [
  "zendesk",
  "freshdesk",
  "intercom",
  "hubspot",
  "jira",
  "salesforce",
  "servicenow",
  "dynamics"
] as const satisfies readonly PhaseBHelpdeskSource[];
```

Add the `jira` contract before `salesforce`:

```ts
  jira: contract({
    source: "jira",
    displayName: "Jira Service Management",
    type: "native_helpdesk",
    authModes: ["basic_api_token"],
    operations: ["ticket_get", "comments_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["request.created", "request.updated", "comment.created"],
    requiredSecrets: nativeRuntimeSecrets,
    docsHref: "https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/",
    officialDocs: docs([
      {
        label: "Jira Service Management Request API",
        href: "https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/",
        context7Id: "/websites/developer_atlassian_cloud_jira_service-desk_rest_api-group-servicedesk",
        notes: [
          "Confirmed request fields, issueId, issueKey, reporter, currentStatus, requestFieldValues, and paged values shape."
        ]
      },
      {
        label: "Jira Service Management Request Comments API",
        href: "https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/#api-rest-servicedeskapi-request-issueidorkey-comment-get",
        context7Id: "/websites/developer_atlassian_cloud_jira_service-desk_rest_api-group-servicedesk",
        notes: [
          "Confirmed request comments endpoint and public/internal visibility difference between customer and agent credentials."
        ]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=jira npm run test:live:helpdesk"
    )
  }),
```

- [ ] **Step 5: Add Jira adapter**

Create `apps/web/src/lib/integrations/helpdesk-adapters/jira.ts`:

```ts
import { basicCredentialHeaders, createHelpdeskHttpClient } from "@/lib/integrations/helpdesk-adapters/http";
import type { HelpdeskAdapterLoadInput, HelpdeskAdapterLoadResult } from "@/lib/integrations/helpdesk-adapters/types";
import { normalizeNativeHelpdeskPayload } from "@/lib/normalizers/native-helpdesk";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 500_000;

export function createJiraAdapter() {
  const client = createHelpdeskHttpClient();

  return {
    async loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult> {
      const baseUrl = input.baseUrl.replace(/\/+$/, "");
      const issueIdOrKey = encodeURIComponent(input.externalId);
      const requestDefaults = {
        source: "jira" as const,
        method: "GET" as const,
        headers: {
          ...basicCredentialHeaders(input.token),
          accept: "application/json"
        },
        timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
        maxResponseBytes: input.maxResponseBytes ?? defaultMaxResponseBytes
      };
      const requestResponse = await client.requestJson({
        ...requestDefaults,
        operation: "ticket_get",
        url: `${baseUrl}/rest/servicedeskapi/request/${issueIdOrKey}`
      });
      const commentsResponse = await client.requestJson({
        ...requestDefaults,
        operation: "comments_get",
        url: `${baseUrl}/rest/servicedeskapi/request/${issueIdOrKey}/comment?limit=100&start=0`
      });
      const payload = {
        request: recordValue(requestResponse.body),
        comments: arrayValue((recordValue(commentsResponse.body).values ?? commentsResponse.body) as unknown)
      };

      return {
        source: "jira",
        externalId: input.externalId,
        payload,
        conversations: normalizeNativeHelpdeskPayload(payload, { source: "jira", baseUrl: input.baseUrl }),
        diagnostics: {
          requests: [requestResponse.diagnostic, commentsResponse.diagnostic]
        }
      };
    }
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
```

Modify `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`:

```ts
import { createJiraAdapter } from "@/lib/integrations/helpdesk-adapters/jira";
```

Add before Salesforce:

```ts
  if (source === "jira") {
    return createJiraAdapter();
  }
```

- [ ] **Step 6: Add Jira normalizer support**

Modify `apps/web/src/lib/normalizers/native-helpdesk.ts`:

Add source metadata:

```ts
  {
    value: "jira",
    label: "Jira Service Management",
    objectName: "Requests + Comments",
    endpointHint: "/rest/servicedeskapi/request/{issueIdOrKey} + /comment"
  },
```

Add source label:

```ts
  jira: "Jira Service Management",
```

Add the normalizer:

```ts
function jiraRequest(payload: unknown) {
  const root = recordValue(payload) ?? {};
  return recordValue(root.request) ?? recordValue(root.issue) ?? recordValue(root);
}

function jiraComments(payload: unknown) {
  const root = recordValue(payload) ?? {};
  return oneOrManyRecords(root.comments).length > 0
    ? oneOrManyRecords(root.comments)
    : oneOrManyRecords(recordValue(root.comment)?.values);
}

function normalizeJiraMessage(comment: NativeRecord, index: number): CustomMessageInput {
  const author = recordValue(comment.author);
  const publicFlag = recordValue(comment.public);
  const isPublic = boolValue(publicFlag?.value ?? comment.public) ?? true;

  return {
    externalId: firstString(comment.id, `jira-comment-${index + 1}`) ?? `jira-comment-${index + 1}`,
    participantType: isPublic ? "customer" : "human_agent",
    authorName: actorName(author, firstString(author?.displayName, author?.emailAddress, "Jira")),
    body: stripHtml(firstString(comment.body, recordValue(comment.body)?.content, comment.renderedBody)) ?? "Без текста",
    sentAt: parseDate(comment.created, new Date(index)),
    isPrivate: !isPublic
  };
}

function normalizeJira(payload: unknown, options: NativeHelpdeskNormalizeOptions): CustomConversationInput[] {
  const request = jiraRequest(payload);

  if (!request) {
    return [];
  }

  const requestId = firstString(request.issueKey, request.key, request.issueId, request.id) ?? "jira-request";
  const status = firstString(recordValue(request.currentStatus)?.status, recordValue(request.fields)?.status, request.status) ?? "unknown";
  const reporter = recordValue(request.reporter);
  const messages = jiraComments(payload).map(normalizeJiraMessage).filter(hasNonEmptyMessageBody);
  const requestFields = oneOrManyRecords(request.requestFieldValues);
  const summary = firstString(
    request.summary,
    request.subject,
    requestFields.find((field) => firstString(field.fieldId) === "summary")?.value,
    `Jira request ${requestId}`
  ) ?? `Jira request ${requestId}`;

  return [{
    externalSource: options.source,
    externalId: requestId,
    externalUrl: sourceUrl(options.baseUrl, `/browse/${encodeURIComponent(requestId)}`),
    channel: "ticket",
    subject: summary,
    status,
    tags: uniqueValues([firstString(request.requestTypeId), firstString(request.serviceDeskId), status]),
    customerName: actorName(reporter, firstString(reporter?.displayName, reporter?.emailAddress, request.reporter)),
    assigneeName: firstString(recordValue(request.assignee)?.displayName, recordValue(request.assignee)?.emailAddress),
    samplingReason: options.samplingReason ?? defaultSamplingReason(options.source),
    openedAt: parseDate(recordValue(request.createdDate)?.iso8601 ?? request.created, messages[0] ? new Date(messages[0].sentAt) : new Date(0)),
    closedAt: statusFromClosed(status) ? parseDate(recordValue(recordValue(request.currentStatus)?.statusDate)?.iso8601 ?? request.updated) : null,
    messages
  }];
}
```

Register in `normalizeNativeHelpdeskPayload`:

```ts
            : options.source === "jira"
              ? normalizeJira(payload, options)
```

Add mapping row:

```ts
  { source: "Jira request.issueKey + comments.values[]", target: "conversation/messages", note: "Request дает карточку обращения, comments становятся сообщениями." },
```

- [ ] **Step 7: Add Jira fixtures and fixture server routing**

Modify `apps/web/tests/fixtures/helpdesk-adapter-fixtures.ts`:

```ts
    jira: {
      success: {
        request: {
          issueId: "10042",
          issueKey: "SUP-42",
          serviceDeskId: "15",
          requestTypeId: "63",
          reporter: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" },
          currentStatus: { status: "Resolved", statusDate: { iso8601: "2026-04-25T10:18:00+0000" } },
          createdDate: { iso8601: "2026-04-25T10:00:00+0000" },
          requestFieldValues: [{ fieldId: "summary", label: "Summary", value: "Refund request from Jira" }]
        },
        comments: [
          {
            id: "10001",
            body: "Заказ задержан, хочу возврат.",
            public: { value: true },
            created: "2026-04-25T10:00:00.000+0000",
            author: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" }
          },
          {
            id: "10002",
            body: "Проверю перевозчика перед возвратом.",
            public: { value: false },
            created: "2026-04-25T10:08:00.000+0000",
            author: { displayName: "Иван Петров", emailAddress: "ivan@example.com" }
          }
        ]
      },
      malformed: { request: { issueKey: "SUP-42" }, comments: [] }
    },
```

Add `jira` getter block to `helpdeskAdapterFixtures`.

Modify `apps/web/tests/fixtures/helpdesk-adapter-server.ts`:

```ts
  if (source === "jira") {
    if (/^\/rest\/servicedeskapi\/request\/[^/]+$/.test(pathname)) {
      return "ticket_get";
    }

    if (/^\/rest\/servicedeskapi\/request\/[^/]+\/comment$/.test(pathname)) {
      return "comments_get";
    }
  }
```

In `payloadFor`:

```ts
  if (source === "jira") {
    const payload = record(fixture);

    if (operation === "ticket_get") {
      return payload.request;
    }

    if (operation === "comments_get") {
      return { values: payload.comments, start: 0, limit: 100, isLastPage: true };
    }
  }
```

- [ ] **Step 8: Run Jira tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/helpdesk-adapter-contracts.test.ts tests/unit/helpdesk-adapter-service.test.ts tests/unit/native-helpdesk-normalizer.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/integrations/helpdesk-adapters apps/web/src/lib/normalizers/native-helpdesk.ts apps/web/tests/fixtures/helpdesk-adapter-fixtures.ts apps/web/tests/fixtures/helpdesk-adapter-server.ts apps/web/tests/unit/helpdesk-adapter-contracts.test.ts apps/web/tests/unit/helpdesk-adapter-service.test.ts apps/web/tests/unit/native-helpdesk-normalizer.test.ts
git commit -m "feat: add jira helpdesk adapter"
```

---

### Task 4: Data Source Contracts and Capability Catalog

**Files:**
- Create: `apps/web/src/lib/integrations/data-source-adapters/types.ts`
- Create: `apps/web/src/lib/integrations/data-source-adapters/source-contracts.ts`
- Modify: `apps/web/src/lib/integrations/capabilities.ts`
- Modify: `apps/web/src/lib/api/openapi.ts`
- Modify: `apps/web/tests/unit/integration-capabilities.test.ts`
- Modify: `apps/web/tests/unit/openapi.test.ts`
- Create: `apps/web/tests/unit/data-source-adapter-contracts.test.ts`

- [ ] **Step 1: Write failing data source contract tests**

Create `apps/web/tests/unit/data-source-adapter-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dataSourceContracts, dataSourceSources } from "@/lib/integrations/data-source-adapters/source-contracts";

describe("data source adapter contracts", () => {
  it("records YDB and YTsaurus as tabular data sources", () => {
    expect(dataSourceSources).toEqual(["ydb", "ytsaurus"]);
    expect(dataSourceContracts.ydb).toMatchObject({
      source: "ydb",
      displayName: "YDB",
      type: "data_source",
      requiredSecrets: ["data_source_credentials"]
    });
    expect(dataSourceContracts.ytsaurus).toMatchObject({
      source: "ytsaurus",
      displayName: "YTsaurus/YT",
      type: "data_source",
      requiredSecrets: ["data_source_token"]
    });
  });

  it("keeps live certification gated for tabular sources", () => {
    for (const source of dataSourceSources) {
      expect(dataSourceContracts[source].certification.summary.productionReady).toBe(false);
      expect(dataSourceContracts[source].certification.gates.live).toBe("waiting_for_access");
    }
  });
});
```

Add to `apps/web/tests/unit/integration-capabilities.test.ts`:

```ts
it("exposes YDB and YTsaurus as data source capabilities", () => {
  expect(getIntegrationCapability("ydb")).toMatchObject({
    source: "ydb",
    displayName: "YDB",
    type: "data_source",
    readiness: "adapter_ready"
  });
  expect(getIntegrationCapability("ytsaurus")).toMatchObject({
    source: "ytsaurus",
    displayName: "YTsaurus/YT",
    type: "data_source",
    readiness: "adapter_ready"
  });
});
```

Add to `apps/web/tests/unit/openapi.test.ts`:

```ts
expect(document.components.schemas.IntegrationCapabilityType).toEqual({
  type: "string",
  enum: ["otrs_family", "native_helpdesk", "custom_api", "webhook_bridge", "enterprise", "data_source"]
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/web
npm run test -- tests/unit/data-source-adapter-contracts.test.ts tests/unit/integration-capabilities.test.ts tests/unit/openapi.test.ts
```

Expected: FAIL because `data-source-adapters` and `data_source` enum do not exist.

- [ ] **Step 3: Add data source types**

Create `apps/web/src/lib/integrations/data-source-adapters/types.ts`:

```ts
import type { CertificationGateSummary, CertificationSummary } from "@/lib/certification/status";
import type { CustomConversationInput } from "@/lib/validation/custom-api";

export type DataSourceSource = "ydb" | "ytsaurus";

export type DataSourceOperation = "table_read" | "query_execute" | "diagnostics" | "fixture_import";

export type DataSourceContract = {
  source: DataSourceSource;
  displayName: string;
  type: "data_source";
  authModes: readonly string[];
  operations: readonly DataSourceOperation[];
  requiredSecrets: readonly string[];
  docsHref: string;
  payloadLimits: {
    rowLimit: number;
    maxResponseBytes: number;
  };
  certification: {
    gates: CertificationGateSummary;
    summary: CertificationSummary;
    limitations: readonly string[];
  };
};

export type DataSourceAdapterLoadInput = {
  source: DataSourceSource;
  baseUrl: string | null;
  config: Record<string, unknown>;
  credential?: string;
  limit: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type DataSourceAdapterLoadResult = {
  source: DataSourceSource;
  rows: unknown[];
  conversations: CustomConversationInput[];
  diagnostics: {
    requests: Array<{
      operation: DataSourceOperation;
      method: "GET" | "POST" | "YQL";
      url: string;
      statusCode: number;
    }>;
  };
};
```

- [ ] **Step 4: Add data source contracts**

Create `apps/web/src/lib/integrations/data-source-adapters/source-contracts.ts`:

```ts
import { summarizeCertification } from "@/lib/certification/status";
import type { DataSourceContract, DataSourceSource } from "@/lib/integrations/data-source-adapters/types";

const gates = {
  docs: "docs_checked",
  contract: "contract_certified",
  stub: "stub_certified",
  live: "waiting_for_access"
} as const;

const defaultLimits = { rowLimit: 1000, maxResponseBytes: 2_000_000 } as const;

function contract(config: Omit<DataSourceContract, "payloadLimits" | "certification">): DataSourceContract {
  return {
    ...config,
    authModes: [...config.authModes],
    operations: [...config.operations],
    requiredSecrets: [...config.requiredSecrets],
    payloadLimits: { ...defaultLimits },
    certification: {
      gates: { ...gates },
      summary: summarizeCertification(gates),
      limitations: [
        "Контракт основан на документации и локальных stub проверках.",
        "Живая сертификация требует защищенный источник и реальные учетные данные."
      ]
    }
  };
}

export const dataSourceSources = ["ydb", "ytsaurus"] as const satisfies readonly DataSourceSource[];

export const dataSourceContracts = {
  ydb: contract({
    source: "ydb",
    displayName: "YDB",
    type: "data_source",
    authModes: ["static_credentials", "token"],
    operations: ["query_execute", "diagnostics", "fixture_import"],
    requiredSecrets: ["data_source_credentials"],
    docsHref: "https://ydb.tech/docs/ru/"
  }),
  ytsaurus: contract({
    source: "ytsaurus",
    displayName: "YTsaurus/YT",
    type: "data_source",
    authModes: ["oauth_token"],
    operations: ["table_read", "diagnostics", "fixture_import"],
    requiredSecrets: ["data_source_token"],
    docsHref: "https://ytsaurus.tech/docs/ru/"
  })
} satisfies Record<DataSourceSource, DataSourceContract>;
```

- [ ] **Step 5: Add data source capabilities**

Modify `apps/web/src/lib/integrations/capabilities.ts`:

```ts
import { dataSourceContracts, dataSourceSources } from "@/lib/integrations/data-source-adapters/source-contracts";
```

Extend type union:

```ts
type: "otrs_family" | "native_helpdesk" | "custom_api" | "webhook_bridge" | "enterprise" | "data_source";
```

Add helper:

```ts
function dataSourceCapability(source: keyof typeof dataSourceContracts): IntegrationCapability {
  const contract = dataSourceContracts[source];

  return {
    source: contract.source,
    displayName: contract.displayName,
    type: "data_source",
    authModes: [...contract.authModes],
    supportsPaging: true,
    supportsCursor: true,
    supportsDiagnostics: contract.operations.includes("diagnostics"),
    supportsInboundWebhooks: false,
    supportsOutboundWebhooks: false,
    operations: [...contract.operations],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: [...contract.requiredSecrets],
    docsHref: contract.docsHref,
    setupStatus: "preview",
    payloadLimits: {
      batchSize: 100,
      importLimit: contract.payloadLimits.rowLimit
    },
    readiness: "adapter_ready",
    certification: {
      gates: { ...contract.certification.gates },
      summary: { ...contract.certification.summary },
      docs: [{ label: `${contract.displayName} documentation`, href: contract.docsHref, status: contract.certification.gates.docs }],
      limitations: [...contract.certification.limitations]
    }
  };
}

const dataSourceCapabilities = dataSourceSources.map(dataSourceCapability);
```

Add `...dataSourceCapabilities` to `integrationCapabilities` before `custom_api`.

- [ ] **Step 6: Update OpenAPI enum**

Modify `apps/web/src/lib/api/openapi.ts` where `IntegrationCapabilityType` is declared:

```ts
enum: ["otrs_family", "native_helpdesk", "custom_api", "webhook_bridge", "enterprise", "data_source"]
```

- [ ] **Step 7: Run capability tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/data-source-adapter-contracts.test.ts tests/unit/integration-capabilities.test.ts tests/unit/openapi.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/integrations/data-source-adapters/types.ts apps/web/src/lib/integrations/data-source-adapters/source-contracts.ts apps/web/src/lib/integrations/capabilities.ts apps/web/src/lib/api/openapi.ts apps/web/tests/unit/data-source-adapter-contracts.test.ts apps/web/tests/unit/integration-capabilities.test.ts apps/web/tests/unit/openapi.test.ts
git commit -m "feat: add tabular data source capabilities"
```

---

### Task 5: Tabular Conversation Normalizer

**Files:**
- Create: `apps/web/src/lib/normalizers/tabular-conversations.ts`
- Test: `apps/web/tests/unit/tabular-conversation-normalizer.test.ts`

- [ ] **Step 1: Write failing normalizer tests**

Create `apps/web/tests/unit/tabular-conversation-normalizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeTabularConversationRows } from "@/lib/normalizers/tabular-conversations";

describe("tabular conversation normalizer", () => {
  it("groups rows by conversation_id and sorts messages by sent_at", () => {
    const conversations = normalizeTabularConversationRows(
      [
        {
          conversation_id: "conv-1",
          message_id: "m2",
          author_name: "Agent",
          participant_type: "human_agent",
          body: "Ответ оператора",
          sent_at: "2026-04-25T10:05:00Z",
          subject: "Refund from table",
          status: "open",
          customer_name: "Анна"
        },
        {
          conversation_id: "conv-1",
          message_id: "m1",
          author_name: "Анна",
          participant_type: "customer",
          body: "Нужен возврат",
          sent_at: "2026-04-25T10:00:00Z",
          is_private: false
        }
      ],
      { source: "ytsaurus", samplingReason: "Импорт YTsaurus." }
    );

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      externalSource: "ytsaurus",
      externalId: "conv-1",
      channel: "ticket",
      subject: "Refund from table",
      customerName: "Анна",
      messages: [
        expect.objectContaining({ externalId: "m1", participantType: "customer" }),
        expect.objectContaining({ externalId: "m2", participantType: "human_agent" })
      ]
    });
  });

  it("rejects rows without required fields", () => {
    expect(() =>
      normalizeTabularConversationRows([{ conversation_id: "conv-1", body: "missing fields" }], {
        source: "ydb",
        samplingReason: "Импорт YDB."
      })
    ).toThrow("Строка табличного источника не содержит обязательные поля.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/web
npm run test -- tests/unit/tabular-conversation-normalizer.test.ts
```

Expected: FAIL because the normalizer file does not exist.

- [ ] **Step 3: Implement the normalizer**

Create `apps/web/src/lib/normalizers/tabular-conversations.ts`:

```ts
import { z } from "zod";
import { customConversationSchema, customParticipantTypeSchema, type CustomConversationInput } from "@/lib/validation/custom-api";

const tabularRowSchema = z.object({
  conversation_id: z.string().trim().min(1),
  message_id: z.string().trim().min(1),
  author_name: z.string().trim().min(1),
  participant_type: customParticipantTypeSchema,
  body: z.string().trim().min(1),
  sent_at: z.string().datetime({ offset: true }),
  subject: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  channel: z.enum(["chat", "email", "ticket", "messenger"]).optional(),
  customer_name: z.string().trim().min(1).optional(),
  assignee_name: z.string().trim().min(1).optional(),
  external_url: z.string().trim().url().optional(),
  tags: z.union([z.array(z.string().trim().min(1)), z.string()]).optional(),
  is_private: z.coerce.boolean().optional(),
  opened_at: z.string().datetime({ offset: true }).optional(),
  closed_at: z.string().datetime({ offset: true }).optional().nullable(),
  sampling_reason: z.string().trim().min(1).optional(),
  risk_hint: z.string().trim().min(1).optional()
});

export type TabularConversationRow = z.infer<typeof tabularRowSchema>;

type NormalizeOptions = {
  source: string;
  samplingReason: string;
};

export function normalizeTabularConversationRows(rows: unknown[], options: NormalizeOptions): CustomConversationInput[] {
  const parsedRows = rows.map((row) => {
    const parsed = tabularRowSchema.safeParse(row);

    if (!parsed.success) {
      throw new Error("Строка табличного источника не содержит обязательные поля.");
    }

    return parsed.data;
  });
  const groups = new Map<string, TabularConversationRow[]>();

  for (const row of parsedRows) {
    groups.set(row.conversation_id, [...(groups.get(row.conversation_id) ?? []), row]);
  }

  return Array.from(groups.entries()).map(([conversationId, groupRows]) => {
    const sortedRows = [...groupRows].sort((left, right) => left.sent_at.localeCompare(right.sent_at));
    const first = sortedRows[0]!;
    const tags = typeof first.tags === "string"
      ? first.tags.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean)
      : first.tags ?? [];
    const fallbackSubject = sortedRows[0]?.body.slice(0, 80) || `Conversation ${conversationId}`;

    return customConversationSchema.parse({
      externalSource: options.source,
      externalId: conversationId,
      externalUrl: first.external_url,
      channel: first.channel ?? "ticket",
      subject: first.subject ?? fallbackSubject,
      status: first.status ?? "imported",
      tags,
      customerName: first.customer_name ?? first.author_name,
      assigneeName: first.assignee_name,
      samplingReason: first.sampling_reason ?? options.samplingReason,
      riskHint: first.risk_hint,
      openedAt: first.opened_at ?? sortedRows[0]!.sent_at,
      closedAt: first.closed_at ?? null,
      messages: sortedRows.map((row) => ({
        externalId: row.message_id,
        participantType: row.participant_type,
        authorName: row.author_name,
        body: row.body,
        sentAt: row.sent_at,
        isPrivate: row.is_private ?? false
      }))
    });
  });
}
```

- [ ] **Step 4: Run normalizer tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/tabular-conversation-normalizer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/normalizers/tabular-conversations.ts apps/web/tests/unit/tabular-conversation-normalizer.test.ts
git commit -m "feat: normalize tabular conversation rows"
```

---

### Task 6: YTsaurus HTTP Adapter

**Files:**
- Create: `apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts`
- Create: `apps/web/tests/fixtures/ytsaurus-server.ts`
- Test: `apps/web/tests/unit/ytsaurus-adapter.test.ts`

- [ ] **Step 1: Write failing YTsaurus adapter tests**

Create `apps/web/tests/unit/ytsaurus-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createYTsaurusAdapter } from "@/lib/integrations/data-source-adapters/ytsaurus";
import { createYTsaurusServer } from "../fixtures/ytsaurus-server";

describe("YTsaurus adapter", () => {
  it("reads a table and normalizes rows", async () => {
    const server = await createYTsaurusServer({ mode: "success" });

    try {
      const result = await createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: server.baseUrl,
        config: { tablePath: "//home/qc/conversations" },
        credential: "yt-token",
        limit: 100
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "ytsaurus",
        externalId: "yt-conv-1"
      });
      expect(server.requests[0]?.headers.authorization).toBe("OAuth yt-token");
      expect(server.requests[0]?.query.path).toBe("//home/qc/conversations");
      expect(JSON.stringify(result.diagnostics)).not.toContain("yt-token");
    } finally {
      await server.close();
    }
  });

  it("rejects unsafe proxy URLs before requests", async () => {
    await expect(
      createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: "file:///tmp/yt",
        config: { tablePath: "//home/qc/conversations" },
        credential: "yt-token",
        limit: 100
      })
    ).rejects.toThrow("YTsaurus proxy URL должен начинаться с http:// или https://.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/web
npm run test -- tests/unit/ytsaurus-adapter.test.ts
```

Expected: FAIL because the adapter and fixture do not exist.

- [ ] **Step 3: Add YTsaurus fixture server**

Create `apps/web/tests/fixtures/ytsaurus-server.ts`:

```ts
import http from "node:http";

type Mode = "success" | "invalid_json" | "auth_failure";

export type YTsaurusRequest = {
  method: string;
  pathname: string;
  query: Record<string, string>;
  headers: Record<string, string>;
};

export async function createYTsaurusServer(options: { mode: Mode }) {
  const requests: YTsaurusRequest[] = [];
  const server = http.createServer((request, response) => {
    const parsedUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push({
      method: request.method ?? "GET",
      pathname: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value)]))
    });

    if (options.mode === "auth_failure") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "bad token" }));
      return;
    }

    if (options.mode === "invalid_json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify([
        {
          conversation_id: "yt-conv-1",
          message_id: "yt-msg-1",
          author_name: "Анна",
          participant_type: "customer",
          body: "Нужен возврат из YTsaurus.",
          sent_at: "2026-04-25T10:00:00Z",
          subject: "YTsaurus refund",
          customer_name: "Анна"
        }
      ])
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected local YTsaurus fixture server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
```

- [ ] **Step 4: Implement YTsaurus adapter**

Create `apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts`:

```ts
import { normalizeTabularConversationRows } from "@/lib/normalizers/tabular-conversations";
import type { DataSourceAdapterLoadInput, DataSourceAdapterLoadResult } from "@/lib/integrations/data-source-adapters/types";

function textConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function safeProxyUrl(baseUrl: string | null) {
  if (!baseUrl) {
    throw new Error("Для YTsaurus укажите proxy URL.");
  }

  const url = new URL(baseUrl);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("YTsaurus proxy URL должен начинаться с http:// или https://.");
  }

  return url.toString().replace(/\/$/, "");
}

function redactToken(value: string) {
  return value.replace(/OAuth\s+[A-Za-z0-9._~+/=-]+/g, "OAuth [REDACTED]");
}

export function createYTsaurusAdapter() {
  return {
    async loadRows(input: DataSourceAdapterLoadInput): Promise<DataSourceAdapterLoadResult> {
      const proxyUrl = safeProxyUrl(input.baseUrl);
      const tablePath = textConfig(input.config, "tablePath");

      if (!tablePath.startsWith("//")) {
        throw new Error("Для YTsaurus укажите tablePath в формате //path/to/table.");
      }

      const url = `${proxyUrl}/api/v3/read_table?path=${encodeURIComponent(tablePath)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `OAuth ${input.credential ?? ""}`
        },
        signal: AbortSignal.timeout(input.timeoutMs ?? 15_000)
      });
      const text = await response.text();
      const maxResponseBytes = input.maxResponseBytes ?? 2_000_000;

      if (Buffer.byteLength(text, "utf8") > maxResponseBytes) {
        throw new Error("Ответ YTsaurus превышает лимит размера.");
      }

      if (!response.ok) {
        throw new Error(`YTsaurus вернул HTTP ${response.status}.`);
      }

      let rows: unknown;

      try {
        rows = text ? JSON.parse(text) : [];
      } catch {
        throw new Error("YTsaurus вернул ответ не в JSON-формате.");
      }

      const rowArray = Array.isArray(rows) ? rows.slice(0, input.limit) : [];
      const conversations = normalizeTabularConversationRows(rowArray, {
        source: "ytsaurus",
        samplingReason: "Импорт YTsaurus/YT: строки таблицы."
      });

      return {
        source: "ytsaurus",
        rows: rowArray,
        conversations,
        diagnostics: {
          requests: [
            {
              operation: "table_read",
              method: "GET",
              url: redactToken(url),
              statusCode: response.status
            }
          ]
        }
      };
    }
  };
}
```

- [ ] **Step 5: Run YTsaurus tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/ytsaurus-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts apps/web/tests/fixtures/ytsaurus-server.ts apps/web/tests/unit/ytsaurus-adapter.test.ts
git commit -m "feat: add ytsaurus data source adapter"
```

---

### Task 7: YDB Adapter

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Create: `apps/web/src/lib/integrations/data-source-adapters/ydb.ts`
- Test: `apps/web/tests/unit/ydb-adapter.test.ts`

- [ ] **Step 1: Write failing YDB adapter tests**

Create `apps/web/tests/unit/ydb-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const close = vi.fn();
const ready = vi.fn().mockResolvedValue(undefined);
const queryFn = vi.fn().mockResolvedValue([
  [
    {
      conversation_id: "ydb-conv-1",
      message_id: "ydb-msg-1",
      author_name: "Анна",
      participant_type: "customer",
      body: "Нужен возврат из YDB.",
      sent_at: "2026-04-25T10:00:00Z",
      subject: "YDB refund",
      customer_name: "Анна"
    }
  ]
]);

vi.mock("@ydbjs/core", () => ({
  Driver: vi.fn().mockImplementation(() => ({ ready, close }))
}));

vi.mock("@ydbjs/query", () => ({
  query: vi.fn(() => queryFn),
  unsafe: (value: string) => value
}));

vi.mock("@ydbjs/auth/static", () => ({
  StaticCredentialsProvider: vi.fn().mockImplementation((value) => value)
}));

describe("YDB adapter", () => {
  it("executes a configured query and closes the driver", async () => {
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");
    const result = await createYdbAdapter().loadRows({
      source: "ydb",
      baseUrl: "grpc://localhost:2136/local",
      config: { query: "SELECT * FROM conversations LIMIT 100" },
      credential: JSON.stringify({ username: "user", password: "pass" }),
      limit: 100
    });

    expect(result.conversations[0]).toMatchObject({
      externalSource: "ydb",
      externalId: "ydb-conv-1"
    });
    expect(ready).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the driver when query execution fails", async () => {
    vi.clearAllMocks();
    queryFn.mockRejectedValueOnce(new Error("query failed"));
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await expect(
      createYdbAdapter().loadRows({
        source: "ydb",
        baseUrl: "grpc://localhost:2136/local",
        config: { query: "SELECT * FROM conversations LIMIT 100" },
        credential: JSON.stringify({ username: "user", password: "pass" }),
        limit: 100
      })
    ).rejects.toThrow("query failed");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/web
npm run test -- tests/unit/ydb-adapter.test.ts
```

Expected: FAIL because YDB packages and adapter do not exist.

- [ ] **Step 3: Install YDB SDK packages**

Run:

```bash
cd apps/web
npm install @ydbjs/core @ydbjs/query @ydbjs/auth @ydbjs/value
```

- [ ] **Step 4: Implement YDB adapter**

Create `apps/web/src/lib/integrations/data-source-adapters/ydb.ts`:

```ts
import { Driver } from "@ydbjs/core";
import { query, unsafe } from "@ydbjs/query";
import { StaticCredentialsProvider } from "@ydbjs/auth/static";
import { normalizeTabularConversationRows } from "@/lib/normalizers/tabular-conversations";
import type { DataSourceAdapterLoadInput, DataSourceAdapterLoadResult } from "@/lib/integrations/data-source-adapters/types";

function queryText(config: Record<string, unknown>) {
  const value = config.query;

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Для YDB укажите YQL query.");
  }

  return value.trim();
}

function credentials(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("YDB credentials должны быть JSON-объектом.");
  }

  const username = (parsed as { username?: unknown }).username;
  const password = (parsed as { password?: unknown }).password;

  if (typeof username !== "string" || typeof password !== "string") {
    throw new Error("YDB credentials должны содержать username и password.");
  }

  return new StaticCredentialsProvider({ username, password });
}

export function createYdbAdapter() {
  return {
    async loadRows(input: DataSourceAdapterLoadInput): Promise<DataSourceAdapterLoadResult> {
      if (!input.baseUrl) {
        throw new Error("Для YDB укажите endpoint/database connection string.");
      }

      const driver = new Driver(input.baseUrl, {
        credentialsProvider: credentials(input.credential)
      });

      try {
        await driver.ready();
        const sql = query(driver);
        const resultSets = await sql`${unsafe(queryText(input.config))}`;
        const rows = Array.isArray(resultSets[0]) ? resultSets[0].slice(0, input.limit) : [];
        const conversations = normalizeTabularConversationRows(rows, {
          source: "ydb",
          samplingReason: "Импорт YDB: строки YQL-запроса."
        });

        return {
          source: "ydb",
          rows,
          conversations,
          diagnostics: {
            requests: [
              {
                operation: "query_execute",
                method: "YQL",
                url: input.baseUrl,
                statusCode: 200
              }
            ]
          }
        };
      } finally {
        driver.close();
      }
    }
  };
}
```

- [ ] **Step 5: Run YDB tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/ydb-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/integrations/data-source-adapters/ydb.ts apps/web/tests/unit/ydb-adapter.test.ts
git commit -m "feat: add ydb data source adapter"
```

---

### Task 8: Data Source Service and Runner Routing

**Files:**
- Create: `apps/web/src/lib/integrations/data-source-adapters/service.ts`
- Modify: `apps/web/src/lib/integration-import-service.ts`
- Modify: `apps/web/src/lib/integrations/runner.ts`
- Test: `apps/web/tests/unit/integration-import-service.test.ts`
- Test: `apps/web/tests/unit/integration-runner-ledger.test.ts`

- [ ] **Step 1: Write failing service routing tests**

Add to `apps/web/tests/unit/integration-import-service.test.ts`:

```ts
it("accepts data_source contracts for YDB and YTsaurus", () => {
  expect(() => assertIntegrationSourceContractSupported({ source: "ydb", type: "data_source" })).not.toThrow();
  expect(() => assertIntegrationSourceContractSupported({ source: "ytsaurus", type: "data_source" })).not.toThrow();
});
```

Add to `apps/web/tests/unit/integration-runner-ledger.test.ts`:

```ts
vi.mock("@/lib/integrations/data-source-adapters/service", () => ({
  loadDataSourceAdapterConversations: vi.fn().mockResolvedValue({
    conversations: [
      {
        externalSource: "ytsaurus",
        externalId: "yt-conv-1",
        channel: "ticket",
        subject: "YTsaurus refund",
        status: "imported",
        customerName: "Анна",
        samplingReason: "Импорт YTsaurus.",
        openedAt: "2026-04-25T10:00:00.000Z",
        closedAt: null,
        messages: [
          {
            externalId: "yt-msg-1",
            participantType: "customer",
            authorName: "Анна",
            body: "Нужен возврат.",
            sentAt: "2026-04-25T10:00:00.000Z",
            isPrivate: false
          }
        ]
      }
    ],
    diagnostics: { requests: [] }
  })
}));
```

Add a runner assertion in the same file near native helpdesk routing tests:

```ts
it("routes data_source integrations through the data source service", async () => {
  const { loadDataSourceAdapterConversations } = await import("@/lib/integrations/data-source-adapters/service");

  const result = await runIntegrationConnector({
    workspaceId: "workspace-1",
    integrationId: "integration-ytsaurus",
    dryRun: true,
    requestedLimit: 10,
    client: prismaMock
  });

  expect(loadDataSourceAdapterConversations).toHaveBeenCalled();
  expect(result).toMatchObject({
    source: "ytsaurus",
    mode: "data_source",
    dryRun: true,
    checkedCount: 1
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-import-service.test.ts tests/unit/integration-runner-ledger.test.ts
```

Expected: FAIL because `data_source` is unsupported.

- [ ] **Step 3: Implement data source service**

Create `apps/web/src/lib/integrations/data-source-adapters/service.ts`:

```ts
import type { Integration, IntegrationCredential } from "@prisma/client";
import { dataSourceContracts, dataSourceSources } from "@/lib/integrations/data-source-adapters/source-contracts";
import type { DataSourceSource } from "@/lib/integrations/data-source-adapters/types";
import { createYdbAdapter } from "@/lib/integrations/data-source-adapters/ydb";
import { createYTsaurusAdapter } from "@/lib/integrations/data-source-adapters/ytsaurus";
import { decryptSecret } from "@/lib/secrets";

type IntegrationWithCredentials = Integration & {
  credentials: IntegrationCredential[];
};

function isDataSourceSource(source: string): source is DataSourceSource {
  return dataSourceSources.some((item) => item === source);
}

function parseConfig(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function credentialSecret(credentials: IntegrationCredential[], kind: string) {
  const credential = credentials.find((item) => item.kind === kind);
  return credential ? decryptSecret(credential.encryptedSecret) : undefined;
}

export async function loadDataSourceAdapterConversations(input: {
  integration: IntegrationWithCredentials;
  limit: number;
}) {
  const source = input.integration.source;

  if (!isDataSourceSource(source)) {
    throw new Error("Неподдерживаемый data source.");
  }

  const contract = dataSourceContracts[source];

  if (input.integration.type !== contract.type) {
    throw new Error("Тип интеграции не соответствует data source contract.");
  }

  const credential = credentialSecret(input.integration.credentials, contract.requiredSecrets[0]!);
  const adapter = source === "ydb" ? createYdbAdapter() : createYTsaurusAdapter();

  return adapter.loadRows({
    source,
    baseUrl: input.integration.baseUrl,
    config: parseConfig(input.integration.configJson),
    credential,
    limit: Math.min(input.limit, contract.payloadLimits.rowLimit),
    maxResponseBytes: contract.payloadLimits.maxResponseBytes
  });
}
```

- [ ] **Step 4: Route runner and contract support**

Modify `apps/web/src/lib/integration-import-service.ts`:

```ts
import { dataSourceContracts } from "@/lib/integrations/data-source-adapters/source-contracts";
```

In `assertIntegrationSourceContractSupported`, accept:

```ts
  const dataSourceContract = dataSourceContracts[source as keyof typeof dataSourceContracts];

  if (dataSourceContract) {
    if (type !== dataSourceContract.type) {
      throw new Error("Тип интеграции не соответствует data source contract.");
    }

    return;
  }
```

Modify `apps/web/src/lib/integrations/runner.ts`:

```ts
import { loadDataSourceAdapterConversations } from "@/lib/integrations/data-source-adapters/service";
```

Add loader:

```ts
async function loadDataSourceConversations(integration: IntegrationWithCredential, limit: number) {
  const result = await loadDataSourceAdapterConversations({ integration, limit });
  return result.conversations;
}
```

Route in `loadIntegrationConversations`:

```ts
  if (integration.type === "data_source") {
    return loadDataSourceConversations(integration, limit);
  }
```

- [ ] **Step 5: Run routing tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-import-service.test.ts tests/unit/integration-runner-ledger.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/integrations/data-source-adapters/service.ts apps/web/src/lib/integration-import-service.ts apps/web/src/lib/integrations/runner.ts apps/web/tests/unit/integration-import-service.test.ts apps/web/tests/unit/integration-runner-ledger.test.ts
git commit -m "feat: route data source imports through runner"
```

---

### Task 9: Integration Setup UI for Jira, YDB, and YTsaurus

**Files:**
- Modify: `apps/web/src/components/integrations/integration-setup-workspace.tsx`
- Modify: `apps/web/src/lib/integration-actions.ts`
- Modify: `apps/web/tests/unit/integration-setup-workspace.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add to `apps/web/tests/unit/integration-setup-workspace.test.tsx`:

```ts
it("offers Jira and tabular data sources in setup", () => {
  render(<IntegrationSetupWorkspace apiTokenCount={1} apiHealth={{ label: "OK", className: "text-green-700" }} />);

  expect(screen.getByText("Jira Service Management")).toBeInTheDocument();
  expect(screen.getByText("Табличные источники")).toBeInTheDocument();
  expect(screen.getByText("YDB")).toBeInTheDocument();
  expect(screen.getByText("YTsaurus/YT")).toBeInTheDocument();
});

it("does not mirror data source secrets into hidden form fields", () => {
  const { container } = render(
    <IntegrationSetupWorkspace apiTokenCount={1} apiHealth={{ label: "OK", className: "text-green-700" }} />
  );

  fireEvent.click(screen.getByRole("button", { name: "YTsaurus/YT" }));
  fireEvent.click(screen.getByRole("button", { name: "Далее" }));
  fireEvent.change(screen.getByLabelText("OAuth token"), {
    target: { value: "yt-secret-token" }
  });

  const secretHiddenInputs = container.querySelectorAll(
    'input[type="hidden"][name*="token" i], input[type="hidden"][name*="secret" i], input[type="hidden"][value="yt-secret-token"]'
  );
  expect(secretHiddenInputs).toHaveLength(0);
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-setup-workspace.test.tsx
```

Expected: FAIL because data source mode is absent.

- [ ] **Step 3: Extend setup action parsing**

Modify `apps/web/src/lib/integration-actions.ts`:

Update mode type handling by adding data source credential fields:

```ts
  const dataSourceSecret = stringField(formData, "dataSourceSecret");
  const dataSourceTablePath = stringField(formData, "dataSourceTablePath");
  const dataSourceQuery = stringField(formData, "dataSourceQuery");
  const credentialSecret =
    mode === "otrs_family"
      ? password
      : mode === "native_helpdesk"
        ? nativeToken
        : mode === "data_source"
          ? dataSourceSecret
          : "";
```

Add data source config entries:

```ts
      tablePath: dataSourceTablePath,
      query: dataSourceQuery,
```

Update `upsertIntegrationSetup` credential slot:

```ts
  if (setup.credentialSecret) {
    const secretKind =
      setup.mode === "data_source"
        ? setup.source === "ytsaurus"
          ? "data_source_token"
          : "data_source_credentials"
        : "auth_password";
    await upsertIntegrationSecretSlot(tx, {
      workspaceId,
      integrationId: integration.id,
      kind: secretKind,
      authMode: setup.mode === "otrs_family" ? "user_password" : setup.mode === "data_source" ? "data_source_secret" : "bearer_token",
      secret: setup.credentialSecret
    });
  }
```

- [ ] **Step 4: Extend setup workspace options**

Modify `apps/web/src/components/integrations/integration-setup-workspace.tsx`:

Extend `SourceMode`:

```ts
type SourceMode = "otrs_family" | "native_helpdesk" | "enterprise" | "custom_api" | "data_source";
```

Add source options:

```ts
const dataSourceOptions = [
  {
    value: "ydb",
    label: "YDB",
    mode: "data_source" as const,
    objectName: "YQL rows",
    endpointHint: "YQL query returning conversation/message columns",
    capability: getIntegrationCapability("ydb", "data_source")
  },
  {
    value: "ytsaurus",
    label: "YTsaurus/YT",
    mode: "data_source" as const,
    objectName: "Table rows",
    endpointHint: "/api/v3/read_table?path=//home/qc/conversations",
    capability: getIntegrationCapability("ytsaurus", "data_source")
  }
];
```

Add a mode group:

```ts
{
  mode: "data_source" as const,
  title: "Табличные источники",
  description: "Импорт строк из YDB и YTsaurus по фиксированному mapping contract.",
  options: dataSourceOptions
}
```

Add state:

```ts
const [dataSource, setDataSource] = useState<"ydb" | "ytsaurus">("ytsaurus");
const [dataSourceBaseUrl, setDataSourceBaseUrl] = useState("https://yt.example.com");
const [dataSourceSecret, setDataSourceSecret] = useState("");
const [dataSourceTablePath, setDataSourceTablePath] = useState("//home/qc/conversations");
const [dataSourceQuery, setDataSourceQuery] = useState("SELECT * FROM conversations LIMIT 100");
```

In submitted form hidden fields, include non-secret data source values:

```tsx
<input type="hidden" name="dataSourceTablePath" value={dataSourceTablePath} />
<input type="hidden" name="dataSourceQuery" value={dataSourceQuery} />
```

Render secret as a visible input with `name="dataSourceSecret"` inside the active form, not as hidden state.

- [ ] **Step 5: Run UI tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-setup-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/integrations/integration-setup-workspace.tsx apps/web/src/lib/integration-actions.ts apps/web/tests/unit/integration-setup-workspace.test.tsx
git commit -m "feat: add tabular integration setup ui"
```

---

### Task 10: Use tRPC and TanStack Query in Integration UI

**Files:**
- Modify: `apps/web/src/components/integrations/integration-setup-workspace.tsx`
- Modify: `apps/web/src/server/trpc/routers/integrations.ts`
- Test: `apps/web/tests/unit/integration-trpc-router.test.ts`
- Test: `apps/web/tests/unit/integration-setup-workspace.test.tsx`

- [ ] **Step 1: Write failing tRPC mutation test**

Extend `apps/web/tests/unit/integration-trpc-router.test.ts`:

```ts
vi.mock("@/lib/integration-actions", () => ({
  recordIntegrationDryRunFromInput: vi.fn().mockResolvedValue({
    ok: true,
    message: "Импорт поставлен в очередь.",
    integrationId: "integration-1",
    runId: "run-1",
    jobId: "job-1"
  })
}));

it("queues integration imports through a typed mutation", async () => {
  const { appRouter } = await import("@/server/trpc/root");
  const caller = appRouter.createCaller({
    user: { id: "user-1", workspaceId: "workspace-1", role: "ADMIN" } as never
  });

  await expect(
    caller.integrations.queueImport({
      source: "ytsaurus",
      sourceLabel: "YTsaurus/YT",
      mode: "data_source",
      baseUrl: "https://yt.example.com",
      maxTickets: 100,
      batchSize: 25,
      dateRangeDays: 30,
      dryRun: true,
      deduplicate: true,
      config: { tablePath: "//home/qc/conversations" }
    })
  ).resolves.toMatchObject({
    ok: true,
    runId: "run-1"
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-trpc-router.test.ts
```

Expected: FAIL because `queueImport` does not exist.

- [ ] **Step 3: Extract typed queue action input**

Modify `apps/web/src/lib/integration-actions.ts` by exporting a typed helper:

```ts
export const integrationSetupInputSchema = z.object({
  source: z.string().trim().min(1),
  sourceLabel: z.string().trim().min(1),
  mode: z.enum(["otrs_family", "native_helpdesk", "enterprise", "custom_api", "data_source"]),
  baseUrl: z.string().trim().nullable(),
  maxTickets: z.number().int().positive().max(10000),
  batchSize: z.number().int().positive().max(1000),
  dateRangeDays: z.number().int().positive().max(3650),
  ticketId: z.string().trim().optional().default(""),
  userLogin: z.string().trim().optional().default(""),
  dryRun: z.boolean(),
  deduplicate: z.boolean(),
  config: z.record(z.unknown()).default({})
});

export type IntegrationSetupInput = z.infer<typeof integrationSetupInputSchema>;

export async function recordIntegrationDryRunFromInput(input: IntegrationSetupInput): Promise<IntegrationImportActionState> {
  const formData = new FormData();

  for (const [key, value] of Object.entries(input)) {
    if (key === "config") {
      formData.set("configJson", JSON.stringify(value));
    } else if (typeof value === "boolean") {
      formData.set(key, value ? "true" : "false");
    } else if (value !== null && value !== undefined) {
      formData.set(key, String(value));
    }
  }

  return recordIntegrationDryRunState(null, formData);
}
```

- [ ] **Step 4: Add typed mutation**

Modify `apps/web/src/server/trpc/routers/integrations.ts`:

```ts
import { recordIntegrationDryRunFromInput, integrationSetupInputSchema } from "@/lib/integration-actions";
```

Add procedure:

```ts
  queueImport: protectedProcedure.input(integrationSetupInputSchema).mutation(({ input }) => {
    return recordIntegrationDryRunFromInput(input);
  })
```

- [ ] **Step 5: Use TanStack Query through tRPC in the setup workspace**

Modify `apps/web/src/components/integrations/integration-setup-workspace.tsx`:

```tsx
import { trpc } from "@/lib/trpc/client";
```

Inside the component:

```tsx
const queueImportMutation = trpc.integrations.queueImport.useMutation();
```

For non-secret dry-run queue operations, call:

```tsx
queueImportMutation.mutate({
  source: selectedSourceKey,
  sourceLabel: activeSourceLabel,
  mode,
  baseUrl: activeBaseUrl,
  maxTickets: Number(maxTickets),
  batchSize: Number(batchSize),
  dateRangeDays: Number(dateRangeDays),
  ticketId: activeTicketId,
  userLogin,
  dryRun: true,
  deduplicate,
  config: {
    tablePath: dataSourceTablePath,
    query: dataSourceQuery
  }
});
```

Keep server-action forms for credential submissions because secrets should remain standard form POST fields and must not be mirrored into client-side mutation state.

- [ ] **Step 6: Run tRPC and UI tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-trpc-router.test.ts tests/unit/integration-setup-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/integration-actions.ts apps/web/src/server/trpc/routers/integrations.ts apps/web/src/components/integrations/integration-setup-workspace.tsx apps/web/tests/unit/integration-trpc-router.test.ts apps/web/tests/unit/integration-setup-workspace.test.tsx
git commit -m "feat: use trpc for integration workflow actions"
```

---

### Task 11: Catalog, OpenAPI, and Readiness Coverage

**Files:**
- Modify: `apps/web/src/lib/api/openapi.ts`
- Modify: `apps/web/src/lib/certification/readiness-report.ts`
- Modify: `apps/web/tests/unit/openapi.test.ts`
- Modify: `apps/web/tests/unit/certification-readiness-report.test.ts`
- Modify: `apps/web/tests/unit/integration-catalog-route.test.ts`

- [ ] **Step 1: Write failing assertions**

Add to `apps/web/tests/unit/integration-catalog-route.test.ts` catalog fixture:

```ts
{
  source: "ydb",
  displayName: "YDB",
  type: "data_source",
  certification: {
    summary: {
      status: "waiting_for_access",
      label: "Живая сертификация ожидает доступы",
      productionReady: false
    }
  }
}
```

Add to `apps/web/tests/unit/openapi.test.ts`:

```ts
expect(document.components.schemas.IntegrationCapability.properties.type).toEqual({
  $ref: "#/components/schemas/IntegrationCapabilityType"
});
expect(document.components.schemas.IntegrationCapabilityType.enum).toContain("data_source");
```

- [ ] **Step 2: Run tests to verify failures**

Run:

```bash
cd apps/web
npm run test -- tests/unit/openapi.test.ts tests/unit/integration-catalog-route.test.ts tests/unit/certification-readiness-report.test.ts
```

Expected: FAIL where readiness or OpenAPI is not updated for data sources.

- [ ] **Step 3: Update readiness command handling**

Modify `apps/web/src/lib/certification/readiness-report.ts`:

```ts
  if (capability.type === "data_source") {
    return `DATA_SOURCE_LIVE_SMOKE=1 DATA_SOURCE_LIVE_SOURCE=${capability.source} npm run test:live:data-source`;
  }
```

Where credential requirements are checked, keep:

```ts
return capability.requiredSecrets.every((secret) => integration.credentials.some((credential) => credential.kind === secret));
```

No separate data source branch is needed for secret presence because the capability already declares source-specific required slots.

- [ ] **Step 4: Run readiness and OpenAPI tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/openapi.test.ts tests/unit/integration-catalog-route.test.ts tests/unit/certification-readiness-report.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/openapi.ts apps/web/src/lib/certification/readiness-report.ts apps/web/tests/unit/openapi.test.ts apps/web/tests/unit/integration-catalog-route.test.ts apps/web/tests/unit/certification-readiness-report.test.ts
git commit -m "feat: document data source integration readiness"
```

---

### Task 12: Final Verification

**Files:**
- Review all files changed in Tasks 1-11.

- [ ] **Step 1: Run focused integration tests**

Run:

```bash
cd apps/web
npm run test -- \
  tests/unit/trpc-foundation.test.ts \
  tests/unit/integration-trpc-router.test.ts \
  tests/unit/helpdesk-adapter-contracts.test.ts \
  tests/unit/helpdesk-adapter-service.test.ts \
  tests/unit/native-helpdesk-normalizer.test.ts \
  tests/unit/data-source-adapter-contracts.test.ts \
  tests/unit/tabular-conversation-normalizer.test.ts \
  tests/unit/ytsaurus-adapter.test.ts \
  tests/unit/ydb-adapter.test.ts \
  tests/unit/integration-capabilities.test.ts \
  tests/unit/integration-import-service.test.ts \
  tests/unit/integration-runner-ledger.test.ts \
  tests/unit/integration-setup-workspace.test.tsx \
  tests/unit/openapi.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full unit suite**

Run:

```bash
cd apps/web
npm run test
```

Expected: PASS.

- [ ] **Step 4: Run E2E suite if UI changed substantially**

Run:

```bash
cd apps/web
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 5: Check whitespace and git status**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints no output. `git status --short` may include the existing unrelated review-fix changes plus this feature branch's tracked changes if final commits were not made.

- [ ] **Step 6: Final commit if verification changed files**

```bash
git add apps/web docs/superpowers/plans/2026-05-27-jira-ydb-ytsaurus-import-integrations.md
git commit -m "test: verify jira and data source integrations"
```

Skip this commit when no files changed during verification.

---

## Self-Review

- Spec coverage: Jira extension, YDB/YTsaurus `data_source` layer, tabular mapping, tRPC/TanStack addition, OpenAPI, UI, security limits, and tests are all mapped to tasks.
- Scope: Auth.js migration is intentionally outside this plan and should get its own spec and implementation plan.
- Placeholder scan: the plan contains concrete file paths, commands, expected outcomes, and code snippets for each code-changing step.
- Type consistency: `data_source`, `DataSourceSource`, `DataSourceAdapterLoadInput`, `normalizeTabularConversationRows`, `createYdbAdapter`, and `createYTsaurusAdapter` names are consistent across tasks.
- Risk: Task 7 depends on the documented `@ydbjs/auth/static` subpath from the `@ydbjs/auth` package; if npm install fails, stop that task and re-check official YDB SDK docs before editing adapter code.
