import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { rect } from "./helpers/layout";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

type QueueLayout = {
  bodyHeight: number;
  commandBarHeight: number;
  expandedOnlyHeight: number;
  gapToList: number;
};

async function signInThroughDemo(page: Page) {
  await page.goto("/auth/login?returnTo=/reviews");

  await page.getByRole("button", { name: /Демо-вход/ }).click();
  await page.getByRole("button", { name: "Войти в демо-режиме" }).click();

  await expect(page).toHaveURL(/\/reviews$/);
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
}

async function readQueueLayout(
  page: Page,
  commandBar: Locator,
  expandedOnly: Locator,
  queueList: Locator
): Promise<QueueLayout> {
  const [commandBarBox, expandedOnlyBox, queueListBox, bodyHeight] = await Promise.all([
    rect(commandBar),
    rect(expandedOnly),
    rect(queueList),
    page.evaluate(() => document.body.scrollHeight)
  ]);

  return {
    bodyHeight,
    commandBarHeight: commandBarBox.height,
    expandedOnlyHeight: expandedOnlyBox.height,
    gapToList: queueListBox.y - (commandBarBox.y + commandBarBox.height)
  };
}

async function scrollCommandBarToSticky(page: Page, sentinel: Locator) {
  await sentinel.evaluate((node) => {
    const topbarHeight =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--app-topbar-height")
      ) || 0;
    const sentinelTop = node.getBoundingClientRect().top + window.scrollY;

    window.scrollTo(0, Math.max(0, sentinelTop - topbarHeight + 16));
  });
}

test("queue quick views do not accumulate vertical layout gap when toggled", async ({ page }) => {
  await signInThroughDemo(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const workspace = page.locator('[data-slot="review-queue-workspace"]');
  const sentinel = page.locator('[data-slot="review-queue-command-sentinel"]');
  const commandBar = page.locator('[data-slot="review-queue-command-bar"]');
  const expandedOnly = commandBar.locator("[data-expanded-only]");
  const quickViewsToggle = commandBar.getByRole("button", { name: /Быстрые виды/ });
  const queueList = page.locator('[data-slot="review-queue-list"]');

  await expect(workspace).toBeVisible();
  await expect(commandBar).toHaveAttribute("data-state", "resting");
  await expect(quickViewsToggle).toBeVisible();
  await expect(quickViewsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(queueList).toBeVisible();

  const collapsedBaseline = await readQueueLayout(page, commandBar, expandedOnly, queueList);

  for (let cycle = 0; cycle < 4; cycle += 1) {
    await quickViewsToggle.click();
    await expect(quickViewsToggle).toHaveAttribute("aria-expanded", "true");
    const expanded = await readQueueLayout(page, commandBar, expandedOnly, queueList);

    expect.soft(expanded.gapToList, `expanded cycle ${cycle + 1} gap`).toBeLessThanOrEqual(collapsedBaseline.gapToList + 8);
    expect
      .soft(expanded.commandBarHeight, `expanded cycle ${cycle + 1} command-bar height`)
      .toBeLessThanOrEqual(collapsedBaseline.commandBarHeight + 320);
    expect
      .soft(expanded.expandedOnlyHeight, `expanded cycle ${cycle + 1} saved-views height`)
      .toBeLessThanOrEqual(collapsedBaseline.expandedOnlyHeight + 320);
    expect
      .soft(expanded.bodyHeight, `expanded cycle ${cycle + 1} body height`)
      .toBeLessThanOrEqual(collapsedBaseline.bodyHeight + 360);

    await quickViewsToggle.click();
    await expect(quickViewsToggle).toHaveAttribute("aria-expanded", "false");
    const collapsed = await readQueueLayout(page, commandBar, expandedOnly, queueList);

    expect.soft(collapsed.gapToList, `collapsed cycle ${cycle + 1} gap`).toBeLessThanOrEqual(collapsedBaseline.gapToList + 8);
    expect
      .soft(collapsed.commandBarHeight, `collapsed cycle ${cycle + 1} command-bar height`)
      .toBeLessThanOrEqual(collapsedBaseline.commandBarHeight + 8);
    expect
      .soft(collapsed.expandedOnlyHeight, `collapsed cycle ${cycle + 1} saved-views height`)
      .toBeLessThanOrEqual(collapsedBaseline.expandedOnlyHeight + 8);
    expect
      .soft(collapsed.bodyHeight, `collapsed cycle ${cycle + 1} body height`)
      .toBeLessThanOrEqual(collapsedBaseline.bodyHeight + 24);
  }

  await scrollCommandBarToSticky(page, sentinel);
  await expect(commandBar).toHaveAttribute("data-state", "stuck");
  expect(await commandBar.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
  expect((await rect(commandBar)).x).toBeGreaterThanOrEqual((await rect(workspace)).x - 1);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(commandBar).toHaveAttribute("data-state", "resting");
});

test("queue quick views and pagination keep mobile actions usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await signInThroughDemo(page);

  const commandBar = page.locator('[data-slot="review-queue-command-bar"]');
  const expandedOnly = commandBar.locator("[data-expanded-only]");
  const quickViewsToggle = commandBar.getByRole("button", { name: /Быстрые виды/ });

  await expect(commandBar).toHaveAttribute("data-state", "resting");
  await expect(quickViewsToggle).toBeVisible();
  const firstBox = await rect(expandedOnly);

  for (let index = 0; index < 6; index += 1) {
    await quickViewsToggle.click();
  }

  await expect(quickViewsToggle).toHaveAttribute("aria-expanded", "false");
  const secondBox = await rect(expandedOnly);
  expect(Math.abs(secondBox.height - firstBox.height)).toBeLessThan(24);

  const nextPage = page.getByRole("link", {
    name: "Перейти на следующую страницу очереди"
  });
  await expect(nextPage).toBeVisible();
  await expect(nextPage.getByText("Показать ещё", { exact: true })).toBeVisible();
  await expect(nextPage).toHaveAttribute("href", "/reviews?page=2");
  await nextPage.click();
  await expect(page).toHaveURL(/\/reviews\?page=2$/);

  const previousPage = page.getByRole("link", {
    name: "Перейти на предыдущую страницу очереди"
  });
  await expect(previousPage).toBeVisible();
  await expect(previousPage.getByText("Назад", { exact: true })).toBeVisible();
  await expect(previousPage).toHaveAttribute("href", "/reviews");
});

test("queue command bar keeps resting controls usable without IntersectionObserver", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: undefined
    });
  });

  try {
    await signInThroughDemo(page);
    await page.goto("/reviews");

    const commandBar = page.locator('[data-slot="review-queue-command-bar"]');
    await expect(commandBar).toHaveAttribute("data-state", "resting");
    expect(await commandBar.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
    await expect(page.getByLabel("Поиск в очереди проверок")).toBeEditable();
  } finally {
    await context.close();
  }
});
