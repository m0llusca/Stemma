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
import { seededDemoWorkspaceId, signInE2EUser } from "./helpers/auth";

test.setTimeout(120_000);

let otrsServer: OtrsGenericInterfaceServer | undefined;
const browserDiagnosticsByPage = new WeakMap<Page, string[]>();

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

test.beforeEach(async ({ context, page }) => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
  await prisma.backendJob.deleteMany({});

  const diagnostics: string[] = [];
  browserDiagnosticsByPage.set(page, diagnostics);
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") {
      return;
    }

    const location = message.location();
    diagnostics.push(
      [
        `route: ${page.url()}`,
        `${message.type()}: ${message.text()}`,
        `source: ${location.url}:${location.lineNumber}:${location.columnNumber}`
      ].join("\n")
    );
  });
  page.on("pageerror", (error) => {
    diagnostics.push(
      [
        `route: ${page.url()}`,
        `pageerror: ${error.message}`,
        `stack: ${error.stack ?? "unavailable"}`
      ].join("\n")
    );
  });
  await page.addInitScript(() => {
    const pattern = /uncontrolled|controlled|FieldControl/i;

    for (const level of ["warn", "error"] as const) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        const message = args.map(String).join(" ");

        if (pattern.test(message)) {
          original(...args, `\n${new Error("Base UI warning capture").stack ?? ""}`);
          return;
        }

        original(...args);
      };
    }
  });

  const workspace = await prisma.workspace.findFirstOrThrow({
    where: { id: seededDemoWorkspaceId },
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

test.afterEach(({ page }) => {
  expect(
    browserDiagnosticsByPage.get(page) ?? [],
    "OTRS cockpit must not emit browser warnings, errors, or page errors"
  ).toEqual([]);
});

async function runIntegrationsQueueFromOverview(page: Page) {
  await page.goto("/admin/integrations");
  await page.getByRole("button", { name: "Запустить очередь сейчас" }).click();
  await expect(page.getByText(/Запущено задач: \d+\. Успешно: \d+\. С ошибками: 0\./)).toBeVisible({ timeout: 45_000 });
}

test("splits integrations overview, setup, and OTRS cockpit without exposing secrets", async ({ page }) => {
  await page.goto("/admin/integrations");

  await expect(page.getByRole("heading", { name: "Интеграции" })).toBeVisible();
  const newSourceButton = page.getByRole("button", { name: "Новый источник" });
  await expect(newSourceButton).toBeVisible();
  await expect(page.getByRole("heading", { name: "Подключенные источники" })).toBeVisible();
  await expect(page.getByText("Готово к проверке").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Что значит статус сертификации?" }).first()).toBeVisible();
  const integrationTabs = page.getByRole("tablist", { name: "Разделы интеграций" });
  await expect(integrationTabs.getByRole("tab", { name: "Источники" })).toBeVisible();
  await expect(integrationTabs.getByRole("tab", { name: "Журнал" })).toBeVisible();
  await expect(integrationTabs.getByRole("tab", { name: "Каталог" })).toBeVisible();

  await newSourceButton.click();
  await expect(page).toHaveURL(/\/admin\/integrations\/new$/);
  await expect(page.getByRole("heading", { name: "Подключение источника" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Семейство OTRS" })).toBeVisible();
  const znunySource = page.getByRole("radio", { name: /Znuny/ });
  await znunySource.click();
  await expect(znunySource).toBeChecked();
  await expect(znunySource).toContainText("Форк OTRS");

  const ydbSource = page.getByRole("radio", { name: /YDB/ });
  await ydbSource.click();
  await expect(ydbSource).toBeChecked();
  await expect(znunySource).not.toBeChecked();

  const zendeskSource = page.getByRole("radio", { name: /Zendesk/ });
  await zendeskSource.click();
  await expect(zendeskSource).toBeChecked();
  await expect(ydbSource).not.toBeChecked();

  await page.goto("/admin/integrations");
  await page.getByRole("link", { name: "Znuny / OTRS / OTOBO" }).first().click();
  await expect(page).toHaveURL(/\/admin\/integrations\/(?!new$)[^/]+$/);
  await expect(page.getByRole("heading", { name: "Znuny / OTRS / OTOBO" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Готовность адаптера" })).toBeVisible();
  await page.getByRole("tab", { name: "Операции" }).click();
  await expect(page.getByRole("heading", { name: "Чек-лист WebService" })).toBeVisible();
  const settingsPanel = page.getByRole("region", { name: "Настройка подключения" });
  await expect(settingsPanel).toBeVisible();
  await expect(page.getByRole("region", { name: "Диагностика" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Предпросмотр / импорт" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История запусков" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ручная проверка payload" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OTRS-family TicketGet payload" })).not.toBeVisible();

  const savedPassword = "e2e-password-must-not-render";
  const savedCaBundle = "-----BEGIN CERTIFICATE-----\ne2e-ca-must-not-render\n-----END CERTIFICATE-----";

  await settingsPanel.getByRole("tab", { name: "Авторизация" }).click();
  await settingsPanel.getByLabel("Пароль или API-секрет").fill(savedPassword);
  await settingsPanel.getByLabel("CA bundle PEM").fill(savedCaBundle);
  await settingsPanel.getByRole("button", { name: "Сохранить OTRS" }).click();
  await expect(page.getByText("Настройка OTRS сохранена.")).toBeVisible();

  const visibleText = await page.getByRole("main").innerText();
  expect(visibleText).not.toContain(savedPassword);
  expect(visibleText).not.toContain("e2e-ca-must-not-render");

  await page.reload();
  await expect(settingsPanel).toBeVisible();
  await settingsPanel.getByRole("tab", { name: "Авторизация" }).click();
  await expect(settingsPanel.getByLabel("Пароль или API-секрет")).toHaveValue("");
  await expect(settingsPanel.getByLabel("CA bundle PEM")).toHaveValue("");
});

test("imports an OTRS CE 6 ticket through the cockpit against the GenericInterface stub", async ({ page }) => {
  if (!otrsServer) {
    throw new Error("OTRS GenericInterface stub server was not started.");
  }

  const ticketId = otrsFixtureTicketIds[0];
  const expectedSubject = `Fixture ticket ${ticketId}`;

  await page.goto("/admin/integrations/new");
  await expect(page.getByRole("heading", { name: "Подключение источника" })).toBeVisible();
  await page.getByRole("radio", { name: /OTRS Community Edition 6/ }).click();
  await page.getByLabel("Адрес источника").fill(otrsServer.baseUrl);
  await page.getByLabel("Логин агента").fill(otrsFixtureUserLogin);
  await page.getByLabel("Пароль").fill(otrsFixturePassword);
  await page.getByLabel("№ тикета (необязательно)").fill(ticketId);
  await page.getByRole("button", { name: "Проверить и подключить" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Базовое подключение сохранено" })
  ).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/integrations");
  await page.getByRole("link", { name: /OTRS|otrs/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/integrations\/(?!new$)[^/]+$/);
  const cockpitUrl = page.url();

  await page.goto(cockpitUrl);

  await expect(page.getByRole("heading", { name: "OTRS Community Edition 6" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Операции" }).click();
  const settingsPanel = page.getByRole("region", { name: "Настройка подключения" });
  await expect(settingsPanel).toBeVisible();
  await settingsPanel.getByLabel("Профиль продукта").selectOption("otrs_ce_6");
  await settingsPanel.getByLabel("Base URL").fill(otrsServer.baseUrl);
  await settingsPanel.getByRole("tab", { name: "Авторизация" }).click();
  await settingsPanel.getByRole("textbox", { name: "UserLogin" }).fill(otrsFixtureUserLogin);
  await settingsPanel.getByRole("button", { name: "Сохранить OTRS" }).click();
  await expect(page.getByText("Настройка OTRS сохранена.")).toBeVisible();

  const diagnosticsPanel = page.getByRole("region", { name: "Диагностика" });
  await diagnosticsPanel.getByLabel("Manual TicketID для TicketGet").fill(ticketId);
  await diagnosticsPanel.getByRole("button", { name: "Запустить диагностику" }).click();
  await expect(diagnosticsPanel.getByText("Диагностика OTRS выполнена. Статус: succeeded.")).toBeVisible();

  for (const step of ["config", "tls", "webservice", "auth", "ticket_get", "normalize", "db_dry_run"]) {
    await expect(
      diagnosticsPanel.getByRole("row").filter({ hasText: step }).getByText("succeeded")
    ).toBeVisible();
  }
  await expect(
    diagnosticsPanel.getByRole("row").filter({ hasText: "ticket_search" }).getByText("skipped")
  ).toBeVisible();

  const previewPanel = page.getByRole("region", { name: "Предпросмотр / импорт" });
  await previewPanel.getByLabel("TicketID вручную").fill(ticketId);
  await previewPanel.getByRole("button", { name: "Предпросмотр TicketID" }).click();
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
