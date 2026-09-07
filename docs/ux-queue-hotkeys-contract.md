# Queue / workbench hotkeys + Take next contract

Locked UX contract for Stemma review queue and grading workbench (P0 #5).
Changing eligibility, sort, or hotkey semantics requires an explicit product decision — never a silent drift.

## Workbench hotkeys (`ReviewKeyboard`)

| Key | Action |
| --- | --- |
| `j` / `ArrowDown` | Focus next criterion card |
| `k` / `ArrowUp` | Focus previous criterion card |
| `1` / `2` / `3` | Score focused criterion (pass / partial / fail) when criteria are present |
| `Enter` | Expand the focused criterion (so score controls are visible) |
| `Esc` | Hide the `?` legend if open; otherwise collapse the focused criterion |
| `Cmd+Enter` / `Ctrl+Enter` | Submit **Завершить и взять следующий** (`intent=finalize_next`) when that button is enabled. If Finalize is disabled (incomplete scorecard), do **not** submit: focus the first invalid control and announce the blocked reason (`Заполните все критерии`). |
| `?` | Toggle the shortcut legend |

### Input guard (immutable)

Hotkeys **must not** run when the event target is an editable field:

- `textarea`, `select`
- text-like `input` types (text, search, email, password, number, …)
- `contentEditable`

Radios, checkboxes, and buttons stay hotkeyable so criterion scoring is not blocked after Tab focus.

Modifiers: plain `meta` / `ctrl` / `alt` chords other than `Cmd/Ctrl+Enter` are ignored (browser / OS shortcuts win).

## Take next eligibility

Five surfaces share **one path**: `takeNextReview` / `selectNextReviewConversationId` (`apps/web/src/lib/queue-view-actions.ts`). Base eligibility is `nextReviewWhere` / `nextReviewOrderBy` (`apps/web/src/lib/review/next-review-query.ts`). Active view filters are AND-ed on top through `buildReviewQueueWhere`.

1. Queue **«Взять следующий»** → `takeNextReview` → hidden `queueHref` (current URL / saved view) → `filtersFromReviewsHref` → same selector
2. Workbench **«Завершить и взять следующий»** (`intent=finalize_next`) → `finalizeReviewAndTakeNext` → `returnTo` → same parser and selector (excludes the case just finished)
3. ⌘K **«Взять следующий»** (`actionId: take-next`) → `takeNextReview(takeNextFormDataFromLocation(pathname, search))` — same FormData `queueHref` as the queue button. Not a href.
4. Topbar pulse **«Взять следующий»** (desktop button + mobile menu) → the same `runTakeNext` → `takeNextReview(takeNextFormDataFromLocation(pathname, search))`. Not a href.
5. Next-case preview **«Взять следующий»** → the same `takeNextReview` form with the page `queueHref`. Not a nav-only peek.

**Killed:** ⌘K and pulse must not navigate to hardcoded `/reviews?status=unreviewed`. That URL is an impostor filter, not take-next.

## Take next write-gate

All take-next surfaces require `reviews:write`. UI flag: `canTakeNextCase` (shell) / `canWriteReviews` (queue). Readers (`EXEC`, `SUPPORT_AGENT`, `VIEWER`) must not see write CTAs.

| Surface | Gate |
| --- | --- |
| Queue **«Взять следующий»** | `canWriteReviews` — omit the page action |
| Pulse **«Взять следующий»** | `canTakeNextCase` — omit desktop + mobile |
| ⌘K **«Взять следующий»** | drop `actionId: take-next` when `!canTakeNextCase` |
| Next-case preview CTA | `canTakeNext` — identity stays; no submit |
| Empty-queue **«Взять без фильтра»** | `canWriteReviews` |
| Workbench **finalize_next** | scorecard panel only when `canSaveReviewDraft` (`reviews:write`) |

`takeNextReview` is `requireCurrentUserPermission("reviews:write")`. A leaked CTA throws into `error.tsx`, not `forbidden.tsx`. Hide the control; do not let readers submit.

Ops empty-triage on `/dashboard` (Lead/Admin) uses the same `takeNextReview` path. Analyst empty-triage is a role-home href (`Открыть сегодня`), not take-next. See [app-shell.md](app-shell.md).

**Follow-up (not fixed):** `QueueSavedViews` create UI still renders for readers on `/reviews`. `createSavedQueueView` does not require `reviews:write`.

**Always (workspace / role / sampling):**

- same workspace
- `qaStatus` not `FINALIZED`
- `samplingType` not `OUT_OF_SAMPLE`
- support agents: only conversations assigned to them (`assigneeId`)
- order: `reviewDueAt` asc (nulls last), then `openedAt` desc

**Active view (URL / saved view):** same filter set as the queue list and **«Следующий кейс»** preview (`conversations[0]` of that set). Status, risk, due, assignee, process, and the rest of `ReviewQueueFilters` apply. Saved views are hrefs — the stored `/reviews?…` query is the filter set. No active filter → base `nextReviewWhere` only (unfiltered SLA order).

Do not silently drop filters from take-next, and do not invent a second eligibility path.

## Take next = URL / saved-view filters

**Status:** contract. List, preview, and take-next share one filter set.

| Surface | Driven by filters? | Driven by |
| --- | --- | --- |
| Queue table rows | Yes | URL / saved view query |
| «Следующий кейс» preview | Yes | First row of the filtered list |
| Queue **«Взять следующий»** | **Yes** | `queueHref` → `filtersFromReviewsHref` → same selector |
| Workbench **finalize_next** | **Yes** | `returnTo` → same parser and selector |
| ⌘K **«Взять следующий»** | **Yes** | `takeNextFormDataFromLocation` → same `queueHref` / `takeNextReview` |
| Pulse **«Взять следующий»** | **Yes** | same `runTakeNext` as ⌘K |
| Next-case preview **«Взять следующий»** | **Yes** | page `queueHref` → same `takeNextReview` form |

An operator on a narrow saved view sees case A as preview, presses Take next, and opens case A (or the next remaining row in that same filtered set). Landing on workspace priority outside the view is a bug.

## Next-case preview

- Label: **«Следующий кейс»**
- **Collapsed by default** (adversarial verdict: do not remove — collapse)
- Collapsed chrome keeps identity + **«Взять следующий»** CTA (`takeNextReview`, same path as the page action)
- Expand reveals priority rationale and signal context
- Page action **«Взять следующий»** remains available regardless of preview expand state
- Status chip: same `ReviewStatusChip` as the queue row (see below)

## Status chip = one dictionary

Queue table and next-case preview share **`reviewStateLabels`** via `resolveQueueStatusChip` / `ReviewStatusChip`.

| State | Label |
| --- | --- |
| queued | В очереди |
| assigned | Назначена |
| in_progress | В работе |
| finalized | Завершена |
| reopened | На пересмотре |

Pending reopen overrides the label to **«Ожидает подтверждения»** (warning).

`qaStatusLabels` is an alias of this dictionary (`qaStatusToReviewState` → `reviewStateLabels`). Do not invent a second gender/wording set for `qaStatus` vs `reviewState`.

Filter/bulk dropdowns may still bind the `QaStatus` enum; the visible words stay `reviewStateLabels`.

## Queue «Итог» filter = different slice

`reviewQueueStatusLabels` is a binary reviewed / unreviewed filter, not the status chip. Do not reuse chip words here.

| Filter value | Label |
| --- | --- |
| unreviewed | Ещё не проверена |
| reviewed | Проверка завершена |

Merging «Итог» into «Статус проверки» would drop the “any not-yet-finalized” vs exact `qaStatus` distinction.

## Ownership

| Concern | Module |
| --- | --- |
| Pure key → action model | `apps/web/src/lib/review/keyboard.ts` |
| DOM wiring | `apps/web/src/components/review/review-keyboard.tsx` |
| Take-next query | `apps/web/src/lib/review/next-review-query.ts` |
| Take-next actions | `apps/web/src/lib/queue-view-actions.ts`, `apps/web/src/lib/review-actions.ts` |
| `queueHref` / take-next FormData | `apps/web/src/lib/review/queue-href-filters.ts` |
| ⌘K + pulse wiring | `apps/web/src/lib/shell/navigation.ts` (`take-next` action), `apps/web/src/components/app-nav-shell.tsx` (`runTakeNext`) |
| Status chip | `apps/web/src/lib/review-state.ts`, `apps/web/src/components/review/review-status-chip.tsx` |
| Preview UI | `apps/web/src/components/review/queue-next-case-preview.tsx` |
| Unit tests | `apps/web/tests/unit/review-keyboard.test.ts`, `queue-next-case-preview.test.tsx`, `queue-table-status-chip.test.tsx`, `review-status-chip.test.ts`, `queue-href-filters.test.ts`, `app-nav-shell.test.tsx` (pulse + ⌘K + same FormData), `next-review-query.test.ts`, `queue-view-actions.test.ts`, `review-actions-lifecycle.test.ts` |

Related: [app-shell.md](app-shell.md) (role homes, ⌘K), [ux-persona-adversarial-synthesis.md](ux-persona-adversarial-synthesis.md).
