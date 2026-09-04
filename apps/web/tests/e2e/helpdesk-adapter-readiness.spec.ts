import { expect, test } from "@playwright/test";

test("shows Phase B adapter readiness without live certification overclaiming", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  const zendesk = page.getByRole("radio", { name: /Zendesk/ });
  await zendesk.click();
  await expect(zendesk).toBeChecked();
  await expect(zendesk).toContainText("Тикеты Zendesk Support");
  await expect(page.getByRole("main")).not.toContainText("Живая сертификация пройдена");

  const salesforce = page.getByRole("radio", { name: /Salesforce/ });
  await salesforce.click();
  await expect(salesforce).toBeChecked();
  await expect(salesforce).toContainText("Кейсы Service Cloud");
  await expect(salesforce).toContainText("ограниченно");
  await expect(page.getByRole("main")).not.toContainText("Живая сертификация пройдена");
});

test("keeps enterprise adapters on explicit client-credentials setup", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  const salesforce = page.getByRole("radio", { name: /Salesforce/ });
  await salesforce.click();

  await expect(
    page.getByRole("heading", { name: "Подключение источника", level: 2 })
  ).toBeVisible();
  await expect(salesforce).toBeChecked();
  await expect(page.getByLabel("Client ID")).toBeVisible();
  await expect(page.getByLabel("Client Secret")).toBeVisible();
  await expect(salesforce).toContainText("Ограниченная поддержка: требуется живая сертификация");
  await expect(page.getByRole("button", { name: "Проверить и подключить" })).toBeEnabled();
});

test("keeps Zendesk native adapter on the runnable check path", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  await page.getByRole("radio", { name: /Zendesk/ }).click();
  await page.getByLabel("Адрес источника").fill("https://example.zendesk.com");
  await page.getByLabel("Email агента").fill("agent@example.com");
  await page.getByRole("textbox", { name: /^API-токен/ }).fill("zendesk-test-token");

  await expect(page.getByRole("button", { name: "Проверить и подключить" })).toBeEnabled();
});
