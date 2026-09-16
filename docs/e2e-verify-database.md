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

### Moscow 22nd / UTC 21st (~21:00–00:00Z) — fixed in e2e (#163)

Seed calendars and the freshness guard still use Moscow days
(`createDemoCalendar`). Report headings in the app still use UTC `dateOnly`
(`resolveReportPeriod`). Product timezone is unchanged — no UX decision to
move headings onto Moscow.

Europe/Moscow is UTC+3, so Moscow midnight of the 22nd is `21:00Z` on the 21st.
Between ~`21:00Z` and `00:00Z` the seed anchor is already Moscow noon of the
22nd, while the running app still sees UTC 21st.

Approach: **match the app’s UTC wall-clock headings**. Do not skip the specs.
`buildDemoDateExpectations(anchor, now)` takes operational dates from the
Moscow seed `anchor` and report headings from wall-clock `now`. The e2e spec
passes `new Date()` as `now`. A green freshness assert in that slot still
does not prove Moscow and UTC are the same calendar day.

09:00Z runs are outside this window.

Date labels in screenshots drift daily if you regenerate them. Visual baselines
are not stored in git today.

## Verify-DB fail-closed bypass (PR #6, `6dd082e`)

`isLocalPlaywrightVerifyDatabase()` used to inspect only `TEST_DATABASE_URL`.
With `NODE_ENV=production`, a verify `TEST_DATABASE_URL` and a different
`DATABASE_URL` (the URL Prisma actually uses), production demo-auth and live-cert
skips could apply against a non-verify database.

Bypass production demo-auth (`QC_DEMO_AUTH=enabled` in `assertProductionBootEnv`)
and live-cert import skips (`assertIntegrationLiveCertifiedForProductionImport`)
only when **both** `TEST_DATABASE_URL` and `DATABASE_URL` match the local verify
allowlist **and** share one identity:

- host in `{localhost, 127.0.0.1, ::1, postgres, db}`
- database `qc_app_demo_verify` (or `QC_PLAYWRIGHT_DATABASE_NAME` when set)
- `schema=public`
- same normalized host + port + database name + `schema=public`

Loopback hosts are one host: `localhost` ≡ `127.0.0.1` ≡ `::1`. An omitted
Postgres port is `5432`. `postgres` and `db` stay allowlisted but are distinct
from loopback and from each other. Different ports fail closed. Remote hosts
stay rejected.

A TEST/DATABASE mismatch is fail-closed (`false` / boot throw). The normal
Playwright harness still sets both env vars to the same validated URL.

`QC_PLAYWRIGHT_DATABASE_NAME` can whitelist another local DB name; both URLs
must still share that name on the same identity.

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
  tests/unit/demo-date-expectations.test.ts \
  tests/unit/local-playwright-verify-database.test.ts \
  tests/unit/instrumentation-boot-gates.test.ts \
  tests/unit/integration-import-service.test.ts
```

Playwright (needs the verify DB, a production build, and `TEST_DATABASE_URL`):

```bash
TEST_DATABASE_URL='postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public' \
  npx playwright test --project=chromium tests/e2e/demo-data-current.spec.ts
```
