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

Two related surfaces share **priority order** via `nextReviewOrderBy` / `nextReviewWhere` in `apps/web/src/lib/review/next-review-query.ts`:

1. Queue action **«Взять следующий»** → `takeNextReview` → `selectNextReviewConversationId`
2. Workbench **«Завершить и взять следующий»** → `finalizeReviewAndTakeNext` → same selector (excluding the case just finished)

**Scope today (do not silently widen/narrow):**

- same workspace
- `qaStatus` not `FINALIZED`
- support agents: only conversations assigned to them (`assigneeName`)
- order: `reviewDueAt` asc (nulls last), then `openedAt` desc

**Queue URL filters** (status, risk, due, assignee chips, saved views, …) shape the **list** and the **«Следующий кейс»** preview (`conversations[0]` of the filtered set). They do **not** rewrite `takeNextReview` eligibility. Aligning Take next with active filters is a separate, explicit change — not a silent patch inside this contract.

## Known limitation: Take next ≠ URL filters

**Status:** accepted mismatch (do not “fix” silently).

| Surface | Driven by filters? | Driven by |
| --- | --- | --- |
| Queue table rows | Yes | URL / saved view query |
| «Следующий кейс» preview | Yes | First row of the filtered list |
| **«Взять следующий»** / **finalize_next** | **No** | `nextReviewWhere` / `nextReviewOrderBy` only |

Operators with a narrow saved view can see case A as preview, press Take next, and land on case B (workspace priority outside the view). That is intentional until product explicitly decides to bind Take next to the active filter set — and ships that as a named change with tests, not a quiet eligibility tweak.

## Next-case preview

- Label: **«Следующий кейс»**
- **Collapsed by default** (adversarial verdict: do not remove — collapse)
- Collapsed chrome keeps identity + **«Открыть приоритетный кейс»** CTA
- Expand reveals priority rationale and signal context
- Page action **«Взять следующий»** remains available regardless of preview expand state

## Ownership

| Concern | Module |
| --- | --- |
| Pure key → action model | `apps/web/src/lib/review/keyboard.ts` |
| DOM wiring | `apps/web/src/components/review/review-keyboard.tsx` |
| Take-next query | `apps/web/src/lib/review/next-review-query.ts` |
| Take-next actions | `apps/web/src/lib/queue-view-actions.ts`, `apps/web/src/lib/review-actions.ts` |
| Preview UI | `apps/web/src/components/review/queue-next-case-preview.tsx` |
| Unit tests | `apps/web/tests/unit/review-keyboard.test.ts`, `queue-next-case-preview.test.tsx` |
