import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("splits integrations overview, setup, and OTRS cockpit without exposing secrets", async ({ page }) => {
  await page.goto("/admin/integrations");

  await expect(page.getByRole("heading", { name: "Интеграции" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Новый источник" })).toHaveAttribute("href", "/admin/integrations/new");
  await expect(page.getByRole("heading", { name: "Подключенные источники" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Последняя диагностика" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preview и импорт" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backend jobs" })).toBeVisible();

  await page.getByRole("link", { name: "Новый источник" }).click();
  await expect(page).toHaveURL(/\/admin\/integrations\/new$/);
  await expect(page.getByRole("heading", { name: "Мастер подключения источника" })).toBeVisible();
  await expect(page.getByLabel("Система-источник")).toContainText("OTRS CE 6");
  await page.getByLabel("Система-источник").selectOption("custom_api");
  await expect(page.getByText("Своя система через API")).toBeVisible();
  await page.getByLabel("Система-источник").selectOption("native:zendesk");
  await expect(page.getByText("Zendesk", { exact: true }).first()).toBeVisible();

  await page.goto("/admin/integrations");
  await page.locator(".admin-tile").filter({ hasText: "Znuny / OTRS / OTOBO" }).getByRole("link", { name: "Открыть cockpit" }).click();
  await expect(page).toHaveURL(/\/admin\/integrations\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Znuny / OTRS / OTOBO" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WebService checklist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Настройка подключения" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Диагностика" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preview / импорт" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История запусков" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ручная проверка payload" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OTRS-family TicketGet payload" })).not.toBeVisible();

  const savedPassword = "e2e-password-must-not-render";
  const savedCaBundle = "-----BEGIN CERTIFICATE-----\ne2e-ca-must-not-render\n-----END CERTIFICATE-----";

  await page.getByLabel("Пароль или API-секрет").fill(savedPassword);
  await page.getByLabel("CA bundle PEM").fill(savedCaBundle);
  await page.getByRole("button", { name: "Сохранить OTRS" }).click();
  await expect(page.getByText("Настройка OTRS сохранена.")).toBeVisible();

  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toContain(savedPassword);
  expect(visibleText).not.toContain("e2e-ca-must-not-render");
});
