# Support QA Platform Next Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the MVP into a usable support QA product by improving integrations, review operations, scorecard management, auditability, and OTRS-family readiness in that order.

**Architecture:** Continue evolving the existing Next.js App Router app in `apps/web`. Keep integration contracts and examples in focused library modules, expose operational state through Prisma models, and add tests around each workflow before broad UI expansion.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Prisma, SQLite, Zod, Vitest, Playwright, npm.

---

## Roadmap Order

1. **Integration Onboarding Kit** - make custom integrations self-serve with endpoint docs, curl examples, payload examples, token diagnostics, and API contract coverage.
2. **Review Queue Workflow Tools** - add filters, search, sort, and queue summary controls for daily QA work.
3. **Scorecard Editor** - allow admins to create/edit criteria, manage weights, version scorecards, and activate new versions.
4. **Audit And Activity History** - expose audit events and API activity in a readable admin timeline.
5. **OTRS/Znuny/OTOBO Adapter Preparation** - add a mapping layer and fixtures for OTRS-family ticket/article payloads before building a live GenericInterface connector.

## Task 1: Integration Onboarding Kit

**Files:**

- Create: `apps/web/src/lib/custom-api-docs.ts`
- Modify: `apps/web/prisma/schema.prisma`
- Modify: `apps/web/prisma/seed.ts`
- Modify: `apps/web/src/lib/api-auth.ts`
- Modify: `apps/web/src/app/api/conversations/route.ts`
- Modify: `apps/web/src/app/api/conversations/[id]/messages/route.ts`
- Modify: `apps/web/src/app/api/reviews/export/route.ts`
- Modify: `apps/web/src/app/admin/integrations/page.tsx`
- Test: `apps/web/tests/unit/custom-api-docs.test.ts`
- Test: `apps/web/tests/api/conversations.test.ts`

- [x] **Step 1: Add API token diagnostics**

Add `lastSuccessAt`, `lastErrorAt`, and `lastError` to `ApiToken`, then create and apply a Prisma migration:

```bash
cd apps/web
npm run db:migrate -- --name add_api_token_diagnostics
```

Expected: a new migration exists under `apps/web/prisma/migrations`, Prisma Client is regenerated, and the local SQLite database is in sync.

- [x] **Step 2: Add shared API docs data**

Create `apps/web/src/lib/custom-api-docs.ts` with endpoint metadata, schema rows, a valid sample conversation payload, and generated curl examples. The sample payload must pass `customConversationSchema`.

- [x] **Step 3: Record API success and failure state**

Extend `apps/web/src/lib/api-auth.ts` with helpers that update API token diagnostics after authenticated requests:

- success: set `lastSuccessAt`, clear `lastError`;
- failure: set `lastErrorAt`, store a short error message.

Each API route should call these helpers for validation failures, not-found failures, internal errors, and successful responses.

- [x] **Step 4: Upgrade the integrations page**

Update `/admin/integrations` to show:

- supported endpoints and scopes;
- the local dev token and authorization header;
- curl examples;
- valid JSON sample payload;
- payload schema reference;
- token diagnostics including last success and last error.

- [x] **Step 5: Verify with tests**

Run:

```bash
cd apps/web
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Expected: all commands exit `0`. API tests must cover required token behavior, scope rejection, successful request diagnostics, and failure diagnostics.

- [x] **Step 6: Commit**

Commit only this task's files to `master`:

```bash
git add apps/web docs/superpowers/plans/2026-05-02-support-qa-next-steps.md
git commit -m "add custom api onboarding kit"
```

## Task 2: Review Queue Workflow Tools

**Files:**

- Modify: `apps/web/src/lib/review-repository.ts`
- Modify: `apps/web/src/app/reviews/page.tsx`
- Modify: `apps/web/src/components/review/queue-table.tsx`
- Test: `apps/web/tests/e2e/review-workflow.spec.ts`

- [ ] Add query-param driven filters for status, channel, source, assignee, and free-text search.
- [ ] Add queue summary counts for total, unchecked, finalized, and high-risk conversations.
- [ ] Add e2e coverage for filtering by status and searching by customer or subject.

## Task 3: Scorecard Editor

**Files:**

- Create: `apps/web/src/lib/scorecard-actions.ts`
- Modify: `apps/web/src/app/admin/scorecards/page.tsx`
- Test: `apps/web/tests/api` or focused unit tests for scorecard validation.

- [ ] Add create/edit forms for scorecard criteria.
- [ ] Validate total active scorecard weight equals 100.
- [ ] Add activate-new-version flow without mutating historical review scorecards.

## Task 4: Audit And Activity History

**Files:**

- Create: `apps/web/src/app/admin/audit/page.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx`
- Modify: `apps/web/src/lib/audit.ts`

- [ ] Show review finalization, seed/import, API token usage, and export activity in a paginated timeline.
- [ ] Add filters by action type and target type.
- [ ] Keep sensitive token material out of audit details.

## Task 5: OTRS/Znuny/OTOBO Adapter Preparation

**Files:**

- Create: `apps/web/src/lib/normalizers/otrs-family.ts`
- Create: `apps/web/tests/unit/otrs-family-normalizer.test.ts`
- Modify: `apps/web/src/app/admin/integrations/page.tsx`

- [ ] Add fixture-compatible normalizer for ticket plus article payloads.
- [ ] Map OTRS article sender types into customer, human agent, AI agent, and system participants.
- [ ] Preserve external ticket/article IDs for idempotent import.
- [ ] Add roadmap UI that marks Znuny / OTRS / OTOBO as the first native connector track.
