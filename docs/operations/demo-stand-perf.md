# Demo stand performance baseline

Roman LIVE (2026-09-08) felt slow. Separate **stand topology** from **app
regressions** before rewriting charts (#109) or Morphicons (#108).

## What to measure

Use DevTools Network + Performance on a warm tab. Record **first navigation**
and a **repeat** of the same route. Note whether the process is `next dev` or
`next start`, and whether Neon had been idle.

| Surface | Role home | What to record |
| --- | --- | --- |
| `/auth/login` | all | TTFB, document finish, time until the login card is interactive |
| Analyst «Сегодня» | `QA_ANALYST` → `/reviews?qaAssignee=…&due=overdue` | TTFB, first paint of the queue table (not only the skeleton), Take next click → next route |
| Exec «Сегодня» | `EXEC` → `/dashboard` | TTFB, first paint of ExecRiskHome (3 KPI), not the ops 4-KPI flash |
| Lead/Admin pulse | `TEAM_LEAD` / `ADMIN` → `/dashboard` | TTFB, KPI row paint |

Also note:

- Next compile / “Compiling /…” in the `next dev` terminal on first hit
- Neon project **idle / suspend** vs compute already awake
- Tunnel (cloudflared) RTT, separately from origin TTFB

Do **not** add decorative spinners to hide a slow origin. Existing
`loading.tsx` / Suspense skeletons stay honest.

## Topology (usually the large gap)

### `next dev` vs `next start`

The pokeable box often runs `next dev` against Neon. Dev mode compiles the
route on first request, logs every Prisma query (`src/lib/db.ts` in
development), and does not apply production minification.

For a **feel-check / LIVE demo**, prefer a production server:

```bash
cd apps/web
npm run build
npm start
```

`next start` sets `NODE_ENV=production`. That is the intended speed baseline.

### `QC_DEMO_AUTH` and production boot

`assertProductionBootEnv` **refuses** `QC_DEMO_AUTH=enabled` when
`NODE_ENV=production`, except the local Playwright verify database
(`docs/e2e-verify-database.md`). So:

| Goal | Recipe |
| --- | --- |
| Fast compiled demo (credentials / SSO) | `next build && next start` **without** `QC_DEMO_AUTH` |
| Pokeable demo-user picker / nav switcher | `QC_DEMO_AUTH=enabled` on **`next dev`** (or a non-production process) |
| Vercel production | never set `QC_DEMO_AUTH=enabled` — boot already fails closed |

Do not widen that gate to “make `next start` + demo picker work” without a
separate security review. The login form still offers local credentials and SSO
when demo auth is off.

### Neon warm

A suspended Neon compute adds seconds to the first query after idle (login
session + user + providers). Warm the project before the LIVE:

1. Open the Neon console (or run `SELECT 1` against `DATABASE_URL`) a minute
   before the demo.
2. Hit `/auth/login` once, then the Analyst inbox and Exec `/dashboard`.
3. Prefer a Neon compute that does not auto-suspend for the stand window.

Connection string: if the stand uses Neon, prefer the **pooled** host Neon
documents for serverless/Prisma. This note does not change app code for that.

## App-side findings (verified in code, #106)

Already fine — no change:

- `/auth/login` loads providers and demo users in one `Promise.all` (single
  `user.findMany` + workspace include). Not an N+1.
- `/reviews` and `/dashboard` already have `loading.tsx` and inner Suspense.
- Queue listing is one `findMany` then in-memory priority sort + page slice
  (`getReviewQueue` → `paginateReviewQueue`). Rewriting that sort to SQL is
  out of scope here.

Safe wins in this PR:

- `getCurrentUser` is wrapped in React `cache()` so layout, AppNav, dashboard
  skeleton, and the page gate share one session lookup per request (legacy
  cookie path also wrote `lastSeenAt` on every call).
- Exec `/dashboard` skips week-check and training **counts** it never renders
  (feeds were already skipped).
- Demo nav switcher lists demo-identity users only (same filter as login), not
  every workspace row.

Known follow-ups (not this PR):

- `/reviews` still loads **all** matching conversations before slicing to 25
  rows (needed for the current global priority rank).
- Lead/Admin `/dashboard` still fans out many parallel counts/finds — not a
  sequential waterfall, but heavy on a cold Neon.

## Feel-check checklist

1. Record the four surfaces above on **`next dev` + cold Neon** (today’s stand).
2. Warm Neon; repeat. Attribute the delta to suspend, not the app.
3. `next build && next start` **without** demo auth; repeat Analyst + Exec.
4. Compare (3) to `next dev` on the same warm database. The compile gap is the
   operational win.
