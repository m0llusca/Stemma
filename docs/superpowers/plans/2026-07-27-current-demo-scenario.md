# Current Demo Scenario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale May 2026 demo dates with a deterministic scenario relative to one UTC anchor, populate every audited UI state, and verify the seeded database before visual QA.

**Architecture:** `seed.ts` remains the destructive-operation guard and Prisma orchestrator. A pure `demo-calendar.ts` owns UTC boundaries and semantic date conversion; existing review/operational catalogs accept `DemoCalendar` rather than reading time; a pure validator checks scenario invariants before Prisma; a separate smoke command validates the completed isolated database.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, existing report-period helpers, Vitest, Playwright, tsx.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-07-27-shadcn-layout-remediation-design.md`.
- Complete the review-workspace and analytics-shell plans first; their visuals rely on this data.
- `assertSeedAllowed` must execute before calendar construction and before every database mutation.
- `DEMO_SEED_NOW` accepts only `YYYY-MM-DDTHH:mm:ss.sssZ`; do not accept offsets, date-only values, or engine-dependent parsing.
- All calendar boundaries use UTC.
- No Prisma schema or migration changes.
- Keep stable IDs, relationships, Russian scenario copy, and existing source coverage where still valid.
- Builders receive time explicitly; they never read `process.env`, `Date.now()`, or `new Date()` without an argument.
- Historical metadata may stay absolute only when it never participates in current UI filtering; document each exception.
- Use a separate local database for reset/seed/smoke verification.
- Before editing, run `git status --short` and record the state of every path
  listed by the task. The commit
  commands below assume those targets were clean; for a pre-existing dirty file,
  stage only new hunks with `git add -p` and inspect `git diff --cached`. If an
  overlapping hunk cannot be isolated safely, leave it uncommitted and report it.
- Run commands from `apps/web`.

---

## Task 1: Introduce the strict UTC DemoCalendar

**Files:**

- Create: `apps/web/prisma/demo-calendar.ts`
- Create: `apps/web/tests/unit/demo-calendar.test.ts`

- [ ] **Step 1: Write strict parsing tests**

```ts
import { createDemoCalendar, resolveDemoSeedNow } from "../../prisma/demo-calendar";

describe("resolveDemoSeedNow", () => {
  it("accepts a complete UTC instant", () => {
    expect(resolveDemoSeedNow({ DEMO_SEED_NOW: "2026-07-27T12:00:00.000Z" }).toISOString())
      .toBe("2026-07-27T12:00:00.000Z");
  });

  it.each([
    "2026-07-27",
    "2026-07-27T12:00:00Z",
    "2026-07-27T15:00:00.000+03:00",
    "not-a-date"
  ])("rejects ambiguous anchor %s", (value) => {
    expect(() => resolveDemoSeedNow({ DEMO_SEED_NOW: value })).toThrow(/DEMO_SEED_NOW/);
  });
});
```

- [ ] **Step 2: Write boundary tests before implementation**

For anchors on the 21st, 22nd, month-end, and year-end, assert:

```ts
const calendar = createDemoCalendar(new Date("2026-07-27T12:00:00.000Z"));
expect(calendar.startOfToday.toISOString()).toBe("2026-07-27T00:00:00.000Z");
expect(calendar.rollingSevenDaysStart.toISOString()).toBe("2026-07-21T00:00:00.000Z");
expect(calendar.previousSevenDaysStart.toISOString()).toBe("2026-07-14T00:00:00.000Z");
expect(calendar.currentVkPeriod.start.toISOString()).toBe("2026-07-22T00:00:00.000Z");
expect(calendar.previousVkPeriod.end.toISOString()).toBe("2026-07-21T23:59:59.999Z");
```

Also test `currentMonth`, `previousMonth`, `thirtyDaysStart`, and semantic helpers at month/year rollover.

- [ ] **Step 3: Run tests and confirm red**

```bash
npx vitest run tests/unit/demo-calendar.test.ts
```

Expected: FAIL because `demo-calendar.ts` does not exist.

- [ ] **Step 4: Implement the pure API**

```ts
export type DemoCalendar = Readonly<{
  now: Date;
  startOfToday: Date;
  rollingSevenDaysStart: Date;
  previousSevenDaysStart: Date;
  thirtyDaysStart: Date;
  currentVkPeriod: ReportPeriod;
  previousVkPeriod: ReportPeriod;
  currentMonth: ReportPeriod;
  previousMonth: ReportPeriod;
}>;

export type DemoClock = Readonly<{ hour?: number; minute?: number; second?: number }>;

export function resolveDemoSeedNow(env: NodeJS.ProcessEnv): Date;
export function createDemoCalendar(now: Date): DemoCalendar;
export function daysFrom(calendar: DemoCalendar, offset: number, clock?: DemoClock): Date;
export function atPeriodDay(
  calendar: DemoCalendar,
  period: "currentVkPeriod" | "previousVkPeriod" | "currentMonth" | "previousMonth",
  dayOffset: number,
  clock?: DemoClock
): Date;
```

`createDemoCalendar` must call `resolveReportPeriod`/`resolvePreviousReportPeriod` from `src/lib/report-period.ts`; do not duplicate 22–21 logic.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/unit/demo-calendar.test.ts tests/unit/report-period.test.ts tests/unit/report-previous-period.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/demo-calendar.ts tests/unit/demo-calendar.test.ts
git commit -m "feat: add deterministic demo calendar"
```

---

## Task 2: Make the reviewed-conversation catalog relative

**Files:**

- Modify: `apps/web/prisma/demo-review-seeds.ts`
- Modify: `apps/web/tests/unit/demo-seed-dataset.test.ts`

- [ ] **Step 1: Rewrite the tests around a fixed injected calendar**

```ts
const calendar = createDemoCalendar(new Date("2026-07-27T12:00:00.000Z"));
const seeds = buildTwoMonthReviewedConversationSeeds(context, calendar);

it("fills current and previous 22-21 periods", () => {
  expect(seeds.filter((seed) => inRange(seed.finalizedAt, calendar.currentVkPeriod))).not.toHaveLength(0);
  expect(seeds.filter((seed) => inRange(seed.finalizedAt, calendar.previousVkPeriod))).not.toHaveLength(0);
  expect(seeds.every((seed) => seed.finalizedAt <= calendar.now)).toBe(true);
});

it("fills both rolling seven-day windows", () => {
  expect(seeds.some((seed) => seed.finalizedAt >= calendar.rollingSevenDaysStart)).toBe(true);
  expect(seeds.some((seed) =>
    seed.finalizedAt >= calendar.previousSevenDaysStart &&
    seed.finalizedAt < calendar.rollingSevenDaysStart
  )).toBe(true);
});
```

Retain variety assertions for six sources, four agents, three teams, eight finding categories, sampling/feedback/appeal states, and all four risk levels.

- [ ] **Step 2: Confirm the old API fails**

```bash
npx vitest run tests/unit/demo-seed-dataset.test.ts
```

Expected: FAIL because the builder does not accept a calendar and returns May dates.

- [ ] **Step 3: Replace absolute slot timestamps with semantic slots**

```ts
type DemoReviewSlot = {
  externalId: string;
  period: "currentVkPeriod" | "previousVkPeriod" | "previousMonth";
  dayOffset: number;
  hour: number;
  minute: number;
  totalScore: number;
  // existing scenario flags remain unchanged
};
```

Build `finalizedAt` with `atPeriodDay`. Derive `openedAt`, `closedAt`, `reviewDueAt`, and message times from that scenario’s base time so:

```text
openedAt <= closedAt <= finalizedAt <= calendar.now
```

Use irregular but deterministic minute/hour offsets. Preserve stable external IDs and scenario text.

- [ ] **Step 4: Change the builder signature**

```ts
export function buildTwoMonthReviewedConversationSeeds(
  context: DemoReviewSeedContext,
  calendar: DemoCalendar
): ReviewedConversationSeed[];
```

No default calendar is allowed; accidental system-time coupling must be a type error.

- [ ] **Step 5: Run dataset tests**

```bash
npx vitest run tests/unit/demo-seed-dataset.test.ts
```

Expected: reviewed dataset tests PASS with current/previous periods and rolling windows populated.

- [ ] **Step 6: Commit**

```bash
git add prisma/demo-review-seeds.ts tests/unit/demo-seed-dataset.test.ts
git commit -m "refactor: anchor reviewed demo scenarios to calendar"
```

---

## Task 3: Make the queue/operational catalog relative

**Files:**

- Modify: `apps/web/prisma/demo-operational-seeds.ts`
- Modify: `apps/web/tests/unit/demo-seed-dataset.test.ts`

- [ ] **Step 1: Add failing SLA/state assertions relative to the anchor**

```ts
const seeds = buildOperationalConversationSeeds(operationalContext, calendar);
const dueOffsets = seeds.map((seed) =>
  Math.round((seed.reviewDueAt.getTime() - calendar.startOfToday.getTime()) / DAY_MS)
);

expect(new Set(seeds.map((seed) => seed.qaStatus)))
  .toEqual(new Set(["QUEUED", "ASSIGNED", "IN_PROGRESS", "REOPENED"]));
expect(dueOffsets.some((value) => value < 0)).toBe(true);
expect(dueOffsets).toContain(0);
expect(dueOffsets.some((value) => value > 0 && value <= 2)).toBe(true);
expect(dueOffsets.some((value) => value > 2)).toBe(true);
```

Also assert messages stay ordered, `closedAt` is null only for valid open/pending scenarios, and previous finalized reviews never lie in the future.

- [ ] **Step 2: Run and confirm red**

```bash
npx vitest run tests/unit/demo-seed-dataset.test.ts --testNamePattern="operational"
```

Expected: FAIL because dates remain hard-coded to May.

- [ ] **Step 3: Convert the catalog**

Change:

```ts
export function buildOperationalConversationSeeds(
  context: DemoOperationalSeedContext,
  calendar: DemoCalendar
): OperationalConversationSeed[];
```

Replace the local `date(string)` helper with `daysFrom(calendar, offset, clock)`. Derive every message from the conversation base and every prior review from the close time. Keep statuses, sources, channels, text, and stable IDs.

- [ ] **Step 4: Keep status-plan data stable**

`buildDemoOperationalStatusPlan()` remains pure catalog data. Add only typed metadata needed to place training, calibration, integration, job, and snapshot instances relative to `DemoCalendar`; do not put `Date` construction in status labels.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/unit/demo-seed-dataset.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/demo-operational-seeds.ts tests/unit/demo-seed-dataset.test.ts
git commit -m "refactor: anchor operational demo scenarios to calendar"
```

---

## Task 4: Add a pure pre-Prisma scenario validator

**Files:**

- Create: `apps/web/prisma/demo-seed-validation.ts`
- Create: `apps/web/tests/unit/demo-seed-validation.test.ts`

- [ ] **Step 1: Write failing invariant tests**

```ts
expect(() => validateDemoReviewSeeds(validSeeds, calendar)).not.toThrow();
expect(() =>
  validateDemoReviewSeeds(
    [{ ...validSeeds[0], finalizedAt: daysFrom(calendar, 1) }],
    calendar
  )
).toThrow(/externalId=.*finalizedAt.*future/i);

expect(() =>
  validateDemoReviewSeeds(
    [{ ...validSeeds[0], openedAt: validSeeds[0].finalizedAt }],
    calendar
  )
).toThrow(/openedAt.*closedAt.*finalizedAt/i);
```

Add coverage failures for:

- current and previous 22–21 periods;
- both rolling seven-day windows;
- all queue statuses and four SLA buckets;
- `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`;
- minimum sources/agents/teams/categories;
- training/calibration/integration/job/snapshot status plans.

- [ ] **Step 2: Run and confirm red**

```bash
npx vitest run tests/unit/demo-seed-validation.test.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement typed errors with scenario IDs**

```ts
export class DemoSeedInvariantError extends Error {
  constructor(readonly scenarioId: string, readonly invariant: string) {
    super(`Demo seed ${scenarioId}: ${invariant}`);
  }
}
```

Validation must be pure and run before the first Prisma write. It must report the exact external/scenario ID and failed invariant.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/demo-seed-validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/demo-seed-validation.ts tests/unit/demo-seed-validation.test.ts
git commit -m "test: validate demo scenario invariants"
```

---

## Task 5: Inject the calendar into seed.ts before mutations

**Files:**

- Create: `apps/web/prisma/demo-seed-bootstrap.ts`
- Modify: `apps/web/prisma/seed.ts`
- Modify: `apps/web/tests/unit/seed-guard.test.ts`
- Create: `apps/web/tests/unit/seed-bootstrap.test.ts`

- [ ] **Step 1: Extract and test bootstrap ordering**

Create `prepareDemoSeed` in `demo-seed-bootstrap.ts`. It owns deterministic
workspace/user IDs and names that are known before Prisma runs, receives `env`,
performs guard → calendar → builders → validator, and returns the IDs plus
validated arrays without touching Prisma. `seed.ts` must pass those same IDs
explicitly to workspace/user `create` calls. Inject narrow callbacks in the test
so ordering is observable:

```ts
export const demoEntityIds = {
  workspace: "demo-workspace",
  analyst: "demo-user-analyst",
  teamLead: "demo-user-team-lead",
  seniorAnalyst: "demo-user-senior-analyst"
} as const;
```

```ts
expect(events).toEqual([
  "assert-seed-allowed",
  "resolve-demo-now",
  "create-demo-calendar",
  "build-scenarios",
  "validate-scenarios",
  "first-prisma-mutation"
]);
```

Add a case where invalid `DEMO_SEED_NOW` throws and the Prisma mutation spy has zero calls.

- [ ] **Step 2: Run and confirm red**

```bash
npx vitest run tests/unit/seed-bootstrap.test.ts tests/unit/seed-guard.test.ts
```

Expected: FAIL until orchestration is injectable and ordered.

- [ ] **Step 3: Wire the bootstrap**

At the beginning of `main()`, call the pure bootstrap before the first
`deleteMany`. Use the returned deterministic IDs later when creating the
workspace and users:

```ts
assertSeedAllowed(process.env as Record<string, string | undefined>);
const calendar = createDemoCalendar(resolveDemoSeedNow(process.env));
const reviewedSeeds = buildTwoMonthReviewedConversationSeeds(reviewContext, calendar);
const operationalSeeds = buildOperationalConversationSeeds(operationalContext, calendar);
validateDemoScenario({ calendar, reviewedSeeds, operationalSeeds, statusPlan });
```

Only then begin `deleteMany`.

- [ ] **Step 4: Replace direct builder calls**

Reuse the prebuilt, validated arrays at the existing insertion points. Do not build them again after deletion and do not change insertion order or relations.

- [ ] **Step 5: Run bootstrap/dataset tests**

```bash
npx vitest run tests/unit/seed-bootstrap.test.ts tests/unit/seed-guard.test.ts tests/unit/demo-calendar.test.ts tests/unit/demo-seed-dataset.test.ts tests/unit/demo-seed-validation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/demo-seed-bootstrap.ts prisma/seed.ts tests/unit/seed-bootstrap.test.ts tests/unit/seed-guard.test.ts
git commit -m "refactor: inject validated calendar into demo seed"
```

---

## Task 6: Convert the remaining current-UI dates in seed.ts

**Files:**

- Modify: `apps/web/prisma/seed.ts`
- Modify: `apps/web/prisma/demo-operational-seeds.ts`
- Modify: `apps/web/tests/unit/demo-seed-dataset.test.ts`

- [ ] **Step 1: Inventory date literals by UI domain**

```bash
rg -n 'new Date\\("2026-|Date\\.UTC\\(2026' prisma/seed.ts prisma/demo-*.ts
```

Classify every match as:

1. participates in current UI/report filtering — must become relative;
2. stable historical metadata not shown by current filters — may remain with a comment;
3. test-only fixed anchor — allowed only in tests.

- [ ] **Step 2: Convert report/quota/snapshot dates**

Use `calendar.currentVkPeriod`, `calendar.previousVkPeriod`, `rollingSevenDaysStart`, and semantic offsets for:

- `ReviewQuota.periodStart/periodEnd`;
- report snapshots;
- dashboard events and review events;
- saved-view or audit timestamps that appear in “recent” UI.

- [ ] **Step 3: Convert training and calibration dates**

Place:

- `open` training due before today;
- `in_progress` due today or within two days;
- `done` completed before today;
- calibration `draft`, `active`, `completed`, `archived` on both sides of the anchor with internally valid ordering.

- [ ] **Step 4: Convert integration, diagnostic, job, and token activity**

Create recent successful, queued, retrying, and failed runs with varied intervals. Ensure:

```text
createdAt <= runAfter <= startedAt <= finishedAt <= now
```

when each timestamp is present. Keep future `runAfter` only for intentionally queued work.

- [ ] **Step 5: Make visible demo values realistic**

Preserve business meaning while replacing repeated/round values with deterministic variations:

- non-round scores/counts;
- realistic Russian names;
- different event gaps;
- enough trend points for line, volume bars, target band, active point, and tooltip.

- [ ] **Step 6: Run the literal inventory again**

```bash
rg -n 'new Date\\("2026-|Date\\.UTC\\(2026' prisma/seed.ts prisma/demo-*.ts
```

Expected: only documented historical metadata or no matches. Review each remaining line manually; do not enforce this with a source-grep unit test.

- [ ] **Step 7: Run pure tests**

```bash
npx vitest run tests/unit/demo-calendar.test.ts tests/unit/demo-seed-dataset.test.ts tests/unit/demo-seed-validation.test.ts tests/unit/seed-bootstrap.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit by domain if the diff is large**

```bash
git add prisma/seed.ts prisma/demo-operational-seeds.ts tests/unit/demo-seed-dataset.test.ts
git commit -m "feat: refresh current demo operational data"
```

If the change exceeds one reviewable unit, commit reports/quotas, learning/calibration, and integrations/jobs separately.

---

## Task 7: Add a post-seed database smoke verifier

**Files:**

- Create: `apps/web/prisma/demo-seed-smoke.ts`
- Modify: `apps/web/package.json`
- Create: `apps/web/tests/unit/demo-seed-smoke.test.ts`

- [ ] **Step 1: Define the summary contract with a mocked Prisma client**

```ts
type DemoSeedSmokeSummary = {
  currentVkFinalized: number;
  previousVkFinalized: number;
  currentRollingSevenDays: number;
  previousRollingSevenDays: number;
  queueStatuses: Record<"QUEUED" | "ASSIGNED" | "IN_PROGRESS" | "REOPENED", number>;
  trainingStatuses: Record<"open" | "in_progress" | "done", number>;
  calibrationStatuses: Record<"draft" | "active" | "completed" | "archived", number>;
  recentIntegrationRuns: number;
  chartPointDays: number;
};
```

Test that a zero count throws a readable error naming the missing range/status.

- [ ] **Step 2: Run and confirm red**

```bash
npx vitest run tests/unit/demo-seed-smoke.test.ts
```

Expected: FAIL because the smoke module does not exist.

- [ ] **Step 3: Implement read-only Prisma checks**

The script must:

- resolve the same `DEMO_SEED_NOW`;
- create the same `DemoCalendar`;
- query only the seeded workspace;
- count finalized human reviews in both report periods and rolling windows;
- group queue, training, calibration, job, snapshot, integration-run, and risk states;
- require at least six sources, four agents, three teams, eight finding categories;
- print a concise JSON summary;
- exit non-zero on any missing required state;
- always disconnect Prisma.

- [ ] **Step 4: Add the command**

```json
"db:seed:verify": "tsx prisma/demo-seed-smoke.ts"
```

- [ ] **Step 5: Run unit tests**

```bash
npx vitest run tests/unit/demo-seed-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/demo-seed-smoke.ts package.json tests/unit/demo-seed-smoke.test.ts
git commit -m "test: verify seeded demo database coverage"
```

---

## Task 8: Seed and verify an isolated local database

**Files:**

- Modify only if failures prove a defect: files from Tasks 1–7
- Create: `apps/web/tests/e2e/demo-data-current.spec.ts`

- [ ] **Step 1: Point at a dedicated test database**

Start the project PostgreSQL service, check whether the dedicated database
exists, and create it only when absent:

```bash
npm run db:up
if ! docker compose -f ../../compose.yaml exec -T postgres psql -U qc_app -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='qc_app_demo_verify'" | rg -q '^1$'; then
  docker compose -f ../../compose.yaml exec -T postgres createdb -U qc_app qc_app_demo_verify
fi
```

Then use its explicit local URL; do not reuse an unknown database:

```bash
export TEST_DATABASE_URL='postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public'
export DATABASE_URL="$TEST_DATABASE_URL"
export ALLOW_SEED=1
export QC_DEMO_AUTH=enabled
export DEMO_SEED_NOW='2026-07-27T12:00:00.000Z'
```

- [ ] **Step 2: Deploy, seed, and smoke-check**

```bash
npm run db:deploy
npm run db:seed
npm run db:seed:verify
```

Expected: all commands exit 0 and the JSON summary has nonzero required counts.

- [ ] **Step 3: Add current-data browser assertions**

The E2E test must verify visible outcomes, not database implementation:

- `/dashboard` rolling seven-day KPIs are nonzero;
- `/reports` current and previous 22–21 views show populated charts;
- `/reviews` includes all four active queue states and mixed SLA;
- `/coaching` shows open/in-progress/done around the anchor;
- `/calibration` shows draft/active/completed/archived;
- integration detail shows recent runs and errors.

- [ ] **Step 4: Run the new E2E**

```bash
npx playwright test tests/e2e/demo-data-current.spec.ts --project=chromium
```

Expected: PASS against the isolated seeded database.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/demo-data-current.spec.ts
git commit -m "test: verify current demo scenario in ui"
```

---

## Task 9: Run the full program gate

**Files:**

- Modify only for evidence-backed failures in the approved scope
- Capture: final light/dark screenshots for all audited routes

- [ ] **Step 1: Run static and unit gates**

```bash
npm run typecheck
npm run test
npm run build
```

Expected: all exit 0. A timeout is not dismissed unless the isolated rerun passes without a functional failure.

- [ ] **Step 2: Run full E2E on the isolated database**

```bash
npm run test:e2e
```

Expected: all scenarios exit 0; stale selectors are updated to role/name or approved `data-slot` without weakening assertions.

- [ ] **Step 3: Re-run the database smoke verifier with the real current time**

```bash
unset DEMO_SEED_NOW
npm run db:seed
npm run db:seed:verify
```

Expected: the scenario remains current at execution time and all required ranges/statuses are populated.

- [ ] **Step 4: Perform the final visual audit**

At 390, 768, 1280, and 1440 px in light and dark:

- `/reviews`;
- one review detail;
- `/reports`;
- `/dashboard`;
- one integration detail;
- `/coaching`;
- `/calibration`.

Compare the same route, viewport, theme, and state side by side with the original audit. Confirm no document overflow, zero-width control, invisible populated chart, broken word, console warning/error, or stale-empty current period remains.

- [ ] **Step 5: Search remaining legacy layout consumers**

Inventory rather than mechanically failing:

```bash
rg -n 'reviews-queue-kpis|queue-cockpit-layout|queue-controls-bar|conversation-message__|trend-chart__|interactive-sparkline__|review-workbench__panes|app-nav__areas' src tests
```

For every match, record whether it is:

- still a behavior hook with an explicit consumer;
- fully styled locally and safe;
- retired and removable.

- [ ] **Step 6: Close the gate without ad-hoc edits**

If the gate exposes a defect, return to the task that owns that behavior, add a
failing regression test there, and commit the minimal fix with that task’s exact
file list. If every command and visual check passes, make no empty “gate” commit.
