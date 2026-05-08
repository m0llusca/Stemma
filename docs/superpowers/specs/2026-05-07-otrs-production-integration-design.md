# OTRS Production Integration Design

Date: 2026-05-07

## Goal

Build a production-ready vertical slice for a real OTRS Community Edition 6.x integration test.

The slice must prove end-to-end connectivity across:

- OTRS CE 6 GenericInterface WebService configuration.
- Backend connector diagnostics and import runner.
- PostgreSQL persistence for integration state, diagnostics, run items, conversations, messages, jobs, and audit.
- Admin UI setup, health, diagnostics, preview, selected import, and run history.
- Review queue visibility for imported OTRS tickets.
- Stub, DB, E2E, and gated live smoke tests.

This is not a generic payload paste feature. The target is a real connector cockpit that can diagnose a live OTRS instance, preview tickets, import selected tickets, and leave enough evidence to debug failures without leaking credentials.

## Current State

The app already has useful pieces:

- `Integration`, `IntegrationCredential`, `IntegrationRun`, `BackendJob`, `Conversation`, and `Message` models.
- A generic integration setup wizard at `/admin/integrations`.
- OTRS-family payload normalizers in `apps/web/src/lib/normalizers/otrs-family.ts`.
- A token-protected legacy endpoint for pasted TicketGet payloads: `POST /api/integrations/otrs-family/tickets`.
- A manual OTRS payload tester UI.
- Background jobs for queued integration import.
- A runner path that can call OTRS TicketGet for a configured `ticketId`.

The missing production pieces are:

- No first-class OTRS connector module boundary.
- No structured OTRS config contract beyond generic `configJson`.
- No stored diagnostic runs or diagnostic steps.
- No per-ticket preview/import run items.
- No real TicketSearch batch preview.
- No selected import flow.
- No CA bundle support for self-hosted internal TLS.
- No OTRS WebService template/checklist surfaced as a first-class setup artifact.
- No full UI cockpit for live diagnostics, preview, import, and history.
- No ordinary CI stub server coverage for OTRS WebService failure modes.
- No gated live smoke harness for a real OTRS CE 6 instance.

Context7 documentation lookup for Znuny GenericInterface confirms the route pattern used by current OTRS-family assumptions: a WebService URL under `nph-genericinterface.pl/Webservice/...`, TicketSearch accepting `UserLogin` and `Password`, and search responses returning `TicketID` arrays. OTRS CE 6 remains the tested primary target for this design; Znuny and OTOBO stay compatible profiles until separately smoke-tested.

## Chosen Approach

Use the **Full Integration Platform Slice**.

This is larger than a diagnostics-only or runner-only change, but it is the right production-grade slice because the goal is a real integration test, not just a code path. The implementation should prove:

1. OTRS WebService configuration can be described and validated.
2. Credentials and CA material are stored safely.
3. Live diagnostics can explain failures before import.
4. TicketSearch and manual TicketID preview both work.
5. Selected import writes review-queue records.
6. UI and DB history make the run auditable and debuggable.
7. Stub and live smoke tests can exercise the same connector paths.

## Target Flow

1. Admin opens OTRS connector setup.
2. UI presents OTRS CE 6 GenericInterface WebService template/checklist.
3. Admin enters Base URL, WebService name, UserLogin, password, optional internal CA bundle, and route overrides if needed.
4. Backend saves non-secret config in `Integration.configJson` and secret material in `IntegrationCredential`.
5. Admin runs diagnostics.
6. Backend executes ordered checks:
   - config shape;
   - TLS/CA;
   - WebService URL;
   - auth;
   - TicketSearch;
   - TicketGet;
   - response shape;
   - normalization;
   - DB dry-run readiness.
7. UI displays per-step pass/warn/error with redacted details and remediation hints.
8. Admin creates preview by manual TicketID list or TicketSearch filters.
9. Backend fetches TicketGet payloads, normalizes all articles, preserves private flags, maps attachments as external OTRS links, detects duplicates, and stores preview items.
10. Admin selects preview items to import.
11. Backend imports selected tickets into `Conversation` and `Message`, updates run items, writes audit, and links imported conversations.
12. `/reviews` shows imported OTRS tickets by source/external ID filters.

## Architecture

Create a dedicated connector module:

```text
apps/web/src/lib/integrations/otrs-family/
```

Responsibilities:

- `config.ts`: versioned Zod config schema, defaults, migration helpers.
- `profiles.ts`: OTRS CE 6 profile first; Znuny/OTOBO future profiles.
- `client.ts`: low-level HTTP client with timeout, response-size limit, TLS CA support, redacted errors.
- `requests.ts`: TicketSearch and TicketGet request builders.
- `diagnostics.ts`: ordered diagnostic checks and step result generation.
- `normalization.ts`: wrapper around current OTRS normalizer plus warnings.
- `attachments.ts`: external attachment link metadata builder; no file download or storage.
- `import-plan.ts`: preview and selected import planning.
- `service.ts`: stable public API used by server actions and jobs.

Existing files keep narrower roles:

- `integration-actions.ts`: server-action facade for forms and UI state.
- `integrations/runner.ts`: backend job orchestration and status updates.
- `normalizers/otrs-family.ts`: payload-to-conversation normalization primitives.
- Prisma models: persistence boundary.

This boundary prevents OTRS legacy behavior from bloating the generic integration runner.

## Data Model

### Typed OTRS Config

`Integration.configJson` becomes a versioned connector config for OTRS:

```ts
{
  connector: "otrs_family",
  configVersion: 1,
  product: "otrs_ce_6",
  webServiceName: "GenericTicketConnectorREST",
  basePath: "/otrs",
  routes: {
    ticketSearchPath: "/Ticket",
    ticketGetPath: "/Ticket/{TicketID}",
    ticketSearchMethod: "POST",
    ticketGetMethod: "GET"
  },
  requestMode: {
    ticketSearch: "post_json",
    ticketGet: "get_query"
  },
  articlePolicy: {
    importAllArticles: true,
    preservePrivateFlag: true
  },
  attachmentPolicy: {
    mode: "external_links_only"
  },
  limits: {
    searchLimit: 50,
    manualTicketIdLimit: 20,
    batchSize: 25,
    requestTimeoutMs: 15000,
    maxResponseBytes: 5000000
  },
  tls: {
    caBundleSecretId: null,
    caFingerprint: null
  },
  advanced: {
    routeOverridesEnabled: false
  }
}
```

`configJson` must never contain passwords, API secrets, CA bundle contents, session IDs, or raw auth query strings.

### Secret Boundary

The current schema has one `IntegrationCredential` per integration. Production OTRS needs independent secret slots, so the credential model must evolve to one encrypted row per secret kind.

Target credential fields:

- `integrationId`
- `kind`: `auth_password`, `ca_bundle`
- `authMode`: `user_password`, `ca_bundle`
- `encryptedSecret`
- `keyVersion`
- `fingerprint`
- `lastRotatedAt`
- `createdAt`
- `updatedAt`

Unique constraint:

- `@@unique([integrationId, kind])`

Migration rule:

- Existing `IntegrationCredential` rows become `kind = "auth_password"`.
- Optional CA bundle is a separate `kind = "ca_bundle"` row.

UI may show `hasCredential`, `hasCaBundle`, `authMode`, `fingerprint`, and `lastRotatedAt`, but never secret values.

### New Tables

Add `IntegrationDiagnosticRun`:

- `id`
- `workspaceId`
- `integrationId`
- `actorId`
- `status`: `running`, `succeeded`, `warning`, `failed`
- `mode`: `diagnostics`, `manual_ticket_ids`, `ticket_search`
- `startedAt`
- `finishedAt`
- `summaryJson`
- `redactedEndpoint`
- `errorCode`
- `errorMessage`

Add `IntegrationDiagnosticStep`:

- `id`
- `diagnosticRunId`
- `key`: `config`, `tls`, `webservice`, `auth`, `ticket_search`, `ticket_get`, `normalize`, `db_dry_run`
- `status`: `ok`, `warn`, `error`, `skipped`
- `durationMs`
- `detailJson`
- `remediationHint`
- `createdAt`

Add `IntegrationRunItem`:

- `id`
- `workspaceId`
- `integrationRunId`
- `diagnosticRunId`
- `externalId`
- `ticketNumber`
- `status`: `previewed`, `selected`, `imported`, `skipped`, `failed`
- `articleCount`
- `privateArticleCount`
- `attachmentCount`
- `warningsJson`
- `errorsJson`
- `conversationId`
- `normalizedPreviewJson`
- `createdAt`
- `updatedAt`

`IntegrationRunItem` is the bridge between preview, selected import, and imported conversations.

## OTRS Connector Behavior

### Diagnostics

Diagnostics must be ordered and persisted. A failed early step may skip later steps, but the run should still store enough evidence to diagnose the failure.

Step expectations:

- `config`: parse config and route profile.
- `tls`: prove HTTPS connection with configured CA.
- `webservice`: build final WebService URL.
- `auth`: perform a low-risk request or first authenticated request.
- `ticket_search`: run TicketSearch with safe filters when available.
- `ticket_get`: fetch one known or searched TicketID.
- `normalize`: produce conversation preview and warnings.
- `db_dry_run`: verify the import plan can map to existing DB constraints without writing conversations.

### Preview Modes

Manual TicketID mode:

- Admin enters 1-20 TicketIDs.
- Backend runs TicketGet for each.
- Partial failures are stored per item.

TicketSearch mode:

- Admin enters queue, state/status, date range, and limit.
- Backend runs TicketSearch.
- Backend runs TicketGet for returned TicketIDs up to the configured limit.
- Partial failures are stored per item.

### Import Policy

All OTRS articles are imported. Internal or service articles are preserved as private messages via `isPrivate`, not discarded.

Attachments are not downloaded and not stored. The connector stores attachment metadata and an external OTRS link when the link can be built safely.

Selected import writes only user-selected preview items. Re-running selected import is idempotent by workspace/source/external ID and updates existing conversations/messages.

## Error Model

Connector errors should use stable categories:

- `CONFIG_INVALID`
- `TLS_FAILED`
- `AUTH_FAILED`
- `WEBSERVICE_NOT_FOUND`
- `TICKET_SEARCH_FAILED`
- `TICKET_GET_FAILED`
- `RESPONSE_SHAPE_INVALID`
- `NORMALIZATION_FAILED`
- `DB_WRITE_FAILED`
- `RATE_LIMITED`
- `TIMEOUT`

Each persisted error should include:

- error code;
- redacted message;
- remediation hint;
- source step;
- whether retry is useful.

No raw password, auth query, session token, or CA content may appear in error details.

## Frontend UX

Split the current overloaded integrations page into a clearer structure:

- `/admin/integrations`: overview of sources, health, latest run, quick actions.
- `/admin/integrations/new`: connector setup wizard.
- `/admin/integrations/[integrationId]`: OTRS cockpit with diagnostics, preview/import, run history, and settings.

### Setup Wizard

OTRS setup wizard steps:

1. Product profile: OTRS CE 6 first.
2. WebService setup: template/YAML and checklist.
3. Access: Base URL, WebService name, UserLogin, password, optional CA bundle.
4. Policies: article handling, attachment external links, limits.
5. Diagnostics: live checks with per-step result.
6. Save/activate: only after diagnostics success or explicit admin acceptance of warnings.

### OTRS Cockpit

The detail page shows:

- health badge: `ok`, `warn`, `error`, `not_checked`;
- latest diagnostic run;
- step list with remediation hints;
- redacted endpoint summary;
- manual TicketID preview form;
- TicketSearch preview form;
- preview table with selectable rows;
- selected import action;
- run history and per-ticket items;
- links to backend job, audit event, and imported conversations.

Preview table columns:

- TicketID;
- TicketNumber;
- title;
- queue;
- state;
- created/changed;
- article count;
- private article count;
- attachment count;
- warnings;
- duplicate status;
- selected checkbox.

## Security

Production security rules:

- Secrets only in encrypted `IntegrationCredential`.
- CA bundle is treated as sensitive material unless explicitly stored as public fingerprint metadata.
- No secret values in `configJson`, `BackendJob.payloadJson`, `IntegrationRun.errorMessage`, audit metadata, browser state, screenshots, or tests.
- All logs use redacted URLs and redacted request/response excerpts.
- Admin-only permissions for setup, diagnostics, preview, selected import, and credential rotation.
- Every mutation writes audit:
  - config saved;
  - credential rotated;
  - diagnostics started/completed;
  - preview created;
  - selected import executed.
- Internal CA bundle is supported; normal insecure TLS bypass is not a supported production path.

## Operations

Operational limits:

- request timeout;
- max response bytes;
- max manual TicketIDs;
- max TicketSearch results;
- max articles per ticket;
- max attachment metadata per ticket;
- batch size;
- retry policy for transient failures.

The system must surface partial failures. If TicketSearch returns 20 IDs and 2 TicketGet calls fail, the preview should show 18 usable items and 2 failed items, not hide the whole run.

Run history must store enough redacted evidence to answer:

- Which WebService route was called?
- Which TicketIDs were found?
- Which TicketIDs failed?
- Which tickets were selected?
- Which conversations were created or updated?
- Which step failed and what should the operator fix?

## Testing Strategy

### Unit And Contract Tests

Cover:

- OTRS config schema/defaults.
- URL and request builders.
- redaction helpers.
- error taxonomy.
- TicketSearch response parsing.
- TicketGet normalization.
- private/public article handling.
- attachment metadata/link mapping.
- duplicate detection.
- selected import planning.

### Stub Integration Tests

Create a local OTRS GenericInterface stub server for ordinary CI.

Scenarios:

- TicketSearch success.
- TicketGet success.
- auth failed.
- WebService route not found.
- invalid JSON.
- malformed TicketGet response.
- timeout.
- partial TicketGet failures.
- attachment metadata present.

### DB Integration Tests

Use PostgreSQL test DB for:

- diagnostic run and steps persistence;
- preview run item persistence;
- selected import creating conversations/messages;
- duplicate selected import updating existing records;
- secret and CA redaction invariants;
- audit events for all mutations.

### E2E Tests

Playwright path:

1. Admin creates OTRS CE 6 integration against stub.
2. Runs diagnostics.
3. Sees step results.
4. Previews manual TicketIDs.
5. Imports selected ticket.
6. Verifies imported ticket in `/reviews?source=otrs`.
7. Opens integration detail history and sees run item status.

### Gated Live Smoke

Real OTRS CE 6 smoke test is opt-in only:

- `OTRS_LIVE_SMOKE=1`;
- live Base URL, UserLogin, password, CA material, and test TicketIDs from protected env/secrets;
- default mode is read-only diagnostics and preview;
- selected import requires a second explicit flag, `OTRS_LIVE_IMPORT=1`, and must target an isolated workspace/test queue;
- no live smoke secrets in normal CI logs or snapshots.

## Acceptance Criteria

The production slice is complete when:

- OTRS CE 6 WebService template/checklist exists in UI.
- Admin can save OTRS config and encrypted credentials.
- Internal CA bundle is supported without disabling TLS verification.
- Live diagnostics persists run and step results.
- Manual TicketID preview works.
- TicketSearch preview works.
- Preview shows all articles, private flags, attachment external-link metadata, duplicates, warnings, and failures.
- Selected import creates or updates `Conversation` and `Message`.
- Imported OTRS tickets are visible in review queue filters.
- Integration detail page shows health, diagnostics, preview/import history, and run items.
- Audit covers all OTRS connector mutations.
- Stub tests, DB tests, and E2E tests pass in ordinary CI.
- Gated live smoke can run against the real OTRS CE 6 instance without leaking credentials.

## Out Of Scope

- Downloading or storing attachment file contents.
- Normal production insecure TLS bypass.
- Full Znuny and OTOBO live certification.
- Scheduled continuous sync beyond manual selected import and controlled preview/import runs.
- Webhook ingestion from OTRS events.
- AutoQA scoring of imported tickets.
