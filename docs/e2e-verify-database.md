# Playwright verify database

E2E and integration tests use a dedicated local Postgres database
(`qc_app_demo_verify`, `schema=public`). They do not use the developer database
(`qc_app`). Playwright `next start` still sets `NODE_ENV=production`; demo-auth
and live-cert skips are gated on this verify DB, not on that env var.

Code: `apps/web/playwright.config.ts`, `apps/web/playwright-database-guard.ts`,
`apps/web/src/lib/local-playwright-verify-database.ts`.

## How e2e boots

`TEST_DATABASE_URL` is required. There is no `DATABASE_URL` fallback. The guard
accepts only a local host (`localhost`, `127.0.0.1`, `::1`, `postgres`, `db`),
database `qc_app_demo_verify` (or `QC_PLAYWRIGHT_DATABASE_NAME` when set), and
`schema=public`. Playwright then sets `DATABASE_URL` to that same validated URL.

The webServer command is `npm run db:deploy && npm run db:seed && npm run start -- --port 3000`.
A production build (`npm run build`) must already exist. `reuseExistingServer` is
false.

Compose (`compose.yaml`) only starts `qc_app` on `127.0.0.1:55432`. Creating
`qc_app_demo_verify` is outside that file. Playwright will not start without an
explicit `TEST_DATABASE_URL` pointing at it.

CI (`.github/workflows/ci.yml`) runs typecheck and unit/API tests only. It does
not run Playwright.

## Demo seed freshness (PR #5, `c558b61`)

A hardcoded `DEMO_SEED_NOW` in Playwright fell out of the dashboard’s real-clock
rolling 7-day window. `demo-data-current` then showed zeros (“Нет проверок за
неделю”) with no typecheck failure.

Playwright always assigns `DEMO_SEED_NOW` from `freshDemoSeedAnchor(new Date())`:
Moscow noon of today’s Moscow day (`…T09:00:00.000Z`). `assertDemoAnchorIsFresh`
still fail-closes if that anchor is outside today’s rolling 7-day window or 22–21
period.

`npm run db:seed` outside Playwright still honors a valid `DEMO_SEED_NOW` via
`resolveDemoSeedNow`. On the Playwright path that env var is overwritten at
config load (`process.env.DEMO_SEED_NOW = demoSeedAnchor`) and then copied into
the webServer env. Setting `DEMO_SEED_NOW` in the shell does not pin the e2e
clock.

### Residual: Moscow 22nd / UTC 21st (~21:00–00:00Z) — known, not fixed

Seed calendars and the freshness guard use Moscow days (`createDemoCalendar`).
Report headings in the app use UTC `dateOnly` (`resolveReportPeriod`).
Europe/Moscow is UTC+3, so Moscow midnight of the 22nd is `21:00Z` on the 21st.

Between ~`21:00Z` and `00:00Z` on that boundary:

- The seed anchor is already Moscow noon of the 22nd.
- The freshness guard compares two Moscow calendars and can stay green.
- Specs build expected headings from that 22nd anchor (UTC period starting the
  22nd).
- The running app uses wall-clock `now` still on UTC 21st and renders the
  previous 22–21 heading.

09:00Z runs are outside this window. Do not treat a green freshness assert in
that slot as proof that report headings match.

Date labels in screenshots drift daily if you regenerate them. Visual baselines
are not stored in git today.

## Verify-DB fail-closed bypass (PR #6, `6dd082e`)

`isLocalPlaywrightVerifyDatabase()` used to inspect only `TEST_DATABASE_URL`.
With `NODE_ENV=production`, a verify `TEST_DATABASE_URL` and a different
`DATABASE_URL` (the URL Prisma actually uses), production demo-auth and live-cert
skips could apply against a non-verify database.

Bypass production demo-auth (`QC_DEMO_AUTH=enabled` in `assertProductionBootEnv`)
and live-cert import skips (`assertIntegrationLiveCertifiedForProductionImport`)
only when **both** `TEST_DATABASE_URL` and `DATABASE_URL` independently match the
local verify allowlist:

- host in `{localhost, 127.0.0.1, ::1, postgres, db}`
- database `qc_app_demo_verify` (or `QC_PLAYWRIGHT_DATABASE_NAME` when set)
- `schema=public`

A TEST/DATABASE mismatch is fail-closed (`false` / boot throw). The normal
Playwright harness still sets both env vars to the same validated URL.

### Residual: independent allowlist identity — known, not fixed

Each URL is allowlisted on its own. Two different local verify-named databases
can both pass: `localhost` vs `127.0.0.1`, or different ports, or two hosts from
the allowlist. They are not compared as one identity.

`QC_PLAYWRIGHT_DATABASE_NAME` can whitelist another local DB name. Remote hosts
remain rejected.

## What did not change

- Developer `DATABASE_URL` / `qc_app` for `npm run dev`.
- Playwright still refuses to fall back from `TEST_DATABASE_URL` to
  `DATABASE_URL`.
- `resolveDemoSeedNow` format (`YYYY-MM-DDTHH:mm:ss.sssZ`) for non-Playwright
  seed.
- Product live-cert and demo-auth gates outside the local verify pair.

## How to verify

From `apps/web`:

```bash
npx vitest run \
  tests/unit/demo-calendar.test.ts \
  tests/unit/demo-anchor-freshness.test.ts \
  tests/unit/local-playwright-verify-database.test.ts \
  tests/unit/instrumentation-boot-gates.test.ts \
  tests/unit/integration-import-service.test.ts
```

Playwright (needs the verify DB, a production build, and `TEST_DATABASE_URL`):

```bash
TEST_DATABASE_URL='postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public' \
  npx playwright test --project=chromium tests/e2e/demo-data-current.spec.ts
```
