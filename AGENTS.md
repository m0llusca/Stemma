<claude-mem-context>
# Memory Context

# [qc_app] project memory, updated 2026-05-04 00:16 GMT+3

## Product Goal

Build a production-oriented web application for manual quality control of support agent answers. AI checks are intentionally deferred; current priority is a strong manual QA product with clear backend foundations, integrations, reporting, calibration, coaching, appeals, reanswers, and administration.

## Chosen Product Direction

- MVP path: manual QA first, not AutoQA.
- Initial workflow: QA analyst reviews digital support conversations/tickets, scores by a versioned checklist, records findings/evidence, and creates follow-up actions.
- Full role model remains planned/supported: admin, QA analyst, QA lead, support lead, operator/agent, viewer, integration developer.
- OTRS-family integrations are first-class: OTRS Community Edition 6.x legacy/best-effort, Znuny as preferred open-source continuation, OTOBO as sibling fork.
- Custom API is mandatory for proprietary helpdesks and AI-agent systems.
- Active Directory / SSO direction is planned through OIDC/SAML-style provider support and directory sync foundations.

## Research And Planning Already Done

- Collected and translated QA best practices into product direction: evidence-based reviews, scorecards/checklists, calibration, appeals, coaching, sampling, audit trail, reports, and manual production workflows.
- Read and incorporated user-provided QA process documents for VK-style quality control. Terminology was normalized to Russian: avoid awkward terms like "скоркарта"; prefer "чек-лист", "проверка", "оценка", "разбор", "калибровка", "апелляция", "переответ".
- Created docs under `docs/superpowers/`:
  - `docs/superpowers/specs/2026-05-02-support-qa-platform-design.md`
  - `docs/superpowers/plans/2026-05-02-support-qa-platform-mvp.md`
  - `docs/superpowers/plans/2026-05-02-support-qa-productization-batch.md`
  - `docs/superpowers/plans/2026-05-02-support-qa-next-steps.md`

## Current Tech Stack

- App: Next.js App Router, React, TypeScript.
- Styling: Tailwind plus large shared CSS in `apps/web/src/app/globals.css`.
- Persistence: Prisma + SQLite at `apps/web/prisma/dev.db`.
- Testing: Vitest unit/API tests and Playwright e2e.
- Primary package: `apps/web`.

## Implemented Backend And Data Foundation

- Prisma schema and seeded local SQLite data exist.
- Review queue, conversations, messages, reviews, score criteria, findings, coaching/training tasks, calibration, integrations, API tokens, audit, jobs, auth providers, sessions, and operational settings have backend/action foundations.
- API foundations include:
  - custom conversation/message ingest;
  - versioned `/api/v1/*` endpoints for conversations, reviews, events, reports, jobs, integrations, auth providers/sessions, tokens, audit logs, health/readiness, privacy redaction, OpenAPI.
- Idempotency, rate-limit helpers, API response/query helpers, token service, audit logging, privacy redaction, runtime config, secrets helpers, review event logging, and job queue helpers are present.
- Integration backend covers custom API, native helpdesk normalizers, OTRS-family normalizer/actions, import runner, and import testing surfaces.

## Implemented Product Areas

- `reviews`: manual review queue with search, quick views, exact filters, compact bulk actions, saved views, review state handling, score display, appeal/reanswer/critical flags, and responsive queue rows.
- `reviews/[conversationId]`: review workspace with conversation timeline, evidence selection, checklist/scoring, details, workflow controls, appeals/reanswer visibility, and compact contextual chips.
- `reports`: reporting dashboard with date period controls, metric cards, charts, and export routes for reports.
- `admin`: modernized admin hub with sections for access, integrations, sampling, scorecards/checklists, system/jobs, audit, and tokens.
- `admin/integrations`: simplified source-selection flow with OTRS/Znuny/OTOBO, cloud helpdesks, and custom API direction; OTRS examples were refined because TicketGet routes differ by GenericInterface setup.
- `calibration`: calibration sessions and session rows are implemented but still need deeper production polish.
- `coaching`: training/learning tasks, next task, task creation form, and error base exist; this screen has been redesigned several times and still needs careful product review.
- `self-review`: exists, but its product need is questionable; user asked whether it is needed.

## UI/Design Direction And Recent Fixes

- User strongly prefers a light, modern, visually calm interface, not dense lists/cards everywhere.
- Design should be functional and compact: no more than about 3 clicks to admin tasks, no duplicate counters/chips/buttons, avoid oversized helper blocks.
- Sidebar:
  - active section highlighting implemented;
  - collapsible sidebar implemented;
  - collapse control is at the bottom.
- Buttons:
  - disabled states added where validation can be inferred;
  - primary blue buttons should have subtle hover without jumping;
  - no green active states for ordinary toggles/forms.
- Recent commits:
  - `5ac3412` polished sidebar toggle and bulk review actions.
  - `c78fd9d` reduced review queue visual noise, fixed exact-filter count from 9 to 10, stabilized training task trigger, added hover for disclosure actions.
  - `000e530` removed green active state, fixed disclosure hover/open state, stabilized training form layout, aligned disclosure/select chevrons.
- Most recent visual state:
  - `Раскрыть / Скрыть` has stable height and visible hover in closed/open states.
  - `Новая задача` in training no longer shifts and uses neutral blue active styling.
  - `select` arrows are custom SVG backgrounds aligned at the right edge.
  - Queue rows are less noisy: base context is a text line; only critical/reanswer/appeal flags remain as compact chips.

## Important User Preferences

- Always commit completed changes to `master`.
- Prefer implementing requested changes directly; do not stop at proposals unless explicitly asked.
- Keep the UI in Russian and use natural Russian product terms.
- Avoid overloaded screens; progressively disclose advanced settings.
- Do not remove functional buttons just because backend is missing; implement backend/actions when needed.
- Do not show canonical curl/getUrl/fallback JSON examples in the main integration UI unless hidden or clearly needed.
- Integration import should have limits to avoid accidentally importing 100k tickets.
- OTRS/Znuny/OTOBO should be treated above generic integrations and documented accurately.

## Known Open Issues / Next Work

- Continue full UI audit across all sections after each design change: look for mixed old/new patterns, inconsistent radii, cramped layouts, text overflow, duplicate counters/chips, and unstable responsive behavior.
- Review detail screen still needs periodic checks for small-ticket layouts: the checklist must not push the reviewed conversation out of view.
- Calibration and coaching are usable but likely still less complete than reviews/admin; they need more production-level flows.
- Appeals need to remain explicit in review list and review detail; make sure notification/entry points are obvious.
- Self-review may be removed or hidden if no clear MVP role.
- Admin settings should remain simple and not regress into dense tables/settings walls.
- Backend is broad but not fully production-hard; future work should add stronger auth/session enforcement, source writeback safety, connector diagnostics, import job UX, and operational monitoring.

## Last Verified Status

- Last completed verification before this memory update:
  - `npm run typecheck` passed.
  - `npm run test` passed: 19 files, 54 tests.
  - `npm run test:e2e` passed: seeded review workflow.
  - `npm run build` passed.
  - `git diff --check` passed.
- Current branch at time of memory update: `master`.
- Latest committed code change before memory update: `000e530 Fix disclosure and select interactions`.
</claude-mem-context>

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is SQLite via Prisma at `apps/web/prisma/dev.db`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
