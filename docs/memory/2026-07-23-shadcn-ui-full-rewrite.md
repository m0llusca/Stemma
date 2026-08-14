# Memory: shadcn/ui full product rewrite (2026-07-23)

**Project:** qc_app / Stemma (`apps/web`)  
**Type:** feature + refactor  
**Status:** Product UI migrated to shadcn/ui; AdminDialog skeptic fix applied.

## Goal

Rewrite the product UI to use **only shadcn components** for standard control roles (buttons, forms, tables, dialogs, badges, empty, skeletons, toasts, nav, etc.), via a **swarm of ≥30 subagents**. Domain/server logic unchanged.

## What was done

### Foundation
- `npx shadcn@latest init --preset nova --base base` in `apps/web`
- `components.json`: style `base-nova`, base **Base UI**, iconLibrary **lucide**, aliases `@/components/ui`
- Installed full official UI set (button, card, dialog, sheet, field, table, tabs, sonner, sidebar, command, …)
- **Tailwind v3 → v4** so `@import "shadcn/tailwind.css"` works (`@theme`, `@utility`, `@custom-variant`)
- `postcss.config.mjs` → `@tailwindcss/postcss`
- Theme tokens in `src/app/globals.css` (OKLCH semantic vars + bridges for domain: `--panel`, `--content-max-width`, `--app-topbar-height`, brand defaults)
- Root layout (`layout.tsx`): only `globals.css`; the retired duplicate theme file was deleted after its semantic intent was migrated
- Providers: `TooltipProvider` + sonner-backed `ToastProvider`
- Dark ops theme: `className="dark"` when `appearance.uiTheme === "ops"`

### Swarm
- **32 background subagents** partitioned by surface (shell, login, product pages, every admin section, operations, wrappers, CSS retirement, tests, inventory)
- Log: goal scratch `swarm-agents.txt` (session-local); ownership was path-partitioned

### Domain wrappers → shadcn compositions
| Wrapper | Implementation |
|---------|----------------|
| `PageShell` | Flex layout + Badge tabs + Separator |
| `EmptyState` | `Empty` / `EmptyHeader` / `EmptyTitle` / … |
| `Chip` | `Badge` + legacy `chip` / `chip--{tone}` class hooks |
| `StatusBadge` | Chip; API `{label,value,tone,compact}` **and** children+tone |
| `StatKpi` / `StatCard` / `StatStrip` | Card + Badge / MetricValue |
| `Modal` | shadcn `Dialog` |
| `AdminDialog` | shadcn `Dialog` (fixed after skeptic: was native `<dialog>` + BEM) |
| `useToast` / `ToastProvider` | **sonner** (`Toaster` from `@/components/ui/sonner`) |
| `HelpTooltip` | shadcn `Tooltip` + Button `render` |
| `TriageStrip` | `Alert` |
| Submit buttons | `Button` + `Spinner` |

### Surfaces migrated
- Shell: `app-nav-shell` → Button, Badge, DropdownMenu, Command+Dialog, NativeSelect
- Login, error, not-found
- Dashboard, reviews queue + detail workbench, coaching, calibration, reports (+ charts/tables), self-review
- Admin hub + all admin pages: access, users (+ CreateUserDialog), scorecards, integrations list/detail/new, channels, tokens, system/jobs, appearance, localization, sampling, AI scoring, audit, report-schedules
- Operations composites (Sheet evidence drawer, KPI cards, etc.)
- Loading states → `Skeleton` / `PageSkeleton`

### CSS exit
- Primary styling: shadcn semantic tokens + Tailwind utilities
- Legacy CSS under `src/app/styles/**` **kept on disk** with LEGACY headers; **not imported** by layout
- Brand colors still applied via body `style={brandStyle}` from appearance resolver

### Tests / verification
- `npm run typecheck` → 0
- `npm run test` → 211 files, 1501 tests green
- Composition tests: `tests/unit/shadcn-ui-composition.test.tsx`
- AdminDialog tests assert `[data-slot=dialog-content]`, no native `dialog.admin-dialog`
- Toast tests adapted for sonner

## Decisions

1. **Base UI default** (not Radix) for new shadcn install — use `render` prop, not `asChild`.
2. **Thin domain wrappers allowed** — pages may import PageShell/EmptyState/etc.; those must compose shadcn only.
3. **NativeSelect** for server-action forms needing FormData `name` attributes; Base UI Select for client-only.
4. **Public APIs of Chip/StatusBadge/StatKpi preserved** (and extended) so swarm page migrations typecheck.
5. **AdminDialog** must never use unimported BEM; always shadcn Dialog.

## Do not regress

- Do not recreate a second theme authority or import `styles/components/*` into layout; `globals.css` owns semantic tokens, themes, modifiers, and motion.
- Do not restore native `<dialog class="admin-dialog">`.
- Prefer `gap-*` over `space-y-*`; semantic colors over raw `bg-blue-500`.
- Icons in buttons: `data-icon`; no size classes inside Button.

## Related paths

- Config: `apps/web/components.json`
- Theme: `apps/web/src/app/globals.css`
- UI: `apps/web/src/components/ui/*`
- Skill (host): `~/.agents/skills/shadcn/`
- Knowledge dump: `docs/memory/shadcn-ui-knowledge.md`
