import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { createAuthSession, sessionCookieName } from "@/lib/auth/session";
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
  const { token, session } = await createAuthSession({ userId: user.id, userAgent: "playwright-otrs-e2e" });

  await context.addCookies([
    {
      name: sessionCookieName,
      value: token,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
      expires: Math.floor(session.expiresAt.getTime() / 1000)
    }
  ]);
});

async function runIntegrationsQueueFromOverview(page: Page) {
  await page.goto("/admin/integrations");
  await page.getByRole("button", { name: "Запустить очередь сейчас" }).click();
  await expect(page.getByText("Запущено задач: 1. Успешно: 1. С ошибками: 0.")).toBeVisible({ timeout: 45_000 });
}

test("splits integrations overview, setup, and OTRS cockpit without exposing secrets", async ({ page }) => {
  await page.goto("/admin/integrations");

  await expect(page.getByRole("heading", { name: "Интеграции" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Новый источник" })).toHaveAttribute("href", "/admin/integrations/new");
  await expect(page.getByRole("heading", { name: "Подключенные источники" })).toBeVisible();
  await expect(page.getByText("Готово к живой сертификации").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Что значит статус сертификации?" }).first()).toBeVisible();
  await expect(page.getByLabel("Разделы интеграций").getByRole("link", { name: "Диагностика" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Проверка и импорт" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Фоновые задачи" })).toBeVisible();

  await page.getByRole("link", { name: "Новый источник" }).click();
  await expect(page).toHaveURL(/\/admin\/integrations\/new$/);
  await expect(page.getByRole("heading", { name: "Мастер подключения источника" })).toBeVisible();
  await expect(page.getByText("Статус сертификации")).toBeVisible();
  await expect(page.getByLabel("Система-источник")).toContainText("OTRS CE 6");
  const selectedSourceCard = page.locator(".source-selected-card");
  await page.getByLabel("Система-источник").selectOption("otrs:otrs_family");
  await expect(selectedSourceCard).toContainText("OTRS-family fallback");
  await expect(selectedSourceCard).toContainText("Не готово к промышленной эксплуатации");
  await expect(selectedSourceCard).not.toContainText("Готово к живой сертификации");
  await page.getByLabel("Система-источник").selectOption("custom_api");
  await expect(page.getByRole("heading", { name: "Своя система через API" })).toBeVisible();
  await expect(selectedSourceCard).toContainText("Живая сертификация пройдена");
  await page.getByLabel("Система-источник").selectOption("native:zendesk");
  await expect(page.getByRole("heading", { name: "Zendesk" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Мастер подключения источника" })).toBeVisible();
  await page.getByLabel("Система-источник").selectOption("otrs:otrs");

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 2. Доступ" })).toBeVisible();
  await page.getByLabel("Base URL").fill(otrsServer.baseUrl);
  await page.getByLabel("UserLogin").fill(otrsFixtureUserLogin);
  await page.getByLabel("Password").fill(otrsFixturePassword);
  await page.getByLabel("TicketID для проверки").fill(ticketId);

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 3. Лимиты" })).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 4. Проверка" })).toBeVisible();
  await page.getByRole("button", { name: "Проверить подключение" }).click();
  await expect(page.getByText("Проверка поставлена в очередь")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Сохранить настройку" }).click();
  await expect(page.getByText("Настройка сохранена. Источник появился в списке подключений.")).toBeVisible();
  await page.getByRole("link", { name: "Открыть cockpit" }).click();

  await expect(page).toHaveURL(/\/admin\/integrations\/(?!new$)[^/]+$/);
  const cockpitUrl = page.url();

  await runIntegrationsQueueFromOverview(page);
  await page.goto(cockpitUrl);

  await expect(page.getByRole("heading", { name: "OTRS CE 6" })).toBeVisible({ timeout: 15_000 });
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
