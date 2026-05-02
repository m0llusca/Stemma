# Support QA Productization Batch Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the next productization batch for the support QA MVP: native OTRS-family import, self-service connector testing, better scorecard editing, stronger review evidence workflows, and more useful operational reporting.

**Architecture:** Keep imports idempotent through shared conversation upsert logic. Keep admin workflows in server actions and focused client components. Extend reporting from existing Prisma data without adding new storage models yet.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, SQLite, Zod, Vitest, Playwright.

---

## Task 1: OTRS-Family Import Endpoint

**Files:**

- Create: `apps/web/src/lib/conversation-import.ts`
- Create: `apps/web/src/app/api/integrations/otrs-family/tickets/route.ts`
- Modify: `apps/web/src/app/api/conversations/route.ts`
- Modify: `apps/web/src/lib/custom-api-docs.ts`
- Test: `apps/web/tests/api/conversations.test.ts`

- [x] Add a shared helper for idempotent custom conversation/message upsert.
- [x] Add token-protected `POST /api/integrations/otrs-family/tickets`.
- [x] Support OTRS CE 6, Znuny, and OTOBO TicketGet-style payloads with source/base URL options.
- [x] Return imported conversation IDs and message counts.
- [x] Cover the endpoint with API tests.

## Task 2: OTRS Import Tester UI

**Files:**

- Create: `apps/web/src/lib/otrs-import-actions.ts`
- Create: `apps/web/src/components/integrations/otrs-import-tester.tsx`
- Modify: `apps/web/src/app/admin/integrations/page.tsx`
- Modify: `apps/web/src/lib/normalizers/otrs-family.ts`
- Test: `apps/web/tests/e2e/review-workflow.spec.ts`

- [x] Add a paste-and-preview TicketGet tester on `/admin/integrations`.
- [x] Import the pasted payload through a server action into the current workspace.
- [x] Redirect imported tickets into the review queue filtered by source.

## Task 3: Scorecard Editor V2

**Files:**

- Create: `apps/web/src/components/scorecards/scorecard-version-form.tsx`
- Modify: `apps/web/src/app/admin/scorecards/page.tsx`
- Modify: `apps/web/src/lib/scorecard-actions.ts`
- Test: `apps/web/tests/e2e/review-workflow.spec.ts`

- [x] Add, delete, and reorder criteria in the version form.
- [x] Show live total weight and block submit until it equals 100.
- [x] Preserve server-side validation and versioning semantics.

## Task 4: Review Detail Improvements

**Files:**

- Modify: `apps/web/src/app/reviews/[conversationId]/page.tsx`
- Modify: `apps/web/src/components/review/conversation-timeline.tsx`
- Modify: `apps/web/src/components/review/review-panel.tsx`
- Test: `apps/web/tests/e2e/review-workflow.spec.ts`

- [x] Highlight evidence messages used by the latest finalized review.
- [x] Add practical category/root-cause/coaching templates to the review panel.
- [x] Show review history on the conversation page.

## Task 5: Reports V2

**Files:**

- Modify: `apps/web/src/app/reports/page.tsx`
- Test: `apps/web/tests/e2e/review-workflow.spec.ts`

- [x] Add finalized review breakdowns by source, risk, finding category, and assignee.
- [x] Keep report calculations scoped to the current workspace.

## Task 6: Verification And Commit

- [x] Run `npm run typecheck`.
- [x] Run `npm run test`.
- [x] Run `npm run test:e2e`.
- [x] Run `npm run build`.
- [x] Reset dev seed data after e2e.
- [x] Commit implementation to `master`.
