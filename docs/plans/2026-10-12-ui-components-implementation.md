# UI Components Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Tasks use checkbox syntax. The user approved variant A and explicitly authorized implementation, verification, commit/push to master and CI.

**Goal:** Integrate the 14 approved UI components into existing Stemma workflows, remove next-themes, and preserve Recharts, permissions, forms and JS limits.

**Architecture:** Existing shadcn/Base UI wrappers remain canonical. Client widgets own transient interaction state; server pages continue permission checks and data loading. URL parsing and form fields retain their current contracts. Optional heavy controls load in their relevant routes, and calendar content only when opened.

**Tech Stack:** Next.js16/React19, Base UI1.9, existing Calendar/Combobox/Menubar/Resizable/ScrollArea/Slider/Progress/Item/Avatar/Breadcrumb/NavigationMenu/AlertDialog/HoverCard/AspectRatio wrappers, Vitest, Playwright, PostgreSQL.

## Ownership and verification discipline

Root owns dependencies, shared confirmation/avatar/navigation/breadcrumb integration, final review, inventory, build, database/browser checks, commits and push. Workers own their assigned files, do not revert other changes, and do not install dependencies, generate Prisma, build, seed databases, commit or push. Their tests are collected for sequential execution after changes settle.

## 1. Reports and queue filters

Files: `apps/web/src/components/reports/report-command-bar.tsx`, date/range controls under reports; `apps/web/src/components/review/queue-filters.tsx`; new focused unit/browser tests for these widgets.

- [x] Read actual period names and existing canonical export/filter helpers. Calendar stores and submits the same YYYY-MM-DD fields as manual inputs; no locale/UTC shifts.
- [x] Implement Calendar range control with explicit apply/cancel, Russian locale and manual inputs. The existing date inputs remain precise entry controls.
- [x] Compose report actions with Menubar while preserving download query parameters and access gates. Keep working mobile filters.
- [x] Replace long operator/reviewer selects with controlled Combobox composition and exactly one submitted named value. Clear means the existing unfiltered value.
- [x] Add behavioral tests using actual accessible controls and FormData, including duplicate display labels with distinct option values, range cancellation and filter retention.

```ts
expect(new FormData(form).getAll("qaAssignee")).toEqual([selectedValue]);
expect(exportHref).toContain("team=");
```

## 2. Workbench

Files: `apps/web/src/app/reviews/[conversationId]/page.tsx`, focused workbench layout component under review, `apps/web/src/components/review/review-panel.tsx`; targeted tests.

- [x] Preserve the RSC-owned conversation/review content, role/source/rubric props and existing mobile pane switch.
- [x] Integrate ResizablePanelGroup/Panel/Handle for desktop with minimum usable pane widths, local layout persistence and keyboard resize. Initial server/client markup stays consistent.
- [x] Integrate ScrollArea for desktop content without breaking message/evidence scroll-to or mobile document scrolling.
- [x] Add HoverCard as supplementary criterion guidance; existing essential instructions remain in the main content.
- [x] Test resize, keyboard access, mobile visibility, evidence targeting and accessible supplementary help.

```ts
await expect(page.getByRole("separator")).toBeVisible();
await page.getByRole("separator").focus();
await page.keyboard.press("ArrowRight");
await expect(page.getByRole("button", { name: /Сохранить/ }).first()).toBeVisible();
```

## 3. Coaching and appearance/sampling settings

Files: `apps/web/src/app/coaching/page.tsx`, `apps/web/src/components/admin/sampling-rule-form.tsx`, `apps/web/src/components/admin/appearance-settings-form.tsx`; focused helper components/tests as needed.

- [x] Replace the hand-built coaching progressbar with Progress using real done/total and an explicit empty-plan label.
- [x] Compose assignment rows with Item/ItemContent/ItemTitle/ItemDescription/ItemActions. Preserve links, statuses and forms.
- [x] Add Slider paired with the existing targetPercent number input, range1–100. The number input remains the single named submitted control.
- [x] Wrap the existing theme preview with AspectRatio; preserve autosave, preview and rollback behavior.
- [x] Test numerical precision, one FormData value, zero-task progress and existing action availability.

```ts
expect(new FormData(form).getAll("targetPercent")).toEqual(["37"]);
expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
```

## 4. Shared confirmation, identity, navigation and breadcrumbs

Files: `apps/web/src/components/ui/confirm-submit-button.tsx`, auth menu/navigation components, `apps/web/src/components/admin/admin-subnav.tsx`, selected nested pages for integrations/jobs/calibration/review; shared wrappers/tests as necessary.

- [x] Replace window.confirm with AlertDialog. Cancel does nothing; confirmed form submission preserves the original submitter, validation and name/value, and occurs once. Existing non-form onClick behavior is preserved.
- [x] Use Avatar/AvatarFallback for actual initials in the current user menu; no external avatar fetches.
- [x] Compose settings subnavigation with NavigationMenu and Next Link render props, preserving permitted links and aria-current.
- [x] Add Breadcrumb on nested pages, using existing back links and returnTo filtering. Do not expose unauthorized ancestor destinations.
- [x] Test cancel/confirm/pending/validation, account-menu behavior, navigation permissions and filtered return links.

## 5. Dependencies and inventory

- [x] Remove `next-themes` with npm from `apps/web`; preserve the current appearance mechanism and `input-otp` reserve.
- [x] Recompute runtime import reachability and update the UI audit. Verify all14 components have real app consumers; report input-otp as intentionally deferred.
- [x] Inspect other unused exports/dependencies and integrate additional existing facilities only when they solve an observed user workflow gap. Avoid placeholder features or unused registries.

## 6. Full project review and release

- [x] Review touched code for correctness/architecture/security and run a separate read-only audit of auth/API/DB/jobs/report/calibration/access boundaries; fix confirmed defects with regressions.
- [x] Run clean install/security audit, typecheck, full unit/API, dedicated PostgreSQL regressions, production build, unchanged JS budgets.
- [x] Run browser QA for changed widgets/workbench/settings/coaching/reports and role/accessibility checks, including dark/light, reduced-motion, forced-colors and mobile.
- [x] Preserve primary developer database and initial untracked `.cursor/hooks/`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`.
- [ ] Commit reviewed changes, push master without force, run ordinary CI and expanded verify-DB smoke, inspect failures and fix until green on the final SHA.

Commands run from `apps/web` with Node24 locally; CI uses its configured Node22:

```sh
npm ci
npm run audit:security
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:budgets
```

Browser verification always sets both database URLs to the dedicated local `qc_app_demo_verify`. Baseline and budget thresholds are not rewritten to accommodate new code.

Local acceptance completed. Remote release receipts are reported with the final commit SHA and GitHub Actions links in the completion message.
