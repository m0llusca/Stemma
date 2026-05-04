# Backend Roadmap Design

Date: 2026-05-04

## Goal

Develop the backend of the Support QA Platform in controlled phases: harden the platform foundation first, then build a reliable integration engine, then deepen QA product workflows, and finally prepare the system for AutoQA and automation.

The design is based on the current `apps/web` backend audit. The app already has a solid base: Next.js App Router, Prisma with PostgreSQL, multi-workspace models, RBAC, API tokens, rate limiting, idempotency for conversation ingest, audit logs, background jobs, health/readiness endpoints, custom API import, and OTRS/native helpdesk normalizers.

The next backend work should not be a rewrite. It should align the existing pieces into clearer contracts and production-oriented boundaries.

## Current Backend Audit

Validation performed during the audit:

- `npm run typecheck` passes.
- `npm run test` passes: 24 test files, 72 tests.
- `npm run build` passes.
- `npm run test:e2e` passes: 2 tests.
- The git worktree was clean before writing this spec.

Strengths:

- PostgreSQL is already the Prisma datasource and migrations include database guardrails.
- Core domain models cover workspaces, users, conversations, messages, scorecards, reviews, findings, calibration, training, integrations, jobs, report snapshots, idempotency keys, API tokens, sessions, and audit logs.
- `/api/v1` already exposes many useful resources: conversations, reviews, integrations, jobs, reports, auth providers, API tokens, audit logs, privacy redaction, health, readiness, and OpenAPI.
- Public ingest uses API token scopes, rate limiting, and idempotency for `POST /api/v1/conversations`.
- Background jobs support queue claiming, retries, stale lock recovery, job events, and integration import execution.
- Test coverage is meaningful for schema invariants, queue behavior, token service, normalizers, scoring, privacy, reporting, and core API ingest behavior.

Main gaps:

- Project notes still mention SQLite, while the implemented backend uses PostgreSQL.
- API behavior is inconsistent between legacy `/api/...` endpoints and newer `/api/v1/...` endpoints.
- Error responses, request IDs, auth failures, rate limit headers, and pagination metadata are not enforced through one route-level contract.
- OpenAPI is currently a manually assembled endpoint map, not a complete source of truth with shared schemas.
- Cookie-auth mutations need CSRF/origin protection and clearer production cookie policy.
- Background jobs need clearer production execution semantics: worker process contract, queue metrics, requeue behavior, scheduled cleanup, and operational visibility.
- Integration import works, but it needs cursor state, paging, per-source retry policy, diagnostics, progress reporting, and webhooks before it can be treated as a real sync engine.
- Several backend modules are large enough that future changes should split them along stable domain boundaries instead of adding more responsibilities into the same files.

## Chosen Approach

Use a Platform First approach in short phases.

The backend should mature in this order:

1. Backend foundation hardening.
2. Integration engine.
3. QA product backend.
4. AutoQA and automation readiness.

This order keeps risk under control. API consistency, auth hardening, jobs reliability, observability, database constraints, and tests are expensive to retrofit after more integrations and workflows depend on them.

## Target Architecture

Keep the existing Next.js App Router backend in `apps/web`. Keep Prisma/PostgreSQL and the existing domain modules. Introduce clearer boundaries around the code that already exists.

Target backend boundaries:

- API layer: route wrappers, request IDs, structured responses, structured errors, auth mapping, rate limit headers, pagination, idempotency handling.
- Domain layer: review, scorecard, integration, jobs, auth, privacy, reporting, and sampling behavior independent from route handlers.
- Persistence layer: Prisma repositories and query builders for complex workspace-scoped queries.
- Worker layer: background job runner, retry policy, stale recovery, scheduled cleanup, and operational metrics.
- Contracts layer: OpenAPI definitions, Zod request/response schemas, examples, and contract tests.

Legacy `/api/...` endpoints should become compatibility endpoints backed by the same services as `/api/v1`, or be explicitly deprecated once clients are migrated.

## Phase 1: Backend Foundation Hardening

Goal: make the backend safe, consistent, observable, and ready for larger product work.

Work items:

- Add a small route handler wrapper or shared route utilities for `/api/v1`.
- Standardize response shape, error shape, request ID propagation, Zod error formatting, auth failure formatting, pagination metadata, and rate-limit headers.
- Apply a consistent API token authentication path to public API routes.
- Apply a consistent session authentication and permission path to admin/user API routes.
- Add CSRF/origin protection for POST, PATCH, PUT, and DELETE routes that rely on browser cookies.
- Strengthen production cookie settings for auth and OIDC flow cookies.
- Update project documentation to match the PostgreSQL database reality.
- Move OpenAPI into a dedicated contracts module with shared schemas for errors, pagination, conversations, reviews, jobs, integrations, auth providers, reports, audit logs, and API tokens.
- Add contract tests that verify implemented routes match the published OpenAPI schemas.
- Expand route-level tests for auth, RBAC, invalid inputs, not-found cases, rate limits, and idempotency replay/conflict behavior.
- Extend audit coverage to every admin/server mutation that changes configuration, access, tokens, jobs, integrations, privacy state, scorecards, or workflow state.
- Normalize request/job observability around request IDs and redacted metadata.
- Separate "enqueue or trigger job" API behavior from worker execution behavior.
- Add failed-job requeue semantics, cancellation semantics, queue metrics, and scheduled retention cleanup.

Success criteria:

- `/api/v1` has one documented contract for success and error responses.
- Browser-auth mutations have explicit CSRF/origin protection.
- Legacy endpoints no longer contain divergent business logic.
- OpenAPI is complete enough for external clients and internal contract tests.
- Jobs can be operated as a production worker loop rather than only a local manual tool.
- Tests cover the highest-risk backend failure paths, not only happy paths.

## Phase 2: Integration Engine

Goal: evolve current import support into a reliable sync engine for real helpdesk and custom systems.

Work items:

- Add an integration capability model for each source: auth modes, paging support, cursor support, webhooks support, diagnostic operations, and payload limits.
- Replace the plain `syncCursor` usage with structured cursor state that can represent source-specific pagination and checkpoint data.
- Implement batch import progress in `IntegrationRun`: current page/cursor, checked count, imported count, skipped count, error count, and last successful checkpoint.
- Add per-source timeout and retry policies.
- Add connector diagnostics for base URL, auth, permissions, endpoint availability, route shape, payload shape, and common configuration errors.
- Add inbound webhook endpoints with signature verification for connector profiles that declare webhook signing support.
- Add outbound webhook delivery for `review.finalized`, `finding.created`, and `coaching.assigned`.
- Store webhook delivery attempts as jobs/events with retry state.
- Add fixture packs and contract tests for OTRS-family, Zendesk, Freshdesk, Intercom, HubSpot, and custom API profiles.

Success criteria:

- Integrations can resume safely after a failed batch.
- Operators can see why a connector is failing before running a full import.
- Webhook payloads are signed, auditable, and retryable.
- Connector behavior is covered by fixtures and source-specific contract tests.

## Phase 3: QA Product Backend

Goal: deepen the backend around daily QA operations, management reporting, and reviewer workflows.

Work items:

- Introduce a clear review lifecycle state machine for draft, finalize, reopen, appeal, and acknowledge. Do not add archive states in this roadmap unless a later product spec defines retention or deletion workflow requirements.
- Make review event history the authoritative timeline for workflow transitions.
- Strengthen scorecard version immutability for historical reviews.
- Expand coaching/training assignments with assignees, due dates, status transitions, completion evidence, reviewer notes, and acknowledgment.
- Add calibration metrics: reviewer agreement, criterion-level variance, score deltas, session summaries, and participant completion state.
- Build a sampling engine with rules, quotas, priority scoring, and explainable sampling reasons.
- Expand reporting snapshots into async exports with history, retention, filters, immutable metrics metadata, and scheduled report jobs.
- Add tests around lifecycle transitions, sampling decisions, calibration summaries, scorecard immutability, and report snapshot creation.

Success criteria:

- QA workflow rules are enforced server-side, not only by forms.
- Review history, appeals, coaching, training, and calibration can be audited.
- Reports are reproducible because filters and metrics are persisted immutably.
- Sampling decisions can be explained to admins and team leads.

## Phase 4: AutoQA And Automation Readiness

Goal: prepare the backend for AI-assisted scoring without weakening manual QA controls.

Work items:

- Add a separate AI review job type and queue.
- Store AI model version, prompt/config version, confidence, uncertainty reasons, and evidence message references.
- Keep AI review output as draft/recommendation until a human workflow accepts, rejects, or overrides it.
- Track human-vs-AI score deltas, finding agreement, and override reasons.
- Make quality knowledge entries retrieval-ready with stable metadata, source references, categories, and review provenance.
- Add audit events for AI-generated findings, AI score acceptance, AI override, and AI-driven automation actions.
- Add evaluation fixtures for AI scoring against known reviewed conversations.

Success criteria:

- No AI score becomes an opaque final decision.
- Every AI decision has evidence, versioning, confidence, timestamp, and human action history.
- AI behavior can be compared against human QA outcomes over time.

## Error Handling

API errors should use one structured format:

- machine-readable code;
- human-readable message;
- request ID;
- optional validation details;
- consistent HTTP status.

Domain errors should not leak raw implementation details. They should be mapped at the API boundary into public error codes. Validation errors should include field-level detail. Permission errors should distinguish unauthenticated from authenticated-but-forbidden callers.

Background job errors should be persisted as job events and summarized on the job record. Retriable and non-retriable failures should be explicit.

## Data Flow

Primary external ingest flow:

1. Client calls public API or connector job fetches source data.
2. Payload is validated with source-specific schema.
3. Source payload is normalized into the custom conversation contract.
4. Import service upserts conversation and messages idempotently.
5. Import run and job events record progress, skipped records, and failures.
6. Review queue reads normalized conversations through workspace-scoped repository queries.

Primary review flow:

1. Reviewer opens a conversation from the queue.
2. Backend loads conversation, messages, active scorecard, existing drafts, and workflow state.
3. Reviewer saves draft or finalizes review through server-side validation.
4. Backend writes review records, criterion scores, findings, coaching/training actions, audit logs, and review events in a transaction.
5. Reporting and outbound webhooks consume finalized review events.

## Security

Security priorities:

- Keep all queries workspace-scoped.
- Keep API token scopes explicit and tested.
- Add CSRF/origin protection for cookie-auth mutations.
- Do not store plain API tokens or connector secrets.
- Support secret rotation and document `QC_SECRET_KEY` production requirements.
- Redact tokens, secrets, passwords, authorization headers, and sensitive metadata in audit and logs.
- Make demo auth impossible in production unless explicitly enabled.
- Keep privacy redaction irreversible for user-facing text fields.

## Testing Strategy

Testing should scale with backend risk:

- Unit tests for pure domain logic, scoring, validation, normalizers, cursor state, and lifecycle state machines.
- API route tests for auth, RBAC, validation, rate limits, idempotency, and response contracts.
- Integration tests against PostgreSQL for schema constraints, transactions, job claiming, and data integrity.
- Connector fixture tests for every supported source profile.
- E2E tests only for key user-visible backend workflows: login, review finalization, integration queueing, report export, and admin operations.
- Contract tests that compare route behavior and examples against OpenAPI.

## Documentation

Required documentation updates in Phase 1:

- Update project notes to say the local database is PostgreSQL via Docker Compose, not SQLite.
- Document environment variables: `DATABASE_URL`, `QC_SECRET_KEY`, demo auth controls, OIDC/Entra secrets, and connector secrets.
- Document API authentication, scopes, idempotency, rate limits, request IDs, error format, and pagination.
- Document the worker process and recommended production schedule for retention cleanup and integration jobs.

## Out Of Scope

This roadmap does not include a frontend redesign, a database provider switch, a rewrite into a separate backend service, or immediate AI scoring implementation. Those may become future projects, but the current backend should first become more consistent and reliable within the existing app structure.
