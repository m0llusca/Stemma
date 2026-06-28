# Stemma Omnichannel QA Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable wave of Stemma's Omnichannel QA Hub program: live certification runs, deeper first-wave integrations, action-channel messaging, AI Quality Ops drafts, unified operations UX, and route performance guards.

**Architecture:** Keep source runtime, certification evidence, messaging, AI drafts, and UI chrome in separate modules with narrow interfaces. Existing declarative contracts stay as the source of truth for readiness copy, while new runtime services write durable evidence and expose compact summaries to UI. Heavy vendor/runtime work remains behind server actions, route handlers, workers, or deferred panels so app shell routes stay lightweight.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/PostgreSQL, Vitest, Playwright, existing Stemma integration adapters, Context7 for current vendor/API docs, Lazyweb report for major UI screen changes.

## Global Constraints

- Use the approved design spec: `docs/superpowers/specs/2026-06-28-stemma-omnichannel-qa-hub-design.md`.
- Before modifying vendor adapter behavior, fetch current official docs with Context7 first; if Context7 has no useful result, use the vendor's official developer documentation directly.
- Every major UI screen change must go through a Lazyweb report with the current screenshot before implementation.
- Do not mark a source `live-certified` from fixtures, docs, or stubs.
- Do not present token-only or limited sources as complete one-click integrations.
- AI output is advisory by default and final quality decisions require human confirmation unless explicitly configured otherwise.
- Pages that only enqueue work or show summaries must not import LDAP, SCIM, worker runtime, vendor SDKs, Prisma-heavy registries, or adapter runtime directly.
- Semantic UI must distinguish positive, warning, negative, neutral, and info states.
- User-facing copy for new operational states should be Russian unless the surrounding file is explicitly English-only documentation.
- Use `npm install` and app commands from `apps/web`.
- Primary checks: `npm run test`, `npm run test:e2e`, and `npm run typecheck`.

---

## Scope And Task Boundaries

This spec spans several subsystems. Implement this plan as parallel-friendly tracks, but keep review gates per task. A task is complete only when its tests pass and it has its own commit.

## Karpathy Review Adjustments

Treat this document as a staged master plan, not a single implementation PR. Prefer the smallest task that can pass independently. If a task discovers that existing code already provides the required behavior, add or tighten tests and stop rather than refactoring adjacent code.

Do not implement optional write-back, marketplace OAuth, conversation ingest, or full cross-page UI migration unless the active task explicitly asks for it. Keep every task's changed lines traceable to its stated success criteria.

## File Structure Map

Certification:

- `apps/web/prisma/schema.prisma` stores durable certification runs, steps, and evidence links.
- `apps/web/src/lib/certification/runs.ts` owns certification run creation, step append, finalization, and summary projection.
- `apps/web/src/lib/certification/readiness-report.ts` remains the readiness projection and evidence redaction layer.
- `apps/web/tests/unit/certification-runs.test.ts` covers run state transitions and evidence redaction boundaries.
- `apps/web/tests/unit/prisma-schema.test.ts` covers schema and migration contracts.

Integration runtime:

- `apps/web/src/lib/integrations/connect/types.ts` defines pipeline extension points.
- `apps/web/src/lib/integrations/connect/orchestrator.ts` runs capability, webhook, and certification steps.
- `apps/web/src/lib/integrations/connect/next-action.ts` maps step failures to one clear user-facing repair action.
- `apps/web/src/lib/integrations/helpdesk-adapters/types.ts` defines optional probe and sync interfaces.
- `apps/web/src/lib/integrations/helpdesk-adapters/probes.ts` contains shared native helpdesk probe helpers.
- `apps/web/src/lib/integrations/helpdesk-adapters/*.ts` implement source-specific first-wave probes.
- `apps/web/src/lib/integrations/otrs-family/certification.ts` bridges the existing OTRS-family diagnostics/import path into certification evidence.

Messaging:

- `apps/web/src/lib/messaging/types.ts` defines action-channel and ingest-channel contracts.
- `apps/web/src/lib/messaging/registry.ts` declares Slack, Teams, Telegram, and WhatsApp readiness.
- `apps/web/src/lib/messaging/delivery.ts` records and sends action-channel notifications.
- `apps/web/src/lib/messaging/templates.ts` formats operational events.
- `apps/web/tests/unit/messaging-actions.test.ts` covers channel readiness, payloads, and redaction.

AI Quality Ops:

- `apps/web/src/lib/ai-quality/drafts.ts` owns draft creation and approval decisions.
- `apps/web/src/lib/ai-quality/types.ts` defines draft/decision types.
- `apps/web/tests/unit/ai-quality-drafts.test.ts` covers advisory behavior and human approval.

Operations UX:

- `apps/web/src/components/operations/operational-page-frame.tsx` gives pages a shared signals/action/details/evidence frame.
- `apps/web/src/components/operations/priority-action-panel.tsx` renders the dominant next action.
- `apps/web/src/components/operations/evidence-drawer.tsx` renders compact evidence details.
- `apps/web/src/lib/ui/semantic-status.ts` maps operational data into semantic color tones.
- `apps/web/src/app/dashboard/page.tsx`, `apps/web/src/app/reviews/page.tsx`, `apps/web/src/app/admin/integrations/page.tsx`, `apps/web/src/app/reports/page.tsx`, and training/coaching pages consume the shared pattern incrementally.

Performance:

- `apps/web/tests/unit/route-runtime-guards.test.ts` expands disallowed-import coverage.
- `apps/web/tests/unit/loading-boundaries.test.ts` verifies loading boundaries on heavy routes.
- `apps/web/tests/e2e/quick-views-layout.spec.ts` keeps quick-view toggles stable.
- `apps/web/tests/e2e/app-shell-routes.spec.ts` covers route shell smoke behavior.

---

### Task 1: Durable Certification Runs

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/20260628120000_add_certification_runs/migration.sql`
- Create: `apps/web/src/lib/certification/runs.ts`
- Test: `apps/web/tests/unit/certification-runs.test.ts`
- Modify: `apps/web/tests/unit/prisma-schema.test.ts`

**Interfaces:**
- Consumes: existing `CertificationEvidence`, `redactCertificationDiagnostics()`, `isProtectedLiveEnvGate()`.
- Produces:
  - `CertificationRunStatus = "running" | "passed" | "failed" | "blocked"`
  - `CertificationStepStatus = "pending" | "passed" | "failed" | "blocked" | "skipped"`
  - `createCertificationRun(input: CreateCertificationRunInput): Promise<CertificationRunView>`
  - `appendCertificationStep(input: AppendCertificationStepInput): Promise<CertificationStepView>`
  - `finalizeCertificationRun(input: FinalizeCertificationRunInput): Promise<CertificationRunView>`

- [ ] **Step 1: Write the failing schema test**

Add this test block to `apps/web/tests/unit/prisma-schema.test.ts`:

```ts
it("stores certification runs and ordered steps separately from evidence rows", () => {
  const runModel = modelBlock("CertificationRun");
  const stepModel = modelBlock("CertificationRunStep");
  const evidenceModel = modelBlock("CertificationEvidence");

  expect(runModel).toMatch(/model CertificationRun/);
  expect(runModel).toMatch(/workspaceId\s+String/);
  expect(runModel).toMatch(/targetType\s+String/);
  expect(runModel).toMatch(/source\s+String/);
  expect(runModel).toMatch(/status\s+String\s+@default\("running"\)/);
  expect(runModel).toMatch(/nextActionJson\s+String\s+@default\("\{\}"\)/);
  expect(runModel).toMatch(/steps\s+CertificationRunStep\[]/);
  expect(stepModel).toMatch(/runId\s+String/);
  expect(stepModel).toMatch(/stepKey\s+String/);
  expect(stepModel).toMatch(/position\s+Int/);
  expect(stepModel).toMatch(/diagnosticsJson\s+String\s+@default\("\{\}"\)/);
  expect(evidenceModel).toMatch(/certificationRunId\s+String\?/);
  expect(evidenceModel).toMatch(/certificationRun\s+CertificationRun\?/);
});
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `cd apps/web && npx vitest run tests/unit/prisma-schema.test.ts -t "stores certification runs"`

Expected: FAIL because `CertificationRun` and `CertificationRunStep` are not in `schema.prisma`.

- [ ] **Step 3: Add Prisma models**

Append the relation fields to existing models in `apps/web/prisma/schema.prisma`:

```prisma
model Workspace {
  certificationRuns         CertificationRun[]
}

model User {
  certificationRuns         CertificationRun[]           @relation("CertificationRunActor")
}

model Integration {
  certificationRuns      CertificationRun[]
}

model IdentityProvider {
  certificationRuns      CertificationRun[]
}
```

Add the new models near `CertificationEvidence`:

```prisma
model CertificationRun {
  id                      String                 @id @default(cuid())
  workspaceId             String
  workspace               Workspace              @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  targetType              String
  source                  String
  provider                String?
  integrationId           String?
  integration             Integration?           @relation(fields: [integrationId], references: [id], onDelete: SetNull)
  identityProviderId      String?
  identityProvider        IdentityProvider?      @relation(fields: [identityProviderId], references: [id], onDelete: SetNull)
  actorId                 String?
  actor                   User?                  @relation("CertificationRunActor", fields: [actorId], references: [id], onDelete: SetNull)
  status                  String                 @default("running")
  startedAt               DateTime               @default(now())
  finishedAt              DateTime?
  nextActionJson          String                 @default("{}")
  summaryJson             String                 @default("{}")
  steps                   CertificationRunStep[]
  evidence                CertificationEvidence[]
  createdAt               DateTime               @default(now())
  updatedAt               DateTime               @updatedAt

  @@index([workspaceId, targetType, source, startedAt])
  @@index([workspaceId, status, startedAt])
  @@index([integrationId, startedAt])
  @@index([identityProviderId, startedAt])
  @@index([actorId, startedAt])
}

model CertificationRunStep {
  id              String           @id @default(cuid())
  workspaceId     String
  runId           String
  run             CertificationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  stepKey         String
  position        Int
  status          String           @default("pending")
  detail          String?
  hint            String?
  diagnosticsJson String           @default("{}")
  startedAt       DateTime         @default(now())
  finishedAt      DateTime?
  createdAt       DateTime         @default(now())

  @@unique([runId, stepKey])
  @@unique([runId, position])
  @@index([workspaceId, runId, position])
  @@index([workspaceId, status, startedAt])
}
```

Add this field to `CertificationEvidence`:

```prisma
model CertificationEvidence {
  certificationRunId      String?
  certificationRun        CertificationRun?  @relation(fields: [certificationRunId], references: [id], onDelete: SetNull)

  @@index([certificationRunId, recordedAt])
}
```

- [ ] **Step 4: Add the SQL migration**

Create `apps/web/prisma/migrations/20260628120000_add_certification_runs/migration.sql`:

```sql
CREATE TABLE "CertificationRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "provider" TEXT,
  "integrationId" TEXT,
  "identityProviderId" TEXT,
  "actorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "nextActionJson" TEXT NOT NULL DEFAULT '{}',
  "summaryJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CertificationRunStep" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "detail" TEXT,
  "hint" TEXT,
  "diagnosticsJson" TEXT NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificationRunStep_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CertificationEvidence" ADD COLUMN "certificationRunId" TEXT;

CREATE INDEX "CertificationRun_workspaceId_targetType_source_startedAt_idx"
  ON "CertificationRun"("workspaceId", "targetType", "source", "startedAt");
CREATE INDEX "CertificationRun_workspaceId_status_startedAt_idx"
  ON "CertificationRun"("workspaceId", "status", "startedAt");
CREATE INDEX "CertificationRun_integrationId_startedAt_idx"
  ON "CertificationRun"("integrationId", "startedAt");
CREATE INDEX "CertificationRun_identityProviderId_startedAt_idx"
  ON "CertificationRun"("identityProviderId", "startedAt");
CREATE INDEX "CertificationRun_actorId_startedAt_idx"
  ON "CertificationRun"("actorId", "startedAt");

CREATE UNIQUE INDEX "CertificationRunStep_runId_stepKey_key"
  ON "CertificationRunStep"("runId", "stepKey");
CREATE UNIQUE INDEX "CertificationRunStep_runId_position_key"
  ON "CertificationRunStep"("runId", "position");
CREATE INDEX "CertificationRunStep_workspaceId_runId_position_idx"
  ON "CertificationRunStep"("workspaceId", "runId", "position");
CREATE INDEX "CertificationRunStep_workspaceId_status_startedAt_idx"
  ON "CertificationRunStep"("workspaceId", "status", "startedAt");
CREATE INDEX "CertificationEvidence_certificationRunId_recordedAt_idx"
  ON "CertificationEvidence"("certificationRunId", "recordedAt");

ALTER TABLE "CertificationRun"
  ADD CONSTRAINT "CertificationRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CertificationRun"
  ADD CONSTRAINT "CertificationRun_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificationRun"
  ADD CONSTRAINT "CertificationRun_identityProviderId_fkey"
  FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificationRun"
  ADD CONSTRAINT "CertificationRun_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificationRunStep"
  ADD CONSTRAINT "CertificationRunStep_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "CertificationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CertificationEvidence"
  ADD CONSTRAINT "CertificationEvidence_certificationRunId_fkey"
  FOREIGN KEY ("certificationRunId") REFERENCES "CertificationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Write the failing service tests**

Create `apps/web/tests/unit/certification-runs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const stepCreateMock = vi.fn();
const updateMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    certificationRun: {
      create: createMock,
      update: updateMock,
      findUnique: findUniqueMock
    },
    certificationRunStep: {
      create: stepCreateMock
    }
  }
}));

describe("certification runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a running certification run with redacted summary defaults", async () => {
    const { createCertificationRun } = await import("@/lib/certification/runs");
    createMock.mockResolvedValue({
      id: "run-1",
      workspaceId: "workspace-1",
      targetType: "integration",
      source: "zendesk",
      provider: null,
      integrationId: "integration-1",
      identityProviderId: null,
      actorId: "user-1",
      status: "running",
      startedAt: new Date("2026-06-28T10:00:00.000Z"),
      finishedAt: null,
      nextActionJson: "{}",
      summaryJson: "{}"
    });

    const result = await createCertificationRun({
      workspaceId: "workspace-1",
      targetType: "integration",
      source: "zendesk",
      integrationId: "integration-1",
      actorId: "user-1"
    });

    expect(createMock).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        targetType: "integration",
        source: "zendesk",
        provider: null,
        integrationId: "integration-1",
        identityProviderId: null,
        actorId: "user-1",
        status: "running",
        nextActionJson: "{}",
        summaryJson: "{}"
      }
    });
    expect(result).toMatchObject({ id: "run-1", status: "running", nextAction: {} });
  });

  it("records ordered steps with redacted diagnostics", async () => {
    const { appendCertificationStep } = await import("@/lib/certification/runs");
    stepCreateMock.mockResolvedValue({
      id: "step-1",
      workspaceId: "workspace-1",
      runId: "run-1",
      stepKey: "auth_check",
      position: 2,
      status: "failed",
      detail: "Ошибка авторизации",
      hint: "Проверьте токен",
      diagnosticsJson: JSON.stringify({ Authorization: "[redacted]" }),
      startedAt: new Date("2026-06-28T10:00:00.000Z"),
      finishedAt: new Date("2026-06-28T10:00:01.000Z")
    });

    const result = await appendCertificationStep({
      workspaceId: "workspace-1",
      runId: "run-1",
      stepKey: "auth_check",
      position: 2,
      status: "failed",
      detail: "Ошибка авторизации",
      hint: "Проверьте токен",
      diagnostics: { Authorization: "Bearer raw" },
      finishedAt: new Date("2026-06-28T10:00:01.000Z")
    });

    expect(stepCreateMock.mock.calls[0][0].data.diagnosticsJson).toBe(JSON.stringify({ Authorization: "[redacted]" }));
    expect(result).toMatchObject({ stepKey: "auth_check", status: "failed" });
  });
});
```

- [ ] **Step 6: Run the service tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/unit/certification-runs.test.ts`

Expected: FAIL with missing module `@/lib/certification/runs`.

- [ ] **Step 7: Implement the certification run service**

Create `apps/web/src/lib/certification/runs.ts`:

```ts
import { prisma } from "@/lib/db";
import { redactCertificationDiagnostics, type CertificationEvidenceTargetType } from "@/lib/certification/readiness-report";

export type CertificationRunStatus = "running" | "passed" | "failed" | "blocked";
export type CertificationStepStatus = "pending" | "passed" | "failed" | "blocked" | "skipped";

export type CertificationRunView = {
  id: string;
  workspaceId: string;
  targetType: CertificationEvidenceTargetType;
  source: string;
  provider: string | null;
  integrationId: string | null;
  identityProviderId: string | null;
  actorId: string | null;
  status: CertificationRunStatus;
  startedAt: string;
  finishedAt: string | null;
  nextAction: Record<string, unknown>;
  summary: Record<string, unknown>;
};

export type CertificationStepView = {
  id: string;
  workspaceId: string;
  runId: string;
  stepKey: string;
  position: number;
  status: CertificationStepStatus;
  detail: string | null;
  hint: string | null;
  diagnostics: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
};

export type CreateCertificationRunInput = {
  workspaceId: string;
  targetType: CertificationEvidenceTargetType;
  source: string;
  provider?: string | null;
  integrationId?: string | null;
  identityProviderId?: string | null;
  actorId?: string | null;
  nextAction?: Record<string, unknown>;
  summary?: Record<string, unknown>;
};

export type AppendCertificationStepInput = {
  workspaceId: string;
  runId: string;
  stepKey: string;
  position: number;
  status: CertificationStepStatus;
  detail?: string | null;
  hint?: string | null;
  diagnostics?: unknown;
  finishedAt?: Date | null;
};

export type FinalizeCertificationRunInput = {
  runId: string;
  status: Exclude<CertificationRunStatus, "running">;
  nextAction?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  finishedAt?: Date;
};

function parseRecord(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeRunStatus(status: string): CertificationRunStatus {
  return status === "passed" || status === "failed" || status === "blocked" ? status : "running";
}

function normalizeStepStatus(status: string): CertificationStepStatus {
  return status === "passed" || status === "failed" || status === "blocked" || status === "skipped" ? status : "pending";
}

function runView(row: {
  id: string;
  workspaceId: string;
  targetType: string;
  source: string;
  provider: string | null;
  integrationId: string | null;
  identityProviderId: string | null;
  actorId: string | null;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  nextActionJson: string;
  summaryJson: string;
}): CertificationRunView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    targetType: row.targetType === "identity_provider" ? "identity_provider" : "integration",
    source: row.source,
    provider: row.provider,
    integrationId: row.integrationId,
    identityProviderId: row.identityProviderId,
    actorId: row.actorId,
    status: normalizeRunStatus(row.status),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    nextAction: parseRecord(row.nextActionJson),
    summary: parseRecord(row.summaryJson)
  };
}

function stepView(row: {
  id: string;
  workspaceId: string;
  runId: string;
  stepKey: string;
  position: number;
  status: string;
  detail: string | null;
  hint: string | null;
  diagnosticsJson: string;
  startedAt: Date;
  finishedAt: Date | null;
}): CertificationStepView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    runId: row.runId,
    stepKey: row.stepKey,
    position: row.position,
    status: normalizeStepStatus(row.status),
    detail: row.detail,
    hint: row.hint,
    diagnostics: parseRecord(row.diagnosticsJson),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null
  };
}

export async function createCertificationRun(input: CreateCertificationRunInput): Promise<CertificationRunView> {
  const row = await prisma.certificationRun.create({
    data: {
      workspaceId: input.workspaceId,
      targetType: input.targetType,
      source: input.source,
      provider: input.provider ?? null,
      integrationId: input.integrationId ?? null,
      identityProviderId: input.identityProviderId ?? null,
      actorId: input.actorId ?? null,
      status: "running",
      nextActionJson: JSON.stringify(input.nextAction ?? {}),
      summaryJson: JSON.stringify(input.summary ?? {})
    }
  });

  return runView(row);
}

export async function appendCertificationStep(input: AppendCertificationStepInput): Promise<CertificationStepView> {
  const row = await prisma.certificationRunStep.create({
    data: {
      workspaceId: input.workspaceId,
      runId: input.runId,
      stepKey: input.stepKey,
      position: input.position,
      status: input.status,
      detail: input.detail ?? null,
      hint: input.hint ?? null,
      diagnosticsJson: JSON.stringify(redactCertificationDiagnostics(input.diagnostics ?? {})),
      ...(input.finishedAt ? { finishedAt: input.finishedAt } : {})
    }
  });

  return stepView(row);
}

export async function finalizeCertificationRun(input: FinalizeCertificationRunInput): Promise<CertificationRunView> {
  const row = await prisma.certificationRun.update({
    where: { id: input.runId },
    data: {
      status: input.status,
      finishedAt: input.finishedAt ?? new Date(),
      ...(input.nextAction ? { nextActionJson: JSON.stringify(input.nextAction) } : {}),
      ...(input.summary ? { summaryJson: JSON.stringify(input.summary) } : {})
    }
  });

  return runView(row);
}
```

- [ ] **Step 8: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/certification-runs.test.ts tests/unit/prisma-schema.test.ts -t "certification"
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260628120000_add_certification_runs/migration.sql src/lib/certification/runs.ts tests/unit/certification-runs.test.ts tests/unit/prisma-schema.test.ts
git commit -m "feat(certification): add durable certification runs"
```

---

### Task 2: Connect Pipeline Certification Probes And Next Action

**Files:**
- Modify: `apps/web/src/lib/integrations/connect/types.ts`
- Modify: `apps/web/src/lib/integrations/connect/orchestrator.ts`
- Create: `apps/web/src/lib/integrations/connect/next-action.ts`
- Test: `apps/web/tests/unit/connect-orchestrator.test.ts`
- Test: `apps/web/tests/unit/connect-next-action.test.ts`

**Interfaces:**
- Consumes: existing `runConnectPipeline()`, `SourceConnectionProfile`.
- Produces:
  - `ConnectStepKey` includes `capability_probe`, `webhook_probe`, `certification_evidence`.
  - `ConnectNextAction = { label: string; description: string; severity: "info" | "warning" | "negative"; action: "fix_auth" | "configure_webhook" | "run_live_certification" | "open_source" }`
  - `nextActionForConnectSteps(steps: ConnectStep[]): ConnectNextAction`

- [ ] **Step 1: Write failing next-action tests**

Create `apps/web/tests/unit/connect-next-action.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextActionForConnectSteps } from "@/lib/integrations/connect/next-action";
import type { ConnectStep } from "@/lib/integrations/connect/types";

describe("connect next action", () => {
  it("routes failed auth to credential repair", () => {
    const steps: ConnectStep[] = [
      { step: "validate_url", status: "ok" },
      { step: "verify_auth", status: "failed", detail: "401" }
    ];

    expect(nextActionForConnectSteps(steps)).toEqual({
      label: "Проверить доступы",
      description: "Источник не подтвердил учетные данные. Обновите токен или OAuth-настройки и повторите проверку.",
      severity: "negative",
      action: "fix_auth"
    });
  });

  it("routes successful token setup without webhook to live certification", () => {
    const steps: ConnectStep[] = [
      { step: "validate_url", status: "ok" },
      { step: "verify_auth", status: "ok" },
      { step: "capability_probe", status: "ok" },
      { step: "webhook_probe", status: "warning" },
      { step: "certification_evidence", status: "ok" }
    ];

    expect(nextActionForConnectSteps(steps)).toEqual({
      label: "Запустить живую сертификацию",
      description: "Базовое подключение готово. Для production-ready статуса нужен protected smoke-run с evidence.",
      severity: "warning",
      action: "run_live_certification"
    });
  });
});
```

- [ ] **Step 2: Run the next-action tests to verify failure**

Run: `cd apps/web && npx vitest run tests/unit/connect-next-action.test.ts`

Expected: FAIL because `next-action.ts` does not exist.

- [ ] **Step 3: Extend connect types**

Modify `apps/web/src/lib/integrations/connect/types.ts`:

```ts
export type ConnectStepKey =
  | "validate_url"
  | "reachability"
  | "auto_detect"
  | "verify_auth"
  | "capability_probe"
  | "webhook_probe"
  | "persist"
  | "test_import"
  | "certification_evidence";

export type CapabilityProbeResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type WebhookProbeResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type CertificationEvidenceResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type SourceConnectionProfile = {
  source: string;
  type: "otrs_family" | "native_helpdesk" | "enterprise" | "data_source";
  urlPolicy: "required" | "fixed" | "optional";
  fixedBaseUrl?: string;
  hostPatterns?: RegExp[];
  credentialFields: CredentialField[];
  normalizeUrl(raw: string): { baseUrl: string; hints?: UrlHints };
  autoDetect?(ctx: ConnectContext): Promise<AutoDetectResult>;
  verifyAuth(ctx: ConnectContext): Promise<VerifyResult>;
  probeCapabilities?(ctx: ConnectContext): Promise<CapabilityProbeResult>;
  probeWebhooks?(ctx: ConnectContext): Promise<WebhookProbeResult>;
  recordCertificationEvidence?(ctx: ConnectContext): Promise<CertificationEvidenceResult>;
  testImport?(ctx: ConnectContext): Promise<TestImportResult>;
};
```

- [ ] **Step 4: Implement next-action mapping**

Create `apps/web/src/lib/integrations/connect/next-action.ts`:

```ts
import type { ConnectStep } from "@/lib/integrations/connect/types";

export type ConnectNextAction = {
  label: string;
  description: string;
  severity: "info" | "warning" | "negative";
  action: "fix_auth" | "configure_webhook" | "run_live_certification" | "open_source";
};

export function nextActionForConnectSteps(steps: ConnectStep[]): ConnectNextAction {
  const failed = steps.find((step) => step.status === "failed");

  if (failed?.step === "verify_auth") {
    return {
      label: "Проверить доступы",
      description: "Источник не подтвердил учетные данные. Обновите токен или OAuth-настройки и повторите проверку.",
      severity: "negative",
      action: "fix_auth"
    };
  }

  if (failed?.step === "validate_url" || failed?.step === "reachability") {
    return {
      label: "Проверить адрес источника",
      description: "Stemma не смогла открыть источник. Проверьте URL, сетевой доступ и private-network настройки.",
      severity: "negative",
      action: "open_source"
    };
  }

  const webhookWarning = steps.find((step) => step.step === "webhook_probe" && step.status === "warning");
  if (webhookWarning) {
    return {
      label: "Запустить живую сертификацию",
      description: "Базовое подключение готово. Для production-ready статуса нужен protected smoke-run с evidence.",
      severity: "warning",
      action: "run_live_certification"
    };
  }

  return {
    label: "Открыть источник",
    description: "Источник подключен. Проверьте импорт, диагностику и readiness evidence.",
    severity: "info",
    action: "open_source"
  };
}
```

- [ ] **Step 5: Extend the orchestrator**

In `apps/web/src/lib/integrations/connect/orchestrator.ts`, after `verify_auth` succeeds and before `persist`, add:

```ts
  if (profile.probeCapabilities) {
    const probed = await profile.probeCapabilities(ctx);
    steps.push({
      step: "capability_probe",
      status: probed.status,
      detail: probed.detail,
      hint: probed.hint
    });
    if (probed.status === "failed") {
      return { steps, connected: false };
    }
  } else {
    steps.push({
      step: "capability_probe",
      status: "skipped",
      detail: "Для этого источника пока нет отдельной проверки возможностей."
    });
  }

  if (profile.probeWebhooks) {
    const probed = await profile.probeWebhooks(ctx);
    steps.push({
      step: "webhook_probe",
      status: probed.status,
      detail: probed.detail,
      hint: probed.hint
    });
  } else {
    steps.push({
      step: "webhook_probe",
      status: "skipped",
      detail: "Вебхуки будут проверены на этапе живой сертификации."
    });
  }
```

After `test_import`, add:

```ts
  if (profile.recordCertificationEvidence) {
    const recorded = await profile.recordCertificationEvidence(ctx);
    steps.push({
      step: "certification_evidence",
      status: recorded.status,
      detail: recorded.detail,
      hint: recorded.hint
    });
  } else {
    steps.push({
      step: "certification_evidence",
      status: "skipped",
      detail: "Evidence будет записан при protected live smoke-run."
    });
  }
```

- [ ] **Step 6: Add orchestrator test coverage**

Extend `apps/web/tests/unit/connect-orchestrator.test.ts` with:

```ts
it("runs capability and webhook probes before persisting the source", async () => {
  const calls: string[] = [];
  const profile = {
    source: "zendesk",
    type: "native_helpdesk",
    urlPolicy: "required",
    credentialFields: [],
    normalizeUrl: () => ({ baseUrl: "https://example.zendesk.com" }),
    verifyAuth: async () => {
      calls.push("verify");
      return { status: "ok" as const, authMode: "basic_api_token", secretSlots: [] };
    },
    probeCapabilities: async () => {
      calls.push("capabilities");
      return { status: "ok" as const, detail: "Tickets API доступен." };
    },
    probeWebhooks: async () => {
      calls.push("webhooks");
      return { status: "warning" as const, detail: "Webhook не настроен автоматически." };
    }
  };

  const result = await runConnectPipeline({
    profile,
    rawUrl: "https://example.zendesk.com",
    credentials: {},
    workspaceId: "workspace-1",
    actorId: "user-1",
    reachabilityCheck: async () => ({ status: "ok" as const }),
    persist: async () => {
      calls.push("persist");
      return { integrationId: "integration-1" };
    }
  });

  expect(calls).toEqual(["verify", "capabilities", "webhooks", "persist"]);
  expect(result.steps.map((step) => step.step)).toContain("capability_probe");
  expect(result.steps.map((step) => step.step)).toContain("webhook_probe");
});
```

- [ ] **Step 7: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/connect-next-action.test.ts tests/unit/connect-orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/integrations/connect/types.ts src/lib/integrations/connect/orchestrator.ts src/lib/integrations/connect/next-action.ts tests/unit/connect-orchestrator.test.ts tests/unit/connect-next-action.test.ts
git commit -m "feat(connect): add certification probe steps"
```

---

### Task 3: Source Documentation Gate And Contract Refresh

**Files:**
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`
- Modify: `apps/web/src/lib/integrations/install-contracts/registry.ts`
- Create: `apps/web/src/lib/integrations/source-doc-gate.ts`
- Test: `apps/web/tests/unit/source-doc-gate.test.ts`
- Modify: `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts`
- Modify: `apps/web/tests/unit/integration-install-contracts.test.ts`
- Modify: `docs/integration-install-contracts.md`

**Interfaces:**
- Consumes: existing helpdesk and install contract registries.
- Produces:
  - `requiredOfficialDocTargets(): OfficialDocTarget[]`
  - `assertContractDocsFresh(checkedAt: string, today?: Date): { ok: boolean; ageDays: number }`
  - `OfficialDocTarget = { source: string; label: string; href: string; context7Id?: string; requiredBeforeCodeChange: true }`

- [ ] **Step 1: Run docs lookup before editing contracts**

For each source changed in this task, run Context7 `resolve-library-id` and `query_docs` first. Minimum sources for this task:

```text
Zendesk API
Intercom API
HubSpot API
Jira Service Management REST API
Freshdesk API
Salesforce REST API
ServiceNow REST API
Microsoft Dynamics 365 Customer Service
```

Record the selected Context7 id in `officialDocs[].context7Id` when Context7 returns a useful official source. If Context7 has no useful result, keep `context7Id` undefined and use the official `href`.

- [ ] **Step 2: Write failing source-doc gate test**

Create `apps/web/tests/unit/source-doc-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  assertContractDocsFresh,
  requiredOfficialDocTargets
} from "@/lib/integrations/source-doc-gate";

describe("source documentation gate", () => {
  it("lists first-wave docs that must be checked before adapter changes", () => {
    expect(requiredOfficialDocTargets().map((target) => target.source)).toEqual(
      expect.arrayContaining(["zendesk", "intercom", "hubspot", "jira", "otrs", "znuny", "otobo"])
    );
    expect(requiredOfficialDocTargets().every((target) => target.requiredBeforeCodeChange)).toBe(true);
  });

  it("flags stale source docs after 120 days", () => {
    expect(assertContractDocsFresh("2026-06-28", new Date("2026-08-01T00:00:00.000Z"))).toEqual({
      ok: true,
      ageDays: 34
    });
    expect(assertContractDocsFresh("2026-01-01", new Date("2026-06-28T00:00:00.000Z"))).toEqual({
      ok: false,
      ageDays: 178
    });
  });
});
```

- [ ] **Step 3: Run the source-doc gate test to verify failure**

Run: `cd apps/web && npx vitest run tests/unit/source-doc-gate.test.ts`

Expected: FAIL because `source-doc-gate.ts` does not exist.

- [ ] **Step 4: Implement the source-doc gate**

Create `apps/web/src/lib/integrations/source-doc-gate.ts`:

```ts
import { phaseBSourceContracts } from "@/lib/integrations/helpdesk-adapters/source-contracts";

export type OfficialDocTarget = {
  source: string;
  label: string;
  href: string;
  context7Id?: string;
  requiredBeforeCodeChange: true;
};

const maxDocAgeDays = 120;

export function requiredOfficialDocTargets(): OfficialDocTarget[] {
  return Object.values(phaseBSourceContracts).flatMap((contract) =>
    contract.officialDocs.map((doc) => ({
      source: contract.source,
      label: doc.label,
      href: doc.href,
      ...(doc.context7Id ? { context7Id: doc.context7Id } : {}),
      requiredBeforeCodeChange: true as const
    }))
  );
}

export function assertContractDocsFresh(checkedAt: string, today = new Date()) {
  const checkedTime = new Date(`${checkedAt}T00:00:00.000Z`).getTime();
  const todayTime = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ageDays = Math.floor((todayTime - checkedTime) / 86_400_000);

  return {
    ok: Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= maxDocAgeDays,
    ageDays
  };
}
```

- [ ] **Step 5: Refresh checkedAt and contract copy**

In `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`, update every first-wave `officialDocs` entry touched by this task to `checkedAt: "2026-06-28"` and add notes with exact API concerns:

```ts
{
  label: "Zendesk Search API",
  href: "https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/",
  context7Id: "/websites/developer_zendesk_api-reference",
  checkedAt: "2026-06-28",
  notes: [
    "Confirmed cursor pagination fields links.next, meta.has_more, and meta.after_cursor.",
    "Search endpoint remains rate-limited separately and also counts toward global API limits."
  ]
}
```

For Intercom, HubSpot, Jira, Freshdesk, Salesforce, ServiceNow, and Dynamics, add source-specific notes that name the exact verified endpoint, auth/scoping constraint, pagination/rate-limit behavior, and any webhook limitation found in official docs. Do not promote readiness based on docs alone, and do not invent a Context7 id if no useful official result was returned.

- [ ] **Step 6: Update install-contract limitations**

In `apps/web/src/lib/integrations/install-contracts/registry.ts`, replace generic registry-only copy for first-wave sources with user-facing limitations:

```ts
"Подключение доступно через текущий token/basic flow; production-ready статус появится только после живой сертификации.",
"Webhook readiness проверяется отдельно и не означает автоматическую регистрацию vendor webhook.",
"OAuth one-click install включается только после redirect/callback, token refresh и scope checks."
```

- [ ] **Step 7: Update docs**

Append this section to `docs/integration-install-contracts.md`:

```md
## Source Documentation Gate

Before changing adapter runtime behavior, the implementer must check the current official vendor documentation. Use Context7 first when it has official coverage. If Context7 does not return a useful official source, use the vendor's official developer documentation directly and record the `checkedAt` date in the source contract.

Contract documentation older than 120 days is stale for runtime changes. A stale contract can remain in the registry, but the adapter cannot be promoted to a deeper readiness state until the docs are refreshed.
```

- [ ] **Step 8: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/source-doc-gate.test.ts tests/unit/helpdesk-adapter-contracts.test.ts tests/unit/integration-install-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/integrations/source-doc-gate.ts src/lib/integrations/helpdesk-adapters/source-contracts.ts src/lib/integrations/install-contracts/registry.ts tests/unit/source-doc-gate.test.ts tests/unit/helpdesk-adapter-contracts.test.ts tests/unit/integration-install-contracts.test.ts ../../docs/integration-install-contracts.md
git commit -m "docs(integrations): enforce source documentation gate"
```

---

### Task 4: Native Helpdesk Capability Probes

**Files:**
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/types.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/probes.ts`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/zendesk.ts`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/intercom.ts`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/hubspot.ts`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/jira.ts`
- Test: `apps/web/tests/unit/helpdesk-adapter-probes.test.ts`
- Modify: `apps/web/tests/fixtures/helpdesk-adapter-server.ts`

**Interfaces:**
- Consumes: `createHelpdeskHttpClient()`, `HelpdeskAdapterLoadInput`.
- Produces:
  - `HelpdeskCapabilityProbeResult = { status: "ok" | "warning" | "failed"; operations: HelpdeskAdapterOperation[]; diagnostics: HelpdeskAdapterLoadResult["diagnostics"]; detail: string; hint?: string }`
  - Optional adapter method `probeCapabilities(input: HelpdeskAdapterProbeInput): Promise<HelpdeskCapabilityProbeResult>`

- [ ] **Step 1: Write failing probe tests**

Create `apps/web/tests/unit/helpdesk-adapter-probes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createZendeskAdapter } from "@/lib/integrations/helpdesk-adapters/zendesk";
import { createIntercomAdapter } from "@/lib/integrations/helpdesk-adapters/intercom";
import { createHubspotAdapter } from "@/lib/integrations/helpdesk-adapters/hubspot";
import { createJiraAdapter } from "@/lib/integrations/helpdesk-adapters/jira";
import { createHelpdeskAdapterServer } from "../fixtures/helpdesk-adapter-server";

describe("native helpdesk capability probes", () => {
  it("confirms Zendesk ticket and comments operations", async () => {
    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });

    try {
      const result = await createZendeskAdapter().probeCapabilities({
        source: "zendesk",
        baseUrl: server.baseUrl,
        token: "user/token:secret",
        externalId: "ZD-1001"
      });

      expect(result).toMatchObject({
        status: "ok",
        operations: expect.arrayContaining(["ticket_get", "comments_get"])
      });
    } finally {
      await server.close();
    }
  });

  it("confirms Intercom conversation retrieval with the pinned API version", async () => {
    const server = await createHelpdeskAdapterServer({ source: "intercom", mode: "success" });

    try {
      const result = await createIntercomAdapter().probeCapabilities({
        source: "intercom",
        baseUrl: server.baseUrl,
        token: "token",
        externalId: "conv-1001"
      });

      expect(result.status).toBe("ok");
      expect(result.operations).toContain("conversations_get");
      expect(result.diagnostics.requests[0].url).toContain("/conversations/");
    } finally {
      await server.close();
    }
  });

  it("confirms HubSpot and Jira read probes without live certification", async () => {
    const hubspotServer = await createHelpdeskAdapterServer({ source: "hubspot", mode: "success" });
    const jiraServer = await createHelpdeskAdapterServer({ source: "jira", mode: "success" });

    try {
      await expect(
        createHubspotAdapter().probeCapabilities({
          source: "hubspot",
          baseUrl: hubspotServer.baseUrl,
          token: "token",
          externalId: "4302"
        })
      ).resolves.toMatchObject({ status: "ok" });

      await expect(
        createJiraAdapter().probeCapabilities({
          source: "jira",
          baseUrl: jiraServer.baseUrl,
          token: "email:token",
          externalId: "JSM-184"
        })
      ).resolves.toMatchObject({ status: "ok" });
    } finally {
      await Promise.all([hubspotServer.close(), jiraServer.close()]);
    }
  });
});
```

- [ ] **Step 2: Run probe tests to verify failure**

Run: `cd apps/web && npx vitest run tests/unit/helpdesk-adapter-probes.test.ts`

Expected: FAIL because adapters do not expose `probeCapabilities`.

- [ ] **Step 3: Extend helpdesk adapter types**

Modify `apps/web/src/lib/integrations/helpdesk-adapters/types.ts`:

```ts
export type HelpdeskAdapterProbeInput = Omit<HelpdeskAdapterLoadInput, "externalId"> & {
  externalId?: string;
};

export type HelpdeskCapabilityProbeResult = {
  status: "ok" | "warning" | "failed";
  operations: HelpdeskAdapterOperation[];
  detail: string;
  hint?: string;
  diagnostics: HelpdeskAdapterLoadResult["diagnostics"];
};

export type HelpdeskAdapter = {
  loadConversation(input: HelpdeskAdapterLoadInput): Promise<HelpdeskAdapterLoadResult>;
  probeCapabilities?(input: HelpdeskAdapterProbeInput): Promise<HelpdeskCapabilityProbeResult>;
};
```

Update `createHelpdeskAdapter()` return type in `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`:

```ts
import type { HelpdeskAdapter, PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

export function createHelpdeskAdapter(source: PhaseBHelpdeskSource): HelpdeskAdapter {
  // existing body
}
```

- [ ] **Step 4: Add shared probe helper**

Create `apps/web/src/lib/integrations/helpdesk-adapters/probes.ts`:

```ts
import type {
  HelpdeskAdapterLoadInput,
  HelpdeskAdapterLoadResult,
  HelpdeskAdapterOperation,
  HelpdeskCapabilityProbeResult
} from "@/lib/integrations/helpdesk-adapters/types";

export function capabilityProbeFromLoadResult(
  input: Pick<HelpdeskAdapterLoadInput, "source">,
  result: HelpdeskAdapterLoadResult,
  requiredOperations: readonly HelpdeskAdapterOperation[]
): HelpdeskCapabilityProbeResult {
  const observed = result.diagnostics.requests.map((request) => request.operation);
  const missing = requiredOperations.filter((operation) => !observed.includes(operation));

  if (missing.length > 0) {
    return {
      status: "warning",
      operations: observed,
      detail: `${input.source}: часть операций не подтверждена.`,
      hint: `Не подтверждены операции: ${missing.join(", ")}.`,
      diagnostics: result.diagnostics
    };
  }

  return {
    status: "ok",
    operations: observed,
    detail: `${input.source}: чтение источника подтверждено.`,
    diagnostics: result.diagnostics
  };
}
```

- [ ] **Step 5: Add adapter methods**

In each first-wave native adapter, import the helper:

```ts
import { capabilityProbeFromLoadResult } from "@/lib/integrations/helpdesk-adapters/probes";
```

Add this method next to `loadConversation` for Zendesk:

```ts
async probeCapabilities(input: HelpdeskAdapterProbeInput): Promise<HelpdeskCapabilityProbeResult> {
  if (!input.externalId) {
    return {
      status: "warning",
      operations: [],
      detail: "Для проверки Zendesk нужен тестовый ticket ID.",
      hint: "Укажите ticket ID и повторите проверку.",
      diagnostics: { requests: [] }
    };
  }

  const loaded = await this.loadConversation({
    ...input,
    externalId: input.externalId
  });
  return capabilityProbeFromLoadResult(input, loaded, ["ticket_get", "comments_get"]);
}
```

Use the same pattern with required operations:

```ts
// Intercom
["conversations_get"]

// HubSpot
["ticket_get", "activities_get"]

// Jira Service Management
["ticket_get", "comments_get"]
```

- [ ] **Step 6: Extend fixtures**

Add missing fixture routes to `apps/web/tests/fixtures/helpdesk-adapter-server.ts` so the tests above return successful JSON for:

```text
/crm/v3/objects/tickets/:id
/crm/v3/objects/tickets/:id/associations/*
/rest/servicedeskapi/request/:issueIdOrKey
/rest/servicedeskapi/request/:issueIdOrKey/comment
```

Each fixture route must return the same minimal payload shape already consumed by the current normalizers.

- [ ] **Step 7: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/helpdesk-adapter-probes.test.ts tests/unit/helpdesk-adapter-service.test.ts tests/unit/native-helpdesk-normalizer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/integrations/helpdesk-adapters/types.ts src/lib/integrations/helpdesk-adapters/index.ts src/lib/integrations/helpdesk-adapters/probes.ts src/lib/integrations/helpdesk-adapters/zendesk.ts src/lib/integrations/helpdesk-adapters/intercom.ts src/lib/integrations/helpdesk-adapters/hubspot.ts src/lib/integrations/helpdesk-adapters/jira.ts tests/unit/helpdesk-adapter-probes.test.ts tests/fixtures/helpdesk-adapter-server.ts
git commit -m "feat(integrations): add native helpdesk capability probes"
```

---

### Task 5: OTRS-Family Certification Bridge

**Files:**
- Create: `apps/web/src/lib/integrations/otrs-family/certification.ts`
- Modify: `apps/web/src/lib/integrations/otrs-family/service.ts`
- Test: `apps/web/tests/unit/otrs-family-certification.test.ts`
- Modify: `apps/web/tests/unit/otrs-family-diagnostics.test.ts`

**Interfaces:**
- Consumes: OTRS-family diagnostics and import-plan services.
- Produces:
  - `buildOtrsCertificationSteps(input: OtrsCertificationInput): CertificationStepDraft[]`
  - `recordOtrsCertificationRun(input: OtrsCertificationRunInput): Promise<CertificationRunView>`

- [ ] **Step 1: Write failing certification bridge test**

Create `apps/web/tests/unit/otrs-family-certification.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/certification/runs", () => ({
  createCertificationRun: vi.fn(async () => ({ id: "run-1", status: "running" })),
  appendCertificationStep: vi.fn(async (input) => ({ id: `step-${input.position}`, ...input })),
  finalizeCertificationRun: vi.fn(async () => ({ id: "run-1", status: "blocked" }))
}));

describe("OTRS-family certification bridge", () => {
  it("turns diagnostics and sample import into ordered certification steps", async () => {
    const { buildOtrsCertificationSteps } = await import("@/lib/integrations/otrs-family/certification");
    const steps = buildOtrsCertificationSteps({
      source: "znuny",
      diagnostics: {
        routeDetected: true,
        authOk: true,
        ticketSearchOk: true,
        webhookOk: false
      },
      sampleImport: {
        imported: 18,
        skipped: 0
      }
    });

    expect(steps.map((step) => step.stepKey)).toEqual([
      "contract_check",
      "auth_check",
      "capability_check",
      "sample_import",
      "webhook_or_polling_check",
      "evidence_lock"
    ]);
    expect(steps.find((step) => step.stepKey === "webhook_or_polling_check")).toMatchObject({
      status: "blocked",
      hint: "Настройте webhook или подтвердите polling fallback для Znuny."
    });
  });
});
```

- [ ] **Step 2: Run OTRS bridge test to verify failure**

Run: `cd apps/web && npx vitest run tests/unit/otrs-family-certification.test.ts`

Expected: FAIL because `otrs-family/certification.ts` does not exist.

- [ ] **Step 3: Implement OTRS bridge**

Create `apps/web/src/lib/integrations/otrs-family/certification.ts`:

```ts
import {
  appendCertificationStep,
  createCertificationRun,
  finalizeCertificationRun,
  type CertificationRunView,
  type CertificationStepStatus
} from "@/lib/certification/runs";

export type OtrsCertificationDiagnostics = {
  routeDetected: boolean;
  authOk: boolean;
  ticketSearchOk: boolean;
  webhookOk: boolean;
};

export type OtrsCertificationSampleImport = {
  imported: number;
  skipped: number;
};

export type CertificationStepDraft = {
  stepKey: string;
  position: number;
  status: CertificationStepStatus;
  detail: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type OtrsCertificationInput = {
  source: "otrs" | "znuny" | "otobo";
  diagnostics: OtrsCertificationDiagnostics;
  sampleImport: OtrsCertificationSampleImport;
};

export type OtrsCertificationRunInput = OtrsCertificationInput & {
  workspaceId: string;
  integrationId: string;
  actorId: string;
};

export function buildOtrsCertificationSteps(input: OtrsCertificationInput): CertificationStepDraft[] {
  const sourceLabel = input.source === "otrs" ? "OTRS" : input.source === "znuny" ? "Znuny" : "OTOBO";

  return [
    {
      stepKey: "contract_check",
      position: 1,
      status: "passed",
      detail: `${sourceLabel}: контракт адаптера найден.`
    },
    {
      stepKey: "auth_check",
      position: 2,
      status: input.diagnostics.authOk ? "passed" : "failed",
      detail: input.diagnostics.authOk ? "Авторизация подтверждена." : "Источник не подтвердил учетные данные.",
      hint: input.diagnostics.authOk ? undefined : "Проверьте пользователя, пароль и GenericInterface web service."
    },
    {
      stepKey: "capability_check",
      position: 3,
      status: input.diagnostics.ticketSearchOk ? "passed" : "failed",
      detail: input.diagnostics.ticketSearchOk ? "TicketSearch доступен." : "TicketSearch недоступен.",
      hint: input.diagnostics.ticketSearchOk ? undefined : `Проверьте маршруты GenericInterface для ${sourceLabel}.`
    },
    {
      stepKey: "sample_import",
      position: 4,
      status: input.sampleImport.imported > 0 ? "passed" : "blocked",
      detail: `Импортировано ${input.sampleImport.imported}, пропущено ${input.sampleImport.skipped}.`,
      hint: input.sampleImport.imported > 0 ? undefined : "Укажите тестовый TicketID и повторите импорт."
    },
    {
      stepKey: "webhook_or_polling_check",
      position: 5,
      status: input.diagnostics.webhookOk ? "passed" : "blocked",
      detail: input.diagnostics.webhookOk ? "Webhook подтвержден." : "Webhook или polling fallback не подтвержден.",
      hint: input.diagnostics.webhookOk ? undefined : `Настройте webhook или подтвердите polling fallback для ${sourceLabel}.`
    },
    {
      stepKey: "evidence_lock",
      position: 6,
      status: "passed",
      detail: "Диагностика подготовлена для evidence ledger."
    }
  ];
}

export async function recordOtrsCertificationRun(input: OtrsCertificationRunInput): Promise<CertificationRunView> {
  const run = await createCertificationRun({
    workspaceId: input.workspaceId,
    targetType: "integration",
    source: input.source,
    integrationId: input.integrationId,
    actorId: input.actorId
  });
  const steps = buildOtrsCertificationSteps(input);

  for (const step of steps) {
    await appendCertificationStep({
      workspaceId: input.workspaceId,
      runId: run.id,
      ...step,
      finishedAt: new Date()
    });
  }

  const hasFailure = steps.some((step) => step.status === "failed");
  const hasBlocker = steps.some((step) => step.status === "blocked");
  return finalizeCertificationRun({
    runId: run.id,
    status: hasFailure ? "failed" : hasBlocker ? "blocked" : "passed",
    summary: {
      imported: input.sampleImport.imported,
      skipped: input.sampleImport.skipped,
      source: input.source
    }
  });
}
```

- [ ] **Step 4: Wire OTRS service without changing existing diagnostics UI**

In `apps/web/src/lib/integrations/otrs-family/service.ts`, export a narrow helper that maps the existing diagnostics/import result shape to `OtrsCertificationInput`. Keep imports from `certification.ts` server-only and avoid client components.

Use this function signature:

```ts
export function summarizeOtrsCertificationInput(input: {
  source: "otrs" | "znuny" | "otobo";
  routeDetected: boolean;
  authOk: boolean;
  ticketSearchOk: boolean;
  webhookOk: boolean;
  imported: number;
  skipped: number;
}) {
  return {
    source: input.source,
    diagnostics: {
      routeDetected: input.routeDetected,
      authOk: input.authOk,
      ticketSearchOk: input.ticketSearchOk,
      webhookOk: input.webhookOk
    },
    sampleImport: {
      imported: input.imported,
      skipped: input.skipped
    }
  };
}
```

- [ ] **Step 5: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/otrs-family-certification.test.ts tests/unit/otrs-family-diagnostics.test.ts tests/unit/otrs-family-import-plan.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/otrs-family/certification.ts src/lib/integrations/otrs-family/service.ts tests/unit/otrs-family-certification.test.ts tests/unit/otrs-family-diagnostics.test.ts
git commit -m "feat(otrs): bridge diagnostics to certification runs"
```

---

### Task 6: Messaging Action Channels

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/20260628123000_add_messaging_channels/migration.sql`
- Create: `apps/web/src/lib/messaging/types.ts`
- Create: `apps/web/src/lib/messaging/registry.ts`
- Create: `apps/web/src/lib/messaging/templates.ts`
- Create: `apps/web/src/lib/messaging/delivery.ts`
- Test: `apps/web/tests/unit/messaging-actions.test.ts`
- Modify: `apps/web/tests/unit/prisma-schema.test.ts`

**Interfaces:**
- Produces:
  - `MessagingChannelKind = "slack" | "teams" | "telegram" | "whatsapp"`
  - `MessagingCapability = "action_notification" | "conversation_ingest"`
  - `messageForOperationalEvent(event: OperationalMessagingEvent): MessageTemplate`
  - `recordMessagingDelivery(input: MessagingDeliveryInput): Promise<MessagingDeliveryView>`

- [ ] **Step 1: Write failing messaging tests**

Create `apps/web/tests/unit/messaging-actions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const deliveryCreateMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    messagingDelivery: {
      create: deliveryCreateMock
    }
  }
}));

describe("messaging action channels", () => {
  it("declares Slack and Teams as action channels before ingest channels", async () => {
    const { messagingChannelRegistry } = await import("@/lib/messaging/registry");

    expect(messagingChannelRegistry.slack.capabilities).toEqual(["action_notification"]);
    expect(messagingChannelRegistry.teams.capabilities).toEqual(["action_notification"]);
    expect(messagingChannelRegistry.telegram.capabilities).toEqual(["action_notification"]);
    expect(messagingChannelRegistry.whatsapp.capabilities).toEqual(["action_notification"]);
    expect(messagingChannelRegistry.whatsapp.ingestRequiresConsent).toBe(true);
  });

  it("formats source certification loss as a manager action", async () => {
    const { messageForOperationalEvent } = await import("@/lib/messaging/templates");

    expect(
      messageForOperationalEvent({
        type: "source_certification_lost",
        source: "Zendesk",
        workspaceName: "Demo",
        href: "https://app.example.com/admin/integrations/int-1"
      })
    ).toEqual({
      title: "Источник потерял live certification",
      body: "Zendesk требует проверки в Demo. Откройте источник и посмотрите evidence.",
      actionLabel: "Открыть источник",
      href: "https://app.example.com/admin/integrations/int-1"
    });
  });
});
```

- [ ] **Step 2: Run messaging tests to verify failure**

Run: `cd apps/web && npx vitest run tests/unit/messaging-actions.test.ts`

Expected: FAIL because `src/lib/messaging/*` files do not exist.

- [ ] **Step 3: Add Prisma models**

Add to `Workspace`:

```prisma
messagingChannels          MessagingChannel[]
messagingDeliveries        MessagingDelivery[]
```

Add models:

```prisma
model MessagingChannel {
  id              String              @id @default(cuid())
  workspaceId     String
  workspace       Workspace           @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  kind            String
  displayName     String
  status          String              @default("draft")
  capabilities    String              @default("action_notification")
  configJson      String              @default("{}")
  secretRef       String?
  lastDeliveredAt DateTime?
  lastError       String?
  deliveries      MessagingDelivery[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([workspaceId, kind])
  @@index([workspaceId, status])
  @@index([workspaceId, kind])
}

model MessagingDelivery {
  id            String            @id @default(cuid())
  workspaceId   String
  workspace     Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  channelId     String?
  channel       MessagingChannel? @relation(fields: [channelId], references: [id], onDelete: SetNull)
  kind          String
  eventType     String
  recipientType String
  recipientRef  String?
  status        String            @default("queued")
  title         String
  body          String
  href          String?
  error         String?
  payloadJson   String            @default("{}")
  createdAt     DateTime          @default(now())
  deliveredAt   DateTime?

  @@index([workspaceId, kind, createdAt])
  @@index([workspaceId, status, createdAt])
  @@index([channelId, createdAt])
}
```

- [ ] **Step 4: Add migration**

Create `apps/web/prisma/migrations/20260628123000_add_messaging_channels/migration.sql` with this shape. If Prisma's generated constraint names differ, keep the generated names consistent throughout the migration and update schema-contract tests in the same task.

```sql
-- CreateTable
CREATE TABLE "MessagingChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "capabilities" TEXT NOT NULL DEFAULT 'action_notification',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "lastDeliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "kind" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "error" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "MessagingDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingChannel_workspaceId_status_idx" ON "MessagingChannel"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "MessagingChannel_workspaceId_kind_idx" ON "MessagingChannel"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingChannel_workspaceId_kind_key" ON "MessagingChannel"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "MessagingDelivery_workspaceId_kind_createdAt_idx" ON "MessagingDelivery"("workspaceId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingDelivery_workspaceId_status_createdAt_idx" ON "MessagingDelivery"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingDelivery_channelId_createdAt_idx" ON "MessagingDelivery"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessagingChannel" ADD CONSTRAINT "MessagingChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingDelivery" ADD CONSTRAINT "MessagingDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingDelivery" ADD CONSTRAINT "MessagingDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "MessagingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Implement messaging types and registry**

Create `apps/web/src/lib/messaging/types.ts`:

```ts
export type MessagingChannelKind = "slack" | "teams" | "telegram" | "whatsapp";
export type MessagingCapability = "action_notification" | "conversation_ingest";

export type MessagingChannelDefinition = {
  kind: MessagingChannelKind;
  displayName: string;
  capabilities: MessagingCapability[];
  ingestRequiresConsent: boolean;
  docsHref: string;
};

export type OperationalMessagingEvent =
  | { type: "source_certification_lost"; source: string; workspaceName: string; href: string }
  | { type: "training_overdue"; assigneeName: string; count: number; href: string }
  | { type: "queue_without_start"; count: number; href: string }
  | { type: "risk_spike"; riskCount: number; href: string };

export type MessageTemplate = {
  title: string;
  body: string;
  actionLabel: string;
  href: string;
};
```

Create `apps/web/src/lib/messaging/registry.ts`:

```ts
import type { MessagingChannelDefinition } from "@/lib/messaging/types";

export const messagingChannelRegistry = {
  slack: {
    kind: "slack",
    displayName: "Slack",
    capabilities: ["action_notification"],
    ingestRequiresConsent: false,
    docsHref: "https://api.slack.com/"
  },
  teams: {
    kind: "teams",
    displayName: "Microsoft Teams",
    capabilities: ["action_notification"],
    ingestRequiresConsent: false,
    docsHref: "https://learn.microsoft.com/en-us/microsoftteams/platform/"
  },
  telegram: {
    kind: "telegram",
    displayName: "Telegram",
    capabilities: ["action_notification"],
    ingestRequiresConsent: true,
    docsHref: "https://core.telegram.org/bots/api"
  },
  whatsapp: {
    kind: "whatsapp",
    displayName: "WhatsApp Business",
    capabilities: ["action_notification"],
    ingestRequiresConsent: true,
    docsHref: "https://developers.facebook.com/docs/whatsapp/cloud-api/"
  }
} as const satisfies Record<string, MessagingChannelDefinition>;
```

- [ ] **Step 6: Implement templates and delivery recorder**

Create `apps/web/src/lib/messaging/templates.ts`:

```ts
import type { MessageTemplate, OperationalMessagingEvent } from "@/lib/messaging/types";

export function messageForOperationalEvent(event: OperationalMessagingEvent): MessageTemplate {
  if (event.type === "source_certification_lost") {
    return {
      title: "Источник потерял live certification",
      body: `${event.source} требует проверки в ${event.workspaceName}. Откройте источник и посмотрите evidence.`,
      actionLabel: "Открыть источник",
      href: event.href
    };
  }

  if (event.type === "training_overdue") {
    return {
      title: "Просрочено обучение",
      body: `${event.assigneeName}: просрочено ${event.count} назначений обучения.`,
      actionLabel: "Открыть обучение",
      href: event.href
    };
  }

  if (event.type === "queue_without_start") {
    return {
      title: "Очередь без старта",
      body: `${event.count} проверок ждут старта. Назначьте или откройте следующую проверку.`,
      actionLabel: "Открыть очередь",
      href: event.href
    };
  }

  return {
    title: "Рост риска",
    body: `${event.riskCount} сигналов риска требуют разбора.`,
    actionLabel: "Открыть риски",
    href: event.href
  };
}
```

Create `apps/web/src/lib/messaging/delivery.ts`:

```ts
import { prisma } from "@/lib/db";
import type { MessagingChannelKind, MessageTemplate } from "@/lib/messaging/types";

export type MessagingDeliveryInput = {
  workspaceId: string;
  channelId?: string | null;
  kind: MessagingChannelKind;
  eventType: string;
  recipientType: "reviewer" | "manager" | "admin" | "assignee";
  recipientRef?: string | null;
  message: MessageTemplate;
  payload?: Record<string, unknown>;
};

export async function recordMessagingDelivery(input: MessagingDeliveryInput) {
  return prisma.messagingDelivery.create({
    data: {
      workspaceId: input.workspaceId,
      channelId: input.channelId ?? null,
      kind: input.kind,
      eventType: input.eventType,
      recipientType: input.recipientType,
      recipientRef: input.recipientRef ?? null,
      status: "queued",
      title: input.message.title,
      body: input.message.body,
      href: input.message.href,
      payloadJson: JSON.stringify(input.payload ?? {})
    }
  });
}
```

- [ ] **Step 7: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/messaging-actions.test.ts tests/unit/prisma-schema.test.ts -t "messaging|Messaging"
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260628123000_add_messaging_channels/migration.sql src/lib/messaging tests/unit/messaging-actions.test.ts tests/unit/prisma-schema.test.ts
git commit -m "feat(messaging): add action channel contracts"
```

---

### Task 7: AI Quality Ops Drafts

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/20260628124500_add_ai_quality_drafts/migration.sql`
- Create: `apps/web/src/lib/ai-quality/types.ts`
- Create: `apps/web/src/lib/ai-quality/drafts.ts`
- Test: `apps/web/tests/unit/ai-quality-drafts.test.ts`
- Modify: `apps/web/tests/unit/prisma-schema.test.ts`

**Interfaces:**
- Produces:
  - `AiQualityDraftKind = "score" | "risk_tag" | "coaching_suggestion" | "training_recommendation" | "priority_summary"`
  - `createAiQualityDraft(input: CreateAiQualityDraftInput)`
  - `decideAiQualityDraft(input: DecideAiQualityDraftInput)`

- [ ] **Step 1: Write failing AI draft tests**

Create `apps/web/tests/unit/ai-quality-drafts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const draftCreateMock = vi.fn();
const draftUpdateMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    aiQualityDraft: {
      create: draftCreateMock,
      update: draftUpdateMock
    }
  }
}));

describe("AI Quality Ops drafts", () => {
  it("creates advisory drafts that are not final decisions", async () => {
    const { createAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftCreateMock.mockResolvedValue({
      id: "draft-1",
      status: "draft",
      kind: "risk_tag",
      suggestedValueJson: JSON.stringify({ risk: "HIGH" }),
      evidenceRefsJson: JSON.stringify(["message-1"])
    });

    await createAiQualityDraft({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      kind: "risk_tag",
      modelVersion: "ai-quality-v1",
      promptVersion: "risk-v1",
      suggestedValue: { risk: "HIGH" },
      evidenceRefs: ["message-1"]
    });

    expect(draftCreateMock.mock.calls[0][0].data.status).toBe("draft");
    expect(draftCreateMock.mock.calls[0][0].data.finalizedById).toBeNull();
  });

  it("requires a human actor to approve or reject a draft", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    await expect(
      decideAiQualityDraft({
        draftId: "draft-1",
        decision: "approved",
        actorId: "",
        reason: "Looks right"
      })
    ).rejects.toThrow("AI draft decisions require a human actor.");
  });
});
```

- [ ] **Step 2: Run AI draft tests to verify failure**

Run: `cd apps/web && npx vitest run tests/unit/ai-quality-drafts.test.ts`

Expected: FAIL because `@/lib/ai-quality/drafts` does not exist.

- [ ] **Step 3: Add Prisma model**

Add to `Workspace`:

```prisma
aiQualityDrafts           AiQualityDraft[]
```

Add to `Conversation`:

```prisma
aiQualityDrafts AiQualityDraft[]
```

Add to `User`:

```prisma
decidedAiQualityDrafts AiQualityDraft[] @relation("AiQualityDraftFinalizedBy")
```

Add model:

```prisma
model AiQualityDraft {
  id                 String       @id @default(cuid())
  workspaceId        String
  workspace          Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversationId     String?
  conversation       Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  reviewId           String?
  kind               String
  status             String       @default("draft")
  modelVersion       String
  promptVersion      String
  suggestedValueJson String       @default("{}")
  evidenceRefsJson   String       @default("[]")
  finalizedById      String?
  finalizedBy        User?        @relation("AiQualityDraftFinalizedBy", fields: [finalizedById], references: [id], onDelete: SetNull)
  finalizedAt        DateTime?
  decisionReason     String?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  @@index([workspaceId, conversationId, createdAt])
  @@index([workspaceId, status, createdAt])
  @@index([finalizedById, finalizedAt])
}
```

- [ ] **Step 4: Add migration**

Create `apps/web/prisma/migrations/20260628124500_add_ai_quality_drafts/migration.sql` with this shape. `reviewId` is intentionally stored as nullable text without a foreign key in this first pass; if a review relation is needed later, add it in a dedicated follow-up that verifies the review model ownership boundary.

```sql
-- CreateTable
CREATE TABLE "AiQualityDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "reviewId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "suggestedValueJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceRefsJson" TEXT NOT NULL DEFAULT '[]',
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiQualityDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiQualityDraft_workspaceId_conversationId_createdAt_idx" ON "AiQualityDraft"("workspaceId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiQualityDraft_workspaceId_status_createdAt_idx" ON "AiQualityDraft"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AiQualityDraft_finalizedById_finalizedAt_idx" ON "AiQualityDraft"("finalizedById", "finalizedAt");

-- AddForeignKey
ALTER TABLE "AiQualityDraft" ADD CONSTRAINT "AiQualityDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQualityDraft" ADD CONSTRAINT "AiQualityDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQualityDraft" ADD CONSTRAINT "AiQualityDraft_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Implement AI types and service**

Create `apps/web/src/lib/ai-quality/types.ts`:

```ts
export type AiQualityDraftKind =
  | "score"
  | "risk_tag"
  | "coaching_suggestion"
  | "training_recommendation"
  | "priority_summary";

export type AiQualityDraftDecision = "approved" | "rejected" | "changed";
```

Create `apps/web/src/lib/ai-quality/drafts.ts`:

```ts
import { prisma } from "@/lib/db";
import type { AiQualityDraftDecision, AiQualityDraftKind } from "@/lib/ai-quality/types";

export type CreateAiQualityDraftInput = {
  workspaceId: string;
  conversationId?: string | null;
  reviewId?: string | null;
  kind: AiQualityDraftKind;
  modelVersion: string;
  promptVersion: string;
  suggestedValue: Record<string, unknown>;
  evidenceRefs: string[];
};

export type DecideAiQualityDraftInput = {
  draftId: string;
  decision: AiQualityDraftDecision;
  actorId: string;
  reason: string;
  changedValue?: Record<string, unknown>;
};

export async function createAiQualityDraft(input: CreateAiQualityDraftInput) {
  return prisma.aiQualityDraft.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId ?? null,
      reviewId: input.reviewId ?? null,
      kind: input.kind,
      status: "draft",
      modelVersion: input.modelVersion,
      promptVersion: input.promptVersion,
      suggestedValueJson: JSON.stringify(input.suggestedValue),
      evidenceRefsJson: JSON.stringify(input.evidenceRefs),
      finalizedById: null
    }
  });
}

export async function decideAiQualityDraft(input: DecideAiQualityDraftInput) {
  if (!input.actorId.trim()) {
    throw new Error("AI draft decisions require a human actor.");
  }

  return prisma.aiQualityDraft.update({
    where: { id: input.draftId },
    data: {
      status: input.decision,
      finalizedById: input.actorId,
      finalizedAt: new Date(),
      decisionReason: input.reason,
      ...(input.changedValue ? { suggestedValueJson: JSON.stringify(input.changedValue) } : {})
    }
  });
}
```

- [ ] **Step 6: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/ai-quality-drafts.test.ts tests/unit/prisma-schema.test.ts -t "AI|AiQuality"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260628124500_add_ai_quality_drafts/migration.sql src/lib/ai-quality tests/unit/ai-quality-drafts.test.ts tests/unit/prisma-schema.test.ts
git commit -m "feat(ai-quality): add advisory draft decisions"
```

---

### Task 8: Operations UX Pattern And Semantic Status

**Files:**
- Create: `apps/web/src/lib/ui/semantic-status.ts`
- Create: `apps/web/src/components/operations/operational-page-frame.tsx`
- Create: `apps/web/src/components/operations/priority-action-panel.tsx`
- Create: `apps/web/src/components/operations/evidence-drawer.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Test: `apps/web/tests/unit/semantic-status.test.ts`
- Test: `apps/web/tests/unit/operations-ui.test.tsx`
- Modify: `apps/web/tests/e2e/app-shell-routes.spec.ts`

**Interfaces:**
- Consumes: existing `StatusBadge`, `statusToneClass`, and dashboard data.
- Produces:
  - `semanticStatusForMetric(input): SemanticStatus`
  - `OperationalPageFrame`
  - `PriorityActionPanel`
  - `EvidenceDrawer`

- [ ] **Step 1: Confirm Lazyweb report for the dashboard screen**

Before editing the dashboard UI, record the hosted Lazyweb report URL in the implementation summary. Use the existing dashboard report for this dashboard-only task:

```text
https://www.lazyweb.com/report/lazyweb/299ab7b6-88e3-4262-81a8-4797e4103929/
```

- [ ] **Step 2: Write failing semantic status tests**

Create `apps/web/tests/unit/semantic-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { semanticStatusForMetric } from "@/lib/ui/semantic-status";

describe("semantic operational status", () => {
  it("marks overdue and failed values as negative", () => {
    expect(semanticStatusForMetric({ kind: "overdue_count", value: 8 })).toEqual({
      tone: "negative",
      className: "semantic-status--negative",
      label: "Требует внимания"
    });
  });

  it("marks healthy completed values as positive", () => {
    expect(semanticStatusForMetric({ kind: "completed_count", value: 63 })).toEqual({
      tone: "positive",
      className: "semantic-status--positive",
      label: "В норме"
    });
  });

  it("keeps no-data values neutral", () => {
    expect(semanticStatusForMetric({ kind: "average_score", value: null })).toEqual({
      tone: "neutral",
      className: "semantic-status--neutral",
      label: "Нет данных"
    });
  });
});
```

- [ ] **Step 3: Write failing operations component tests**

Create `apps/web/tests/unit/operations-ui.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationalPageFrame } from "@/components/operations/operational-page-frame";
import { PriorityActionPanel } from "@/components/operations/priority-action-panel";

describe("operations UI pattern", () => {
  it("renders signals, action, details, and evidence in order", () => {
    render(
      <OperationalPageFrame
        title="Главная"
        signals={<div>Сигналы</div>}
        action={<div>Действие</div>}
        details={<div>Детали</div>}
        evidence={<div>Evidence</div>}
      />
    );

    expect(screen.getByText("Сигналы").compareDocumentPosition(screen.getByText("Действие"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Действие").compareDocumentPosition(screen.getByText("Детали"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Детали").compareDocumentPosition(screen.getByText("Evidence"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders one dominant next action", () => {
    render(
      <PriorityActionPanel
        title="Сделать сейчас"
        description="Закройте просроченное обучение."
        actionLabel="Открыть фокус"
        href="/dashboard?focus=training"
        tone="warning"
      />
    );

    expect(screen.getByRole("link", { name: "Открыть фокус" })).toHaveAttribute("href", "/dashboard?focus=training");
  });
});
```

- [ ] **Step 4: Run UI tests to verify failure**

Run:

```bash
cd apps/web
npx vitest run tests/unit/semantic-status.test.ts tests/unit/operations-ui.test.tsx
```

Expected: FAIL because new modules do not exist.

- [ ] **Step 5: Implement semantic status**

Create `apps/web/src/lib/ui/semantic-status.ts`:

```ts
export type SemanticTone = "positive" | "warning" | "negative" | "neutral" | "info";

export type SemanticMetricInput = {
  kind:
    | "overdue_count"
    | "failed_count"
    | "risk_count"
    | "completed_count"
    | "average_score"
    | "queue_count"
    | "learning_count";
  value: number | null;
};

export type SemanticStatus = {
  tone: SemanticTone;
  className: `semantic-status--${SemanticTone}`;
  label: string;
};

function status(tone: SemanticTone, label: string): SemanticStatus {
  return {
    tone,
    className: `semantic-status--${tone}`,
    label
  };
}

export function semanticStatusForMetric(input: SemanticMetricInput): SemanticStatus {
  if (input.value === null) {
    return status("neutral", "Нет данных");
  }

  if ((input.kind === "overdue_count" || input.kind === "failed_count" || input.kind === "risk_count") && input.value > 0) {
    return status("negative", "Требует внимания");
  }

  if (input.kind === "queue_count" && input.value > 0) {
    return status("warning", "В работе");
  }

  if (input.kind === "learning_count" && input.value > 0) {
    return status("info", "Обучение");
  }

  return status("positive", "В норме");
}
```

- [ ] **Step 6: Implement operations components**

Create `apps/web/src/components/operations/operational-page-frame.tsx`:

```tsx
import type { ReactNode } from "react";

export function OperationalPageFrame({
  title,
  signals,
  action,
  details,
  evidence
}: {
  title: string;
  signals: ReactNode;
  action: ReactNode;
  details: ReactNode;
  evidence: ReactNode;
}) {
  return (
    <section className="operational-page-frame" aria-labelledby="operational-page-title">
      <h1 id="operational-page-title" className="sr-only">
        {title}
      </h1>
      <div className="operational-page-frame__signals">{signals}</div>
      <div className="operational-page-frame__action">{action}</div>
      <div className="operational-page-frame__details">{details}</div>
      <div className="operational-page-frame__evidence">{evidence}</div>
    </section>
  );
}
```

Create `apps/web/src/components/operations/priority-action-panel.tsx`:

```tsx
import Link from "next/link";
import clsx from "clsx";
import type { SemanticTone } from "@/lib/ui/semantic-status";

export function PriorityActionPanel({
  title,
  description,
  actionLabel,
  href,
  tone = "info"
}: {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  tone?: SemanticTone;
}) {
  return (
    <section className={clsx("priority-action-panel", `semantic-status--${tone}`)}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Link href={href} className="button button-primary">
        {actionLabel}
      </Link>
    </section>
  );
}
```

Create `apps/web/src/components/operations/evidence-drawer.tsx`:

```tsx
import type { ReactNode } from "react";

export function EvidenceDrawer({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="evidence-drawer">
      <summary>{title}</summary>
      <div className="evidence-drawer__body">{children}</div>
    </details>
  );
}
```

- [ ] **Step 7: Migrate dashboard only**

Use the components from Step 6 on `apps/web/src/app/dashboard/page.tsx` only:

- Wrap primary dashboard content in `OperationalPageFrame`.
- Make "Фокус сейчас" the dominant `PriorityActionPanel`.
- Keep existing dashboard data-loading code and route behavior in place.
- Do not change reports or integrations in this task. Create separate follow-up tasks for those screens after their own Lazyweb reports are attached.

- [ ] **Step 8: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/semantic-status.test.ts tests/unit/operations-ui.test.tsx
npm run test:e2e -- tests/e2e/app-shell-routes.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ui/semantic-status.ts src/components/operations src/app/dashboard/page.tsx tests/unit/semantic-status.test.ts tests/unit/operations-ui.test.tsx tests/e2e/app-shell-routes.spec.ts
git commit -m "feat(ui): introduce operations page pattern"
```

---

### Task 9: Performance And Runtime Guards

**Files:**
- Modify: `apps/web/tests/unit/route-runtime-guards.test.ts`
- Create: `apps/web/tests/unit/loading-boundaries.test.ts`
- Modify: `apps/web/tests/e2e/quick-views-layout.spec.ts`
- Modify: `apps/web/tests/e2e/app-shell-routes.spec.ts`

**Interfaces:**
- Consumes: file-system source checks and existing Playwright auth helpers.
- Produces: CI guards for heavy imports, loading boundaries, quick-view gaps, and route shell behavior.

- [ ] **Step 1: Write failing loading-boundary test**

Create `apps/web/tests/unit/loading-boundaries.test.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.join(process.cwd(), "src/app");

const heavyRoutes = [
  "dashboard",
  "reviews",
  "reviews/[conversationId]",
  "coaching",
  "reports",
  "admin",
  "admin/integrations",
  "admin/integrations/new",
  "admin/integrations/[integrationId]",
  "admin/system",
  "admin/users"
];

describe("route loading boundaries", () => {
  it.each(heavyRoutes)("keeps %s behind a loading boundary", (routePath) => {
    expect(existsSync(path.join(appRoot, routePath, "loading.tsx"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run loading-boundary test**

Run: `cd apps/web && npx vitest run tests/unit/loading-boundaries.test.ts`

Expected: PASS if current boundaries are complete, FAIL if a route has no `loading.tsx`.

- [ ] **Step 3: Expand runtime import guard**

In `apps/web/tests/unit/route-runtime-guards.test.ts`, add these disallowed references:

```ts
const disallowedReferences = [
  "ldapts",
  "@/lib/auth/ldaps",
  "@/lib/auth/directory-sync",
  "@/lib/jobs/queue",
  "@/lib/integrations/helpdesk-adapters",
  "@/lib/integrations/otrs-family/client",
  "@/lib/integrations/data-source-adapters",
  "@/lib/certification/runs",
  "@/lib/messaging/delivery"
];
```

Add guarded files:

```ts
const guardedFiles = [
  "src/app/page.tsx",
  "src/app/auth/login/page.tsx",
  "src/app/dashboard/page.tsx",
  "src/app/reviews/page.tsx",
  "src/app/coaching/page.tsx",
  "src/app/reports/page.tsx",
  "src/app/admin/integrations/page.tsx",
  "src/lib/system-enqueue-actions.ts",
  "src/lib/jobs/enqueue.ts"
];
```

If a current page imports a heavy module directly, move the import behind a server action, route handler, or page-data module that is not part of the shell.

- [ ] **Step 4: Strengthen quick-view Playwright check**

In `apps/web/tests/e2e/quick-views-layout.spec.ts`, add:

```ts
test("quick views keep the filter panel height stable after repeated toggles", async ({ page }) => {
  await loginAsDemoAdmin(page);
  await page.goto("/reviews");

  const panel = page.getByRole("region", { name: /Быстрые виды/i }).first();
  const firstBox = await panel.boundingBox();
  expect(firstBox).not.toBeNull();

  for (let index = 0; index < 6; index += 1) {
    await page.getByRole("button", { name: /Раскрыть|Свернуть/i }).click();
  }

  const secondBox = await panel.boundingBox();
  expect(secondBox).not.toBeNull();
  expect(Math.abs((secondBox?.height ?? 0) - (firstBox?.height ?? 0))).toBeLessThan(24);
});
```

- [ ] **Step 5: Add shell smoke budget check**

In `apps/web/tests/e2e/app-shell-routes.spec.ts`, add:

```ts
test("dashboard shell reaches first content quickly", async ({ page }) => {
  await loginAsDemoAdmin(page);
  const startedAt = Date.now();
  await page.goto("/dashboard");
  await page.getByRole("banner").waitFor({ state: "visible" });
  await page.getByText(/Фокус сейчас|Последняя активность/).first().waitFor({ state: "visible" });
  expect(Date.now() - startedAt).toBeLessThan(2_500);
});
```

The E2E budget is intentionally looser than the local warm route target because Playwright startup and dev-server noise are higher.

- [ ] **Step 6: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/route-runtime-guards.test.ts tests/unit/loading-boundaries.test.ts
npm run test:e2e -- tests/e2e/quick-views-layout.spec.ts tests/e2e/app-shell-routes.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/unit/route-runtime-guards.test.ts tests/unit/loading-boundaries.test.ts tests/e2e/quick-views-layout.spec.ts tests/e2e/app-shell-routes.spec.ts
git commit -m "test(perf): guard route runtime and layout stability"
```

---

### Task 10: API And UI Readiness Surfacing

**Files:**
- Modify: `apps/web/src/lib/api/openapi.ts`
- Modify: `apps/web/src/app/api/v1/readiness/route.ts`
- Modify: `apps/web/src/app/admin/integrations/[integrationId]/page.tsx`
- Modify: `apps/web/src/app/admin/integrations/page.tsx`
- Test: `apps/web/tests/unit/openapi.test.ts`
- Test: `apps/web/tests/unit/readiness-route.test.ts`
- Test: `apps/web/tests/unit/integration-capabilities.test.ts`

**Interfaces:**
- Consumes: `CertificationRunView`, `PhaseDReadinessReport`, install contracts.
- Produces:
  - Readiness API includes latest certification run summary.
  - Integration UI shows one readiness badge, one next action, and an evidence drawer.

- [ ] **Step 1: Write failing readiness-route expectation**

Extend `apps/web/tests/unit/readiness-route.test.ts`:

```ts
expect(body.certification).toEqual(
  expect.objectContaining({
    latestRuns: expect.any(Array),
    evidenceModel: expect.objectContaining({
      protectedEnvGates: expect.arrayContaining(["protected:live-smoke"])
    })
  })
);
```

- [ ] **Step 2: Run readiness test to verify failure**

Run: `cd apps/web && npx vitest run tests/unit/readiness-route.test.ts`

Expected: FAIL until the route includes latest run summaries.

- [ ] **Step 3: Add OpenAPI schema**

In `apps/web/src/lib/api/openapi.ts`, add:

```ts
CertificationRunSummary: {
  type: "object",
  required: ["id", "targetType", "source", "status", "startedAt", "nextAction"],
  properties: {
    id: { type: "string" },
    targetType: { type: "string", enum: ["integration", "identity_provider"] },
    source: { type: "string" },
    status: { type: "string", enum: ["running", "passed", "failed", "blocked"] },
    startedAt: { type: "string", format: "date-time" },
    finishedAt: { type: "string", format: "date-time", nullable: true },
    nextAction: { type: "object", additionalProperties: true }
  }
}
```

Reference it from readiness response:

```ts
latestRuns: {
  type: "array",
  items: { $ref: "#/components/schemas/CertificationRunSummary" }
}
```

- [ ] **Step 4: Add readiness route data**

In `apps/web/src/app/api/v1/readiness/route.ts`, query latest certification runs for the workspace:

```ts
const latestRuns = await prisma.certificationRun.findMany({
  where: { workspaceId },
  orderBy: { startedAt: "desc" },
  take: 10,
  select: {
    id: true,
    targetType: true,
    source: true,
    status: true,
    startedAt: true,
    finishedAt: true,
    nextActionJson: true
  }
});
```

Map to:

```ts
latestRuns: latestRuns.map((run) => ({
  id: run.id,
  targetType: run.targetType,
  source: run.source,
  status: run.status,
  startedAt: run.startedAt.toISOString(),
  finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
  nextAction: parseJsonObject(run.nextActionJson)
}))
```

- [ ] **Step 5: Update integration UI**

In integration pages, replace repeated source-readiness fragments with one compact block:

```tsx
<StatusBadge
  label="Готовность"
  value={capability.certification.summary.label}
  tone={certificationTone(capability.certification.summary.status)}
/>
<EvidenceDrawer title="Evidence">
  <CertificationEvidenceList evidence={latestEvidenceForSource} />
</EvidenceDrawer>
```

If `CertificationEvidenceList` does not exist, create it as a small component inside `apps/web/src/components/integrations/integration-ui.tsx` and pass plain serializable evidence rows. Do not import `@/lib/certification/readiness-report` into client components.

- [ ] **Step 6: Run focused checks**

Run:

```bash
cd apps/web
npx vitest run tests/unit/openapi.test.ts tests/unit/readiness-route.test.ts tests/unit/integration-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/openapi.ts src/app/api/v1/readiness/route.ts src/app/admin/integrations/[integrationId]/page.tsx src/app/admin/integrations/page.tsx src/components/integrations/integration-ui.tsx tests/unit/openapi.test.ts tests/unit/readiness-route.test.ts tests/unit/integration-capabilities.test.ts
git commit -m "feat(readiness): surface certification runs"
```

---

## Final Verification

After all tasks are complete on the integration branch, run:

```bash
cd apps/web
npm run typecheck
npm run test
npm run test:e2e
```

Expected:

- `npm run typecheck`: PASS.
- `npm run test`: PASS.
- `npm run test:e2e`: PASS, or documented failures unrelated to this plan with exact test names and logs.

Also run:

```bash
git status --short
```

Expected: clean working tree except intentionally ignored local artifacts.

## Self-Review Notes

- Spec coverage: tasks cover certification runs, source docs gate, first-wave probes, OTRS-family bridge, messaging action channels, AI advisory drafts, operations UX, performance/runtime guards, and readiness surfacing.
- Decomposition: each task has a separate test cycle and commit. Adapter deepening is split from certification storage and UI surfacing.
- Deferred by design: production OAuth marketplace installs, WhatsApp/Telegram ingest, and enterprise/data-source live deepening are not implemented in this first executable wave because the spec requires live access, consent, and separate compliance review before those can be truthfully production-ready.
