import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import {
  createOtrsGenericInterfaceServer,
  type OtrsGenericInterfaceServer
} from "../fixtures/otrs-genericinterface-server";
import {
  otrsFixturePassword,
  otrsFixtureTicketIds,
  otrsFixtureUserLogin
} from "../fixtures/otrs-ticket-fixtures";
import { signInE2EUser } from "./helpers/auth";

test.setTimeout(120_000);

let otrsServer: OtrsGenericInterfaceServer | undefined;

test.beforeAll(async () => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
  otrsServer = await createOtrsGenericInterfaceServer({
    expectedAuth: {
      userLogin: otrsFixtureUserLogin,
      password: otrsFixturePassword
    },
    ticketIds: [otrsFixtureTicketIds[0]]
  });
});

test.afterAll(async () => {
  await otrsServer?.close();
});

test.beforeEach(async ({ context }) => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
  await prisma.backendJob.deleteMany({});

  const workspace = await prisma.workspace.findFirstOrThrow({
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  const user = await prisma.user.upsert({
    where: {
      workspaceId_email: {
        workspaceId: workspace.id,
        email: "otrs-e2e-admin@example.com"
      }
    },
    create: {
      workspaceId: workspace.id,
      email: "otrs-e2e-admin@example.com",
      name: "OTRS E2E Admin",
      role: "ADMIN"
    },
    update: {
      name: "OTRS E2E Admin",
      role: "ADMIN"
    },
    select: { id: true }
  });
  await signInE2EUser(context, user, "playwright-otrs-e2e");
});

async function runIntegrationsQueueFromOverview(page: Page) {
  await page.goto("/admin/integrations");
  await page.getByRole("button", { name: "Запустить очередь сейчас" }).click();
  await expect(page.getByText(/Запущено задач: \d+\. Успешно: \d+\. С ошибками: 0\./)).toBeVisible({ timeout: 45_000 });
}

test("splits integrations overview, setup, and OTRS cockpit without exposing secrets", async ({ page }) => {
  await page.goto("/admin/integrations");

  await expect(page.getByRole("heading", { name: "Интеграции" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Новый источник" })).toHaveAttribute("href", "/admin/integrations/new");
  await expect(page.getByRole("heading", { name: "Подключенные источники" })).toBeVisible();
  await expect(page.getByText("Готово к проверке").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Что значит статус сертификации?" }).first()).toBeVisible();
  await expect(page.getByLabel("Разделы интеграций").getByRole("link", { name: "Источники" })).toBeVisible();
  await expect(page.getByLabel("Разделы интеграций").getByRole("link", { name: "Журнал" })).toBeVisible();
  await expect(page.getByLabel("Разделы интеграций").getByRole("link", { name: "Каталог" })).toBeVisible();

  await page.getByRole("link", { name: "Новый источник" }).click();
  await expect(page).toHaveURL(/\/admin\/integrations\/new$/);
  await expect(page.getByRole("heading", { name: "Подключение источника" }).first()).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Семейство OTRS" })).toBeVisible();
  const selectedSourceCard = page.locator(".connect-source-current");
  await page.getByRole("radio", { name: /Znuny/ }).click();
  await expect(selectedSourceCard).toContainText("Znuny");
  await expect(selectedSourceCard).toContainText("Форк OTRS");
  await page.getByRole("radio", { name: /YDB/ }).click();
  await expect(selectedSourceCard).toContainText("YDB");
  await page.getByRole("radio", { name: /Zendesk/ }).click();
  await expect(selectedSourceCard).toContainText("Zendesk");

  await page.goto("/admin/integrations");
  await page.getByRole("link", { name: "Znuny / OTRS / OTOBO" }).first().click();
  await expect(page).toHaveURL(/\/admin\/integrations\/(?!new$)[^/]+$/);
  await expect(page.getByRole("heading", { name: "Znuny / OTRS / OTOBO" })).toBeVisible();
  await expect(page.getByText("Статус сертификации")).toBeVisible();
  await page.getByRole("link", { name: "Операции" }).click();
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

  await page.reload();
  await expect(page.getByRole("heading", { name: "Настройка подключения" })).toBeVisible();
  await expect(page.getByLabel("Пароль или API-секрет")).toHaveValue("");
  await expect(page.getByLabel("CA bundle PEM")).toHaveValue("");
});

test("imports an OTRS CE 6 ticket through the cockpit against the GenericInterface stub", async ({ page }) => {
  if (!otrsServer) {
    throw new Error("OTRS GenericInterface stub server was not started.");
  }

  const ticketId = otrsFixtureTicketIds[0];
  const expectedSubject = `Fixture ticket ${ticketId}`;

  await page.goto("/admin/integrations/new");
  await expect(page.getByRole("heading", { name: "Подключение источника" }).first()).toBeVisible();
  await page.getByRole("radio", { name: /OTRS Community Edition 6/ }).click();
  await page.getByLabel("Адрес источника").fill(otrsServer.baseUrl);
  await page.getByLabel("Логин агента").fill(otrsFixtureUserLogin);
  await page.getByLabel("Пароль").fill(otrsFixturePassword);
  await page.getByLabel("№ тикета (необязательно)").fill(ticketId);
  await page.getByRole("button", { name: "Подключить" }).click();
  await expect(page.locator("p").filter({ hasText: /^Источник подключён$/ })).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/integrations");
  await page.getByRole("link", { name: /OTRS|otrs/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/integrations\/(?!new$)[^/]+$/);
  const cockpitUrl = page.url();

  await page.goto(cockpitUrl);

  await expect(page.getByRole("heading", { name: "OTRS Community Edition 6" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Операции" }).click();
  const settingsPanel = page.getByRole("heading", { name: "Настройка подключения" }).locator("xpath=ancestor::section[1]");
  await expect(settingsPanel).toBeVisible();
  await settingsPanel.getByLabel("Product profile").selectOption("otrs_ce_6");
  await settingsPanel.getByLabel("Base URL").fill(otrsServer.baseUrl);
  await settingsPanel.getByRole("textbox", { name: "UserLogin" }).fill(otrsFixtureUserLogin);
  await settingsPanel.getByRole("button", { name: "Сохранить OTRS" }).click();
  await expect(page.getByText("Настройка OTRS сохранена.")).toBeVisible();

  const diagnosticsPanel = page.getByRole("heading", { name: "Диагностика" }).locator("xpath=ancestor::section[1]");
  await diagnosticsPanel.getByLabel("Manual TicketID для TicketGet").fill(ticketId);
  await diagnosticsPanel.getByRole("button", { name: "Запустить диагностику" }).click();
  await expect(diagnosticsPanel.getByText("Диагностика OTRS выполнена. Статус: succeeded.")).toBeVisible();

  for (const step of ["config", "tls", "webservice", "auth", "ticket_get", "normalize", "db_dry_run"]) {
    await expect(diagnosticsPanel.locator("tbody tr").filter({ hasText: step }).getByText("succeeded")).toBeVisible();
  }
  await expect(diagnosticsPanel.locator("tbody tr").filter({ hasText: "ticket_search" }).getByText("skipped")).toBeVisible();

  const previewPanel = page.getByRole("heading", { name: "Preview / импорт" }).locator("xpath=ancestor::section[1]");
  await previewPanel.getByLabel("Manual TicketID").fill(ticketId);
  await previewPanel.getByRole("button", { name: "Preview TicketID" }).click();
  await expect(previewPanel.getByText("Preview OTRS создан. Строк: 1.")).toBeVisible();
  await expect(previewPanel.getByText(ticketId, { exact: true })).toBeVisible();

  const previewItem = previewPanel.getByRole("checkbox", { name: `Выбрать ${ticketId}` });
  await expect(previewItem).toBeChecked();
  await previewItem.uncheck();
  await previewItem.check();
  await previewPanel.getByRole("button", { name: "Импортировать выбранные" }).click();
  await expect(previewPanel.getByText("Выбранные OTRS-обращения поставлены в backend-очередь.")).toBeVisible();

  await runIntegrationsQueueFromOverview(page);

  await page.goto(`/reviews?source=otrs&q=${ticketId}`);
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
  await expect(page.getByRole("link", { name: expectedSubject })).toBeVisible();
});
