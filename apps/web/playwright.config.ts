import { defineConfig, devices } from "@playwright/test";

const defaultDatabaseUrl = "postgresql://qc_app:qc_app@localhost:55432/qc_app?schema=public";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? defaultDatabaseUrl;
process.env.QC_DEMO_AUTH = process.env.QC_DEMO_AUTH ?? "enabled";
// Playwright forces FORCE_COLOR for workers and webServer. Empty NO_COLOR avoids Node 25 warnings in that child env.
process.env.NO_COLOR = "";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "npm run db:deploy && npm run db:seed && npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  }
});
