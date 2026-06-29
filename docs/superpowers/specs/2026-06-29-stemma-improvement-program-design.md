# Stemma — Improvement Program (2026-06-29)

## Origin

After a long run of narrow visual micro-polish, we ran a five-dimension, read-only
audit (UX, accessibility, performance, code-health, product-vs-competitors) via
parallel sub-agents. Headline: Stemma is a **mature, cleanly-built manual QA
workbench** (real weighted scoring, real calibration math, closed-loop coaching,
sampling, drill-through analytics; disciplined server-component architecture;
tokenized CSS; zero TODO/FIXME; well-tested core). The opportunity is therefore
not bug-patching but choosing where to invest the next substantial step. The
stakeholder chose to pursue **the whole program**, at quality, in parallel.

## Decisions (locked)

- **AI auto-scoring engine → YandexGPT** (Yandex Foundation Models / `yandexgpt`),
  behind a provider abstraction (`QualityScoringProvider`). Real model calls on
  ingest produce per-criterion drafts (score + confidence + quoted evidence).
  **Graceful deterministic fallback** when no Yandex credentials are present, so
  the seeded demo always works. Sentiment analysis (Phase 3) reuses the same
  provider. Fetch current YandexGPT API docs (context7) at implementation time.
- **Voice / omnichannel → deferred.** ASR + audio storage + player is the
  heaviest track and is out of scope for this program; it becomes its own later
  initiative.

## Global constraints (every workstream)

- Preserve behavior: server actions, form field names, hrefs, ARIA, **Russian
  copy**.
- Tokens only — no raw hex leaks; works in **light + dark**.
- **Test suite stays green** (currently 1088) and **typecheck clean**; new logic
  is TDD'd; new tests added for previously-uncovered logic.
- Each workstream owns a **disjoint file set** so parallel agents never conflict.
- A **verification gate** (typecheck + full vitest) runs after every phase; the
  next phase starts only on green.
- All work lands on branch `improvement/program-2026-06-29`; merge to `master`
  is a deliberate final step.

## Workstreams & phasing

### Phase 0 — parallel, low-risk, audit-specified
- **W1a · A11y quick-wins** (owns `theme.css`, `00-base.css`, command-palette
  focus CSS in `10-app-shell.css`): darken `--muted`/`--text-muted` (#8A94A3 →
  a value ≥4.5:1 on app bg #F7F8FA and panel #FFF) — clears ~258 contrast
  failures across 18 files; darken light-theme semantic status text so it passes
  on its tint chips; add a **global `:focus-visible` baseline**; fix
  command-palette input `outline:0`.
- **W1b · Dead-code & orphan-CSS purge** (owns the 5 dead component files,
  `custom-api-docs.ts`, `loading-states.tsx` `StableEmptyState`, orphan CSS in
  `96-misc-forms.css`/`94-enablement.css`/`40-admin.css`/`92-reports.css`/
  `87-source-picker.css`): delete confirmed-unused `MetricCard`,
  `StickyMetricsBar`, `ScoreBar`, `OtrsSetupWizard`; remove 9 dead exports in
  `custom-api-docs.ts`; drop `StableEmptyState`; remove ~186 verified-orphan CSS
  base classes (conservative — skip any class built via template literals).
- **W2 · Foundations & vestigial removal** (owns new primitive files + a new CSS
  partial, `app-nav-shell.tsx`, `layout.tsx`, `src/server/trpc/*`,
  `src/lib/trpc/*`, `trpc-provider.tsx`, `package.json` deps): build a shared
  **Toast + `aria-live`** primitive (provider mounted in layout) and a shared
  **Modal/Dialog** primitive (focus-trap, scroll-lock, ESC, backdrop, focus
  restore); refactor the **command palette** to proper focus management +
  Up/Down/Enter keyboard nav + `aria-expanded`/`aria-haspopup`; **remove the
  vestigial tRPC/TanStack-Query client stack** (zero `trpc.*` usage confirmed) —
  delete the client provider/dirs, unwrap `layout.tsx`, drop unused deps.
- **W4 · Scale & correctness** (owns `review-repository.ts`,
  `reports/report-page-data.ts`, `report-export.ts`, `reports/report-aggregation.ts`,
  `reports/page.tsx`, `reviews/page.tsx`, `dashboard/page.tsx` + tests): paginate
  the review queue (SQL `take`/cursor + pager UI); narrow `report-export` selects;
  per-agent dashboard aggregation via `groupBy`; add `unstable_cache`/`revalidate`
  + React `cache()` for `getCurrentUser`; push reports aggregation into SQL **only
  with regression tests proving identical output**, else bound + cache and note
  it; add the missing `report-aggregation`/`report-format` tests.

### Phase 1 — after W2 (consumes Toast/Modal)
- **W3 · Core-loop polish**: responsive breakpoints for dashboard, top-nav, and
  the workbench stack (transcript/scorecard toggle on collapse); **grading-flow
  continuity** — "save & take next" + batch "N of M" counter + empty-take banner;
  wire **success feedback** through the Toast primitive across grading / feedback
  / bulk / coaching; pending-state affordance on filter/period changes.

### Phase 2 — parallel feature branches (isolated worktrees)
- **W5 · AI auto-scoring**: `AiQualityDraft` gains per-criterion granularity +
  `confidence`; an `AI_SCORE` backend job runs on ingest calling the
  `QualityScoringProvider` (YandexGPT adapter + deterministic fallback); wire
  `decideAiQualityDraft` into **accept / reject / override** controls in the
  workbench; replace the faked per-criterion chip with real predictions.
- **W6 · Notifications delivery**: a `MESSAGING_DELIVERY` job that actually posts
  to provider webhooks; emit deliveries on key events (review finalized, training
  assigned, appeal opened, quota at risk).

### Phase 3 — depth
Automated reviewer workload assignment; sentiment analysis (reuse YandexGPT
provider) + CSAT correlation; scheduled/recurring report exports + subscriptions;
savable custom dashboards (extend `SavedQueueView`); trended root-cause / reason
analytics; coaching plans + before/after coaching-impact metric; shared
Modal/Table primitive consolidation + remaining `EmptyState`/`StatKpi` bypasses.

## Execution model

Phases run sequentially; **within a phase, work fans out to parallel sub-agents**
on disjoint file sets, followed by a verification agent (typecheck + full vitest).
The orchestrator reviews each phase's results before launching the next, so the
stakeholder stays in the loop at every phase boundary. Feature tracks in Phase 2
use isolated git worktrees to avoid cross-track conflicts.
