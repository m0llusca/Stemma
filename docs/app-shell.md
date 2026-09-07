# Authenticated App Shell

Authenticated Stemma routes should render a lightweight shell before expensive page data resolves. The shell owns stable chrome: sidebar navigation, topbar, workspace branding, user identity, theme, density, and locale affordances.

## Shell Snapshot

`apps/web/src/lib/shell/snapshot.ts` exposes `getShellSnapshot()` and `buildShellNavItems()`.

The snapshot is intentionally small:

- user id, workspace id, name, email, and role;
- resolved workspace branding;
- role-filtered navigation items.

Do not add page metrics, integration health, review queues, reports, LDAP state, or job runner data to the snapshot. Those belong behind page-local loaders or async signal components.

## Navigation

Navigation is role-filtered from the shell definitions. Add a nav item by declaring its `href`, label, icon, group, and allowed roles in the shell nav definitions. Keep labels short because collapsed and mobile shells have fixed space.

### Role homes

`roleHomePath` (`apps/web/src/lib/auth/role-home.ts`) is the product home after login and the brand mark target (`homeHref` from `AppNav`). Do not hardcode `/dashboard`.

| Role | Home | «Сегодня» |
| --- | --- | --- |
| QA_ANALYST | `/reviews?qaAssignee=…&due=overdue` (Мои+просрочено) | Same href. No name → `/reviews?due=overdue`. |
| TEAM_LEAD, ADMIN | `/dashboard` | `/dashboard` |
| SUPPORT_AGENT | `/self-review` | Hidden. Brand → self-review, not ops pulse. |
| VIEWER | `/auth/pending-access` | Hidden |

`todayHrefForRole` / `visibleTopNavAreas` rewrite Analyst «Сегодня». Login generic paths (`/`, `/reviews`, `/dashboard`, `/auth/login`) remap to role home. Deep links with a query string stay as-is.

⌘K **«Взять следующий кейс»** is an action, not a nav href. Same `takeNextReview` path as the queue button — [ux-queue-hotkeys-contract.md](ux-queue-hotkeys-contract.md).

## Async Signals

Sidebar and topbar counters or alerts should be non-blocking. Load them in isolated async signal components so the shell can render if a count, health probe, or optional widget fails. Signal failures should degrade to neutral copy or be omitted; they should not block the page shell.

## Loading Boundaries

Authenticated pages should expose a route-level `loading.tsx` when page data can wait. Use `PageSkeleton` from `apps/web/src/components/loading-states.tsx` with the closest variant:

- `dashboard`
- `workspace`
- `detail`
- `reports`
- `admin`

Inside a page, wrap expensive content in `Suspense` with the same skeleton style. Skeletons should preserve approximate layout size so quick view toggles and filter changes do not produce large blank gaps.

## Page permission denials

A signed-in user without the page permission sees **«Недостаточно прав»** (`forbidden.tsx`), not the generic **«Что-то пошло не так»** (`error.tsx`). SUPPORT_AGENT on `/admin/*` is the usual case; any role missing the gate behaves the same.

Gate RSC pages with `requirePagePermission` / `denyPageAccess` (`apps/web/src/lib/page-permission.ts`). They catch the deny and call Next.js `forbidden()`. That needs `experimental.authInterrupts: true` in `apps/web/next.config.ts`. Without the flag, `forbidden()` / `forbidden.tsx` do not work (undefined or wrong 403 UI).

API routes and server actions keep `requireCurrentUserPermission` (403 JSON or throw). Mutation deny UX is unchanged.

Most pages call the gate inside `Suspense`. After the response starts streaming, Next.js cannot change the status: HTTP may be 200 with 403 UI. E2E checks the copy, not the status.

`AppNavShell` reads `useSearchParams()` for Analyst inbox active-area matching (`activeAreaForPath`). The shell in `layout.tsx` is **not** wrapped in `Suspense`. Residual — see Follow-up.

## Runtime Import Guard

Enqueue-only routes must stay enqueue-only. They may import small queue enqueue helpers, but must not import LDAP clients, worker runners, connector side-effect runtimes, or other heavy modules through shared action files.

When adding or changing an enqueue route, keep validation and enqueue code in a narrow module and extend the route runtime guard test if the route is part of the guarded surface.

## Adding An Authenticated Route

1. Create the App Router page under `apps/web/src/app`.
2. Gate the page with `requirePagePermission` (or `denyPageAccess` for a custom role check). Do not call `requireCurrentUserPermission` from `page.tsx` — that throws into `error.tsx`.
3. Add `loading.tsx` with `PageSkeleton` if page-specific data can wait.
4. Keep shell-level data out of the page loader; use `getShellSnapshot()` only from shell components.
5. Add a shell nav item only if the route is top-level navigation, and set the allowed roles explicitly.
6. Keep enqueue-only API routes free of LDAP, worker, and connector runtime imports.
7. Add or update route smoke and runtime guard coverage when the route is part of the authenticated shell surface.

## Follow-up (not fixed)

- **AGENT deep-link `/dashboard`.** Brand and login send SUPPORT_AGENT to `/self-review`. Typed `/dashboard` still opens: page gate is `reviews:read`, which agents have. Nav hides «Сегодня»; the route does not.
- **Suspense active-area.** `useSearchParams()` in `AppNavShell` has no layout `Suspense`. Analyst «Сегодня» highlight can trip the client search-params boundary.
- **#24 pending.** Dashboard peer leaderboard / vanity avg still gated by `role !== SUPPORT_AGENT`. Target: `peer_quality:read` (TEAM_LEAD+ADMIN). Permission is not in the matrix yet. QA Analyst still sees peer rows.
