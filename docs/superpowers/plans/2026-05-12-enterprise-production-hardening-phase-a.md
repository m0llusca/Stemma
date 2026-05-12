# Enterprise Production Hardening Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase A foundation for enterprise production hardening: Russian certification statuses, score-as-points presentation, admin help tooltips, current integration/API readiness hardening, and visual QA coverage.

**Architecture:** Keep existing data semantics stable. Add focused formatting, certification, and tooltip primitives, then wire them into existing admin, integration, report, review, and OpenAPI surfaces. This plan intentionally stops before Phase B connector adapters and Phase C enterprise identity adapters; those need separate implementation plans after this foundation lands.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma, Vitest, Playwright, lucide-react, existing CSS in `apps/web/src/app/globals.css`.

---

## Scope Check

The approved design covers several independent subsystems. This plan implements Phase A only:

- certification registry foundation and Russian labels;
- score language change from percent to points without data migration;
- shared help tooltip primitive;
- current OTRS/custom/webhook/API hardening surface;
- visual/layout QA sweep.

Follow-up plans required after Phase A:

- `enterprise-production-hardening-phase-b-adapters.md`: Zendesk, Freshdesk, Intercom, HubSpot, Salesforce, ServiceNow, Dynamics adapters.
- `enterprise-production-hardening-phase-c-identity.md`: Entra hardening, SAML, SCIM, AD/LDAPS, deprovisioning.
- `enterprise-production-hardening-phase-d-live-certification.md`: protected live smoke jobs and readiness report.

## File Structure

- Create `apps/web/src/lib/score-display.ts`: score label helpers and point-language formatters.
- Modify `apps/web/src/components/ui/score-bar.tsx`: use score display helpers and point labels.
- Modify score/report/review/export pages that currently append `%` to quality score.
- Create `apps/web/src/lib/certification/status.ts`: machine keys and Russian certification labels.
- Modify `apps/web/src/lib/integrations/capabilities.ts`: add certification metadata to existing capability registry.
- Modify `apps/web/src/app/api/v1/integrations/catalog/route.ts`: return the enriched registry and request ID.
- Modify `apps/web/src/lib/api/openapi.ts`: document score unit and certification schemas.
- Create `apps/web/src/components/ui/help-tooltip.tsx`: accessible question-mark help primitive.
- Modify selected admin pages and integration components to use help triggers.
- Modify `apps/web/src/app/globals.css`: tooltip styles and layout contract fixes.
- Add or update Vitest tests under `apps/web/tests/unit`.
- Add Playwright visual QA under `apps/web/tests/e2e`.

## Official Documentation Check

Phase A changes do not add new external SDKs or API integrations. Phase A public API descriptions cover existing local contracts only. Phase B and Phase C plans must fetch current official docs through Context7 or vendor docs before changing connector behavior.

---

### Task 1: Add Score Display Helpers

**Files:**
- Create: `apps/web/src/lib/score-display.ts`
- Test: `apps/web/tests/unit/score-display.test.ts`

- [ ] **Step 1: Write failing tests for point labels**

Create `apps/web/tests/unit/score-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clampQualityScore,
  formatQualityScore,
  formatQualityScoreDelta,
  qualityScoreUnit
} from "@/lib/score-display";

describe("score display helpers", () => {
  it("formats normalized totalScore as points, not percent", () => {
    expect(qualityScoreUnit).toBe("points");
    expect(formatQualityScore(92.4)).toBe("92 балла");
    expect(formatQualityScore(91.5)).toBe("92 балла");
    expect(formatQualityScore(1)).toBe("1 балл");
    expect(formatQualityScore(2)).toBe("2 балла");
    expect(formatQualityScore(5)).toBe("5 баллов");
    expect(formatQualityScore(null)).toBe("Нет оценки");
  });

  it("clamps display values to the stored 0..100 score range", () => {
    expect(clampQualityScore(-5)).toBe(0);
    expect(clampQualityScore(104)).toBe(100);
  });

  it("formats deltas as point changes", () => {
    expect(formatQualityScoreDelta(3.4)).toBe("+3 п.");
    expect(formatQualityScoreDelta(-2.6)).toBe("-3 п.");
    expect(formatQualityScoreDelta(0)).toBe("0 п.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/score-display.test.ts
```

Expected: FAIL because `@/lib/score-display` does not exist.

- [ ] **Step 3: Implement the score display helper**

Create `apps/web/src/lib/score-display.ts`:

```ts
export const qualityScoreUnit = "points" as const;

export function clampQualityScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function qualityScorePointWord(value: number) {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  const last = absolute % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "баллов";
  }

  if (last === 1) {
    return "балл";
  }

  if (last >= 2 && last <= 4) {
    return "балла";
  }

  return "баллов";
}

export function formatQualityScore(value: number | null | undefined, emptyLabel = "Нет оценки") {
  if (value == null) {
    return emptyLabel;
  }

  const score = clampQualityScore(value);
  return `${score} ${qualityScorePointWord(score)}`;
}

export function formatQualityScoreDelta(value: number | null | undefined) {
  if (value == null) {
    return "0 п.";
  }

  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} п.`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd apps/web && npm run test -- tests/unit/score-display.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/score-display.ts apps/web/tests/unit/score-display.test.ts
git commit -m "feat: add quality score display helpers"
```

---

### Task 2: Convert Shared Score UI To Points

**Files:**
- Modify: `apps/web/src/components/ui/score-bar.tsx`
- Test: `apps/web/tests/unit/score-bar.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/web/tests/unit/score-bar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreBar } from "@/components/ui/score-bar";

describe("ScoreBar", () => {
  it("renders quality score as points", () => {
    render(<ScoreBar value={86.7} label="Оценка" />);

    expect(screen.getByText("Оценка: 87 баллов")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("keeps the empty label for missing score", () => {
    render(<ScoreBar value={null} emptyLabel="Еще не сохранен" />);

    expect(screen.getByText("Еще не сохранен")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/score-bar.test.tsx
```

Expected: FAIL because `ScoreBar` renders `%`.

- [ ] **Step 3: Update `ScoreBar`**

Replace `apps/web/src/components/ui/score-bar.tsx` with:

```tsx
import { clampQualityScore, formatQualityScore } from "@/lib/score-display";

function scoreTone(score: number) {
  if (score < 60) {
    return "bg-[#dc2626]";
  }

  if (score < 85) {
    return "bg-[#d97706]";
  }

  return "bg-[#3157d5]";
}

export function ScoreBar({
  value,
  emptyLabel = "Нет оценки",
  compact = false,
  label
}: {
  value?: number | null;
  emptyLabel?: string;
  compact?: boolean;
  label?: string;
}) {
  if (value == null) {
    return <span className="whitespace-nowrap text-sm font-medium text-[#64748b]">{emptyLabel}</span>;
  }

  const score = clampQualityScore(value);

  return (
    <div className={`grid min-w-[104px] gap-1 ${compact ? "max-w-[154px]" : "max-w-[190px]"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[#111827]">
          {label ? `${label}: ` : ""}
          {formatQualityScore(score)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]" aria-hidden="true">
        <div className={`h-full rounded-full ${scoreTone(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
cd apps/web && npm run test -- tests/unit/score-bar.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run score-related unit tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/score.test.ts tests/unit/score-display.test.ts tests/unit/score-bar.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui/score-bar.tsx apps/web/tests/unit/score-bar.test.tsx
git commit -m "feat: show quality scores as points"
```

---

### Task 3: Update Score Language Across Reports, Reviews, Exports, And Tests

**Files:**
- Modify: `apps/web/src/app/reports/page.tsx`
- Modify: `apps/web/src/components/reports/report-charts.tsx`
- Modify: `apps/web/src/components/review/review-panel.tsx`
- Modify: `apps/web/src/app/reviews/[conversationId]/page.tsx`
- Modify: `apps/web/src/app/self-review/page.tsx`
- Modify: `apps/web/src/app/calibration/page.tsx`
- Modify: `apps/web/src/lib/report-export.ts`
- Modify: `apps/web/tests/e2e/review-workflow.spec.ts`
- Modify: `apps/web/tests/unit/report-export.test.ts`

- [ ] **Step 1: Update tests first**

In `apps/web/tests/e2e/review-workflow.spec.ts`, change:

```ts
await expect(page.getByText("100%").first()).toBeVisible();
```

to:

```ts
await expect(page.getByText("100 баллов").first()).toBeVisible();
```

Keep these assertions unchanged because they describe criterion weights, not final score:

```ts
await expect(page.getByText("Сумма весов: 100%")).toBeVisible();
await expect(page.getByText("Сумма весов: 101%")).toBeVisible();
```

In `apps/web/tests/unit/report-export.test.ts`, add this assertion to the CSV test:

```ts
expect(csv).toContain("94 балла");
expect(csv).not.toContain("94%");
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/web && npm run test -- tests/unit/report-export.test.ts && npm run test:e2e -- tests/e2e/review-workflow.spec.ts
```

Expected: at least one FAIL because UI/export still use percent language.

- [ ] **Step 3: Replace direct score formatting in pages**

Use `formatQualityScore` from `@/lib/score-display` wherever final review score is displayed.

In `apps/web/src/app/reviews/[conversationId]/page.tsx`, add:

```ts
import { formatQualityScore } from "@/lib/score-display";
```

Change:

```ts
const scoreLabel = scorePreviewReview ? `${Math.round(scorePreviewReview.totalScore)}%` : "Не проверено";
```

to:

```ts
const scoreLabel = scorePreviewReview ? formatQualityScore(scorePreviewReview.totalScore) : "Не проверено";
```

Change review history pills:

```tsx
<span className="pill pill--neutral">{Math.round(review.totalScore)}%</span>
```

to:

```tsx
<span className="pill pill--neutral">{formatQualityScore(review.totalScore)}</span>
```

In `apps/web/src/app/self-review/page.tsx`, import `formatQualityScore` and change:

```tsx
<span className="pill pill--neutral">{Math.round(review.totalScore)}%</span>
```

to:

```tsx
<span className="pill pill--neutral">{formatQualityScore(review.totalScore)}</span>
```

In `apps/web/src/app/calibration/page.tsx`, import `formatQualityScore` and change:

```tsx
Эталон: {baselineReview ? `${Math.round(baselineReview.totalScore)}% · ${baselineReview.reviewer.name}` : "нет финальной проверки"}
```

to:

```tsx
Эталон: {baselineReview ? `${formatQualityScore(baselineReview.totalScore)} · ${baselineReview.reviewer.name}` : "нет финальной проверки"}
```

Change participant score rendering:

```tsx
{participant.user.name}: {review ? `${Math.round(review.totalScore)}%` : "ждет"}
```

to:

```tsx
{participant.user.name}: {review ? formatQualityScore(review.totalScore) : "ждет"}
```

- [ ] **Step 4: Replace report score formatting**

In `apps/web/src/app/reports/page.tsx`, import:

```ts
import { formatQualityScore, formatQualityScoreDelta } from "@/lib/score-display";
```

Change:

```ts
function formatAverageScore(value?: number | null) {
  if (value == null) return "Нет данных";
  return `${Math.round(value)}%`;
}
```

to:

```ts
function formatAverageScore(value?: number | null) {
  return formatQualityScore(value, "Нет данных");
}
```

Change report metric comparison unit from:

```tsx
comparison={{ current: averageScore, previous: previousAverageScore, unit: " п.п." }}
```

to:

```tsx
comparison={{ current: averageScore, previous: previousAverageScore, unit: " п." }}
```

Change score chart suffixes from:

```tsx
<HorizontalBarChart rows={operatorScoreRows} valueSuffix="%" maxValue={100} />
<HorizontalBarChart rows={sourceScoreRows} valueSuffix="%" maxValue={100} />
<HorizontalBarChart rows={blockScoreChartRows} valueSuffix="%" maxValue={100} />
```

to:

```tsx
<HorizontalBarChart rows={operatorScoreRows} valueSuffix=" баллов" maxValue={100} />
<HorizontalBarChart rows={sourceScoreRows} valueSuffix=" баллов" maxValue={100} />
<HorizontalBarChart rows={blockScoreChartRows} valueSuffix=" баллов" maxValue={100} />
```

If `formatQualityScoreDelta` is unused after import, remove it before committing.

In `apps/web/src/components/reports/report-charts.tsx`, change the score formatter:

```ts
function formatValue(value: number) {
  return `${Math.round(value)}%`;
}
```

to:

```ts
import { formatQualityScore } from "@/lib/score-display";

function formatValue(value: number) {
  return formatQualityScore(value);
}
```

- [ ] **Step 5: Replace report export score language**

In `apps/web/src/lib/report-export.ts`, import:

```ts
import { formatQualityScore } from "@/lib/score-display";
```

Change rows that currently serialize only `String(Math.round(review.totalScore))` for a final score to:

```ts
formatQualityScore(review.totalScore)
```

Change PDF text:

```ts
doc.fontSize(10).text(`${index + 1}. ${date} · ${score}% · ${source}/${externalId}`);
```

to:

```ts
doc.fontSize(10).text(`${index + 1}. ${date} · ${score} · ${source}/${externalId}`);
```

where `score` is already `formatQualityScore(review.totalScore)`.

- [ ] **Step 6: Search for final score percent leftovers**

Run:

```bash
cd apps/web && rg -n "totalScore.*%|Math\\.round\\([^)]*totalScore[^)]*\\).*%|Average score|Средняя оценка: .*%" src tests
```

Expected: no final-score percent usages. Percent usages for scorecard weights, sampling target percent, CSAT percent, and chart bar widths may remain.

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/report-export.test.ts tests/unit/score-display.test.ts tests/unit/score-bar.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run E2E workflow**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/review-workflow.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/reports/page.tsx apps/web/src/components/reports/report-charts.tsx apps/web/src/components/review/review-panel.tsx apps/web/src/app/reviews/[conversationId]/page.tsx apps/web/src/app/self-review/page.tsx apps/web/src/app/calibration/page.tsx apps/web/src/lib/report-export.ts apps/web/tests/e2e/review-workflow.spec.ts apps/web/tests/unit/report-export.test.ts
git commit -m "refactor: present quality scores as points"
```

---

### Task 4: Add Certification Status Registry

**Files:**
- Create: `apps/web/src/lib/certification/status.ts`
- Test: `apps/web/tests/unit/certification-status.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/unit/certification-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  certificationStatusLabels,
  certificationStatusTone,
  summarizeCertification
} from "@/lib/certification/status";

describe("certification statuses", () => {
  it("uses Russian labels for admin-facing certification gates", () => {
    expect(certificationStatusLabels.live_certified).toBe("Живая сертификация пройдена");
    expect(certificationStatusLabels.waiting_for_access).toBe("Ожидает доступы");
    expect(certificationStatusLabels.not_production_ready).toBe("Не готово к промышленной эксплуатации");
  });

  it("summarizes certification without claiming production for contract-only sources", () => {
    expect(
      summarizeCertification({
        docs: "docs_checked",
        contract: "contract_certified",
        stub: "stub_certified",
        live: "waiting_for_access"
      })
    ).toMatchObject({
      status: "ready_for_live_certification",
      label: "Готово к живой сертификации",
      productionReady: false
    });
  });

  it("uses positive tone only for live-certified adapters", () => {
    expect(certificationStatusTone("live_certified")).toBe("pill--ok");
    expect(certificationStatusTone("waiting_for_access")).toBe("pill--warning");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/certification-status.test.ts
```

Expected: FAIL because `@/lib/certification/status` does not exist.

- [ ] **Step 3: Implement status helpers**

Create `apps/web/src/lib/certification/status.ts`:

```ts
export const certificationStatuses = [
  "docs_checked",
  "contract_certified",
  "stub_certified",
  "live_certified",
  "ready_for_live_certification",
  "waiting_for_access",
  "limited",
  "not_production_ready",
  "configuration_required",
  "secret_required",
  "certificate_required"
] as const;

export type CertificationStatus = (typeof certificationStatuses)[number];

export type CertificationGateSummary = {
  docs: CertificationStatus;
  contract: CertificationStatus;
  stub: CertificationStatus;
  live: CertificationStatus;
};

export const certificationStatusLabels: Record<CertificationStatus, string> = {
  docs_checked: "Документация проверена",
  contract_certified: "Контрактные тесты пройдены",
  stub_certified: "Сертификация на заглушке пройдена",
  live_certified: "Живая сертификация пройдена",
  ready_for_live_certification: "Готово к живой сертификации",
  waiting_for_access: "Ожидает доступы",
  limited: "Есть ограничения",
  not_production_ready: "Не готово к промышленной эксплуатации",
  configuration_required: "Нужна настройка",
  secret_required: "Ожидает секрет",
  certificate_required: "Ожидает сертификат"
};

export function certificationStatusTone(status: CertificationStatus) {
  if (status === "live_certified" || status === "docs_checked" || status === "contract_certified" || status === "stub_certified") {
    return "pill--ok";
  }

  if (status === "waiting_for_access" || status === "secret_required" || status === "certificate_required" || status === "ready_for_live_certification") {
    return "pill--warning";
  }

  if (status === "not_production_ready" || status === "configuration_required") {
    return "pill--danger";
  }

  return "pill--neutral";
}

export function summarizeCertification(gates: CertificationGateSummary) {
  if (gates.live === "live_certified") {
    return {
      status: "live_certified" as const,
      label: certificationStatusLabels.live_certified,
      productionReady: true
    };
  }

  if (gates.docs === "docs_checked" && gates.contract === "contract_certified" && gates.stub === "stub_certified") {
    return {
      status: "ready_for_live_certification" as const,
      label: certificationStatusLabels.ready_for_live_certification,
      productionReady: false
    };
  }

  if (gates.live === "waiting_for_access") {
    return {
      status: "waiting_for_access" as const,
      label: certificationStatusLabels.waiting_for_access,
      productionReady: false
    };
  }

  return {
    status: "not_production_ready" as const,
    label: certificationStatusLabels.not_production_ready,
    productionReady: false
  };
}
```

- [ ] **Step 4: Run the test**

Run:

```bash
cd apps/web && npm run test -- tests/unit/certification-status.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/certification/status.ts apps/web/tests/unit/certification-status.test.ts
git commit -m "feat: add certification status labels"
```

---

### Task 5: Enrich Integration Capabilities With Certification Metadata

**Files:**
- Modify: `apps/web/src/lib/integrations/capabilities.ts`
- Modify: `apps/web/tests/unit/integration-capabilities.test.ts`
- Modify: `apps/web/tests/unit/integration-catalog-route.test.ts`
- Modify: `apps/web/src/app/api/v1/integrations/catalog/route.ts`

- [ ] **Step 1: Update capability tests**

In `apps/web/tests/unit/integration-capabilities.test.ts`, add assertions to the first test:

```ts
expect(getIntegrationCapability("otrs")).toMatchObject({
  certification: {
    summary: {
      status: "ready_for_live_certification",
      label: "Готово к живой сертификации",
      productionReady: false
    }
  }
});

expect(getIntegrationCapability("custom_api")).toMatchObject({
  certification: {
    summary: {
      status: "live_certified",
      label: "Живая сертификация пройдена",
      productionReady: true
    }
  }
});

expect(getIntegrationCapability("servicenow").certification.summary.label).toBe("Не готово к промышленной эксплуатации");
```

In `apps/web/tests/unit/integration-catalog-route.test.ts`, add a success test:

```ts
it("returns certification metadata with Russian labels", async () => {
  const { GET } = await import("@/app/api/v1/integrations/catalog/route");
  mocks.requireSessionApi.mockResolvedValue({
    ok: true,
    user: { id: "user-1", workspaceId: "workspace-1" }
  });
  mocks.listIntegrationCapabilities.mockReturnValue([
    {
      source: "custom_api",
      displayName: "Custom API",
      certification: {
        summary: {
          status: "live_certified",
          label: "Живая сертификация пройдена",
          productionReady: true
        }
      }
    }
  ]);

  const response = await GET(
    new Request("https://qc.example.test/api/v1/integrations/catalog", {
      headers: { "x-request-id": "req-catalog" }
    })
  );

  await expect(response.json()).resolves.toEqual({
    catalog: [
      {
        source: "custom_api",
        displayName: "Custom API",
        certification: {
          summary: {
            status: "live_certified",
            label: "Живая сертификация пройдена",
            productionReady: true
          }
        }
      }
    ],
    requestId: "req-catalog"
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/web && npm run test -- tests/unit/certification-status.test.ts tests/unit/integration-capabilities.test.ts tests/unit/integration-catalog-route.test.ts
```

Expected: FAIL because capabilities do not expose certification metadata and catalog response lacks `requestId`.

- [ ] **Step 3: Extend capability types**

In `apps/web/src/lib/integrations/capabilities.ts`, import:

```ts
import {
  summarizeCertification,
  type CertificationGateSummary,
  type CertificationStatus
} from "@/lib/certification/status";
```

Extend `IntegrationCapability`:

```ts
  certification: {
    gates: CertificationGateSummary;
    summary: ReturnType<typeof summarizeCertification>;
    docs: Array<{
      label: string;
      href: string;
      status: CertificationStatus;
    }>;
    limitations: string[];
  };
```

Add helper functions near `defaultEvents`:

```ts
function certification(input: {
  gates: CertificationGateSummary;
  docs: Array<{ label: string; href: string; status: CertificationStatus }>;
  limitations?: string[];
}) {
  return {
    gates: input.gates,
    summary: summarizeCertification(input.gates),
    docs: input.docs,
    limitations: input.limitations ?? []
  };
}

const docsChecked: CertificationStatus = "docs_checked";
const needsAccess: CertificationStatus = "waiting_for_access";
```

- [ ] **Step 4: Add certification metadata to each capability**

For OTRS-family capabilities, use:

```ts
certification: certification({
  gates: {
    docs: "docs_checked",
    contract: "contract_certified",
    stub: "stub_certified",
    live: "waiting_for_access"
  },
  docs: [
    {
      label: "GenericInterface TicketSearch/TicketGet",
      href: "/admin/integrations/new?source=otrs",
      status: docsChecked
    }
  ],
  limitations: ["Живая сертификация требует защищенный OTRS/Znuny/OTOBO sandbox."]
})
```

For `custom_api`, use:

```ts
certification: certification({
  gates: {
    docs: "docs_checked",
    contract: "contract_certified",
    stub: "stub_certified",
    live: "live_certified"
  },
  docs: [
    {
      label: "OpenAPI contract",
      href: "/api/v1/openapi",
      status: docsChecked
    }
  ]
})
```

For `generic_webhook`, use:

```ts
certification: certification({
  gates: {
    docs: "docs_checked",
    contract: "contract_certified",
    stub: "stub_certified",
    live: "waiting_for_access"
  },
  docs: [
    {
      label: "Webhook HMAC contract",
      href: "/api/v1/openapi",
      status: docsChecked
    }
  ],
  limitations: ["Живая сертификация требует внешний webhook producer."]
})
```

For preview native helpdesks, use `contract_certified` only where current tests already cover the normalizer; keep `live: needsAccess` and a limitation:

```ts
limitations: ["Adapter готов к контрактной проверке; нужна live-среда для промышленной сертификации."]
```

For roadmap enterprise sources, use:

```ts
certification: certification({
  gates: {
    docs: "configuration_required",
    contract: "not_production_ready",
    stub: "not_production_ready",
    live: "waiting_for_access"
  },
  docs: [
    {
      label: "Официальная документация требует проверки перед реализацией adapter",
      href: "/api/v1/openapi",
      status: "configuration_required"
    }
  ],
  limitations: ["Adapter еще не реализован."]
})
```

- [ ] **Step 5: Preserve fallback capabilities**

In `getIntegrationCapability`, when returning a fallback for unknown `native_helpdesk` or `custom_api`, copy the base certification but add a limitation:

```ts
certification: {
  ...base.certification,
  limitations: [`Источник ${source} использует fallback capability и требует отдельной сертификации.`]
}
```

- [ ] **Step 6: Return request ID in catalog response**

In `apps/web/src/app/api/v1/integrations/catalog/route.ts`, change:

```ts
return apiJson(
  {
    catalog: listIntegrationCapabilities()
  },
  200,
  requestId
);
```

to:

```ts
return apiJson(
  {
    catalog: listIntegrationCapabilities(),
    requestId
  },
  200,
  requestId
);
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/certification-status.test.ts tests/unit/integration-capabilities.test.ts tests/unit/integration-catalog-route.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/integrations/capabilities.ts apps/web/src/app/api/v1/integrations/catalog/route.ts apps/web/tests/unit/integration-capabilities.test.ts apps/web/tests/unit/integration-catalog-route.test.ts
git commit -m "feat: expose integration certification readiness"
```

---

### Task 6: Document Certification And Score Units In OpenAPI

**Files:**
- Modify: `apps/web/src/lib/api/openapi.ts`
- Modify: `apps/web/tests/unit/openapi.test.ts`

- [ ] **Step 1: Update OpenAPI test**

In `apps/web/tests/unit/openapi.test.ts`, add:

```ts
expect(document.components.schemas.ScoreSummary).toMatchObject({
  type: "object",
  required: ["totalScore", "scoreUnit", "scoreLabel"]
});
expect(document.components.schemas.ScoreSummary.properties.scoreUnit.enum).toEqual(["points"]);
expect(document.components.schemas.CertificationSummary.required).toEqual(["status", "label", "productionReady"]);
expect(document.components.schemas.IntegrationCapability.required).toEqual(
  expect.arrayContaining(["certification"])
);
expect(document.components.schemas.IntegrationCapability.properties.certification).toEqual({
  $ref: "#/components/schemas/Certification"
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/openapi.test.ts
```

Expected: FAIL because OpenAPI lacks score and certification schemas.

- [ ] **Step 3: Add OpenAPI schemas**

In `apps/web/src/lib/api/openapi.ts`, add these under `components.schemas` before `IntegrationCapability`:

```ts
        ScoreSummary: {
          type: "object",
          required: ["totalScore", "scoreUnit", "scoreLabel"],
          properties: {
            totalScore: {
              type: "number",
              minimum: 0,
              maximum: 100,
              description: "Нормализованная итоговая оценка от 0 до 100."
            },
            scoreUnit: {
              type: "string",
              enum: ["points"],
              description: "Итоговая оценка отображается как баллы, не проценты."
            },
            scoreLabel: {
              type: "string",
              examples: ["92 балла"]
            }
          }
        },
        CertificationSummary: {
          type: "object",
          required: ["status", "label", "productionReady"],
          properties: {
            status: { type: "string" },
            label: { type: "string" },
            productionReady: { type: "boolean" }
          }
        },
        Certification: {
          type: "object",
          required: ["gates", "summary", "docs", "limitations"],
          properties: {
            gates: { type: "object" },
            summary: { $ref: "#/components/schemas/CertificationSummary" },
            docs: {
              type: "array",
              items: {
                type: "object",
                required: ["label", "href", "status"],
                properties: {
                  label: { type: "string" },
                  href: { type: "string" },
                  status: { type: "string" }
                }
              }
            },
            limitations: { type: "array", items: { type: "string" } }
          }
        },
```

Update `IntegrationCapability.required` to include `"certification"` and add:

```ts
            certification: { $ref: "#/components/schemas/Certification" }
```

- [ ] **Step 4: Run OpenAPI tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/openapi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/openapi.ts apps/web/tests/unit/openapi.test.ts
git commit -m "docs: add score and certification schemas to openapi"
```

---

### Task 7: Add Accessible Help Tooltip Primitive

**Files:**
- Create: `apps/web/src/components/ui/help-tooltip.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/tests/unit/help-tooltip.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/web/tests/unit/help-tooltip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpTooltip } from "@/components/ui/help-tooltip";

describe("HelpTooltip", () => {
  it("renders an accessible question mark trigger with described help text", () => {
    render(<HelpTooltip label="Что значит статус?" content="Статус показывает readiness gate." />);

    const trigger = screen.getByRole("button", { name: "Что значит статус?" });
    const tooltip = screen.getByText("Статус показывает readiness gate.");

    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
    expect(trigger).toHaveClass("help-tooltip__trigger");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/help-tooltip.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/ui/help-tooltip.tsx`:

```tsx
import { CircleHelp } from "lucide-react";
import { useId, type ReactNode } from "react";

export function HelpTooltip({
  label,
  content,
  className = ""
}: {
  label: string;
  content: ReactNode;
  className?: string;
}) {
  const id = useId();

  return (
    <span className={`help-tooltip ${className}`}>
      <button
        type="button"
        className="help-tooltip__trigger"
        aria-label={label}
        aria-describedby={id}
      >
        <CircleHelp size={14} aria-hidden="true" />
      </button>
      <span id={id} role="tooltip" className="help-tooltip__content">
        {content}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Add CSS**

Append to the shared UI section in `apps/web/src/app/globals.css` near button/form primitives:

```css
.help-tooltip {
  position: relative;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  vertical-align: middle;
}

.help-tooltip__trigger {
  display: inline-flex;
  height: 22px;
  width: 22px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel);
  color: var(--muted);
  cursor: help;
  outline: 2px solid transparent;
  outline-offset: 2px;
}

.help-tooltip__trigger:hover,
.help-tooltip__trigger:focus-visible {
  border-color: var(--accent-border);
  color: var(--accent-strong);
  outline-color: var(--button-focus-ring);
}

.help-tooltip__content {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 40;
  width: min(280px, calc(100vw - 32px));
  max-width: max-content;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--foreground);
  color: var(--panel);
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 560;
  line-height: 1.45;
  text-align: left;
  box-shadow: var(--shadow-raised);
  transition: opacity 120ms ease, transform 120ms ease;
}

.help-tooltip:hover .help-tooltip__content,
.help-tooltip:focus-within .help-tooltip__content {
  opacity: 1;
  transform: translateY(0);
}
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
cd apps/web && npm run test -- tests/unit/help-tooltip.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui/help-tooltip.tsx apps/web/src/app/globals.css apps/web/tests/unit/help-tooltip.test.tsx
git commit -m "feat: add accessible help tooltip"
```

---

### Task 8: Surface Certification And Help In Integration UI

**Files:**
- Modify: `apps/web/src/app/admin/integrations/page.tsx`
- Modify: `apps/web/src/app/admin/integrations/[integrationId]/page.tsx`
- Modify: `apps/web/src/components/integrations/integration-setup-workspace.tsx`
- Modify: `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`

- [ ] **Step 1: Update E2E expectations**

In `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`, add after the integrations overview headings:

```ts
await expect(page.getByText("Готово к живой сертификации").first()).toBeVisible();
await expect(page.getByRole("button", { name: "Что значит статус сертификации?" }).first()).toBeVisible();
```

In the new integration setup section, add:

```ts
await expect(page.getByText("Статус сертификации")).toBeVisible();
```

- [ ] **Step 2: Run E2E to verify it fails**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/otrs-integration-cockpit.spec.ts
```

Expected: FAIL because certification labels and help triggers are not rendered.

- [ ] **Step 3: Add certification helpers in integrations overview**

In `apps/web/src/app/admin/integrations/page.tsx`, import:

```ts
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { certificationStatusTone } from "@/lib/certification/status";
```

Where a capability is available for an integration row, render:

```tsx
<span className={`pill ${certificationStatusTone(capability.certification.summary.status)}`}>
  {capability.certification.summary.label}
</span>
<HelpTooltip
  label="Что значит статус сертификации?"
  content="Статус показывает, какие проверки прошел connector: документация, контрактные тесты, заглушка и живая сертификация."
/>
```

For catalog rows, render the same summary from `capability.certification.summary`.

- [ ] **Step 4: Add certification summary to integration cockpit**

In `apps/web/src/app/admin/integrations/[integrationId]/page.tsx`, import the same helpers.

Near the cockpit status strip, render:

```tsx
<div className="ops-status-item">
  <span className="ops-status-item__label">Статус сертификации</span>
  <span className={`pill ${certificationStatusTone(capability.certification.summary.status)}`}>
    {capability.certification.summary.label}
  </span>
  <span className="record-meta">
    {capability.certification.summary.productionReady ? "Можно использовать в промышленном контуре." : "Нужны дополнительные проверки перед промышленным контуром."}
  </span>
</div>
```

Use the existing `capability` variable if present. If the page does not yet compute it at cockpit scope, add:

```ts
const capability = getIntegrationCapability(integration.source, integration.type);
```

- [ ] **Step 5: Add setup wizard help copy**

In `apps/web/src/components/integrations/integration-setup-workspace.tsx`, import `HelpTooltip`.

In the source selected card, add:

```tsx
<div className="flex min-w-0 items-center gap-2">
  <p className="soft-callout__label">Статус сертификации</p>
  <HelpTooltip
    label="Что значит статус сертификации?"
    content="Connector нельзя считать промышленно готовым без прохождения всех gate-проверок."
  />
</div>
```

The setup wizard is a client component, so keep Phase A simple and use static labels matching current capability status for source groups:

```ts
const sourceModeCertificationLabels: Record<SourceMode, string> = {
  otrs_family: "Готово к живой сертификации",
  native_helpdesk: "Ожидает доступы",
  custom_api: "Живая сертификация пройдена"
};
```

Render:

```tsx
<span className="pill pill--neutral">{sourceModeCertificationLabels[selectedOption.mode]}</span>
```

- [ ] **Step 6: Run E2E**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/otrs-integration-cockpit.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/integrations/page.tsx apps/web/src/app/admin/integrations/[integrationId]/page.tsx apps/web/src/components/integrations/integration-setup-workspace.tsx apps/web/tests/e2e/otrs-integration-cockpit.spec.ts
git commit -m "feat: show integration certification readiness"
```

---

### Task 9: Add Help Tooltips To Access, Tokens, Scorecards, And Reports

**Files:**
- Modify: `apps/web/src/app/admin/access/page.tsx`
- Modify: `apps/web/src/app/admin/tokens/page.tsx`
- Modify: `apps/web/src/app/admin/scorecards/page.tsx`
- Modify: `apps/web/src/app/reports/page.tsx`
- Test: `apps/web/tests/e2e/review-workflow.spec.ts`

- [ ] **Step 1: Add E2E expectations**

In `apps/web/tests/e2e/review-workflow.spec.ts`, add:

```ts
await page.goto("/admin/access");
await expect(page.getByRole("button", { name: "Как работает приоритет групп?" })).toBeVisible();

await page.goto("/admin/tokens");
await expect(page.getByRole("button", { name: "Что такое scope API-ключа?" })).toBeVisible();

await page.goto("/admin/scorecards");
await expect(page.getByRole("button", { name: "Чем вес отличается от итоговых баллов?" })).toBeVisible();

await page.goto("/reports");
await expect(page.getByRole("button", { name: "Как считать оценку в баллах?" })).toBeVisible();
```

- [ ] **Step 2: Run E2E to verify it fails**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/review-workflow.spec.ts
```

Expected: FAIL because help triggers are not present.

- [ ] **Step 3: Add tooltips**

Import `HelpTooltip` in each page:

```ts
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

In `apps/web/src/app/admin/access/page.tsx`, near "Группы и роли", add:

```tsx
<HelpTooltip
  label="Как работает приоритет групп?"
  content="Меньшее значение priority применяется раньше. Если пользователь состоит в нескольких группах, победит первое активное правило."
/>
```

In `apps/web/src/app/admin/tokens/page.tsx`, near API scopes, add:

```tsx
<HelpTooltip
  label="Что такое scope API-ключа?"
  content="Scope ограничивает, какие API endpoint может вызывать ключ. Для production выдавайте минимально нужный набор scope."
/>
```

In `apps/web/src/app/admin/scorecards/page.tsx`, near criterion weight copy, add:

```tsx
<HelpTooltip
  label="Чем вес отличается от итоговых баллов?"
  content="Вес критерия влияет на расчет. Итоговая оценка отображается как нормализованные баллы от 0 до 100."
/>
```

In `apps/web/src/app/reports/page.tsx`, near average score metric, add:

```tsx
<HelpTooltip
  label="Как считать оценку в баллах?"
  content="Итоговая оценка хранится как нормализованное значение от 0 до 100 и показывается как баллы."
/>
```

- [ ] **Step 4: Run E2E**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/review-workflow.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/access/page.tsx apps/web/src/app/admin/tokens/page.tsx apps/web/src/app/admin/scorecards/page.tsx apps/web/src/app/reports/page.tsx apps/web/tests/e2e/review-workflow.spec.ts
git commit -m "feat: add admin help tooltips"
```

---

### Task 10: Tighten Admin Layout Contract

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/tests/e2e/admin-layout-visual.spec.ts`

- [ ] **Step 1: Add layout QA test**

Create `apps/web/tests/e2e/admin-layout-visual.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const routes = [
  "/admin",
  "/admin/integrations",
  "/admin/integrations/new",
  "/admin/access",
  "/admin/users",
  "/admin/scorecards",
  "/admin/tokens",
  "/admin/system",
  "/reports",
  "/reviews",
  "/calibration",
  "/self-review"
];

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
  { width: 1440, height: 960 }
];

test.describe("admin layout visual contract", () => {
  for (const viewport of viewports) {
    test(`has no unintended horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);

      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("body")).toBeVisible();

        const overflow = await page.evaluate(() => {
          const documentElement = document.documentElement;
          return documentElement.scrollWidth - documentElement.clientWidth;
        });

        expect.soft(overflow, `${route} overflow at ${viewport.width}px`).toBeLessThanOrEqual(2);
      }
    });
  }
});
```

- [ ] **Step 2: Run the layout test**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/admin-layout-visual.spec.ts
```

Expected before CSS edits: FAIL on any route with unintended overflow, or PASS if the previous redesign already fixed the route set. Continue with Step 3 either way so the layout contract is explicit.

- [ ] **Step 3: Apply CSS contract fixes**

In `apps/web/src/app/globals.css`, add or update these rules near existing admin layout rules:

```css
.ops-panel__header > *,
.command-center > *,
.admin-actions,
.ops-status-item,
.ops-metric {
  min-width: 0;
}

.ops-panel__header > :first-child,
.command-center > :first-child {
  min-width: 0;
  max-width: 100%;
}

.ops-panel__title,
.record-title,
.record-meta,
.ops-metric__note,
.ops-status-item__value {
  overflow-wrap: anywhere;
}

.ops-table__row {
  min-width: 0;
}

.ops-table__cell,
.ops-table__cell form {
  min-width: 0;
  max-width: 100%;
}

.ops-table__cell--actions .action-button,
.admin-actions .action-button {
  max-width: 100%;
}

.ops-tabs--section {
  scrollbar-gutter: stable;
}

@media (max-width: 640px) {
  .help-tooltip__content {
    right: auto;
    left: 0;
    max-width: calc(100vw - 32px);
  }
}
```

Do not remove existing responsive-table behavior. If a route still overflows because of a legitimate code block or intentionally scrollable table, scope the fix to that container instead of globally hiding overflow.

- [ ] **Step 4: Re-run layout test**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/admin-layout-visual.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/tests/e2e/admin-layout-visual.spec.ts
git commit -m "test: add admin layout overflow sweep"
```

---

### Task 11: Harden Current API Catalog And Response Contracts

**Files:**
- Modify: `apps/web/src/app/api/v1/integrations/catalog/route.ts`
- Modify: `apps/web/tests/unit/integration-catalog-route.test.ts`

- [ ] **Step 1: Add API contract expectations**

In `apps/web/tests/unit/integration-catalog-route.test.ts`, extend the success test from Task 5 with header and certification shape assertions:

```ts
expect(response.headers.get("x-request-id")).toBe("req-catalog");
const body = await response.json();
expect(body.catalog[0].certification.summary).toMatchObject({
  label: "Живая сертификация пройдена",
  productionReady: true,
  status: "live_certified"
});
expect(body.catalog[0].certification.summary.label).not.toBe("production-ready");
```

- [ ] **Step 2: Run tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/integration-catalog-route.test.ts
```

Expected: FAIL until the catalog route returns request ID and certification metadata consistently.

- [ ] **Step 3: Ensure catalog route keeps request ID**

Verify `apps/web/src/app/api/v1/integrations/catalog/route.ts` returns:

```ts
return apiJson(
  {
    catalog: listIntegrationCapabilities(),
    requestId
  },
  200,
  requestId
);
```

- [ ] **Step 4: Run API tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/integration-catalog-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/integrations/catalog/route.ts apps/web/tests/unit/integration-catalog-route.test.ts
git commit -m "fix: expose stable integration readiness contracts"
```

---

### Task 12: Final Verification For Phase A

**Files:**
- No new files expected.
- Verify all files touched by Tasks 1-11.

- [ ] **Step 1: Search for forbidden final-score percent labels**

Run:

```bash
cd apps/web && rg -n "totalScore.*%|Math\\.round\\([^)]*totalScore[^)]*\\).*%|100%\"|valueSuffix=\"%\"" src tests
```

Expected: Only valid scorecard weight, layout width, sampling, CSAT, modulo, or non-quality-score percent references remain. If a final quality score reference remains, fix it before proceeding.

- [ ] **Step 2: Search for English certification labels in user-facing code**

Run:

```bash
cd apps/web && rg -n "production-ready|ready for live|live-certified|stub-certified|contract-certified|waiting for access" src tests
```

Expected: No user-facing English certification labels. Machine keys in tests or type names are acceptable only if they are not rendered labels.

- [ ] **Step 3: Typecheck**

Run:

```bash
cd apps/web && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Unit and API tests**

Run:

```bash
cd apps/web && npm run test
```

Expected: PASS.

- [ ] **Step 5: E2E tests**

Run:

```bash
cd apps/web && npm run test:e2e
```

Expected: PASS.

- [ ] **Step 6: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: Only intended Phase A files are modified. Existing unrelated dirty files from before this plan must not be reverted.

- [ ] **Step 7: Commit final verification fixes**

When Step 1-6 require code or test fixes, commit them:

```bash
git add apps/web
git commit -m "chore: complete phase a production hardening verification"
```

When Step 1-6 pass without additional changes, skip this commit.

---

## Phase A Completion Criteria

Phase A is complete when:

1. `totalScore` still stores normalized `0..100` numbers.
2. User-facing final quality score labels say "балл/балла/баллов", not `%`.
3. Criterion weights may still show `%`.
4. Integration capabilities expose certification metadata with Russian labels.
5. Integration overview, cockpit, and setup UI show certification readiness honestly.
6. Help tooltip primitive exists and appears on high-value admin fields.
7. OpenAPI documents score unit and certification schemas.
8. Current integration catalog/API responses include stable machine statuses and request IDs.
9. Visual overflow sweep passes for the Phase A route set.
10. `npm run typecheck`, `npm run test`, and `npm run test:e2e` pass.
