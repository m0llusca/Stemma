import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightTestDatabaseUrl } from "./playwright-database-guard";
import { assertDemoAnchorIsFresh } from "./tests/e2e/helpers/demo-anchor-freshness";

// Fail-closed: TEST_DATABASE_URL must point at the dedicated local
// qc_app_demo_verify:public database; DATABASE_URL is derived only from the
// validated URL and never falls back to a developer database.
const testDatabaseUrl = resolvePlaywrightTestDatabaseUrl(process.env);
process.env.DATABASE_URL = testDatabaseUrl;
// Deterministic demo anchor: chart/evidence specs are certified against the
// current seed anchor (see report-keyboard-evidence.spec.ts), and every seed run —
// the webServer boot and each spec's beforeEach — inherits this process env.
// Re-anchored 2026-08-13: the runtime dashboard/reports clock is real `now`, so
// the anchor must stay within the rolling windows or demo-data-current fails stale.
const demoSeedAnchor = "2026-08-13T09:00:00.000Z";
process.env.DEMO_SEED_NOW = demoSeedAnchor;
// Fail-fast on anchor rot: the seed clock is pinned for byte-stable screenshots
// while the app renders rolling windows from the real clock, so a stale anchor
// silently turns into "zero weekly checks" and wrong-period report headings
// several minutes into a run. Assert the two clocks still agree up front.
assertDemoAnchorIsFresh(new Date(demoSeedAnchor), new Date());
// Playwright forces FORCE_COLOR for workers and webServer. Empty NO_COLOR avoids Node 25 warnings in that child env.
process.env.NO_COLOR = "";

const webServerEnv: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  ),
  // Force demo auth and allow seed to run for e2e without relying on the caller's shell.
  QC_DEMO_AUTH: "enabled",
  // E2E OTRS uses a local GenericInterface fixture; production keeps private URLs blocked by default.
  QC_ALLOW_PRIVATE_BASE_URLS: "1",
  ALLOW_SEED: "1",
  // Local-only e2e secret; never a production credential.
  AUTH_SECRET: "task10-local-e2e-secret-2026-07-29-only",
  // next start runs NODE_ENV=production and secrets.ts fails closed without a key;
  // this throwaway value only encrypts data inside the disposable verify database.
  QC_SECRET_KEY: "task10-local-e2e-qc-secret-key-only",
  NEXTAUTH_URL: "http://localhost:3000",
  // Harness repair for resolvePublicOrigin (src/lib/public-origin.ts): the
  // configured origin is checked BEFORE the allowlist and must be HTTPS under
  // `next start` (NODE_ENV=production), while .env pins an http://localhost
  // value. Empty string skips the configured-origin branch so the localhost
  // QC_PUBLIC_ORIGIN_ALLOWLIST path engages — same local-only override pattern
  // as AUTH_SECRET above; the product guard itself stays intact.
  QC_PUBLIC_ORIGIN: "",
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // One worker: the e2e suites share one mutable dedicated database and one server port.
  workers: 1,
  // "line" keeps the run deterministic and CI-friendly (no html report server).
  reporter: "line",
  use: {
    baseURL: "http://localhost:3000",
    // Deterministic locale/timezone for stable Russian copy, dates, and screenshots.
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    // deviceScaleFactor intentionally stays at each device preset's default so
    // font rasterization is stable across runs; do not override it here.
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] }
    }
  ],
  webServer: {
    // Production server: a production build (`npm run build`) MUST already exist
    // (.next/BUILD_ID present) before Playwright starts — producing it is the
    // caller's responsibility; this config never builds to keep the exclusive
    // build ownership (Agent B) intact.
    command: "npm run db:deploy && npm run db:seed && npm run start -- --port 3000",
    env: webServerEnv,
    url: "http://localhost:3000",
    timeout: 120_000,
    // Never reuse an arbitrary pre-existing server: state and env would be unverified.
    reuseExistingServer: false
  }
});
