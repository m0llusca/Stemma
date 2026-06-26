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

## Runtime Import Guard

Enqueue-only routes must stay enqueue-only. They may import small queue enqueue helpers, but must not import LDAP clients, worker runners, connector side-effect runtimes, or other heavy modules through shared action files.

When adding or changing an enqueue route, keep validation and enqueue code in a narrow module and extend the route runtime guard test if the route is part of the guarded surface.

## Adding An Authenticated Route

1. Create the App Router page under `apps/web/src/app`.
2. Require the existing authenticated user/workspace path used by neighboring routes.
3. Add `loading.tsx` with `PageSkeleton` if page-specific data can wait.
4. Keep shell-level data out of the page loader; use `getShellSnapshot()` only from shell components.
5. Add a shell nav item only if the route is top-level navigation, and set the allowed roles explicitly.
6. Keep enqueue-only API routes free of LDAP, worker, and connector runtime imports.
7. Add or update route smoke and runtime guard coverage when the route is part of the authenticated shell surface.
