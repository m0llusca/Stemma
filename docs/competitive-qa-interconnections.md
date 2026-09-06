# Competitive QA interconnections — Stemma target map

**Date:** 2026-09-06  
**Repo:** `apps/web`  
**Related:** [business-logic-adversarial-audit.md](business-logic-adversarial-audit.md)

---

## 1. Context

Lazyweb (product-UI research tooling) was unavailable for this pass. Findings below are synthesized from **public web** competitor positioning (vendor sites and 2025–2026 roundups covering Zendesk QA / Klaus, Observe.AI, MaestroQA, Playvox / NICE, Level AI, plus helpdesk-adjacent Freshdesk and HubSpot) and cross-checked against Stemma code + the adversarial audit.

Competitors sell **closed loops**, not isolated features: sampling feeds queue; score feeds feedback and coaching; reports drill to the same conversation IDs; calibration and appeals feed rubric trust. Stemma’s product bar is the same closed-loop honesty — especially fail-closed live integration gates.

---

## 2. Feature interconnection matrix (summary)

Legend for competitor cells: **strong** = marketed as core loop; **partial** = present but thinner; **weak** = not a primary story. Stemma column = **target** product intent (not ship status — see §4).

| Interconnection loop | Stemma target | Klaus / Zendesk QA | Observe.AI | MaestroQA | Playvox | Level AI | Freshdesk | HubSpot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sampling → human queue (exclude non-sample) | Core | strong (AutoQA + human exceptions) | strong (Auto QA + rules) | strong | strong | strong | partial (ticket filters, not QA sample) | weak |
| Score finalize → agent feedback + ack / dispute | Core | strong | strong | strong | strong | strong | partial | weak |
| Scored / pinned evidence → coaching plan (stable IDs) | Core | strong | strong | strong | strong | strong | weak | weak |
| KPI / report → drill-down to conversation + review | Core | strong | strong | strong | strong | strong | partial | partial |
| Appeals → manager-only resolution | Core | strong | strong | strong | partial | strong | weak | weak |
| Integration honesty / live-cert fail-closed | Core (differentiator) | partial (platform trust) | partial | partial | partial | partial | N/A (native) | N/A (native) |
| Calibration multi-rater on same conversation | Core | strong | strong | strong | partial | strong | weak | weak |
| AI draft / AutoQA → human exception queue | Core (hybrid) | strong | strong | strong | strong | strong | weak | weak |
| Coaching done → measurable quality delta | Core | partial–strong | strong | strong | strong | strong | weak | weak |
| Appeal / dispute outcomes → rubric & calibration signals | Target | partial | strong | partial | partial | strong | weak | weak |
| Root-cause tags → coaching themes + reports | Core | strong | strong | strong | partial | strong | partial | partial |
| Sampling / quota → assignment workload visibility | Core | partial | partial | strong | strong (WFM) | partial | weak | weak |
| Reviewer quality (GraderQA-like) | Target | partial | partial | strong | partial | partial | weak | weak |
| Coaching gap → training / quiz linked to reviews | Target | partial | strong | strong | strong | partial | weak | weak |
| Internal QA score × CSAT on one drill-down | Target | strong | strong | partial | partial | strong | partial | partial |

**Takeaway:** Category leaders win on **ID-stable loops** (ticket → score → feedback → coaching → report) plus AutoQA exception routing. Stemma already aims at that loop; the durable differentiator called out in research is **integration honesty / fail-closed live gates**, which helpdesk-native suites rarely market as a QA product surface.

---

## 3. Fifteen must-have interconnections (P0 / P1 / P2)

Exact priority list from parent research.

### P0 — ship-blocking closed loop

1. **Sampling → queue with `OUT_OF_SAMPLE` exclusion**  
   Unmatched / non-sample conversations must not enter default take-next or queue listing.

2. **Scorecard finalize → agent feedback + ack**  
   Finalize publishes to the agent; acknowledge (and dispute path) closes the feedback loop.

3. **Scored / pinned → coaching plan (same IDs)**  
   Low score / pins / findings open a coaching plan that carries the same `reviewId` / `conversationId` lineage.

4. **Report / KPI → drill-down to conversation + review**  
   Every KPI cell resolves to filtered queue and/or the concrete conversation+review evidence.

5. **Appeals manager-only resolution**  
   Agents may dispute; only managers resolve (`confirmed` / `corrected` / reanswer request).

6. **Integration honesty / fail-closed live gates**  
   Production import and “connected” claims require protected live-cert evidence; probes must not fake readiness.

7. **Calibration multi-rater same conversation**  
   Multiple raters score the same conversation; agreement is measurable per criterion.

### P1 — trust and ops scale

8. **AI draft → human queue (exceptions)**  
   Auto-score drafts route uncertain / rejected / policy exceptions into human review work.

9. **Coaching completion → quality delta**  
   Closing a plan/assignment measures before/after agent score delta.

10. **Appeal outcomes → rubric / calibration signals**  
    Dispute patterns feed rubric tuning and calibration focus (not status-only bookkeeping).

11. **Root-cause tags → coaching themes + reports**  
    Finding root-cause / category drives coaching focus areas and report drill-through.

12. **Sampling / quota → assignment workload visibility**  
    Quotas and sample volume surface as reviewer/agent assignment load, not only completion %.

### P2 — differentiation depth

13. **GraderQA-like reviewer quality**  
    Score the scorers (agreement, bias, coverage) as a first-class surface.

14. **Coaching gap → training / quiz linked to reviews**  
    Gaps spawn training/quiz artifacts still linked to originating reviews.

15. **Internal QA vs CSAT on one drill-down**  
    One evidence path correlating internal score and customer CSAT for the same conversations.

---

## 4. Stemma status map (`apps/web`)

Cross-check: code grep + [business-logic-adversarial-audit.md](business-logic-adversarial-audit.md) (2026-09-06 finish-everything verify). Statuses are **wired** (end-to-end enough for production loop), **partial** (pieces exist; ID or product loop incomplete), **missing** (no meaningful path).

| # | Interconnection | Status | Evidence (quick) |
| --- | --- | --- | --- |
| 1 | Sampling → queue `OUT_OF_SAMPLE` exclusion | **Wired** | `sampling-engine.ts` (`outOfSampleSamplingType`); `nextReviewWhere` / `buildReviewQueueWhere`; audit **S2** fixed. Note: queue **summary** counts may still include OOS (remaining risk). |
| 2 | Finalize → feedback + ack | **Wired** | `review-actions` finalize; `feedback-actions` acknowledge; self-review UI; messaging on training/feedback. |
| 3 | Scored / pinned → coaching (same IDs) | **Wired** | Finalize offers coaching CTA; `/coaching` prefills + persists `reviewId`/`conversationId` on `CoachingPlan` (FKs `onDelete: SetNull`, migration `20260906123433_coaching_plan_origin_fks`); review detail lists `originLinkedPlans`; timeline pins; self-review pins + closable `CoachingAction`; `TrainingAssignment.reviewId` exists. |
| 4 | Report / KPI → conversation + review | **Wired** | Dashboard KPI/focus → `/reviews?…`; reports use `reportReviewHref` + `resolveReportEvidence` → `/reviews/{conversationId}`. `REPORT_EXPORT` job now ships filtered rows + summary metrics (`finalizedCount` / `averageScore` / critical / high-risk). |
| 5 | Appeals manager-only | **Wired** | `managerOnlyFeedbackActions` in `feedback-actions.ts`; audit **F1** fixed. |
| 6 | Integration honesty / fail-closed live gates | **Wired** | `assertIntegrationLiveCertifiedForProductionImport`; Connect persists `ready` not premature `active`; webhook workspace pin; audit **I1 / C2 / W1 / C1**. |
| 7 | Calibration multi-rater | **Wired** | `CalibrationSession` + items + participants; `/calibration` agreement engine (`calibration/agreement.ts`); scorecard + related-review deep links. |
| 8 | AI draft → human exceptions queue | **Wired** | `process=ai_exception` via `parseReviewQueueFilters` / `buildReviewQueueWhere` (`ai-quality/exceptions.ts`); queue chip «AI-исключения»; take-next honors `queueHref`. |
| 9 | Coaching completion → quality delta | **Wired** | `/coaching` `loadAssignmentCoachingImpact` + training before/after averages; `CoachingAction` status close. |
| 10 | Appeal outcomes → rubric / calibration signals | **Wired (signals)** | `appeal_confirmed` / `appeal_corrected` write `calibration.appeal_signal` ReviewEvent + audit; `/calibration` panel «Сигналы по апелляциям». **Does not** auto-edit scorecard criteria. |
| 11 | Root-cause → coaching themes + reports | **Wired** | Finding `rootCause` / `findingCategory` report drill-through; `/coaching` aggregates themes (`coaching-themes.ts`) and auto-seeds plan `focusArea` via `CoachingPlanThemeField`. |
| 12 | Sampling / quota → workload visibility | **Wired** | Quota risk evaluation + dashboard reviewer assignment workload (`reviewer-workload.ts` / `loadReviewerWorkload`). |
| 13 | GraderQA-like reviewer quality | **Wired lite** | Calibration: low inter-rater agreement list (`listLowAgreementCalibrationItems`) + HUMAN finalize volume (30d). No blind regrade product. |
| 14 | Coaching gap → training / quiz ↔ reviews | **Wired (no LMS)** | One-click `createTrainingAssignmentFromReview` from review / finding coaching action (optional `coachingActionId`); `TrainingAssignment.reviewId` + optional `coachingPlanId`. No external LMS/quiz engine. |
| 15 | Internal QA × CSAT one drill-down | **Wired lite** | Reports overview `QaCsatMatrixPanel` + queue dual filter `csatBucket` × `qaScoreBand`; Conversation.`csatScore`/`csatBucket` in schema. |

**Audit alignment:** P0 items 1–7 and P1/P2 items 8–15 are wired for the UI closed loop (lite where noted). Finish-everything wave **verified** 2026-09-06 (typecheck + vitest). True leftovers: queue summary OOS counts; no auto scorecard edit from appeals; no blind GraderQA / external LMS.

See also [cross-feature-interconnections.md](cross-feature-interconnections.md).

---

## 5. Suggested build order (if prioritizing from this list)

1. ~~Harden remaining **partial** P0 (#3 plan ID lineage on `CoachingPlan`).~~ **Done.**  
2. ~~Close remaining P1 gaps (#11–12) and audit tails before expanding AutoQA coverage claims.~~ **Done** (themes + workload + audit tails except queue-summary OOS).  
3. Optional depth: blind GraderQA, appeal→scorecard auto-edit, external LMS — only after the human closed loop stays boringly reliable.

No commit attached to this doc write-up.
