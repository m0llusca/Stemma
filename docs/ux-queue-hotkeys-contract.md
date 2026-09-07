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
| `Cmd+Enter` / `Ctrl+Enter` | Submit **Завершить и взять следующий** (`intent=finalize_next`) |
| `?` | Toggle the shortcut legend |

### Input guard (immutable)

Hotkeys **must not** run when the event target is an editable field:

- `textarea`, `select`
- text-like `input` types (text, search, email, password, number, …)
- `contentEditable`

Radios, checkboxes, and buttons stay hotkeyable so criterion scoring is not blocked after Tab focus.

Modifiers: plain `meta` / `ctrl` / `alt` chords other than `Cmd/Ctrl+Enter` are ignored (browser / OS shortcuts win).

## Take next eligibility

Three surfaces share **one path**: `takeNextReview` / `selectNextReviewConversationId` (`apps/web/src/lib/queue-view-actions.ts`). Base eligibility is `nextReviewWhere` / `nextReviewOrderBy` (`apps/web/src/lib/review/next-review-query.ts`). Active view filters are AND-ed on top through `buildReviewQueueWhere`.

1. Queue **«Взять следующий»** → `takeNextReview` → hidden `queueHref` (current URL / saved view) → `filtersFromReviewsHref` → same selector
2. Workbench **«Завершить и взять следующий»** (`intent=finalize_next`) → `finalizeReviewAndTakeNext` → `returnTo` → same parser and selector (excludes the case just finished)
3. ⌘K **«Взять следующий»** (`actionId: take-next`) → `takeNextReview(takeNextFormDataFromLocation(pathname, search))` — same FormData `queueHref` as the queue button. Not a href.

**Killed:** ⌘K must not navigate to hardcoded `/reviews?status=unreviewed`. That URL is an impostor filter, not take-next.

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

An operator on a narrow saved view sees case A as preview, presses Take next, and opens case A (or the next remaining row in that same filtered set). Landing on workspace priority outside the view is a bug.

## Next-case preview

- Label: **«Следующий кейс»**
- **Collapsed by default** (adversarial verdict: do not remove — collapse)
- Collapsed chrome keeps identity + **«Открыть приоритетный кейс»** CTA
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

## Ownership

| Concern | Module |
| --- | --- |
| Pure key → action model | `apps/web/src/lib/review/keyboard.ts` |
| DOM wiring | `apps/web/src/components/review/review-keyboard.tsx` |
| Take-next query | `apps/web/src/lib/review/next-review-query.ts` |
| Take-next actions | `apps/web/src/lib/queue-view-actions.ts`, `apps/web/src/lib/review-actions.ts` |
| `queueHref` / ⌘K FormData | `apps/web/src/lib/review/queue-href-filters.ts` |
| ⌘K wiring | `apps/web/src/lib/shell/navigation.ts` (`take-next` action), `apps/web/src/components/app-nav-shell.tsx` |
| Status chip | `apps/web/src/lib/review-state.ts`, `apps/web/src/components/review/review-status-chip.tsx` |
| Preview UI | `apps/web/src/components/review/queue-next-case-preview.tsx` |
| Unit tests | `apps/web/tests/unit/review-keyboard.test.ts`, `queue-next-case-preview.test.tsx`, `queue-table-status-chip.test.tsx`, `review-status-chip.test.ts`, `queue-href-filters.test.ts`, `next-review-query.test.ts`, `queue-view-actions.test.ts`, `review-actions-lifecycle.test.ts` |

Related: [app-shell.md](app-shell.md) (role homes, ⌘K), [ux-persona-adversarial-synthesis.md](ux-persona-adversarial-synthesis.md).

## Follow-up (not fixed)

Topbar pulse **«Взять кейс»** still links to `/reviews?status=unreviewed`. That is not the take-next path. ⌘K is fixed; pulse chrome is leftover.
