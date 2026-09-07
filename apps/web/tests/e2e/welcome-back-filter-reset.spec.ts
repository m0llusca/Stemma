import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { LAST_VISIT_STORAGE_KEY } from "@/lib/guidance/visit-memory";
import { findSeededDemoAnalyst, signInE2EUser } from "./helpers/auth";

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
  // DOM h1 — getByRole misses the title while the exact-filter Sheet is open
  // (active filters set defaultOpen, which marks the page inert).
  await expect(page.locator("h1")).toHaveText("Очередь проверок", { timeout: 15_000 });
}

async function seedStaleLastVisit(page: Page) {
  await page.evaluate((key) => {
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

test("welcome-back reset leaves a shared workspace view for analyst role-home", async ({ page, context }) => {
  const analyst = await findSeededDemoAnalyst();
  await signInE2EUser(context, analyst, "playwright-welcome-back-reset");

  await openQueue(page, "/reviews?process=critical");
  await expect(page).toHaveURL(/process=critical/);

  await seedStaleLastVisit(page);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Очередь проверок", { timeout: 15_000 });

  const banner = page.getByRole("region", { name: "С возвращением" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Критические за период");
  await expect(page.getByRole("region", { name: "Подсказки очереди" })).toHaveCount(0);

  const reset = banner.getByRole("link", { name: "Сбросить к очереди дня" });
  await expect(reset).toHaveAttribute("href", analystResetHref(analyst.name));
  // Active filters open the exact-filter Sheet; dismiss it so the reset is clickable.
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
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
