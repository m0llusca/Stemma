# Stemma — full redesign design spec (2026-06-29)

## Context

Stemma is a Russian-language contact-center Quality Control (QA) platform (Next.js 16 + React 19, hand-written CSS token system). A first redesign pass (merged to `master`) was a **design-system refresh / reskin** — it improved consistency but preserved the original information architecture, page layouts, and interaction models. This spec defines a **ground-up redesign** across four dimensions the stakeholder explicitly prioritized: **visual identity, information architecture & navigation, page composition / layout, and interaction models.**

Direction was validated against two interactive mockups (review workbench + analytics cockpit). The chosen character: **modern, clean, professional B2B SaaS — grounded in the competitors' visual language** (NICE, Verint, Cresta, Klaus/Zendesk QA, MaestroQA, EvaluAgent). Explicitly rejected: editorial/serif treatment and warm-ivory palette.

**Reused from the first redesign (the "plumbing"):** the split `components/*.css` partials, the unified `Chip` / `StatKpi` / `EmptyState` primitives, `CriterionMatrix`, and the various bug fixes. **Reworked on top:** the token layer (new identity), navigation/IA, layout grammar, and interaction models. Functionality, data wiring, tRPC, Russian copy, and accessibility are preserved; the test suite stays green.

## 1. Visual identity / design system

Replaces the "Graphite" token layer.

**Palette (cool neutral).** App bg `#F7F8FA`; panels `#FFFFFF`; ink `#16181D` / secondary `#5B6470` / muted `#8A94A3`; hairline `#E7EAEF` / strong `#D6DAE1`. One accent — **indigo `#4F46E5`** (`-soft #EEF0FE`, `-ink #3730A3`) used ONLY for actions, active/selected state, and positive deltas. **AI-provenance** in a quiet violet (`#6D28D9` / soft `#F3F0FF`), always distinct from the action accent. Rationed semantic ramp: pass `#15803D`, warn `#B45309`, fail `#DC2626` (+ soft tints), firing only on status/thresholds.

**Typography.** **Inter** (Cyrillic, tabular numerals) as the single UI sans; a mono (JetBrains Mono / IBM Plex Mono) for IDs and timestamps. **No serif.** Hierarchy by weight (400/500/600) + size. Hero metrics are large tabular Inter (not serif).

**Chrome.** Modern-SaaS, not flat-editorial: hairline borders + **subtle elevation** (`0 1px 2–3px rgba(16,24,40,.05–.06)`) on cards/panels; radii 8–10px cards, 6–8px controls/chips; comfortable-but-dense rhythm ("tool, not website"). Subtle shadows are intentional (distinct from the prior flat pass).

**Theming (simplified, configurable — preserved).** Keep a real, user-configurable theme system, just lighter than the old 7-palette setup:
- **Light** (primary) + **Dark** (cool, reworked "Night Ops") at parity.
- A **small curated set of accent options** (indigo default + ~3 alternates) selectable in Appearance.
- **Density** (compact / comfortable) retained.
- Drop the 6 heavy color palettes (azure/emerald/violet/amber/rose) — they fight a single strong identity.
- Configured on the **Appearance** admin screen; brand logo/color overrides retained.

## 2. Information architecture & navigation

**Move away from the persistent left side rail.** Primary navigation becomes a **top bar** (modern SaaS):
- Left: brand mark + primary areas as horizontal tabs — **Сегодня · Ревью · Калибровка · Обучение · Аналитика** (Настройки lives under a user/admin menu).
- Center/right: **command palette trigger (⌘K)** — first-class navigation + actions — plus the work-pulse counters (compact, subordinate) and the user/identity menu.
- This frees the full horizontal canvas for master-detail content.

**Secondary navigation is in-page** (segmented tabs / contextual headers), never a second global bar. **Settings** uses a **contained left sub-nav within its own page** (a common modern pattern) — not a global rail.

**Command palette (⌘K)** is the fast path: jump to any screen, run actions (take next review, open a queue filter, switch period), search conversations/agents.

Route map is unchanged structurally (the existing routes stay); only the navigation *chrome* and grouping change.

## 3. Layout grammar

- **Page shell:** top nav + a consistent content frame (max-width, padding tokens, a contextual page header with title + primary action + optional in-page tabs).
- **Master-detail** for the queue and review: a list/inbox on the left, the work surface on the right, each independently scrollable. The review workbench is the hero — a focused two-pane grading environment (conversation transcript + scorecard) with a sticky live score.
- **Decision-first dashboards:** a "what needs attention now" triage strip, then a KPI row (StatKpi tiles), then trend + matrix. No panel-soup.
- **Cockpit analytics:** dense, organized data-viz — KPI tiles with deltas + sparklines, a trend chart (muted volume bars + single-accent line), the agent×criteria `CriterionMatrix` (single-hue heat, sticky first column, pinned team-average), drill-everywhere.
- **Settings:** contained sub-nav + single-column ~640px forms grouped with section labels + hairline dividers.

## 4. Interaction models (signatures)

- **Keyboard-first grading:** J/K to move criteria, 1·2·3 to score, shortcuts surfaced inline; fast, flow-state review.
- **AI auto-score-first:** each criterion shows an AI prediction the reviewer confirms/overrides in one click; provenance is a quiet inline marker (violet) with rationale + quoted evidence + a HH:MM jump-link, never a loud pill.
- **Triage mode:** "what to review/handle now" walks the user through the highest-consequence items.
- **Drill-everywhere:** every KPI / chart segment / matrix cell links to the underlying conversations.
- **Motion:** 120–180ms ease transitions; skeletons for dense-list loading; `prefers-reduced-motion` respected.

## 5. Per-screen approach

- **Сегодня / dashboard** — decision-first triage strip + StatKpi row + trend + areas-of-opportunity; drill-through.
- **Ревью — очередь** — curated inbox (master), self-describing rows, filter chips, bulk actions; selecting opens the workbench (detail).
- **Ревью — рабочее место** — two-pane grading hero: transcript + scorecard, sticky live score, keyboard-first, AI auto-score + override + evidence jump-links, batch progress.
- **Калибровка** — workbench-as-mode + consensus strip + alignment matrix (single-hue), variance flags; scores quarantined from production.
- **Обучение** — coaching hub: action-count strip, agent score-over-time with coaching events overlaid, areas-of-opportunity → "add to coaching", lifecycle chips.
- **Самооценка** — agent-facing: one hero metric + signed delta + latest feedback + acknowledge/dispute state machine.
- **Аналитика / отчёты** — the cockpit: KPI tiles, trend, agent×criteria matrix, operational signals, distribution; drill-everywhere; real empty states.
- **Настройки (admin)** — contained sub-nav; object-table grammar for lists (users/access/tokens/audit), crafted forms for settings, scorecard accordion builder, connector rows for integrations, ops panels for system/monitoring, the Appearance theme configurator.
- **Логин** — minimal centered card, top-nav-less, one accent action, SSO; light + dark parity.

## 6. Constraints & non-goals

- Preserve all behavior: tRPC/server actions, form field names, hrefs, aria/accessibility, Russian copy.
- Works in light + dark; uses tokens only (no raw hex leaks).
- Test suite (currently 1059) stays green; typecheck clean.
- **Non-goals:** no backend/data-model changes; no new product features beyond what the interaction models imply (keyboard nav, triage, AI-override UI surface existing data); no migration off the current stack.

## 7. Execution approach (detail → writing-plans)

Phased, token-first, via subagents with review, in an isolated branch:
- **A. Identity/token layer** — new cool-SaaS tokens, Inter, indigo accent, AI violet, semantic ramp, subtle elevation, simplified theming; rework dark theme.
- **B. Shell & navigation** — top nav, command palette, contextual headers, settings sub-nav; remove the global side rail; page-shell.
- **C. Layout primitives** — master-detail shell, decision-first dashboard grammar, cockpit analytics components (reuse/extend StatKpi, trend, CriterionMatrix).
- **D. Per-screen application** — the ~14 screens, parallelized over disjoint domains.
- **E. Interaction layer** — keyboard grading, AI auto-score-first/override surface, triage, drill-through.
- **F. Verification** — full visual sweep (light + dark, with seeded data), tests, typecheck, review.

Detailed task breakdown is produced by the writing-plans step.
