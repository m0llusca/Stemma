# Jira, YDB, and YTsaurus Import Integrations Design

Date: 2026-05-27

## Summary

Add three import integrations:

- Jira Service Management as an extension of the already implemented Phase B helpdesk adapter layer.
- YDB as a tabular data source that imports conversation/message rows into the existing QC import pipeline.
- YTsaurus/YT as a tabular data source that imports table rows into the same conversation contract.

The existing Phase B work is not being reimplemented. Phase B already exists in `apps/web/src/lib/integrations/helpdesk-adapters` with adapter contracts, fixtures, capabilities, live-smoke gating, and normalizers for current helpdesk/enterprise sources. This scope extends that layer with Jira and adds a separate `data_source` integration category for YDB/YTsaurus because they are data platforms, not helpdesk products.

## Goals

- Add Jira to the existing native helpdesk setup flow, catalog, runner, normalizer, fixtures, tests, and readiness reporting.
- Add YDB and YTsaurus as first-class import sources for teams that store conversations in internal data platforms.
- Reuse the existing `CustomConversationInput` validation and import pipeline.
- Improve the stack where it directly improves this work: add typed internal APIs and better server-state handling instead of preserving demo-era code by default.
- Preserve current certification semantics: docs and stub tests can certify adapter contracts, but live certification remains gated by protected credentials.

## Non-Goals

- Do not replace PostgreSQL/Prisma with YDB.
- Do not run YTsaurus MapReduce or long-running operations in this slice.
- Do not migrate every existing API route, server action, or screen to the new client/server stack in this slice.
- Do not complete the Auth.js migration inside the Jira/YDB/YTsaurus integration implementation unless the project is explicitly reprioritized around auth first.
- Do not mark Jira/YDB/YTsaurus production-ready until live smoke tests run against real protected environments.

## Existing Architecture

The app already has:

- `Integration` and `IntegrationCredential` persistence via Prisma.
- OTRS-family production import flow.
- Phase B helpdesk adapter contracts under `apps/web/src/lib/integrations/helpdesk-adapters`.
- Integration capabilities exposed through `apps/web/src/lib/integrations/capabilities.ts`.
- A unified import runner in `apps/web/src/lib/integrations/runner.ts`.
- Zod validation through `CustomConversationInput`.
- Unit, API, E2E, and live-smoke test layers.

The new work should follow these patterns rather than creating a parallel import system.

## Jira Design

Jira should be added to the existing Phase B native helpdesk layer.

Source contract:

- `source`: `jira`
- `type`: `native_helpdesk`
- `displayName`: `Jira Service Management`
- First supported auth mode: Basic API token.
- Required secret: `auth_password`, storing the existing Basic credential format used by other native adapters.
- Readiness: `adapter_ready` after docs, contract, and stub tests pass; live stays `waiting_for_access`.

Adapter behavior:

- Add `jira` to `PhaseBHelpdeskSource`.
- Add `createJiraAdapter()` under `apps/web/src/lib/integrations/helpdesk-adapters/jira.ts`.
- Fetch a Jira Service Management request/issue and its comments.
- Normalize the request/issue into one conversation and comments into messages.
- Preserve public vs internal comments through `isPrivate`.
- Use existing diagnostics and redaction behavior from `createHelpdeskHttpClient`.

Docs evidence:

- Jira Service Management request objects include `issueId`, `issueKey`, reporter, current status, request fields, and pagination metadata.
- Request comments are available under the service desk request comments API; customer access only sees public comments, while licensed agents can see internal and public comments.
- The adapter should document this visibility limitation and require agent-level credentials for complete QA sampling.

## Data Source Layer

YDB and YTsaurus should not be modeled as `native_helpdesk`. Add a new integration capability type:

- `data_source`

This category represents systems that return rows rather than helpdesk objects. It should still feed the same import pipeline after a dedicated row-to-conversation normalizer.

New module boundary:

- `apps/web/src/lib/integrations/data-source-adapters/types.ts`
- `apps/web/src/lib/integrations/data-source-adapters/source-contracts.ts`
- `apps/web/src/lib/integrations/data-source-adapters/service.ts`
- `apps/web/src/lib/integrations/data-source-adapters/ydb.ts`
- `apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts`
- `apps/web/src/lib/normalizers/tabular-conversations.ts`

This keeps the helpdesk adapter model focused and lets tabular sources evolve independently.

## Tabular Mapping Contract

The first slice uses a fixed column contract. Each row represents one message. Rows with the same `conversation_id` are grouped into one `CustomConversationInput`.

Required fields:

- `conversation_id`
- `message_id`
- `author_name`
- `participant_type`
- `body`
- `sent_at`

Optional fields:

- `subject`
- `status`
- `channel`
- `customer_name`
- `assignee_name`
- `external_url`
- `tags`
- `is_private`
- `opened_at`
- `closed_at`
- `sampling_reason`
- `risk_hint`

Normalizer rules:

- Group rows by `conversation_id`.
- Sort messages by `sent_at`.
- Validate participant type against the existing message schema.
- Default channel to `ticket`.
- Use the first non-empty subject per conversation, otherwise derive a short subject from the first message.
- Reject rows without required fields before database writes.
- Enforce row, payload, and response-size limits before normalization.

## YDB Design

YDB uses the official JavaScript/TypeScript SDK.

Runtime behavior:

- Store endpoint/database and query config in `Integration.configJson`.
- Store secrets in `IntegrationCredential`; first slice supports static username/password or token-like credential through a dedicated credential slot.
- Create the YDB driver inside the import run and close it in `finally`, matching the SDK guidance for server/serverless runtimes.
- Execute configured YQL through the SDK template/query APIs with parameters for limit/cursor where applicable.
- Never concatenate user-provided values into YQL.
- Validate configured result rows through the tabular mapping contract.

Dependency impact:

- Add only the YDB SDK packages needed for server-side querying.
- Do not change the app database provider.

## YTsaurus Design

YTsaurus uses the HTTP API for the first slice.

Runtime behavior:

- Store proxy URL and table path in `Integration.configJson`.
- Store OAuth token in `IntegrationCredential`.
- Read table data via `GET /api/v3/read_table?path=<table_path>`.
- Request JSON output where supported.
- Apply max response-size and row-count limits.
- Validate table path and proxy URL before requests.
- Normalize response rows through the same tabular mapping contract.

Deferred:

- MapReduce operations.
- Dynamic table transactions.
- Write/export flows.
- Python/CLI-based ingestion.

## UI Design

Extend the integration setup workspace with a new source mode:

- `Табличные источники`

Options:

- YDB
- YTsaurus/YT

The setup should collect:

- Base URL or endpoint.
- Database/table path.
- Auth mode and secret.
- Import limit and batch size.
- Query/table preview parameters.
- A short mapping checklist explaining required columns.

Existing certification/readiness chips should be reused. YDB/YTsaurus should show adapter-ready status after docs and stub tests, not production-ready status.

New interactive integration screens should use the revised client stack:

- tRPC for internal admin/integration procedures that are consumed only by this Next.js app.
- TanStack Query for remote state, mutations, cache invalidation, and polling of diagnostics/import-run status.
- Zustand only for complex local wizard state that currently turns into large prop chains or broad `useState` clusters.

Public integration endpoints remain REST/OpenAPI because external systems and operators need stable documented HTTP contracts.

## API and OpenAPI

Update the integration capability schema:

- Add `data_source` to `IntegrationCapabilityType`.
- Include YDB and YTsaurus capabilities in the catalog route.
- Document payload limits, required secrets, operations, and live-smoke environment variables.

The public custom API contract remains unchanged because these integrations import into the existing internal conversation model.

## Error Handling and Security

- Redact tokens, passwords, authorization headers, YDB credentials, YTsaurus OAuth tokens, table paths with embedded credentials, and query parameters that look secret-like.
- Reject unsafe YTsaurus URLs and non-HTTP(S) proxy values.
- Require explicit admin permission for setup and import.
- Enforce max response bytes in adapters.
- Enforce row limits before normalization and before database writes.
- Store only non-secret config in `configJson`.
- Keep live smoke tests opt-in via protected environment variables.

## Testing

Follow test-driven implementation.

Required tests:

- Jira contract test adds `jira` to the Phase B source list.
- Jira fixture server covers request/issue and comments endpoints.
- Jira adapter test proves endpoint usage, Basic auth, redacted diagnostics, and public/internal comment mapping.
- Jira normalizer test validates message grouping and `isPrivate`.
- Data source contract tests cover YDB/YTsaurus capabilities, certification gates, and OpenAPI enum changes.
- Tabular normalizer tests cover grouping, sorting, required-field errors, defaults, and malformed rows.
- YDB adapter tests mock SDK behavior and assert driver close on success and failure.
- YTsaurus adapter tests use a local HTTP fixture and assert token redaction, path encoding, response limits, and malformed JSON handling.
- Runner/service tests prove `data_source` integrations route through the new service, not the helpdesk service.
- UI tests cover the new source mode and required setup fields.

Verification commands:

- `npm run typecheck`
- `npm run test`
- Targeted E2E only if UI flow changes require it.

## Stack Decision

Use the existing stack as the base, but do not preserve demo-era architecture when a newer tool clearly improves the project.

Baseline:

- Next.js 16 and React 19
- Prisma/PostgreSQL
- Zod
- Tailwind 3 for now
- Vitest
- Playwright

Selected additions:

- YDB JavaScript/TypeScript SDK packages, server-side only.
- tRPC for new internal admin/integration procedures.
- TanStack Query through the tRPC React integration for integration setup, diagnostics, import-run actions, cache invalidation, and polling.
- Zustand for integration wizard local state only if it reduces the current large client component state surface.

Auth decision:

- Auth.js v5 is a better long-term authentication foundation than maintaining custom demo-session plumbing.
- Auth.js should own sign-in/session/provider plumbing in a separate auth modernization plan.
- Product authorization, workspace permissions, SCIM provisioning, audit events, and group policy remain application concerns layered above Auth.js.
- SAML can be addressed through an Auth.js-compatible provider/integration where appropriate, but it does not remove the need for local group/role mapping.

Deferred:

- shadcn/ui and Tailwind v4: separate migration/design-system decision.
- Sentry/OpenTelemetry: valuable production hardening, but separate from integration delivery.

## Rollout

1. Add tRPC/TanStack Query foundations for new internal integration workflows.
2. Refactor only the integration setup/run interactions that benefit from typed procedures, mutations, invalidation, or polling.
3. Add Jira to existing Phase B helpdesk contracts and tests.
4. Add tabular normalizer and `data_source` capability model.
5. Add YTsaurus HTTP adapter because it has no package-install dependency.
6. Add YDB adapter and SDK dependencies.
7. Extend setup UI and catalog/OpenAPI.
8. Run full typecheck and unit tests.
9. Leave live smoke tests documented but skipped until real credentials are available.

## Self-Review

- No placeholder requirements remain.
- Phase B is described as existing work and is not re-scoped as new implementation.
- Jira and data-platform integrations have separate module boundaries.
- The first YDB/YTsaurus slice is import-only and does not include storage replacement or export.
- The stack decision no longer rejects tRPC/TanStack/Zustand merely because older code exists.
- Auth.js is treated as a recommended separate modernization track because it changes app-wide auth/session behavior, while the current spec is scoped to imports.
