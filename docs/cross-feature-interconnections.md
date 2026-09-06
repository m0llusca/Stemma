# Cross-feature interconnections — wiring wave

**Date:** 2026-09-06  
**Repo:** `apps/web`  
**Related:** [competitive-qa-interconnections.md](competitive-qa-interconnections.md), [business-logic-adversarial-audit.md](business-logic-adversarial-audit.md)

Uncommitted product wiring that closes competitive silos between review, AI drafts, coaching, reports/dashboard, and self-review. Finish-everything wave **verified** (typecheck + vitest) — see Remaining leftovers. No commit attached.

---

## What this wave wired

| Loop | Behavior | Primary paths |
| --- | --- | --- |
| **CoachingAction close** | Managers complete / cancel / reopen finding-linked разборы; audited + `ReviewEvent`; open-action reports stop treating every row as forever-open | `coaching-action.ts`, `coaching-action-actions.ts`, `/coaching`, review detail |
| **AI approve → DRAFT Review** | Accept / override on a score draft materializes mapped `CriterionScore` rows onto the deciding actor’s human **DRAFT** Review (still requires human finalize) | `ai-quality/apply-score-draft.ts`, `ai-quality/drafts.ts` |
| **Report / dashboard drill-downs** | KPI cards, focus rows, and report cells share the `/reviews?…` filter contract; evidence sheet can open `/reviews/{conversationId}` | `dashboard/page.tsx`, `reports/page.tsx`, `reports/report-format` + evidence helpers |
| **Coaching CTA after finalize** | Low score / critical / high-risk findings append `coachOffer` params; toast + review detail offer plan create with stable IDs; **`CoachingPlan.reviewId`/`conversationId` persisted** | `coaching-follow-up.ts`, `coaching-plan-actions.ts`, `review-actions.ts`, `review-saved-toast.tsx`, review detail |
| **Pins on self-review** | Agent self-review surface loads open coaching pins (+ finding coaching actions) so feedback/coaching notes are visible without manager UI | `self-review/page.tsx` |
| **Calibration cross-links** | Calibration links scorecard admin + related reviews with return context | `calibration/page.tsx` |
| **AI exceptions queue** | `process=ai_exception` surfaces low-confidence / rejected / changed score drafts; take-next stays in filter | `ai-quality/exceptions.ts`, `review-repository`, queue UI |
| **Appeal → calibration signal** | Resolved appeals emit `calibration.appeal_signal` + audit flag; calibration lists links | `feedback-actions.ts`, `/calibration` |
| **Coaching themes** | Aggregate finding category / rootCause / failed criteria → seed plan `focusArea` | `coaching-themes.ts`, `coaching-plan-theme-field.tsx`, `/coaching` |
| **Reviewer workload** | Dashboard assignment-load surface from sample / queue volume | `reviewer-workload.ts`, `/dashboard` |
| **GraderQA-lite** | Low inter-rater agreement + HUMAN finalize volume on calibration | `calibration/reviewer-quality.ts`, `/calibration` |
| **Training one-click** | `createTrainingAssignmentFromReview` from review / coaching action (no fake LMS) | `feedback-actions.ts`, review detail |
| **QA × CSAT matrix** | Reports overview matrix + queue `csatBucket` × `qaScoreBand` filters | `report-aggregation.ts`, `insight-correlation-panels.tsx`, `review-repository.ts` |
| **Audit tails** | Self-review `assigneeId`; take-next `reviews:write`; OTRS per-item lock renew; `REPORT_EXPORT` summary metrics | `review-lifecycle.ts`, `queue-view-actions.ts`, `jobs/queue.ts`, `report-export.ts` |

Supporting tests: `cross-link-wiring`, `coaching-action-actions`, `coaching-follow-up`, `coaching-themes`, `reviewer-workload`, `calibration-reviewer-quality`, `ai-apply-score-draft`, `ai-exceptions`, `ai-quality-drafts`, `report-evidence-links`, `product-pages-copy`, plus broader queue/feedback/sampling/connect suites.

---

## Remaining leftovers (true gaps only)

| Item | Why still open |
| --- | --- |
| Queue summary OOS | `getReviewQueueSummary` still uses `scopedConversationWhere` (may include `OUT_OF_SAMPLE` in totals); listing/take-next already exclude |
| Appeal → auto scorecard edit | Signals only; no automatic criterion rewrite |
| Blind GraderQA / external LMS | Intentionally out of scope (lite / no LMS) |
| `appeal_corrected` scoring reopen | Status-only product semantics (deferred by design) |
| Session API 403 exact Russian string | Polish; no cross-tenant leak observed |

P0–P2 competitive loops from [competitive §4](competitive-qa-interconnections.md) are **wired** (lite where noted). No active finish-everything backlog beyond the rows above.

---

## Verification (this pass)

| Check | Result |
| --- | --- |
| Conflict markers | None |
| `cd apps/web && npm run typecheck` | **exit 0** |
| Vitest (expanded changed areas) | **41 files, 369 passed** |
| Fix this pass | `review-detail-page.test.tsx` mock for `prisma.coachingPlan.findMany` |
