import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

type QueueLayout = {
  bodyHeight: number;
  controlsHeight: number;
  gapToQueue: number;
  quickViewsHeight: number;
};

type StickyQueueLayout = {
  controlsBottom: number;
  controlsHeight: number;
  controlsPaddingLeft: number;
  controlsPaddingRight: number;
  controlsPosition: string;
  isStuck: boolean;
  queueTop: number;
  slotHeight: number;
  slotMinHeight: number;
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

async function scrollQueueControlsToSticky(page: Page) {
  await page.evaluate(() => {
    const slot = document.querySelector(".queue-controls-bar__slot");
    const topbarHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-topbar-height")) || 0;
    const slotTop = slot ? slot.getBoundingClientRect().top + window.scrollY : 0;

    window.scrollTo(0, Math.max(0, slotTop - topbarHeight + 16));
  });

  await page.waitForFunction(() => {
    const controls = document.querySelector(".queue-controls-bar");

    return controls?.classList.contains("queue-controls-bar--stuck") && getComputedStyle(controls).position === "fixed";
  });
}

async function readStickyQueueLayout(page: Page): Promise<StickyQueueLayout> {
  return await page.evaluate(() => {
    const controls = document.querySelector(".queue-controls-bar");
    const slot = document.querySelector(".queue-controls-bar__slot");
    const queue = document.querySelector(".queue-list, .queue-empty-state");
    const controlsRect = controls?.getBoundingClientRect();
    const slotRect = slot?.getBoundingClientRect();
    const queueRect = queue?.getBoundingClientRect();
    const slotMinHeight = slot ? Number.parseFloat(getComputedStyle(slot).minHeight) || 0 : 0;
    const controlsStyle = controls ? getComputedStyle(controls) : null;

    return {
      controlsBottom: controlsRect?.bottom ?? 0,
      controlsHeight: controlsRect?.height ?? 0,
      controlsPaddingLeft: controlsStyle ? Number.parseFloat(controlsStyle.paddingLeft) || 0 : 0,
      controlsPaddingRight: controlsStyle ? Number.parseFloat(controlsStyle.paddingRight) || 0 : 0,
      controlsPosition: controls ? getComputedStyle(controls).position : "",
      isStuck: controls?.classList.contains("queue-controls-bar--stuck") ?? false,
      queueTop: queueRect?.top ?? 0,
      slotHeight: slotRect?.height ?? 0,
      slotMinHeight
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

  await scrollQueueControlsToSticky(page);
  const stickyLayout = await readStickyQueueLayout(page);
  const queueClearsFixedControls = stickyLayout.queueTop >= stickyLayout.controlsBottom - 2;
  const slotStillReservesSpace = stickyLayout.slotHeight > 0 && stickyLayout.slotMinHeight > 0;

  expect(stickyLayout.isStuck, "queue controls should enter sticky state after scrolling").toBe(true);
  expect(stickyLayout.controlsPosition, "sticky queue controls should be fixed").toBe("fixed");
  expect(stickyLayout.controlsPaddingLeft, "sticky queue controls should keep a small desktop left padding").toBeGreaterThanOrEqual(8);
  expect(stickyLayout.controlsPaddingLeft, "sticky queue controls should keep only a small desktop left padding").toBeLessThanOrEqual(12);
  expect(stickyLayout.controlsPaddingRight, "sticky queue controls should keep a small desktop right padding").toBeGreaterThanOrEqual(8);
  expect(stickyLayout.controlsPaddingRight, "sticky queue controls should keep only a small desktop right padding").toBeLessThanOrEqual(12);
  expect(
    queueClearsFixedControls || slotStillReservesSpace,
    `queueTop=${stickyLayout.queueTop}, controlsBottom=${stickyLayout.controlsBottom}, slotHeight=${stickyLayout.slotHeight}, slotMinHeight=${stickyLayout.slotMinHeight}`
  ).toBe(true);
});

test("quick views keep the filter panel height stable after repeated toggles", async ({ page }) => {
  await signInThroughDemo(page);
  await page.goto("/reviews");

  const quickViews = page.locator(".queue-quick-views").first();
  const quickViewsToggle = quickViews.locator("summary").filter({ hasText: /Быстрые виды/ });
  const firstBox = await quickViews.boundingBox();
  expect(firstBox).not.toBeNull();

  for (let index = 0; index < 6; index += 1) {
    await quickViewsToggle.click();
  }

  const secondBox = await quickViews.boundingBox();
  expect(secondBox).not.toBeNull();
  expect(Math.abs((secondBox?.height ?? 0) - (firstBox?.height ?? 0))).toBeLessThan(24);
});
