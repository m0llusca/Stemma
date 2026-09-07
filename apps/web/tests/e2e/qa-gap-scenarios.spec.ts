import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import {
  createLocalNonDemoAdmin,
  findSeededDemoAdmin,
  findSeededDemoAgent,
  findSeededDemoAnalyst,
  localQaAdmin,
  signInE2EUser
} from "./helpers/auth";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

async function openWorkflowPanel(page: Page) {
  await page.getByRole("button", { name: /Управление проверкой/ }).click();
  await expect(page.getByLabel("Статус проверки")).toBeVisible();
}

test("local credential login honors returnTo then logout shows loggedOut", async ({ page }) => {
  await createLocalNonDemoAdmin();

  await page.goto("/auth/login?returnTo=/admin/tokens");
  await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  await page.getByLabel("Логин").fill(localQaAdmin.login);
  await page.getByLabel("Пароль").fill(localQaAdmin.password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();

  await expect(page).toHaveURL(/\/admin\/tokens/);
  await expect(page.getByRole("heading", { level: 1, name: "API-доступ" })).toBeVisible();

  await page.getByRole("button", { name: /Профиль:/ }).click();
  await page.getByRole("button", { name: "Выйти" }).click();

  await expect(page).toHaveURL(/\/auth\/login\?loggedOut=1/);
  await expect(page.getByText("Сессия завершена.")).toBeVisible();
});

test("dual-control reopen requires a second workflow manager", async ({ browser }) => {
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { workspaceId: "demo-workspace", qaStatus: "FINALIZED" },
    select: { id: true, subject: true }
  });
  const admin = await findSeededDemoAdmin();
  const analyst = await findSeededDemoAnalyst();

  const requesterContext = await browser.newContext();
  await signInE2EUser(requesterContext, admin, "playwright-reopen-requester");
  const requesterPage = await requesterContext.newPage();
  await requesterPage.goto(`/reviews/${conversation.id}`);
  await expect(requesterPage.getByText(/Завершен/).first()).toBeVisible();

  await openWorkflowPanel(requesterPage);
  await requesterPage.getByLabel("Статус проверки").selectOption("REOPENED");
  await requesterPage.getByLabel("Причина переоткрытия").fill("Калибровка: нужна повторная оценка критериев.");
  await requesterPage.getByRole("button", { name: "Запросить / обновить" }).click();
  await expect(requesterPage.getByText("ожидает подтверждения переоткрытия")).toBeVisible();
  await requesterContext.close();

  const confirmerContext = await browser.newContext();
  await signInE2EUser(confirmerContext, analyst, "playwright-reopen-confirmer");
  const confirmerPage = await confirmerContext.newPage();
  await confirmerPage.goto(`/reviews/${conversation.id}`);
  await openWorkflowPanel(confirmerPage);
  await confirmerPage.getByRole("button", { name: "Подтвердить переоткрытие" }).click();
  await expect(confirmerPage.getByText("На пересмотре", { exact: true }).first()).toBeVisible();
  await confirmerContext.close();
});

test("SUPPORT_AGENT can open self-review and is blocked from admin mutations", async ({ browser }) => {
  const agent = await findSeededDemoAgent();
  const context = await browser.newContext();
  await signInE2EUser(context, agent, "playwright-support-agent");
  const page = await context.newPage();

  await page.goto("/self-review");
  await expect(page.getByRole("heading", { name: "Моя обратная связь" })).toBeVisible();

  const areaNav = page.getByRole("navigation", { name: "Основные разделы" });
  const areaMenuTrigger = page.getByRole("button", { name: "Разделы" });
  if (await areaNav.isVisible()) {
    await expect(areaNav.getByRole("link", { name: "Сегодня" })).toHaveCount(0);
    await expect(areaNav.getByRole("link", { name: "Моя обратная связь" })).toBeVisible();
  } else {
    await areaMenuTrigger.click();
    const areaMenu = page.getByRole("menu");
    await expect(areaMenu.getByRole("menuitem", { name: "Сегодня" })).toHaveCount(0);
    await expect(areaMenu.getByRole("menuitem", { name: /Моя обратная связь/ })).toBeVisible();
    await page.keyboard.press("Escape");
  }

  await page.goto("/dashboard");
  await expect(page.getByText("Операторы с наибольшей нагрузкой")).toHaveCount(0);
  await expect(page.getByText("Области для роста")).toHaveCount(0);
  await expect(page.getByText("Риск и апелляции")).toHaveCount(0);

  await page.goto("/admin/users");
  await expect(page.getByRole("alert").filter({ hasText: "Недостаточно прав" })).toBeVisible();
  await expect(page.getByText("Недостаточно прав для выполнения операции.")).toBeVisible();
  await expect(page.getByText("Что-то пошло не так", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Пользователи" })).toHaveCount(0);

  await page.goto("/admin/scorecards");
  await expect(page.getByRole("alert").filter({ hasText: "Недостаточно прав" })).toBeVisible();
  await expect(page.getByText("Что-то пошло не так", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Новая версия" })).toHaveCount(0);
  await context.close();
});

test("non-demo admin creates an API token and a new scorecard version", async ({ browser }) => {
  const localAdmin = await createLocalNonDemoAdmin();
  const context = await browser.newContext();
  await signInE2EUser(context, localAdmin, "playwright-local-admin-settings");
  const page = await context.newPage();

  await page.goto("/admin/tokens");
  await expect(page.getByRole("heading", { level: 1, name: "API-доступ" })).toBeVisible();
  await page.locator('[data-slot="dialog-trigger"]').filter({ hasText: "Новый ключ" }).click();
  const tokenDialog = page.getByRole("dialog", { name: "Новый ключ" });
  await expect(tokenDialog).toBeVisible();
  await tokenDialog.getByLabel("Название").fill("E2E gap token");
  await tokenDialog.getByRole("button", { name: "Создать ключ" }).click();
  await expect(tokenDialog.getByText("API-ключ создан")).toBeVisible();
  await expect(tokenDialog.locator('[data-testid="created-api-token-secret"]')).toHaveText(/.+/);

  await page.goto("/admin/scorecards");
  await expect(page.getByRole("heading", { name: "Формы оценки", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Новая версия" }).click();
  const scorecardDialog = page.getByRole("dialog", { name: "Новая версия формы оценки" });
  await expect(scorecardDialog).toBeVisible();
  await scorecardDialog.locator("#scorecard-name").fill("E2E методика gap");
  await scorecardDialog.getByRole("button", { name: "Создать новую версию" }).click();
  await expect(page.getByRole("dialog", { name: "Новая версия формы оценки" })).toHaveCount(0);
  await expect(page.getByText("E2E методика gap")).toBeVisible();
  await context.close();
});
