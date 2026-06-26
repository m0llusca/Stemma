import { expect, test } from "@playwright/test";

test("shows Phase B adapter readiness without live certification overclaiming", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  await page.getByRole("radio", { name: /Zendesk/ }).click();
  await expect(page.locator(".connect-source-current")).toContainText("Zendesk");
  await expect(page.locator(".connect-source-current")).toContainText("Тикеты Zendesk Support");
  await expect(page.locator(".connect-source-current")).not.toContainText("Живая сертификация пройдена");

  await page.getByRole("radio", { name: /Salesforce/ }).click();
  await expect(page.locator(".connect-source-current")).toContainText("Salesforce");
  await expect(page.locator(".connect-source-current")).toContainText("Кейсы Service Cloud");
  await expect(page.getByRole("radio", { name: /Salesforce/ })).toContainText("ограниченно");
  await expect(page.locator(".connect-source-current")).not.toContainText("Живая сертификация пройдена");
});

test("keeps enterprise adapters on explicit client-credentials setup", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  await page.getByRole("radio", { name: /Salesforce/ }).click();

  await expect(page.getByRole("heading", { name: "Подключение источника" }).first()).toBeVisible();
  await expect(page.getByLabel("Client ID")).toBeVisible();
  await expect(page.getByLabel("Client Secret")).toBeVisible();
  await expect(page.getByText("ограниченная поддержка — требуется живая сертификация")).toBeVisible();
  await expect(page.getByRole("button", { name: "Подключить" })).toBeEnabled();
});

test("keeps Zendesk native adapter on the runnable check path", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  await page.getByRole("radio", { name: /Zendesk/ }).click();
  await page.getByLabel("Адрес источника").fill("https://example.zendesk.com");
  await page.getByLabel("Email агента").fill("agent@example.com");
  await page.getByRole("textbox", { name: /^API-токен/ }).fill("zendesk-test-token");

  await expect(page.getByRole("button", { name: "Подключить" })).toBeEnabled();
});
