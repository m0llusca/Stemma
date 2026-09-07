import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import {
  findSeededDemoAgent,
  findSeededDemoAnalyst,
  findSeededDemoExec,
  findSeededDemoViewer,
  signInE2EUser
} from "./helpers/auth";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

async function openQuickViews(page: Page) {
  const toggle = page.getByRole("button", { name: /Быстрые виды/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Быстрые представления очереди")).toBeVisible();
}

async function expectReaderSavedViews(page: Page) {
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
  await openQuickViews(page);

  const overdue = page.getByRole("link", { name: "Просрочено" });
  await expect(overdue).toBeVisible();
  await overdue.click();
  await expect(page).toHaveURL(/\/reviews\?due=overdue/);

  await openQuickViews(page);
  await page.getByRole("button", { name: /Ещё/ }).click();
  await page.getByRole("menuitem", { name: "Критические за период" }).click();
  await expect(page).toHaveURL(/\/reviews\?process=critical/);

  await openQuickViews(page);
  await expect(page.getByLabel("Сохранить текущий вид")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Сохранить" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Удалить представление/ })).toHaveCount(0);
}

test("QA_ANALYST can apply views and sees create chrome", async ({ browser }) => {
  const analyst = await findSeededDemoAnalyst();
  const context = await browser.newContext();
  await signInE2EUser(context, analyst, "playwright-qa-saved-views");
  const page = await context.newPage();

  await page.goto("/reviews");
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
  await openQuickViews(page);

  await expect(page.getByRole("link", { name: "Просрочено" })).toBeVisible();
  await expect(page.getByLabel("Сохранить текущий вид")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить" })).toBeVisible();

  await page.getByRole("link", { name: "Просрочено" }).click();
  await expect(page).toHaveURL(/due=overdue/);

  await context.close();
});

test("EXEC can apply existing views but cannot create or delete them", async ({ browser }) => {
  const exec = await findSeededDemoExec();
  const context = await browser.newContext();
  await signInE2EUser(context, exec, "playwright-exec-saved-views");
  const page = await context.newPage();

  await page.goto("/reviews");
  await expectReaderSavedViews(page);

  await context.close();
});

test("SUPPORT_AGENT can apply existing views but cannot create or delete them", async ({ browser }) => {
  const agent = await findSeededDemoAgent();
  const context = await browser.newContext();
  await signInE2EUser(context, agent, "playwright-agent-saved-views");
  const page = await context.newPage();

  await page.goto("/reviews");
  await expectReaderSavedViews(page);

  await context.close();
});

test("VIEWER is denied the reviews queue and saved-view mutate chrome", async ({ browser }) => {
  const viewer = await findSeededDemoViewer();
  const context = await browser.newContext();
  await signInE2EUser(context, viewer, "playwright-viewer-saved-views");
  const page = await context.newPage();

  await page.goto("/reviews");
  await expect(page.getByRole("alert").filter({ hasText: "Недостаточно прав" })).toBeVisible();
  await expect(page.getByText("Недостаточно прав для выполнения операции.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Быстрые виды/ })).toHaveCount(0);
  await expect(page.getByLabel("Сохранить текущий вид")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Сохранить" })).toHaveCount(0);

  await context.close();
});
