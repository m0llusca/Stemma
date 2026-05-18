import { expect, test } from "@playwright/test";

test("shows Phase B adapter readiness without live certification overclaiming", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  await page.getByLabel("Система-источник").selectOption("native:zendesk");
  await expect(page.locator(".source-selected-card")).toContainText("Zendesk");
  await expect(page.locator(".source-selected-card")).toContainText("Готово к живой сертификации");
  await expect(page.locator(".source-selected-card")).not.toContainText("Живая сертификация пройдена");

  await page.getByLabel("Система-источник").selectOption("native:salesforce");
  await expect(page.locator(".source-selected-card")).toContainText("Salesforce Service Cloud");
  await expect(page.locator(".source-selected-card")).toContainText("Готово к живой сертификации");
  await expect(page.locator(".source-selected-card")).not.toContainText("Живая сертификация пройдена");
});

test("keeps enterprise adapters out of the native runnable save path", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  await page.getByLabel("Система-источник").selectOption("native:salesforce");
  await page.getByRole("button", { name: "Далее" }).click();

  await expect(page.getByRole("heading", { name: "Шаг 2. Доступ" })).toBeVisible();
  await expect(page.getByText("Enterprise-доступы требуют отдельного защищенного подключения")).toBeVisible();
  await expect(page.getByText("oauth_client_credentials", { exact: true })).toBeVisible();
  await expect(page.getByText("не записать источник как native_helpdesk")).toBeVisible();
  await expect(page.getByRole("button", { name: "Далее" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Проверить подключение" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить настройку" })).not.toBeVisible();
});

test("keeps Zendesk native adapter on the runnable check path", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  await page.getByLabel("Система-источник").selectOption("native:zendesk");
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByLabel("Ключ API или секрет приложения").fill("zendesk-test-token");
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Далее" }).click();

  await expect(page.getByRole("heading", { name: "Шаг 4. Проверка" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Проверить подключение" })).toBeEnabled();
});
