# OTRS Production Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved production-ready OTRS CE 6 vertical slice: typed connector config, encrypted secret slots, persisted diagnostics, TicketSearch/manual preview, selected import, admin cockpit UI, stub coverage, and gated live smoke testing.

**Architecture:** Keep the Next.js App Router app in `apps/web`. Add a dedicated OTRS-family connector module under `apps/web/src/lib/integrations/otrs-family/` and let existing generic integration files act as facades: server actions handle forms, jobs handle orchestration, Prisma holds durable evidence, and current normalizers remain the payload-to-review-queue conversion layer.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, PostgreSQL, Zod, Node HTTP/TLS, Vitest, Playwright, Docker Compose, npm.

---

## Scope

This plan implements `docs/superpowers/specs/2026-05-07-otrs-production-integration-design.md`.

Primary production target is OTRS Community Edition 6.x GenericInterface. Znuny and OTOBO profiles may stay selectable compatibility profiles, but this plan only requires OTRS CE 6 stub/live proof.

Non-goals:

- No automatic OTRS WebService creation through OTRS admin APIs.
- No attachment file download or local attachment blob storage.
- No insecure TLS bypass. Internal TLS is supported through a CA bundle secret.
- No continuous scheduler/polling beyond existing backend job execution.
- No live import unless `OTRS_LIVE_IMPORT=1` is explicitly set in addition to live smoke credentials.

## Execution Rules

- Start each task by adding or tightening failing tests before production code.
- Keep commits task-scoped. The plan includes a commit command at the end of every task.
- Use `npm install` from `apps/web` only if dependencies are missing; do not add a new HTTP client package unless a task explicitly requires it.
- Use the existing Postgres workflow: `npm run db:up`, `npm run db:migrate -- --name <name>`, `npm run db:generate`.
- After Task 4, pause for review before proceeding to Task 5 when executing with subagents.
- Preserve old manual payload import behavior until the new cockpit fully replaces it.

## File Structure

Create this connector boundary:

- `apps/web/src/lib/integrations/otrs-family/config.ts`
- `apps/web/src/lib/integrations/otrs-family/profiles.ts`
- `apps/web/src/lib/integrations/otrs-family/credentials.ts`
- `apps/web/src/lib/integrations/otrs-family/errors.ts`
- `apps/web/src/lib/integrations/otrs-family/client.ts`
- `apps/web/src/lib/integrations/otrs-family/requests.ts`
- `apps/web/src/lib/integrations/otrs-family/diagnostics.ts`
- `apps/web/src/lib/integrations/otrs-family/normalization.ts`
- `apps/web/src/lib/integrations/otrs-family/attachments.ts`
- `apps/web/src/lib/integrations/otrs-family/import-plan.ts`
- `apps/web/src/lib/integrations/otrs-family/service.ts`

Modify these backend facades:

- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/seed.ts`
- `apps/web/src/lib/integration-actions.ts`
- `apps/web/src/lib/integration-import-service.ts`
- `apps/web/src/lib/integrations/runner.ts`
- `apps/web/src/lib/jobs/queue.ts`
- `apps/web/src/app/api/v1/integrations/route.ts`
- `apps/web/src/app/api/v1/integrations/[integrationId]/diagnostics/route.ts`
- `apps/web/src/app/api/v1/integrations/[integrationId]/preview/route.ts`
- `apps/web/src/app/api/v1/integrations/[integrationId]/import/route.ts`

Modify or add UI units:

- `apps/web/src/app/admin/integrations/page.tsx`
- `apps/web/src/app/admin/integrations/new/page.tsx`
- `apps/web/src/app/admin/integrations/[integrationId]/page.tsx`
- `apps/web/src/components/integrations/integration-setup-workspace.tsx`
- `apps/web/src/components/integrations/otrs-setup-wizard.tsx`
- `apps/web/src/components/integrations/otrs-webservice-checklist.tsx`
- `apps/web/src/components/integrations/otrs-connection-form.tsx`
- `apps/web/src/components/integrations/otrs-diagnostics-panel.tsx`
- `apps/web/src/components/integrations/otrs-preview-panel.tsx`
- `apps/web/src/components/integrations/otrs-run-history.tsx`

Add test and live-smoke support:

- `apps/web/tests/unit/otrs-family-config.test.ts`
- `apps/web/tests/unit/otrs-family-credentials.test.ts`
- `apps/web/tests/unit/otrs-family-client.test.ts`
- `apps/web/tests/unit/otrs-family-diagnostics.test.ts`
- `apps/web/tests/unit/otrs-family-import-plan.test.ts`
- `apps/web/tests/unit/integration-actions-otrs.test.ts`
- `apps/web/tests/unit/job-queue.test.ts`
- `apps/web/tests/unit/prisma-schema.test.ts`
- `apps/web/tests/fixtures/otrs-genericinterface-server.ts`
- `apps/web/tests/fixtures/otrs-ticket-fixtures.ts`
- `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`
- `apps/web/src/scripts/otrs-live-smoke.ts`
- `docs/otrs-live-smoke.md`
- `.github/workflows/otrs-live-smoke.yml`

## Task 1: Add Typed OTRS Config And Profiles

**Files:**

- Create: `apps/web/src/lib/integrations/otrs-family/config.ts`
- Create: `apps/web/src/lib/integrations/otrs-family/profiles.ts`
- Modify: `apps/web/src/lib/normalizers/otrs-family.ts`
- Test: `apps/web/tests/unit/otrs-family-config.test.ts`

- [x] **Step 1: Write failing config/profile tests**

Add tests that prove:

- minimal OTRS CE 6 config is expanded with production defaults;
- default WebService name is the current profile value `GenericTicketConnectorREST`;
- route overrides are accepted only when `advanced.routeOverridesEnabled` is true;
- config parsing rejects `password`, `Password`, `sessionId`, `SessionID`, `token`, `caBundle`, and raw auth query strings anywhere inside `configJson`;
- final GenericInterface base URL is built as `/nph-genericinterface.pl/Webservice/<WebServiceName>`;
- limits clamp to safe maximums: search <= 100, manual IDs <= 50, batch <= 50, response bytes <= 10 MB.

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-config.test.ts
```

Expected: FAIL because `@/lib/integrations/otrs-family/config` and `profiles` do not exist.

- [x] **Step 2: Implement `profiles.ts`**

Move profile-oriented data out of the normalizer without breaking old imports. Keep OTRS CE 6 first:

```ts
export const otrsFamilyProfiles = {
  otrs_ce_6: {
    product: "otrs_ce_6",
    source: "otrs",
    label: "OTRS Community Edition 6",
    basePath: "/otrs",
    webServiceName: "GenericTicketConnectorREST",
    ticketSearchPath: "/Ticket",
    ticketGetPath: "/Ticket/{TicketID}",
    ticketSearchMethod: "POST",
    ticketGetMethod: "GET",
    ticketZoomPath: "/index.pl?Action=AgentTicketZoom;TicketID=<TicketID>"
  }
} as const;
```

Compatibility profiles for `znuny_lts` and `otobo` may remain in the same file, but all defaults used by the production connector must resolve through `otrs_ce_6`.

- [x] **Step 3: Implement `config.ts`**

Use Zod and export:

- `otrsConnectorConfigSchema`;
- `parseOtrsConnectorConfig(value: string | unknown)`;
- `buildDefaultOtrsConnectorConfig(product?: OtrsProduct)`;
- `assertNoOtrsSecretsInConfig(value: unknown)`;
- `buildOtrsWebServiceBaseUrl(input)`;
- `redactOtrsConfigForUi(config)`.

The parsed config shape must match the approved spec:

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

- [x] **Step 4: Re-export existing normalizer profile APIs**

Keep existing imports working by making `apps/web/src/lib/normalizers/otrs-family.ts` re-export or delegate profile helpers. Existing tests in `tests/unit/otrs-family-normalizer.test.ts` must continue to pass.

- [x] **Step 5: Verify and commit**

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-config.test.ts tests/unit/otrs-family-normalizer.test.ts
npm run typecheck
git add apps/web/src/lib/integrations/otrs-family apps/web/src/lib/normalizers/otrs-family.ts apps/web/tests/unit/otrs-family-config.test.ts docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "add typed otrs connector config"
```

Expected: both tests and typecheck exit `0`.

## Task 2: Evolve Credentials Into Secret Slots

**Files:**

- Create: `apps/web/src/lib/integrations/otrs-family/credentials.ts`
- Modify: `apps/web/prisma/schema.prisma`
- Add migration: `apps/web/prisma/migrations/<timestamp>_add_integration_credential_kinds/migration.sql`
- Modify: `apps/web/prisma/seed.ts`
- Modify: `apps/web/src/lib/integration-actions.ts`
- Modify: `apps/web/src/lib/integrations/runner.ts`
- Modify: `apps/web/src/app/api/v1/integrations/route.ts`
- Test: `apps/web/tests/unit/otrs-family-credentials.test.ts`
- Test: `apps/web/tests/unit/prisma-schema.test.ts`

- [x] **Step 1: Write failing credential tests**

Cover:

- upsert of `auth_password` and `ca_bundle` creates independent encrypted rows;
- CA fingerprint is SHA-256 over normalized PEM text;
- config stores only `tls.caFingerprint` and credential row IDs, never PEM contents;
- API serialization returns `hasCredential`, `hasCaBundle`, `authMode`, `kind`, `fingerprint`, and timestamps, but not `encryptedSecret`;
- migration/schema has `@@unique([integrationId, kind])` and no `integrationId @unique`.

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-credentials.test.ts tests/unit/prisma-schema.test.ts
```

Expected: FAIL because `kind` and credential slot helpers do not exist.

- [x] **Step 2: Change Prisma relation from one credential to many**

Update schema around `Integration` and `IntegrationCredential`:

```prisma
model Integration {
  // existing fields
  credentials    IntegrationCredential[]
  runs           IntegrationRun[]
}

model IntegrationCredential {
  id              String      @id @default(cuid())
  workspaceId     String
  integrationId   String
  integration     Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  kind            String      @default("auth_password")
  authMode        String
  encryptedSecret String
  keyVersion      String      @default("local-dev")
  fingerprint     String?
  lastRotatedAt   DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@unique([integrationId, kind])
  @@index([workspaceId])
  @@index([workspaceId, kind])
}
```

Task 3 owns `IntegrationDiagnosticRun`, so do not add `diagnosticRuns` in Task 2.

Create migration with:

```bash
cd apps/web
npm run db:migrate -- --name add_integration_credential_kinds
```

Expected migration behavior:

- add `kind TEXT NOT NULL DEFAULT 'auth_password'`;
- add nullable `fingerprint`;
- drop old unique index on `integrationId`;
- create unique index on `(integrationId, kind)`;
- existing rows become `auth_password`.

- [x] **Step 3: Add credential helper module**

Implement `credentials.ts` exports:

- `OtrsCredentialKind = "auth_password" | "ca_bundle"`;
- `upsertIntegrationSecretSlot(tx, input)`;
- `getIntegrationSecretSlots(client, integrationId)`;
- `decryptIntegrationSecretSlot(slots, kind)`;
- `fingerprintSecret(value)`;
- `summarizeIntegrationSecretSlots(slots)`.

Use existing `encryptSecret` and `decryptSecret`. Do not log decrypted values.

- [x] **Step 4: Update existing credential call sites**

Replace singular `credential` usage with `credentials`:

- `integration-actions.ts`: save password as `auth_password`; optional CA bundle as `ca_bundle`;
- `runner.ts`: read `auth_password` for legacy helpdesk/OTRS runner path;
- `api/v1/integrations/route.ts`: keep backward `hasCredential` and add `credentials` summary array;
- `seed.ts`: deletion order remains valid.

- [x] **Step 5: Verify and commit**

Run:

```bash
cd apps/web
npm run db:generate
npm run test -- tests/unit/otrs-family-credentials.test.ts tests/unit/prisma-schema.test.ts tests/unit/integration-import-service.test.ts
npm run typecheck
git add apps/web/prisma apps/web/src/lib apps/web/src/app/api/v1/integrations/route.ts apps/web/tests/unit docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "support integration credential secret slots"
```

Expected: tests and typecheck exit `0`, and generated Prisma types expose `credentials`.

## Task 3: Add Diagnostics And Run Item Persistence

**Files:**

- Modify: `apps/web/prisma/schema.prisma`
- Add migration: `apps/web/prisma/migrations/<timestamp>_add_integration_diagnostics/migration.sql`
- Modify: `apps/web/prisma/seed.ts`
- Test: `apps/web/tests/unit/prisma-schema.test.ts`

- [x] **Step 1: Write failing schema tests**

Extend `prisma-schema.test.ts` to assert:

- `IntegrationDiagnosticRun`, `IntegrationDiagnosticStep`, and `IntegrationRunItem` models exist;
- diagnostic runs are indexed by workspace/integration/status/start time;
- run items are unique by `integrationRunId + externalId` when `integrationRunId` exists;
- run items can link to diagnostic runs, integration runs, and conversations;
- migration SQL creates foreign keys and hot-path indexes.

Run:

```bash
cd apps/web
npm run test -- tests/unit/prisma-schema.test.ts
```

Expected: FAIL before schema/migration changes.

- [x] **Step 2: Add Prisma models**

Add relation arrays to `Workspace`, `Integration`, `IntegrationRun`, `Conversation`, and `User` as needed.

Use these model names and status strings:

```prisma
model IntegrationDiagnosticRun {
  id               String                      @id @default(cuid())
  workspaceId      String
  workspace        Workspace                   @relation(fields: [workspaceId], references: [id])
  integrationId    String
  integration      Integration                 @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  actorId          String?
  actor            User?                       @relation(fields: [actorId], references: [id], onDelete: SetNull)
  status           String
  mode             String
  startedAt        DateTime                    @default(now())
  finishedAt       DateTime?
  summaryJson      String                      @default("{}")
  redactedEndpoint String?
  errorCode        String?
  errorMessage     String?
  steps            IntegrationDiagnosticStep[]
  runItems         IntegrationRunItem[]

  @@index([workspaceId, startedAt])
  @@index([workspaceId, status, startedAt])
  @@index([integrationId, startedAt])
}

model IntegrationDiagnosticStep {
  id              String                   @id @default(cuid())
  diagnosticRunId String
  diagnosticRun   IntegrationDiagnosticRun @relation(fields: [diagnosticRunId], references: [id], onDelete: Cascade)
  key             String
  status          String
  durationMs      Int                      @default(0)
  detailJson      String                   @default("{}")
  remediationHint String?
  createdAt       DateTime                 @default(now())

  @@index([diagnosticRunId, createdAt])
  @@index([diagnosticRunId, key])
}

model IntegrationRunItem {
  id                    String                    @id @default(cuid())
  workspaceId           String
  workspace             Workspace                 @relation(fields: [workspaceId], references: [id])
  integrationRunId      String?
  integrationRun        IntegrationRun?           @relation(fields: [integrationRunId], references: [id], onDelete: SetNull)
  diagnosticRunId       String?
  diagnosticRun         IntegrationDiagnosticRun? @relation(fields: [diagnosticRunId], references: [id], onDelete: SetNull)
  externalId            String
  ticketNumber          String?
  status                String
  articleCount          Int                       @default(0)
  privateArticleCount   Int                       @default(0)
  attachmentCount       Int                       @default(0)
  warningsJson          String                    @default("[]")
  errorsJson            String                    @default("[]")
  conversationId        String?
  conversation          Conversation?             @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  normalizedPreviewJson String                    @default("{}")
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt

  @@index([workspaceId, createdAt])
  @@index([workspaceId, status, createdAt])
  @@index([integrationRunId, status])
  @@index([diagnosticRunId, status])
  @@index([conversationId])
}
```

Use a manual partial unique index in migration SQL for preview/import idempotency:

```sql
CREATE UNIQUE INDEX "IntegrationRunItem_integrationRunId_externalId_key"
ON "IntegrationRunItem"("integrationRunId", "externalId")
WHERE "integrationRunId" IS NOT NULL;
```

- [x] **Step 3: Create and inspect migration**

Run:

```bash
cd apps/web
npm run db:migrate -- --name add_integration_diagnostics
```

Expected: migration creates all three tables, indexes, and foreign keys. Add the partial unique index manually if Prisma does not generate it.

- [x] **Step 4: Update seed cleanup**

Delete in dependency order:

1. `integrationRunItem`;
2. `integrationDiagnosticStep`;
3. `integrationDiagnosticRun`;
4. `integrationRun`;
5. `integrationCredential`;
6. `integration`.

- [x] **Step 5: Verify and commit**

Run:

```bash
cd apps/web
npm run db:generate
npm run test -- tests/unit/prisma-schema.test.ts
npm run typecheck
git add apps/web/prisma docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "add integration diagnostics persistence"
```

Expected: schema test, generation, and typecheck exit `0`.

## Task 4: Build HTTP Client, Requests, Errors, And Redaction

**Files:**

- Create: `apps/web/src/lib/integrations/otrs-family/errors.ts`
- Create: `apps/web/src/lib/integrations/otrs-family/client.ts`
- Create: `apps/web/src/lib/integrations/otrs-family/requests.ts`
- Test: `apps/web/tests/unit/otrs-family-client.test.ts`

- [x] **Step 1: Write failing client tests**

Cover:

- TicketSearch POST JSON body includes `UserLogin`, `Password`, filters, and `Limit`;
- TicketGet GET query includes auth, `AllArticles=1`, `Attachments=1`, and `GetAttachmentContents=0`;
- redaction removes `Password`, `UserLogin`, `SessionID`, `token`, and credentials from URL/query/body/error metadata;
- HTTP 401 maps to `auth_failed`;
- network TLS failure maps to `tls_failed` with CA remediation hint;
- timeout maps to `timeout`;
- invalid JSON maps to `invalid_json`;
- oversized response maps to `response_too_large`;
- client accepts a test transport so unit tests do not make live network calls.

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-client.test.ts
```

Expected: FAIL because client/request modules do not exist.

- [x] **Step 2: Implement error taxonomy**

`errors.ts` exports `OtrsConnectorErrorCode`:

```ts
type OtrsConnectorErrorCode =
  | "config_invalid"
  | "secret_missing"
  | "tls_failed"
  | "webservice_unreachable"
  | "auth_failed"
  | "ticket_search_failed"
  | "ticket_get_failed"
  | "invalid_json"
  | "response_too_large"
  | "timeout"
  | "normalization_failed"
  | "db_dry_run_failed";
```

Also export `OtrsConnectorError` with `code`, `safeMessage`, `redactedDetail`, and optional `remediationHint`.

- [x] **Step 3: Implement request builders**

`requests.ts` exports:

- `buildTicketSearchRequest(input)`;
- `buildTicketGetRequest(input)`;
- `buildOtrsOperationUrl(config, operation, ticketId?)`;
- `parseTicketSearchResponse(payload)`.

TicketSearch for OTRS CE 6 must use POST JSON by default. TicketGet must use GET query by default. Both functions must respect route overrides only after config parsing has accepted them.

- [x] **Step 4: Implement production HTTP client**

`client.ts` exports:

- `createOtrsHttpClient({ config, baseUrl, userLogin, password, caBundle, transport? })`;
- `requestJson(operationRequest)`;
- `redactOtrsUrl(url)`;
- `redactOtrsPayload(value)`.

Use Node `http`/`https` modules when a CA bundle is present so `ca` can be passed to the TLS agent. Use the same path for normal HTTPS if this keeps implementation simpler. Enforce timeout and max response bytes while streaming.

Do not support `rejectUnauthorized: false`.

- [x] **Step 5: Verify and commit**

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-client.test.ts tests/unit/otrs-family-config.test.ts
npm run typecheck
git add apps/web/src/lib/integrations/otrs-family apps/web/tests/unit/otrs-family-client.test.ts docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "add otrs http client and requests"
```

Expected: client tests and typecheck exit `0`.

**Review checkpoint:** pause after this task for code review before Task 5 when using subagent-driven execution.

## Task 5: Persist Ordered Diagnostics

**Files:**

- Create: `apps/web/src/lib/integrations/otrs-family/diagnostics.ts`
- Modify: `apps/web/src/lib/integrations/otrs-family/service.ts`
- Test: `apps/web/tests/unit/otrs-family-diagnostics.test.ts`

- [x] **Step 1: Write failing diagnostics tests**

Tests must use a fake OTRS client and fake Prisma transaction client. Cover:

- run starts as `running` and finishes `succeeded`, `warning`, or `failed`;
- steps are written in exact order: `config`, `tls`, `webservice`, `auth`, `ticket_search`, `ticket_get`, `normalize`, `db_dry_run`;
- early failure skips later unsafe steps and records skipped steps;
- all detail JSON is redacted;
- successful diagnostic writes summary with searched/fetched ticket IDs and article counts;
- `db_dry_run` detects duplicate `Conversation` by `(workspaceId, externalSource, externalId)` without writing conversations.

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-diagnostics.test.ts
```

Expected: FAIL before diagnostics service exists.

- [x] **Step 2: Implement diagnostics runner**

`diagnostics.ts` exports:

- `runOtrsDiagnostics(input)`;
- `persistDiagnosticStep(tx, input)`;
- `deriveDiagnosticStatus(steps)`;
- `diagnosticStepDefinitions`.

Implementation notes:

- `config`: parse `Integration.configJson` and base URL.
- `tls`: for HTTPS, perform the first client request with configured CA and map certificate errors clearly.
- `webservice`: store only redacted endpoint.
- `auth`: use first authenticated request result; do not create a separate destructive request.
- `ticket_search`: run safe TicketSearch with limit 1 when no manual ID is supplied.
- `ticket_get`: fetch manual ID if supplied, otherwise first ID from search.
- `normalize`: call OTRS normalization wrapper from Task 6 if present, or current normalizer during this task.
- `db_dry_run`: validate mapping and duplicate state.

- [x] **Step 3: Add service entrypoint**

`service.ts` exports `runOtrsConnectorDiagnostics({ workspaceId, integrationId, actorId, manualTicketId? })`.

It must load:

- integration by workspace;
- config;
- `auth_password` secret;
- optional `ca_bundle` secret.

Missing password must create a failed diagnostic run with `secret_missing`, not throw before persistence.

- [x] **Step 4: Verify and commit**

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-diagnostics.test.ts tests/unit/otrs-family-client.test.ts
npm run typecheck
git add apps/web/src/lib/integrations/otrs-family apps/web/tests/unit/otrs-family-diagnostics.test.ts docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "persist otrs connector diagnostics"
```

Expected: diagnostics tests and typecheck exit `0`.

## Task 6: Build Preview And Selected Import Planning

**Files:**

- Create: `apps/web/src/lib/integrations/otrs-family/attachments.ts`
- Create: `apps/web/src/lib/integrations/otrs-family/normalization.ts`
- Create: `apps/web/src/lib/integrations/otrs-family/import-plan.ts`
- Modify: `apps/web/src/lib/integrations/otrs-family/service.ts`
- Test: `apps/web/tests/unit/otrs-family-import-plan.test.ts`
- Test: `apps/web/tests/unit/otrs-family-normalizer.test.ts`

- [x] **Step 1: Write failing preview/import-plan tests**

Cover:

- manual TicketID preview fetches each ID up to `manualTicketIdLimit`;
- TicketSearch preview fetches IDs returned by search up to `searchLimit`;
- all articles are imported and private article flags are preserved;
- attachments become external metadata/link warnings and never include base64 content;
- duplicate conversations are marked `skipped` or warned before import;
- selected import only imports selected `IntegrationRunItem` IDs from the same workspace/run;
- imported item stores `conversationId`, `status=imported`, and warning/error JSON;
- failed item does not roll back already imported selected items unless the whole transaction fails before import begins.

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-import-plan.test.ts tests/unit/otrs-family-normalizer.test.ts
```

Expected: FAIL before import-plan modules exist.

- [x] **Step 2: Implement attachment mapping**

`attachments.ts` exports:

- `extractOtrsAttachmentMetadata(ticket, article)`;
- `buildOtrsAttachmentExternalUrl({ baseUrl, ticketId, articleId, attachmentId })`;
- `summarizeAttachmentWarnings(metadata)`.

Rules:

- keep filename, content type, size, article ID, attachment ID;
- drop `Content`, `ContentAlternative`, base64 fields, and any binary-like payload;
- produce a warning if a payload contained attachment content that was intentionally discarded.

- [x] **Step 3: Implement normalization wrapper**

`normalization.ts` wraps current `normalizeOtrsFamilyTicket` and returns:

```ts
{
  conversation: CustomConversationInput,
  stats: {
    articleCount: number,
    privateArticleCount: number,
    attachmentCount: number
  },
  warnings: Array<{ code: string; message: string; detail?: Record<string, unknown> }>
}
```

Do not change the existing `Conversation`/`Message` schema in this task.

- [x] **Step 4: Implement preview/import plan**

`import-plan.ts` exports:

- `createOtrsPreviewRun(input)`;
- `createOtrsPreviewItems(input)`;
- `importSelectedOtrsRunItems(input)`.

Preview creates:

- an `IntegrationDiagnosticRun` with mode `manual_ticket_ids` or `ticket_search`;
- an `IntegrationRun` with `dryRun=true` and status `previewed`;
- `IntegrationRunItem` rows with `status=previewed` or `skipped`.

Selected import:

- updates selected preview rows to `selected`;
- upserts conversations/messages using `upsertCustomConversation`;
- updates row status to `imported` or `failed`;
- updates `IntegrationRun.importedCount`, `errorCount`, `finishedAt`;
- updates `Integration.lastImportAt`, `lastSyncedAt`, and `syncCursor`.

- [x] **Step 5: Verify and commit**

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-import-plan.test.ts tests/unit/otrs-family-normalizer.test.ts
npm run typecheck
git add apps/web/src/lib/integrations/otrs-family apps/web/tests/unit/otrs-family-import-plan.test.ts apps/web/tests/unit/otrs-family-normalizer.test.ts docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "add otrs preview and selected import plan"
```

Expected: preview/import tests and typecheck exit `0`.

## Task 7: Wire Server Actions, API Routes, And Jobs

**Files:**

- Modify: `apps/web/src/lib/integration-actions.ts`
- Modify: `apps/web/src/lib/integration-import-service.ts`
- Modify: `apps/web/src/lib/integrations/runner.ts`
- Modify: `apps/web/src/lib/jobs/queue.ts`
- Create: `apps/web/src/app/api/v1/integrations/[integrationId]/diagnostics/route.ts`
- Create: `apps/web/src/app/api/v1/integrations/[integrationId]/preview/route.ts`
- Create: `apps/web/src/app/api/v1/integrations/[integrationId]/import/route.ts`
- Test: `apps/web/tests/unit/integration-actions-otrs.test.ts`
- Test: `apps/web/tests/unit/integration-import-service.test.ts`
- Test: `apps/web/tests/unit/job-queue.test.ts`

- [ ] **Step 1: Write failing facade tests**

Cover:

- saving OTRS setup writes typed config and secret slots;
- diagnostics action enforces `integrations:manage`, calls service, writes audit action `integration.otrs_diagnostics_run`;
- preview action supports `manual_ticket_ids` and `ticket_search`;
- selected import queues a backend job with payload `{ operation: "otrs_selected_import", integrationRunItemIds: ["item-1"] }`;
- job queue dispatches `otrs_selected_import` to the OTRS service and keeps old `INTEGRATION_IMPORT` behavior for native/custom integrations.

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-actions-otrs.test.ts tests/unit/integration-import-service.test.ts tests/unit/job-queue.test.ts
```

Expected: FAIL before new action/API/job wiring.

- [ ] **Step 2: Add server actions**

In `integration-actions.ts`, add:

- `saveOtrsIntegrationConfiguration(formData)`;
- `runOtrsDiagnosticsAction(formData)`;
- `createOtrsPreviewAction(formData)`;
- `queueSelectedOtrsImportAction(formData)`;
- state wrappers for `useActionState`.

Every action must:

- authorize through `getCurrentUser` and `canManageIntegrations`;
- validate with Zod or existing typed parsers;
- write audit logs with redacted metadata;
- `revalidatePath("/admin/integrations")` and `revalidatePath("/admin/integrations/<id>")`.

- [ ] **Step 3: Add API routes**

Expose API equivalents for scripted testing:

- `POST /api/v1/integrations/[integrationId]/diagnostics`;
- `POST /api/v1/integrations/[integrationId]/preview`;
- `POST /api/v1/integrations/[integrationId]/import`.

Use `requireSessionApi`, standardized API errors, request IDs, and the same service layer as server actions.

- [ ] **Step 4: Update job payload handling**

Do not overload legacy dry-run payloads. Add explicit operation dispatch:

```ts
type IntegrationJobOperation =
  | "legacy_connector_run"
  | "otrs_selected_import";
```

Old queued jobs without `operation` must behave as `legacy_connector_run`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-actions-otrs.test.ts tests/unit/integration-import-service.test.ts tests/unit/job-queue.test.ts
npm run typecheck
git add apps/web/src/lib apps/web/src/app/api/v1/integrations apps/web/tests/unit docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "wire otrs connector actions and jobs"
```

Expected: facade tests and typecheck exit `0`.

## Task 8: Build Admin Integration Cockpit UI

**Files:**

- Modify: `apps/web/src/app/admin/integrations/page.tsx`
- Create: `apps/web/src/app/admin/integrations/new/page.tsx`
- Create: `apps/web/src/app/admin/integrations/[integrationId]/page.tsx`
- Modify: `apps/web/src/components/integrations/integration-setup-workspace.tsx`
- Modify: `apps/web/src/components/integrations/otrs-setup-wizard.tsx`
- Create: `apps/web/src/components/integrations/otrs-webservice-checklist.tsx`
- Create: `apps/web/src/components/integrations/otrs-connection-form.tsx`
- Create: `apps/web/src/components/integrations/otrs-diagnostics-panel.tsx`
- Create: `apps/web/src/components/integrations/otrs-preview-panel.tsx`
- Create: `apps/web/src/components/integrations/otrs-run-history.tsx`
- Test: `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`

- [ ] **Step 1: Add failing E2E skeleton**

Create an E2E test that expects:

- `/admin/integrations` shows overview and a `Новый источник` link;
- `/admin/integrations/new` shows source setup with OTRS CE 6 option;
- `/admin/integrations/[integrationId]` shows tabs or sections for setup, diagnostics, preview/import, and history;
- no password or CA content appears in visible text after save.

Run:

```bash
cd apps/web
npm run test:e2e -- tests/e2e/otrs-integration-cockpit.spec.ts
```

Expected: FAIL because routes/components do not exist yet.

- [ ] **Step 2: Refactor overview and new setup route**

`/admin/integrations` becomes a dense operations overview:

- connected integrations;
- latest diagnostics status;
- latest preview/import counts;
- recent backend jobs;
- link to detail page per integration.

`/admin/integrations/new` hosts the setup wizard. Keep current custom API and native helpdesk setup reachable.

- [ ] **Step 3: Build OTRS detail cockpit**

`/admin/integrations/[integrationId]` loads:

- integration;
- credential summaries;
- latest diagnostic run and steps;
- recent preview/import runs and run items;
- recent backend jobs by run ID.

Render:

- `OtrsWebserviceChecklist`: WebService name, route template, required operations, GenericInterface URL pattern;
- `OtrsConnectionForm`: base URL, WebService name, user login, password update, CA bundle update, advanced route overrides;
- `OtrsDiagnosticsPanel`: per-step status, duration, redacted endpoint, remediation hint;
- `OtrsPreviewPanel`: manual TicketID textarea, TicketSearch filters, preview table, selected import button;
- `OtrsRunHistory`: runs, items, imported conversation links to `/reviews`.

- [ ] **Step 4: Preserve manual payload tester as legacy tool**

Keep `OtrsImportTester` behind a collapsed "Ручная проверка payload" section. Label it as legacy/manual JSON path and keep the existing server action unchanged.

- [ ] **Step 5: Verify responsive UI**

Run:

```bash
cd apps/web
npm run test:e2e -- tests/e2e/otrs-integration-cockpit.spec.ts
npm run typecheck
```

If a local browser review is needed, start:

```bash
cd apps/web
npm run dev
```

Expected: E2E and typecheck exit `0`; forms do not expose secret values.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/integrations apps/web/src/components/integrations apps/web/tests/e2e/otrs-integration-cockpit.spec.ts docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "add otrs integration cockpit ui"
```

## Task 9: Add OTRS GenericInterface Stub And Contract Coverage

**Files:**

- Create: `apps/web/tests/fixtures/otrs-genericinterface-server.ts`
- Create: `apps/web/tests/fixtures/otrs-ticket-fixtures.ts`
- Add or modify: `apps/web/tests/unit/otrs-family-client.test.ts`
- Add or modify: `apps/web/tests/unit/otrs-family-diagnostics.test.ts`
- Add or modify: `apps/web/tests/unit/otrs-family-import-plan.test.ts`

- [ ] **Step 1: Build stub fixture server**

The fixture server must expose OTRS-like routes:

- `POST /otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket`
- `GET /otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/:ticketId`

It must support modes:

- success;
- 401 auth failure;
- invalid JSON;
- malformed TicketSearch response;
- malformed TicketGet response;
- delayed timeout;
- oversized response;
- TicketGet with attachments containing base64 content.

- [ ] **Step 2: Add contract tests through real HTTP**

Use the actual client/service against the local stub server. Cover:

- diagnostics success path;
- diagnostics auth failure path;
- preview by TicketSearch;
- preview by manual IDs;
- selected import writes conversations/messages and run items;
- attachment base64 is discarded.

Run:

```bash
cd apps/web
npm run test -- tests/unit/otrs-family-client.test.ts tests/unit/otrs-family-diagnostics.test.ts tests/unit/otrs-family-import-plan.test.ts
```

Expected: all tests exit `0` and no test needs a live OTRS instance.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/fixtures apps/web/tests/unit docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "add otrs genericinterface contract tests"
```

## Task 10: Prove End-To-End Stub Flow In Browser

**Files:**

- Modify: `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`
- Modify: `apps/web/playwright.config.ts` only if the test needs deterministic env wiring

- [ ] **Step 1: Extend E2E to full stub workflow**

The test should:

1. Start or address the OTRS stub server.
2. Open `/admin/integrations/new`.
3. Save OTRS CE 6 connection config pointing at the stub.
4. Run diagnostics.
5. Assert step statuses show success.
6. Create preview from manual TicketIDs.
7. Select one item.
8. Queue selected import.
9. Run integration queue from UI or call the job runner helper route if already available.
10. Navigate to `/reviews?source=otrs&q=<externalId>` and assert imported conversation appears.

- [ ] **Step 2: Verify E2E locally**

Run:

```bash
cd apps/web
npm run db:up
npm run db:seed
npm run test:e2e -- tests/e2e/otrs-integration-cockpit.spec.ts
```

Expected: E2E exits `0` against local Postgres and stub OTRS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/otrs-integration-cockpit.spec.ts apps/web/playwright.config.ts docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "cover otrs cockpit with e2e stub flow"
```

## Task 11: Add Gated Live OTRS Smoke Harness

**Files:**

- Create: `apps/web/src/scripts/otrs-live-smoke.ts`
- Modify: `apps/web/package.json`
- Create: `docs/otrs-live-smoke.md`
- Create: `.github/workflows/otrs-live-smoke.yml`

- [ ] **Step 1: Add live smoke script**

The script must refuse to run unless `OTRS_LIVE_SMOKE=1`.

Supported env:

```bash
OTRS_LIVE_SMOKE=1
OTRS_BASE_URL=https://support.example.com/otrs
OTRS_WEBSERVICE_NAME=GenericTicketConnectorREST
OTRS_USER_LOGIN=qc_api
OTRS_PASSWORD=change-me-in-protected-secret-store
OTRS_CA_BUNDLE_PATH=/path/to/internal-ca.pem
OTRS_TEST_TICKET_ID=42
OTRS_SEARCH_QUEUE=Raw
OTRS_SEARCH_STATE_TYPE=open
OTRS_LIVE_IMPORT=0
```

Behavior:

- create an in-memory connector config;
- run diagnostics;
- run TicketSearch preview or manual TicketID preview;
- print redacted JSON summary;
- exit non-zero on failed diagnostics or failed preview;
- run selected import only when `OTRS_LIVE_IMPORT=1`.

- [ ] **Step 2: Add package script**

Add:

```json
"test:otrs:live": "tsx src/scripts/otrs-live-smoke.ts"
```

- [ ] **Step 3: Add docs**

`docs/otrs-live-smoke.md` must include:

- required OTRS GenericInterface WebService operations;
- least-privilege OTRS user recommendation;
- CA bundle setup;
- exact command for diagnostics-only smoke;
- exact command for selected import smoke;
- warning that CI must use protected secrets/environment.

- [ ] **Step 4: Add gated GitHub workflow**

Create a manual-only workflow:

- `workflow_dispatch` only;
- protected environment name `otrs-live`;
- no schedule and no push trigger;
- requires live env secrets;
- runs `npm ci`, `npm run db:generate`, and `OTRS_LIVE_SMOKE=1 npm run test:otrs:live`.

If this repository is not hosted on GitHub Actions, the workflow file remains harmless documentation of the protected job shape.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd apps/web
npm run test:otrs:live
```

Expected without env: exits non-zero with a clear message that `OTRS_LIVE_SMOKE=1` is required.

Then run:

```bash
cd apps/web
npm run typecheck
git add apps/web/src/scripts/otrs-live-smoke.ts apps/web/package.json docs/otrs-live-smoke.md .github/workflows/otrs-live-smoke.yml docs/superpowers/plans/2026-05-07-otrs-production-integration.md
git commit -m "add gated otrs live smoke harness"
```

Expected: typecheck exits `0`; live smoke script fails closed without env.

## Task 12: Final Hardening And Full Verification

**Files:**

- Modify: `docs/superpowers/specs/2026-05-07-otrs-production-integration-design.md` only if implementation discovers a necessary spec correction
- Modify: `docs/otrs-live-smoke.md`
- Modify: `AGENTS.md` only if new durable local commands are introduced
- Modify tests touched by previous tasks only for final fixes

- [ ] **Step 1: Run full local verification**

Run:

```bash
cd apps/web
npm run db:up
npm run db:migrate -- --name verify_no_pending_changes
npm run db:seed
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Expected:

- migrations report no unintended schema drift;
- typecheck exits `0`;
- Vitest exits `0`;
- Playwright exits `0`;
- build exits `0`.

If `verify_no_pending_changes` creates an empty migration or errors because the database is already current, remove the empty migration before committing and document the actual output in the final task notes.

- [ ] **Step 2: Production-readiness self-review**

Review these invariants in code:

- no decrypted password or CA content is included in UI props, API responses, logs, audit metadata, diagnostic details, job payloads, or thrown errors;
- no OTRS attachment content is persisted;
- every live connector request has timeout and response-size limit;
- all new Prisma query paths include `workspaceId`;
- selected import cannot import another workspace's preview items;
- old custom/native integration queue tests still pass;
- manual payload import still works.

- [ ] **Step 3: Update docs**

Update docs with final file paths and commands:

- `docs/otrs-live-smoke.md`;
- this plan's completed checkboxes if execution is happening inline;
- spec corrections only if implementation changed an approved decision.

- [ ] **Step 4: Commit final hardening**

Run:

```bash
git status --short
git add AGENTS.md docs apps/web
git commit -m "finalize otrs production integration"
```

Expected: commit contains only OTRS integration implementation, tests, docs, and necessary generated Prisma artifacts.

## Acceptance Criteria

- Admin can configure an OTRS CE 6 GenericInterface connection without secrets entering `configJson`.
- Password and optional CA bundle are independent encrypted credential slots.
- Diagnostics persist ordered steps with redacted details and remediation hints.
- TicketSearch and manual TicketID preview both create durable preview items.
- Selected import writes `Conversation` and `Message` rows and links `IntegrationRunItem.conversationId`.
- Private article flags survive import into `Message.isPrivate`.
- Attachment content is not downloaded or stored; only external metadata/link warnings are retained.
- `/reviews` can find imported OTRS tickets by source and external ID.
- Stub tests cover success, auth failure, invalid JSON, malformed responses, timeout, oversized response, and attachment payload discard.
- Live smoke is gated by env/protected manual execution and fails closed by default.
- Full verification commands pass before the branch is considered complete.
