import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

type QueueLayout = {
  bodyHeight: number;
  controlsHeight: number;
  gapToQueue: number;
  quickViewsHeight: number;
};

async function signInThroughDemo(page: Page) {
  await page.goto("/auth/login?returnTo=/reviews");

  await page.locator("summary").filter({ hasText: "Демо-вход" }).click();
  await page.getByRole("button", { name: "Войти в демо-режиме" }).click();

  await expect(page).toHaveURL(/\/reviews$/);
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
}

async function readQueueLayout(quickViews: Locator): Promise<QueueLayout> {
  return await quickViews.evaluate((quickViewsElement) => {
    const document = quickViewsElement.ownerDocument;
    const controls = document.querySelector(".queue-controls-bar");
    const queue = document.querySelector(".queue-list, .queue-empty-state");
    const controlsRect = controls?.getBoundingClientRect();
    const queueRect = queue?.getBoundingClientRect();
    const quickViewsRect = quickViewsElement.getBoundingClientRect();

    return {
      bodyHeight: document.body.scrollHeight,
      controlsHeight: controlsRect?.height ?? 0,
      gapToQueue: controlsRect && queueRect ? queueRect.top - controlsRect.bottom : 0,
      quickViewsHeight: quickViewsRect.height
    };
  });
}

test("reviews quick views do not accumulate vertical layout gap when toggled", async ({ page }) => {
  await signInThroughDemo(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const quickViews = page.locator(".queue-quick-views");
  const quickViewsToggle = quickViews.locator("summary").filter({ hasText: /Быстрые виды/ });
  const queueList = page.locator(".queue-list, .queue-empty-state");

  await expect(quickViews).toBeVisible();
  await expect(quickViewsToggle).toBeVisible();
  await expect(quickViewsToggle).toContainText(/Раскрыть|Свернуть|Скрыть/);
  await expect(queueList).toBeVisible();

  const collapsedBaseline = await readQueueLayout(quickViews);

  for (let cycle = 0; cycle < 4; cycle += 1) {
    await quickViewsToggle.click();
    await expect(quickViews).toHaveJSProperty("open", true);
    const expanded = await readQueueLayout(quickViews);

    expect.soft(expanded.gapToQueue, `expanded cycle ${cycle + 1} gap`).toBeLessThanOrEqual(collapsedBaseline.gapToQueue + 8);
    expect
      .soft(expanded.controlsHeight, `expanded cycle ${cycle + 1} controls height`)
      .toBeLessThanOrEqual(collapsedBaseline.controlsHeight + 320);
    expect.soft(expanded.quickViewsHeight, `expanded cycle ${cycle + 1} quick views height`).toBeLessThanOrEqual(320);
    expect
      .soft(expanded.bodyHeight, `expanded cycle ${cycle + 1} body height`)
      .toBeLessThanOrEqual(collapsedBaseline.bodyHeight + 360);

    await quickViewsToggle.click();
    await expect(quickViews).toHaveJSProperty("open", false);
    const collapsed = await readQueueLayout(quickViews);

    expect.soft(collapsed.gapToQueue, `collapsed cycle ${cycle + 1} gap`).toBeLessThanOrEqual(collapsedBaseline.gapToQueue + 8);
    expect
      .soft(collapsed.controlsHeight, `collapsed cycle ${cycle + 1} controls height`)
      .toBeLessThanOrEqual(collapsedBaseline.controlsHeight + 8);
    expect
      .soft(collapsed.quickViewsHeight, `collapsed cycle ${cycle + 1} quick views height`)
      .toBeLessThanOrEqual(collapsedBaseline.quickViewsHeight + 8);
    expect
      .soft(collapsed.bodyHeight, `collapsed cycle ${cycle + 1} body height`)
      .toBeLessThanOrEqual(collapsedBaseline.bodyHeight + 24);
  }
});
