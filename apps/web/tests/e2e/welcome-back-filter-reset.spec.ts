import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { LAST_VISIT_STORAGE_KEY } from "@/lib/guidance/visit-memory";
import { findSeededDemoAnalyst, findSeededDemoLead, signInE2EUser } from "./helpers/auth";

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

function analystResetHref(name: string) {
  return `/reviews?qaAssignee=${encodeURIComponent(name)}&due=overdue`;
}

async function openQueue(page: Page, path = "/reviews") {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible({ timeout: 15_000 });
}

async function seedStaleLastVisitBeforeNavigation(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString());
  }, LAST_VISIT_STORAGE_KEY);
}

test("first paint of /reviews does not silently apply a workspace saved view", async ({ page, context }) => {
  const analyst = await findSeededDemoAnalyst();
  await signInE2EUser(context, analyst, "playwright-welcome-back-first-paint");

  await openQueue(page);
  await expect(page).toHaveURL((url) => url.pathname === "/reviews" && url.search === "");
  await expect(page.getByRole("region", { name: "С возвращением" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Быстрые виды" })).toBeVisible();
  await expect(page.getByText("Все", { exact: true }).first()).toBeVisible();

  const reset = page.getByRole("button", { name: "Сбросить фильтры" });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveAttribute("href", analystResetHref(analyst.name));
});

test("day-1 glossary is a single SLA/OTRS hint, not a tour", async ({ page, context }) => {
  const analyst = await findSeededDemoAnalyst();
  await signInE2EUser(context, analyst, "playwright-welcome-back-glossary");

  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await openQueue(page);

  const hint = page.getByRole("region", { name: "Подсказки очереди" });
  await expect(hint).toBeVisible();
  await expect(hint.getByText("SLA и OTRS")).toBeVisible();
  await expect(hint.getByText(/контрольный срок проверки/i)).toBeVisible();
  await expect(hint.getByText(/типичный helpdesk-источник/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Далее" })).toHaveCount(0);

  await page.getByRole("button", { name: /^точные фильтры/i }).click();
  await expect(page.getByRole("button", { name: /что такое sla/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /что такое otrs/i })).toBeVisible();
});

test("welcome-back reset is one click when active filters would open the sheet", async ({
  page,
  context
}) => {
  const analyst = await findSeededDemoAnalyst();
  await signInE2EUser(context, analyst, "playwright-welcome-back-reset");
  await seedStaleLastVisitBeforeNavigation(page);

  await openQueue(page, "/reviews?process=critical");
  await expect(page).toHaveURL(/process=critical/);
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);

  const banner = page.getByRole("region", { name: "С возвращением" });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-trap-kind", "workspace");
  await expect(banner).toContainText("Критические за период");
  await expect(page.getByRole("region", { name: "Подсказки очереди" })).toHaveCount(0);

  const reset = banner.getByRole("link", { name: "Сбросить к очереди дня" });
  await expect(reset).toHaveAttribute("href", analystResetHref(analyst.name));
  await reset.click();

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/reviews" &&
      url.searchParams.get("qaAssignee") === analyst.name &&
      url.searchParams.get("due") === "overdue" &&
      !url.searchParams.has("process")
    );
  });
  await expect(page.getByRole("region", { name: "С возвращением" })).toHaveCount(0);
});

test("welcome-back names ad-hoc filters that are not role-home", async ({ page, context }) => {
  const analyst = await findSeededDemoAnalyst();
  await signInE2EUser(context, analyst, "playwright-welcome-back-adhoc");
  await seedStaleLastVisitBeforeNavigation(page);

  await openQueue(page, "/reviews?channel=CHAT");
  await expect(page).toHaveURL(/channel=CHAT/);
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);

  const banner = page.getByRole("region", { name: "С возвращением" });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-trap-kind", "adhoc");
  await expect(banner).toContainText("текущие фильтры не совпадают с очередью дня");
  await expect(banner).not.toContainText("общий вид");

  const reset = banner.getByRole("link", { name: "Сбросить к очереди дня" });
  await expect(reset).toHaveAttribute("href", analystResetHref(analyst.name));
  await reset.click();

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/reviews" &&
      url.searchParams.get("qaAssignee") === analyst.name &&
      url.searchParams.get("due") === "overdue" &&
      !url.searchParams.has("channel")
    );
  });
});

test("lead dashboard welcome-back reset goes to role-home /dashboard", async ({ page, context }) => {
  const lead = await findSeededDemoLead();
  await signInE2EUser(context, lead, "playwright-welcome-back-lead-dashboard");
  await seedStaleLastVisitBeforeNavigation(page);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible({ timeout: 15_000 });

  const banner = page.getByRole("region", { name: "С возвращением" });
  await expect(banner).toBeVisible();
  const reset = banner.getByRole("link", { name: "Сбросить к очереди дня" });
  await expect(reset).toHaveAttribute("href", "/dashboard");
  await expect(reset).not.toHaveAttribute("href", "/reviews");
  await reset.click();

  await expect(page).toHaveURL((url) => url.pathname === "/dashboard" && url.search === "");
});
