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
  await page.getByRole("button", { name: "Демо-вход", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Войти в демо-режиме" }).press("Enter");

  await expect(page).toHaveURL(/\/admin\/localization$/);
  await expect(page.getByRole("heading", { name: "Локализация" })).toBeVisible();
  const adminNavigation = page.getByRole("navigation", {
    name: "Разделы администрирования"
  });
  const currentLocalizationRoute = adminNavigation.getByRole("button", {
    name: "Локализация",
    exact: true
  });
  await expect(currentLocalizationRoute).toHaveAttribute("aria-current", "page");
  await expect(currentLocalizationRoute).toBeEnabled();
  await expect(currentLocalizationRoute).not.toHaveAttribute("aria-selected");

  const language = page.getByRole("combobox", { name: "Язык" });
  await language.click();
  await page.getByRole("option", { name: /^English \(/ }).click();
  await expect(language).toContainText("English");

  await page.getByRole("searchbox", { name: "Фильтр ключей" }).fill("dashboard.focus.title");
  const localizationTable = page.getByRole("table", { name: "Ключи локализации" });
  const translationRow = localizationTable.getByRole("row", {
    name: /^dashboard\.focus\.title\b/
  });
  await expect(translationRow).toBeVisible();

  const draft = translationRow.getByRole("textbox", {
    name: "Черновик dashboard.focus.title"
  });
  const statusBadge = translationRow.locator('[data-slot="badge"]');
  await draft.fill("Focus for E2E publish");
  await translationRow
    .getByRole("button", { name: "Сохранить черновик dashboard.focus.title" })
    .click();
  await expect(draft).toHaveValue("Focus for E2E publish", { timeout: 10_000 });
  await expect(statusBadge).toHaveText("Черновик");

  await translationRow
    .getByRole("button", { name: "Опубликовать dashboard.focus.title" })
    .click();
  await expect(statusBadge).toHaveText("Опубликовано", { timeout: 10_000 });
  await expect(draft).toHaveValue("Focus for E2E publish");
});
