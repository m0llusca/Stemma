import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("edits and publishes a localization draft", async ({ page }) => {
  await page.goto("/auth/login?returnTo=/admin/localization");
  await page.locator("summary").filter({ hasText: "Демо-вход" }).press("Enter");
  await page.getByRole("button", { name: "Войти в демо-режиме" }).press("Enter");

  await expect(page).toHaveURL(/\/admin\/localization$/);
  await expect(page.getByRole("heading", { name: "Локализация" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Локализация" })).toHaveAttribute("href", "/admin/localization");

  const englishLocaleId = await page.getByLabel("Язык").locator("option", { hasText: "English" }).getAttribute("value");
  expect(englishLocaleId).toBeTruthy();
  await page.getByLabel("Язык").selectOption(englishLocaleId ?? "");
  await page.getByLabel("Фильтр ключей").fill("dashboard.focus.title");
  await expect(page.getByText("dashboard.focus.title", { exact: true })).toBeVisible();

  const draft = page.getByLabel("Черновик dashboard.focus.title");
  await draft.fill("Focus for E2E publish");
  await page.getByRole("button", { name: "Сохранить черновик dashboard.focus.title" }).click();
  await expect(page.getByLabel("Черновик dashboard.focus.title")).toHaveValue("Focus for E2E publish", { timeout: 10_000 });
  await expect(page.locator(".pill").filter({ hasText: /^Черновик$/ })).toBeVisible();

  await page.getByRole("button", { name: "Опубликовать dashboard.focus.title" }).click();
  await expect(page.locator(".pill").filter({ hasText: /^Опубликовано$/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel("Черновик dashboard.focus.title")).toHaveValue("Focus for E2E publish");
});
