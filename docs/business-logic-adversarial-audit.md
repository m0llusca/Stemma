# Stemma business-logic adversarial audit — synthesis

**Date:** 2026-09-06  
**Repo:** `/Users/dubrsky/Downloads/qc_app` (`apps/web`)  
**Inputs:** three parallel adversarial audits (ingress/sampling, review/feedback, jobs/messaging/reports/auth) + pipeline map + re-verification after P1 closure + finish-everything verify  
**Status:** fixes uncommitted; re-verify green (typecheck + 41 vitest files / 369 tests). Finish-everything wave **verified** — deferred audit tails closed except queue-summary OOS (see §5).

---

## 1. Pipeline stages (brief)

Closed loop observed in code:

1. **Ingress** — Custom API, signed webhooks (`x-qc-workspace-id` required), integration import jobs (production gated on protected live-cert evidence), OTRS-family selected import, Phase B helpdesk adapters, data-source adapters. Connect orchestrator probes auth/capabilities/webhooks before persist as `ready` (not `active`).
2. **Normalize → persist** — `CustomConversationInput` → `upsertCustomConversation` (`Conversation` + `Message`, workspace-scoped unique keys).
3. **Sampling** — `evaluateSamplingRules` / `applySamplingDecision`; unmatched persist `samplingType: OUT_OF_SAMPLE`; match can auto-assign QA + enqueue `AI_SCORE`.
4. **Queue / Take next** — SLA order (`reviewDueAt`, then `openedAt`); `OUT_OF_SAMPLE` excluded from default queue listing and take-next via `buildReviewQueueWhere` / `nextReviewWhere`; optional queue URL filters; agents scoped by `assigneeId`.
5. **Review** — draft / finalize / AI draft decide; scorecard criteria; audit + review events.
6. **Feedback / appeal / self-review** — acknowledge, open appeal, manager resolve; self-review ownership checks.
7. **Coaching / calibration** — plans, training tasks, pins; calibration sessions.
8. **Reports / messaging / auth boundaries** — exports & schedules, quota-risk, delivery jobs, SSO/session workspace pinning. Production import enqueue is fail-closed on protected live-cert evidence.

```text
Ingress → Normalize/Persist → Sampling → Assign/Take-next
       → Score/Finalize → Feedback/Appeal → Coaching
       → Reports / Audit / Messaging
```

---

## 2. Verification evidence (this pass)

| Check | Result |
|-------|--------|
| P1 re-verify (code) | S2/`OUT_OF_SAMPLE` + `nextReviewWhere`; I1 live-cert gate; C2 Connect `ready`; W1 `x-qc-workspace-id` — all landed |
| Queue list follow-up | `buildReviewQueueWhere` excludes `OUT_OF_SAMPLE` by default (same as take-next) |
| Finish-everything tails | Self-review `assigneeId`; take-next `reviews:write`; OTRS `onItemProgress` lock renew; `REPORT_EXPORT` metrics — **fixed** |
| `cd apps/web && npm run typecheck` | **exit 0** |
| Vitest (broad changed areas) | **41 files, 369 passed** |

```text
tests/unit/sampling-engine.test.ts
tests/unit/conversation-import-ai-score.test.ts
tests/unit/integration-import-service.test.ts
tests/unit/connect-orchestrator.test.ts
tests/unit/webhook-route.test.ts
tests/unit/next-review-query.test.ts
tests/unit/review-queue-contract.test.ts
tests/unit/review-actions-lifecycle.test.ts
tests/unit/queue-view-actions.test.ts
tests/unit/feedback-actions-messaging.test.ts
tests/unit/feedback-actions-scope.test.ts
tests/unit/messaging-delivery-job.test.ts
tests/unit/report-export-rows.test.ts
tests/unit/report-schedule.test.ts
tests/unit/report-schedule-actions.test.ts
tests/unit/quota-risk-evaluation.test.ts
tests/unit/auth-session-lifecycle.test.ts
tests/unit/saml-routes.test.ts
tests/unit/otrs-family-import-plan.test.ts
tests/unit/ai-draft-decision-actions.test.ts
tests/unit/ai-quality-drafts.test.ts
tests/unit/coaching-agent-scope.test.ts
tests/unit/score.test.ts
tests/unit/integration-runner-ledger.test.ts
(+ finish-everything modules: coaching-themes, reviewer-workload, calibration-reviewer-quality,
  ai-exceptions, ai-apply-score-draft, cross-link-wiring, coaching-*, review-lifecycle,
  review-events, job-queue, product-pages-copy, review-detail-page, report-aggregation,
  report-evidence-links)
```

No commit made (parent owns commit).

---

## 3. Findings — fixed vs deferred

### 3.1 Ingress + sampling + OTRS (audit A)

| Sev | ID | Defect | Status |
|-----|----|--------|--------|
| P0 | C1 | Webhook probe `failed` still persisted source as connected | **Fixed** — `runConnectPipeline` returns before persist when `webhook_probe` fails |
| P0 | S1 | Sampling `%` miss fell through to lower catch-all → inflated sample | **Fixed** — conditions first; `sampled_out` hard-stops cascade |
| P0 | S2 | Unmatched rules kept inbound privileged `samplingType` (queue injection) | **Fixed** — import persists `samplingType: OUT_OF_SAMPLE`; excluded from take-next + default queue list |
| P1 | R1 | OTRS re-import race: empty claim → `no_selection` clobber; no per-item claim | **Fixed** — reclaim `importing`; per-item `selected→importing`; idempotent if already `imported` |
| P1 | C2 | Connect marks `active` / `connected: true` without live cert evidence | **Fixed** — Connect persist uses `status: "ready"` until live evidence |
| P1 | I1 | Production import enqueue has no live-cert / protected-evidence gate | **Fixed** — `assertIntegrationLiveCertifiedForProductionImport` (dry-run exempt) |
| P2 | W1 | Public webhook route scopes by `endpointId` only (no explicit workspace pin) | **Fixed** — require `x-qc-workspace-id` header |
| P2 | R2 | Long OTRS TX may outlive job lock renewal | **Fixed** — `onItemProgress` → `renewCurrentJobLock` per selected item outside item TX |

### 3.2 Review + agent feedback (audit B)

| Sev | ID | Defect | Status |
|-----|----|--------|--------|
| P0 | F1 | Agent could resolve own appeal (`appeal_confirmed` / `appeal_corrected` / `reanswer_requested`) with only `feedback:acknowledge` | **Fixed** — manager workflow gate in `feedback-actions.ts` |
| P0 | F2 | `/coaching` leaked team scores, review candidates, create UI data to `SUPPORT_AGENT` | **Fixed** — agent-scoped history/plans; create forms manager-only; plan mutates deny agents |
| P1 | Q1 | Take-next / finalize-and-take-next ignored active queue URL filters | **Fixed** — `filtersFromReviewsHref` + `buildReviewQueueWhere` |
| P1 | Q2 | Agent take-next / review detail scoped by `assigneeName` (collision risk) | **Fixed** — `assigneeId` in `next-review-query` + review detail |
| P1 | R3 | Finalize allowed with all N/A / empty applicable weight (`maxWeight === 0`) | **Fixed** — finalize rejects zero applicable weight |
| P1 | R4 | Draft score saves audited only `totalScore` (silent criterion rewrites) | **Fixed** — audit includes previous/current criterion scores |
| P1 | A1 | AI draft decide lacked idempotency + audit | **Fixed** — `updateMany` where `status: "draft"` + `auditLog("ai_quality.draft.decided")` |
| P2 | — | `takeNextReview` still permissioned `reviews:read` while UI expects write | **Fixed** — `requireCurrentUserPermission("reviews:write")` |
| P2 | — | Self-review ownership still keyed by display name in `assertSelfReviewScope` | **Fixed** — keyed by `conversationAssigneeId` vs `userId` |
| P2 | — | `appeal_corrected` is status-only (does not reopen scoring) | **Deferred** (product semantics) |

### 3.3 Jobs / messaging / reports / auth (audit C)

| Sev | ID | Defect | Status |
|-----|----|--------|--------|
| P0 | M1 | Messaging delivery job retry re-POSTed every channel | **Fixed** — `backendJobId` marker + skip if `delivered` |
| P0 | RS1 | Concurrent schedule workers could double-enqueue due reports | **Fixed** — CAS claim on `(id, nextRunAt)` before enqueue |
| P0 | Auth1 | `/auth/sso` without `workspaceId` picked oldest matching IdP across tenants | **Fixed** — require workspace; fail-closed redirect |
| P1 | RF1 | Invalid schedule `filtersJson` silently became `{}` (wider export) | **Fixed** — reject non-object JSON |
| P1 | RF2 | Export rows ignored conversation filter params | **Fixed** — apply `reportScheduleFilterKeys` in `loadReportExportRows` |
| P1 | QR1 | Overlapping quotas double-counted reviews → false-green completion | **Fixed** — count each review once |
| P1 | Auth2 | Session row workspace ≠ user workspace not revoked | **Fixed** — revoke fail-closed |
| P2 | — | `REPORT_EXPORT` job still stubs rich metrics / not full filtered artifact | **Fixed** — filtered rows + `ReportExportMetrics` (`finalizedCount`, `averageScore`, critical/high-risk) |
| P2 | — | Session API 403 mapping depends on exact Russian permission string | **Deferred** (no cross-tenant leak observed) |

---

## 4. Adversarial verdict — is ticket→feedback fail-closed enough for production?

**Verdict: yes for the closed human QA loop and for fail-closed production ingress gates; remaining items are P2 product/ops polish.**

**Strong enough now (ticket → queue → score → feedback + gated ingress):**

- Agents cannot self-close appeals or browse team coaching scores.
- Take-next and default queue listing exclude unmatched sampling (`OUT_OF_SAMPLE`); filters still pin agents by `assigneeId`.
- Finalize cannot succeed with zero applicable criteria; draft score rewrites leave criterion-level audit.
- AI draft decisions are one-shot and audited.
- Messaging retries and report schedule claims no longer duplicate side effects.
- SSO start and session validation fail closed on workspace mismatch / missing workspace.
- Connect persists `ready` (not premature `active`); production import requires protected live-cert evidence; public webhooks require `x-qc-workspace-id`.
- Self-review ownership is `assigneeId`-scoped; take-next requires `reviews:write`.
- OTRS selected import renews job lock per item; report export jobs carry filtered summary metrics.

**Still deferred (non-blocking):**

- `appeal_corrected` remains status-only (does not reopen scoring) — product semantics.
- Session API 403 mapping depends on exact Russian permission string — polish only.
- Queue summary counts may still include `OUT_OF_SAMPLE` (listing/take-next already exclude).

**Practical bar:** ship to production for workspaces with reviewed Connect/import ops and protected live certification. Uncertified Phase B / OTRS stay dry-run / `ready` until evidence lands.

---

## 5. Remaining risks (priority order)

1. **Queue summary counts** — `getReviewQueueSummary` still uses `scopedConversationWhere` (may include `OUT_OF_SAMPLE` in totals); listing/take-next already exclude them.
2. **`appeal_corrected` scoring reopen** — status-only by design; managers must manually reopen if score change is needed.
3. **Session API 403 string coupling** — exact Russian permission text; no cross-tenant leak observed.

---

## 6. Key files touched this wave

| Area | Primary paths |
|------|----------------|
| Connect / sampling / OTRS / import / webhooks | `integrations/connect/orchestrator.ts`, `connect-actions.ts`, `sampling-engine.ts`, `conversation-import.ts`, `integration-import-service.ts`, `integrations/otrs-family/import-plan.ts`, `api/v1/webhooks/[endpointId]/route.ts` |
| Review / queue | `queue-view-actions.ts`, `review/next-review-query.ts`, `review-actions.ts`, `review-repository.ts`, `review-lifecycle.ts` |
| Feedback / coaching / AI | `feedback-actions.ts`, `app/coaching/page.tsx`, `coaching-plan-actions.ts`, `coaching-themes.ts`, `ai-quality/drafts.ts`, `ai-quality/draft-decision-actions.ts`, `ai-quality/exceptions.ts` |
| Calibration / workload | `calibration/reviewer-quality.ts`, `reviewer-workload.ts`, `app/calibration/page.tsx`, `app/dashboard/page.tsx` |
| Messaging / reports / auth / jobs | `jobs/messaging-delivery-job.ts`, `messaging/delivery.ts`, `report-schedule.ts`, `report-schedule-actions.ts`, `report-export.ts`, `reports/quota-risk-evaluation.ts`, `jobs/queue.ts`, `app/auth/sso/route.ts`, `auth/session.ts` |

---

## 7. Suggested next hardening (not done here)

1. Exclude `OUT_OF_SAMPLE` from `getReviewQueueSummary` counts for consistency with the list.
2. Decide product semantics for `appeal_corrected` → reopen scoring (or document status-only forever).
3. Decouple Session API 403 from exact Russian permission string if clients depend on it.

---

## 8. Follow-on — cross-feature interconnection wave (same day)

After the fail-closed audit fixes above, a separate uncommitted wave closed several **product loop** gaps (not new security defects):

- `CoachingAction` complete/cancel/reopen (managers) so open-action KPIs are honest.
- AI score draft **approve/changed → human DRAFT Review** scores (`apply-score-draft.ts`).
- Report + dashboard KPI cells drill to `/reviews` filters / conversation evidence.
- Finalize low-score/critical path offers coaching plan create with `reviewId` + `conversationId`.
- Self-review surfaces coaching pins (and finding actions).

Full matrix: [competitive-qa-interconnections.md](competitive-qa-interconnections.md). Wave summary: [cross-feature-interconnections.md](cross-feature-interconnections.md).

---

## 9. Finish-everything wave (verified)

**Status:** verified / uncommitted (2026-09-06). Competitive P0–P2 loops and deferred audit tails from §3 are **wired/fixed** except the true leftovers in §5.

Closed in this wave:

- Competitive **P0 #3**, **P1 #8 / #10 / #11 / #12**, **P2 #13–15** (lite where noted)
- Audit tails: self-review `assigneeId`, take-next `reviews:write`, OTRS lock renew, `REPORT_EXPORT` metrics

Do not treat queue-summary OOS, appeal→auto scorecard edit, blind GraderQA, or external LMS as shipped.
