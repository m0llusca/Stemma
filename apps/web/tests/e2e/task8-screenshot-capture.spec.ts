import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const screenshotDirectory = resolve(
  process.cwd(),
  "../../.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/task-8/screenshots"
);
const graphHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";
const tableHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score%2Cvolume%2Cprevious%2Ctarget";

async function settleVisuals(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    "graphite"
  );
}

async function settleDeferredCharts(page: Page) {
  const charts = page.locator('[data-slot="deferred-chart-visual"]');
  for (let index = 0; index < (await charts.count()); index += 1) {
    const chart = charts.nth(index);
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toHaveAttribute("data-deferred-state", "ready", {
      timeout: 15_000
    });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

for (const width of [390, 1440] as const) {
  test(`capture Task 8 Graphite surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { level: 1, name: "Сегодня" })
    ).toBeVisible();
    await settleVisuals(page);
    await settleDeferredCharts(page);
    await page.screenshot({
      path: resolve(screenshotDirectory, `dashboard-graphite-${width}.png`),
      fullPage: true,
      animations: "disabled"
    });

    await page.goto(graphHref);
    await expect(
      page.locator(
        'section[role="region"][aria-label="Параметры отчёта"]'
      )
    ).toHaveAttribute("data-hydrated", "true");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Аналитика качества"
      })
    ).toBeVisible();
    await settleVisuals(page);
    await settleDeferredCharts(page);
    await page.screenshot({
      path: resolve(
        screenshotDirectory,
        `reports-overview-graph-graphite-${width}.png`
      ),
      fullPage: true,
      animations: "disabled"
    });

    await page.goto(tableHref);
    await expect(
      page.getByRole("table", {
        name: "Табличные данные: Динамика качества"
      })
    ).toBeVisible();
    await settleVisuals(page);
    await settleDeferredCharts(page);
    await page.screenshot({
      path: resolve(
        screenshotDirectory,
        `reports-overview-table-graphite-${width}.png`
      ),
      fullPage: true,
      animations: "disabled"
    });
  });
}
