# OTRS selected import

Cockpit selected import is a backend job, not a live TicketGet loop. Operators can drain it, read job status, and re-run after a crash without assuming rollback. Agents must keep the ownership lock TX short so heartbeats can commit.

Preview still talks to OTRS. Selected import does not.

## How the job runs

The cockpit queues `INTEGRATION_IMPORT` with `operation: "otrs_selected_import"`, an `integrationRunId`, and the chosen `integrationRunItemIds`. Drain the queue as in [jobs-scheduling.md](jobs-scheduling.md).

Then the worker:

1. Claims the job and renews the `backendJob` lock on the global `prisma` client.
2. Opens a **short** transaction: ownership check (`assertCurrentJobLock`, no renew in that TX) → **commit**.
3. Runs `importSelectedOtrsRunItems` **outside** that transaction, still on global `prisma`.
4. Finalizes `IntegrationRun` in a later short transaction.
5. Marks the job `SUCCEEDED` in another short transaction.

Do not wrap step 3 in the ownership TX. That TX holds the `backendJob` row; per-item heartbeats update the same row and would wait on it until lock timeout (self-deadlock). That bug is fixed.

Code: `runSelectedOtrsImportJob` in `apps/web/src/lib/jobs/queue.ts`, `runSelectedOtrsImportConnector` in `apps/web/src/lib/integrations/runner.ts`.

## Heartbeats

Before each item, `onItemProgress` calls `renewCurrentJobLock(prisma, job)`. That commits `lockedAt` so other workers see a live lock.

Default stale recovery is 30 minutes (`backendJobQueueDefaults.staleLockMs`). Heartbeats keep a long import from looking abandoned. If the process dies, heartbeats stop; after the stale window the same job returns to `QUEUED` (while attempts remain).

## Per-item claim and resume

Selected import is **not** one all-or-nothing Prisma transaction. Each row:

1. Heartbeat.
2. Claim `selected` → `importing` (one worker wins).
3. Upsert the conversation from stored `normalizedPreviewJson`.
4. Mark the item `imported` or `failed`.

On start (including a recovered job) the runner resets `previewed` / `selected` / `importing` rows in the payload back to `selected`, then claims them one by one. Already `imported` rows stay imported. `failed` rows stay failed — they are not reclaimed.

TicketGet is not on this path. Preview (`createOtrsPreviewItems`), diagnostics, the legacy connector, and the live smoke harness fetch tickets. Selected import only parses preview JSON.

## Crash residual

If the process dies mid-import, conversations already upserted stay in the workspace. `IntegrationRun` may still be `queued` or `retry_scheduled` until a later attempt finalizes it. There is no all-or-nothing rollback.

Resume is the **same** `INTEGRATION_IMPORT` job after stale recovery or retry. Remaining `previewed` / `selected` / `importing` rows are claimed again. A second cockpit enqueue still requires a `previewed` run and `previewed` items — a `queued`, `retry_scheduled`, or `failed` run is rejected. After a terminal job failure, start a new preview.

## What did not change

- Cockpit UI/API contract: preview, select, “Импортировать выбранные”, queue message, drain.
- TicketGet still belongs to preview / diagnostics / legacy connector / live smoke — not to the selected-import job TX.

## How to verify

From `apps/web`:

```bash
npm run test:e2e -- tests/e2e/otrs-integration-cockpit.spec.ts
```

The chromium spec creates a preview, queues selected import, drains `integrations`, and asserts job type `INTEGRATION_IMPORT` is `SUCCEEDED` with `importedCount: 1` (spec bound: under 15s).

Unit coverage for the TX split and heartbeat-after-commit order: `apps/web/tests/unit/integration-runner-ledger.test.ts` (“selected OTRS import connector”). Claim/resume: `apps/web/tests/unit/otrs-family-import-plan.test.ts`.
