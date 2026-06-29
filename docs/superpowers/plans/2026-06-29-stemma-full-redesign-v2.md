# Stemma full redesign v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reimagine Stemma (Russian contact-center QA platform) ground-up — modern cool-SaaS identity, top navigation (no side rail) + command palette, master-detail layouts, decision-first/cockpit composition, and keyboard-first / AI-assisted interaction models — across all ~14 screens, preserving all behavior and keeping the suite green.

**Architecture:** Token-first. Rework the CSS token layer and shell, then layout primitives, then per-screen application, then the interaction layer. Reuse the first-redesign plumbing (split `components/*.css` partials, `Chip`/`StatKpi`/`EmptyState`/`CriterionMatrix`). Source of truth: `docs/superpowers/specs/2026-06-29-stemma-full-redesign-design.md` + the two approved mockups (modern workbench + analytics cockpit).

**Tech Stack:** Next.js 16 (App Router), React 19, hand-written CSS tokens in `src/app/styles/theme.css` + `src/app/styles/components/*.css`, `next/font` (Inter + JetBrains Mono), tRPC, Prisma, Vitest, Playwright.

**Branch:** `redesign/v2-modern-saas` (already created; spec committed).

---

## Verification model (applies to every task)

This is presentation/structure work, so per-task verification is:
1. `cd apps/web && npx tsc --noEmit` → clean.
2. `cd apps/web && npm run test` → suite stays green (currently 1059 passing). Update tests only when intended behavior changes; never weaken an assertion to pass.
3. Visual check on the running dev server (`http://localhost:4000`) in **light AND dark**, and for analytics screens select the **quarter** period (seed data is April–May 2026) so charts populate.
4. Token-compliance: no raw hex outside `theme.css` (and intentional theme-preview swatches). Grep changed files.
5. Behavior preserved: tRPC/server actions, form field names, hrefs, aria — unchanged.

Add NEW unit tests where logic changes (nav active-state resolver, command-palette filter, theme resolution, keyboard handlers). Commit after each task.

---

## Phase A — Identity / token layer

### Task A1: Cool-SaaS light tokens + fonts

**Files:**
- Modify: `apps/web/src/app/styles/theme.css` (`:root` block)
- Modify: `apps/web/src/app/layout.tsx` (fonts)

- [ ] **Step 1:** In `layout.tsx`, replace `Manrope` with `Inter` and keep a mono. Use `next/font/google`:
```ts
import { Inter, JetBrains_Mono } from "next/font/google";
const sans = Inter({ subsets: ["latin", "cyrillic"], display: "swap", variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], weight: ["400","500"], display: "swap", variable: "--font-mono" });
```
Keep the `${sans.variable} ${mono.variable}` on `<html>`.

- [ ] **Step 2:** In `theme.css` `:root`, set the cool-neutral token values (exact):
```css
--background:#F7F8FA; --panel:#FFFFFF; --panel-muted:#F4F5F7; --panel-tint:#FBFBFE;
--panel-header:#FAFBFC; --panel-header-border:#E7EAEF; --panel-header-muted:#5B6470;
--foreground:#16181D; --text-body:#363B44; --text-subtle:#5B6470; --text-muted:#8A94A3; --muted:#8A94A3;
--border:#E7EAEF; --border-strong:#D6DAE1;
--accent:#4F46E5; --accent-strong:#4338CA; --accent-soft:#EEF0FE; --accent-muted:#E0E3FB; --accent-border:#C7CBF7; --accent-ink:#3730A3;
--ai:#6D28D9; --ai-strong:#5B21B6; --ai-soft:#F3F0FF; --ai-border:#DDD3F5; --ai-ink:#5B21B6;
--success:#15803D; --warning:#B45309; --danger:#DC2626;
--status-success-bg:#E7F4EC; --status-success-border:#BFE3CC; --status-danger-bg:#FCEAEA; --status-danger-border:#F6CFCF; --status-warning-bg:#FBF0E1; --status-warning-border:#F0D9B5;
--radius-page:14px; --radius-card:10px; --radius-control:8px; --radius-small:6px; --radius-chip:6px;
--shadow-panel:0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.05);
--shadow-raised:0 8px 24px rgba(16,24,40,.12);
```
Keep `color-mix` derivations (`--surface-*`, `--line-soft`, etc.) as-is — they recompute from the new bases. Keep `font-feature-settings:"tnum" 1` on body; keep the flat `background: var(--background)`.

- [ ] **Step 3:** `cd apps/web && npx tsc --noEmit` → clean.
- [ ] **Step 4:** Visual: dashboard renders cool-neutral, Inter, indigo accent. `npm run test` green.
- [ ] **Step 5:** Commit: `git commit -am "Redesign v2 A1: cool-SaaS light tokens + Inter/JetBrains Mono"`

### Task A2: Cool-dark theme parity

**Files:** Modify `apps/web/src/app/styles/theme.css` (`body[data-theme="ops"]`)

- [ ] **Step 1:** Rework the dark theme to a cool near-black with the new accent family (exact):
```css
--background:#0E1117; --panel:#161A22; --panel-muted:#11151C; --panel-tint:#1B2230; --panel-header:#1A1F29; --panel-header-border:#262C37;
--foreground:#F2F4F8; --text-body:#C7CCD6; --text-subtle:#9AA3B2; --text-muted:#7A8494; --muted:#7A8494;
--border:#262C37; --border-strong:#3A424F;
--accent:#7C7BF0; --accent-strong:#A5A4F7; --accent-soft:rgba(99,91,255,.16); --accent-muted:rgba(124,123,240,.22); --accent-border:#4F46E5; --accent-ink:#C7CBF7;
--ai:#A78BFA; --ai-soft:rgba(124,58,237,.18); --ai-border:rgba(124,58,237,.46); --ai-ink:#E5E0FF;
--success:#4ADE80; --warning:#FBBF24; --danger:#F87171;
--shadow-panel:0 1px 0 rgba(255,255,255,.03), 0 1px 2px rgba(0,0,0,.3); --shadow-raised:0 12px 32px rgba(0,0,0,.4);
```
Keep the derived-var re-declarations, recomputed from these bases.

- [ ] **Step 2:** tsc clean; visual: toggle dark on dashboard + workbench — parity, legible, no white-on-dark leaks. Tests green.
- [ ] **Step 3:** Commit: `git commit -am "Redesign v2 A2: cool-dark theme parity"`

### Task A3: Simplify theming (drop 6 palettes, keep light/dark + curated accents + density)

**Files:**
- Modify: `apps/web/src/app/styles/theme.css` (remove `body[data-theme="azure|emerald|violet|amber|rose"]` blocks; add accent-only overrides)
- Modify: `apps/web/src/lib/ui-theme.ts` (theme/appearance resolution — narrow the allowed palette set)
- Modify: `apps/web/src/components/admin/appearance-settings-form.tsx` + `apps/web/src/app/admin/appearance/page.tsx` (offer light/dark + accent + density, drop palette grid)
- Tests: `apps/web/tests/unit/*appearance*`/`*ui-theme*` if present.

- [ ] **Step 1:** Replace the 6 full color-palette themes with **accent-only** options. Define accent presets as small overrides (only `--accent*` tokens), e.g. `body[data-accent="blue"]{--accent:#2563EB;--accent-strong:#1D4ED8;...}`, presets: `indigo` (default, no override), `blue`, `teal` (#0D9488), `violet` (#7C3AED). Light/dark stays on `data-theme` (`""`=light, `ops`=dark). Keep `data-density`.
- [ ] **Step 2:** Update `ui-theme.ts` resolution: allowed `uiTheme ∈ {light, ops}`, new `uiAccent ∈ {indigo, blue, teal, violet}`, `uiDensity` retained; map to `data-theme`/`data-accent`/`data-density` in `layout.tsx`. Migrate any stored palette value → nearest accent (default indigo).
- [ ] **Step 3:** Update the Appearance form to: theme (light/dark) toggle, accent picker (4 swatches), density — drop the 6-palette grid. Preserve the server action + field names; rename only if the lib changed (update both sides).
- [ ] **Step 4:** Update/extend unit tests for theme resolution (light/dark/accent/density). tsc + full suite green.
- [ ] **Step 5:** Visual: Appearance screen shows the simplified controls; switching accent recolors the app; dark works. Commit: `git commit -am "Redesign v2 A3: simplified theming — light/dark + curated accents + density"`

---

## Phase B — Shell & navigation (top nav, no side rail)

### Task B1: Navigation model in the shell lib

**Files:**
- Modify: `apps/web/src/lib/shell/navigation.ts` (+ types)
- Tests: `apps/web/tests/unit/shell-navigation.test.ts` (create)

- [ ] **Step 1:** Write a failing test for a `topNavAreas` structure + an `activeAreaForPath(pathname)` resolver: areas = `today(/dashboard)`, `review(/reviews)`, `calibration(/calibration)`, `coaching(/coaching)`, `analytics(/reports)`; `/admin/*` and `/self-review` resolve to their owning area or a settings/user menu. Assert `activeAreaForPath('/reviews/abc')==='review'`, `activeAreaForPath('/reports')==='analytics'`.
- [ ] **Step 2:** Run it — fails. Implement `topNavAreas` + `activeAreaForPath` (longest-prefix match, reuse existing `isActivePath`). Keep the existing command-palette items model; extend if needed for actions.
- [ ] **Step 3:** Test passes; tsc clean. Commit: `git commit -m "Redesign v2 B1: top-nav navigation model + active-area resolver"`

### Task B2: Top nav component + remove side rail

**Files:**
- Create: `apps/web/src/components/app-nav.tsx` + `apps/web/src/components/app-nav-shell.tsx` (client)
- Modify: `apps/web/src/app/layout.tsx` (drop `AppSidebar`; render `AppNav` as the single top bar; `main` full-width)
- Modify: `apps/web/src/app/styles/components/00-base.css` + `10-app-shell.css` (replace `.app-sidebar`/`.app-rail` styles; add `.app-nav`; rework `.page` grid to single column)
- Delete: `apps/web/src/components/app-sidebar.tsx`, `app-sidebar-shell.tsx` (after confirming no other consumers)

- [ ] **Step 1:** Build `AppNavShell` (client): a top bar — brand mark + horizontal area tabs (from `topNavAreas`, `aria-current` on active via `activeAreaForPath`), a centered `⌘K` command trigger, compact work-pulse counters, the user/identity menu (reuse the existing identity/demo-switcher markup from `app-topbar-shell.tsx`). Keep the command-palette dialog (lift from `app-topbar-shell.tsx`). `AppNav` (server) wires data like the old topbar did.
- [ ] **Step 2:** In `layout.tsx`: remove `<AppSidebar />`; the shell is `<div class="page"><AppNav/><main id="main-content">{children}</main></div>` with `.page` a single column. Keep skip-link.
- [ ] **Step 3:** CSS: add `.app-nav` (top bar: 56px, white panel, hairline bottom, area tabs with active = accent-ink text + 2px accent underline or accent-soft pill; subtle). Remove `.app-sidebar*`/`.app-rail*` rules and the `.page:has(.auth-shell)` sidebar-hide rule (replace with hiding `.app-nav` on the auth shell). Update `00-base.css` `.page` to single column; ensure content max-width + padding tokens.
- [ ] **Step 4:** Update `tests/unit/auth-shell-layout.test.ts` to assert `.page:has(.auth-shell) .app-nav { display:none }` (login hides nav). Update any sidebar unit test → nav. tsc + suite green.
- [ ] **Step 5:** Visual: every route shows the top nav, correct active area, no side rail, content full-width; ⌘K opens; light+dark. Commit: `git commit -am "Redesign v2 B2: top nav + command palette; remove side rail"`

### Task B3: Settings contained sub-nav

**Files:**
- Modify: `apps/web/src/app/admin/*` layout — add a contained left sub-nav inside the admin area (e.g., a shared `AdminSubnav` component) listing admin sections; not global.
- Create: `apps/web/src/components/admin/admin-subnav.tsx`
- Modify: `apps/web/src/app/styles/components/40-admin.css`

- [ ] **Step 1:** Create `AdminSubnav` (links to access/users/tokens/audit/integrations/scorecards/sampling/localization/appearance/system), active per pathname. Render it inside the admin pages' frame (a 2-col: sub-nav + content), contained within the admin content area.
- [ ] **Step 2:** CSS for `.admin-subnav` (contained, hairline, ~200px, sticky). tsc + tests green.
- [ ] **Step 3:** Visual: /admin/* shows the contained sub-nav; other areas don't. Commit: `git commit -am "Redesign v2 B3: contained admin sub-nav"`

---

## Phase C — Layout primitives

### Task C1: Page shell + contextual header

**Files:** Create `apps/web/src/components/ui/page-shell.tsx`; CSS in a new `apps/web/src/app/styles/components/07-shell.css` (import after 06-data in `layout.tsx`).

- [ ] **Step 1:** `PageShell` props: `eyebrow?`, `title`, `actions?`, `tabs?` (in-page segmented), `children`. Renders a consistent contextual header (title + primary action + optional in-page tabs) + content frame (max-width, padding tokens). tsc clean.
- [ ] **Step 2:** Visual smoke on one screen; tests green. Commit: `git commit -am "Redesign v2 C1: PageShell + contextual header primitive"`

### Task C2: Master-detail shell

**Files:** Create `apps/web/src/components/ui/master-detail.tsx`; CSS in `07-shell.css`.

- [ ] **Step 1:** `MasterDetail` — a 2-pane responsive shell (list left, detail right; independently scrollable; collapses to single-column under a breakpoint). Used by queue→workbench. tsc clean.
- [ ] **Step 2:** Commit: `git commit -am "Redesign v2 C2: master-detail shell primitive"`

### Task C3: Cockpit analytics primitives

**Files:**
- Modify: `apps/web/src/components/ui/stat-kpi.tsx` (add an optional `sparkline` slot already supported via `trend`; ensure delta caption support per first redesign)
- Create: `apps/web/src/components/reports/trend-chart.tsx` (muted volume bars + single-accent line; SVG, both themes via tokens read at runtime or token-driven inline)
- Modify: `apps/web/src/components/reports/criterion-matrix.tsx` (confirm single-hue indigo ramp + sticky col + pinned team-avg — already exists; retune ramp to the new accent)

- [ ] **Step 1:** Build `TrendChart` (props: points, optional volume series). Use Chart.js (already a pattern? if not, hand-built SVG keyed off CSS-var-resolved colors at runtime). Both themes. tsc clean.
- [ ] **Step 2:** Retune `CriterionMatrix` heat to indigo single-hue. Visual on /reports (quarter period). Tests green. Commit: `git commit -am "Redesign v2 C3: cockpit analytics primitives (trend, matrix retune, kpi)"`

### Task C4: Triage strip

**Files:** Create `apps/web/src/components/ui/triage-strip.tsx`; CSS in `07-shell.css`.

- [ ] **Step 1:** `TriageStrip` (icon + headline + sub + single action) — the decision-first banner (accent-soft). tsc clean. Commit: `git commit -am "Redesign v2 C4: triage strip primitive"`

---

## Phase D — Per-screen application (parallelizable over disjoint domains)

Each task: rebuild the screen(s) using PageShell / MasterDetail / cockpit primitives + the approved mockup language; apply the spec's per-screen moves; preserve behavior. Verify per the model above (incl. dark + seeded data). Disjoint file/partial ownership for safe parallel execution (see first-redesign domain split).

- [ ] **Task D1 — Dashboard (Сегодня):** `app/dashboard/page.tsx`, `components/operations/*`, `30-dashboard.css`. Triage strip + StatKpi row + TrendChart + areas-of-opportunity; drill-through links. Commit.
- [ ] **Task D2 — Reviews (queue + workbench):** `app/reviews/**`, `components/review/**`, `60/70/80/85-*.css`. Master-detail: inbox rows (self-describing, filter chips, bulk, dark-ink selection) → workbench (two-pane, sticky live score, segmented answers w/ inline points, AI auto-score chip, evidence jump). Match the approved workbench mockup. Commit.
- [ ] **Task D3 — Calibration:** `app/calibration/page.tsx`, `50/94-*.css`. Workbench-as-mode + consensus strip + alignment matrix (single-hue) + variance flags. Commit.
- [ ] **Task D4 — Coaching + Self-review:** `app/coaching/page.tsx`, `app/self-review/page.tsx`, `components/coaching/**`, `94-enablement.css`. Coaching: action strip + score-over-time w/ coaching events + areas→add-to-coaching + lifecycle chips. Self-review: hero metric + delta + feedback + acknowledge/dispute. Commit.
- [ ] **Task D5 — Analytics/reports:** `app/reports/page.tsx`, `components/reports/**`, `92-reports.css`. The cockpit per the approved mockup: KPI tiles + TrendChart + CriterionMatrix + operational signals + distribution; drill-everywhere; real empty states. Commit.
- [ ] **Task D6 — Admin suite:** `app/admin/**`, `components/admin|integrations|scorecards|i18n/**`, `40/20/87/90-*.css`. AdminSubnav layout; object-table lists; crafted forms; scorecard accordion; connector rows; system ops panels; Appearance configurator (from A3). Commit.
- [ ] **Task D7 — Login:** `app/auth/login/page.tsx`, auth-shell CSS. Minimal centered card, one accent action, SSO, light+dark; nav hidden. Commit.

---

## Phase E — Interaction layer

- [ ] **Task E1 — Keyboard-first grading:** add a keyboard handler in the workbench (J/K move criterion focus, 1·2·3 set the focused criterion's score, `?` shows shortcuts). Unit-test the pure reducer (key→state). Respect inputs/focus. Files: `components/review/review-panel.tsx` (+ a small `lib/review/keyboard.ts` + test). Commit.
- [ ] **Task E2 — AI auto-score-first + override + provenance:** surface the existing AI draft per criterion as a prediction chip with one-click accept/override + inline rationale + evidence HH:MM jump-link (scroll-to-message). No new data. Files: `components/review/review-panel.tsx`, `conversation-timeline.tsx`. Commit.
- [ ] **Task E3 — Triage mode + drill-everywhere:** wire TriageStrip targets and ensure every KPI/chart/matrix cell links to the filtered reviews. Files: dashboard + reports. Commit.
- [ ] **Task E4 — Command palette actions:** extend palette items with actions (take next review, open queue filter, switch period, jump to area). Unit-test the filter. Files: `app-nav-shell.tsx`, `lib/shell/navigation.ts`. Commit.

---

## Phase F — Verification & finish

- [ ] **Task F1:** Full visual sweep — all 14 screens × light + dark, analytics on quarter period; capture before/after. Fix any breakage.
- [ ] **Task F2:** `npm run test` (full), `npx tsc --noEmit`, hex-compliance grep. All green/clean.
- [ ] **Task F3:** Final code-quality review of the diff (scoped agent); fix high-confidence issues.
- [ ] **Task F4:** Use superpowers:finishing-a-development-branch (merge / PR per stakeholder choice).

---

## Self-review (completed)

- **Spec coverage:** identity→A1–A3; IA/nav (top nav, no rail, ⌘K, settings sub-nav)→B1–B3; layout (page-shell, master-detail, cockpit)→C1–C4 + D; interactions (keyboard, AI override, triage, drill)→E; theming simplified→A3; per-screen→D1–D7; verification→F. All spec sections map to tasks.
- **Placeholders:** none — token values are exact; structural tasks name exact files + the precise change; visual/structure tasks verify via suite+visual+hex-grep (appropriate for presentation work) and add unit tests where logic changes.
- **Type/name consistency:** `topNavAreas`/`activeAreaForPath` (B1) consumed by B2/E4; `PageShell`/`MasterDetail`/`TrendChart`/`TriageStrip` defined in C, consumed in D; `uiAccent`/`data-accent` defined A3, consumed by layout/B2.
