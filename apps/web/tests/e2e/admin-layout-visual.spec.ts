import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

const routes = [
  "/admin",
  "/admin/integrations",
  "/admin/integrations/new",
  "/admin/access",
  "/admin/ai-scoring",
  "/admin/channels",
  "/admin/users",
  "/admin/scorecards",
  "/admin/tokens",
  "/admin/system",
  "/reports",
  "/reviews",
  "/calibration",
  "/self-review"
] as const;

const viewportWidths = [390, 768, 1280, 1440] as const;
const viewportHeight = 900;

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(async ({ context }) => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });

  const admin = await findSeededDemoAdmin();
  await signInE2EUser(context, admin, "playwright-admin-layout");
});

test("admin and work queue routes do not introduce page-level horizontal overflow", async ({ page }) => {
  for (const width of viewportWidths) {
    await page.setViewportSize({ width, height: viewportHeight });

    for (const route of routes) {
      const response = await page.goto(route);
      await page.locator("body").waitFor({ state: "visible" });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      expect.soft(response?.ok(), `${route} at ${width}px should load successfully`).toBe(true);

      const layout = await page.evaluate(() => {
        const root = document.documentElement;

        return {
          clientWidth: root.clientWidth,
          overflow: root.scrollWidth - root.clientWidth,
          scrollWidth: root.scrollWidth
        };
      });

      expect
        .soft(
          layout.overflow,
          `${route} at ${width}px: scrollWidth=${layout.scrollWidth}, clientWidth=${layout.clientWidth}`
        )
        .toBeLessThanOrEqual(2);
    }
  }
});
