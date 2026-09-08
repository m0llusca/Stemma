import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("login form has no product AppNav chrome, pulse, or header skeleton", async ({ page }) => {
  await page.goto("/auth/login");

  await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основные разделы" })).toHaveCount(0);
  await expect(page.getByRole("banner", { name: "Глобальная навигация" })).toHaveCount(0);
  await expect(page.getByLabel("Глобальная навигация")).toHaveCount(0);
  await expect(page.getByLabel("Рабочий пульс")).toHaveCount(0);
  await expect(page.locator('[data-slot="app-nav"]')).toHaveCount(0);
});
