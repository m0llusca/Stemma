import { expect, test } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow } from "./helpers/layout";

test.setTimeout(120_000);

for (const width of [390, 1280]) {
  test(`initial Recharts geometry fits before responsive measurement at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    // ResponsiveContainer checks for ResizeObserver before its initial DOM
    // measurement. Removing this optional API preserves positive initialDimension
    // while React still paints the real SVG, making the CI first-paint race
    // deterministic. A callback-only observer stub would still measure first.
    await context.addInitScript(() => {
      Object.defineProperty(window, "ResizeObserver", { configurable: true, value: undefined });
    });
    await signInE2EUser(context, await findSeededDemoAdmin(), "playwright-chart-initial-sizing");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    for (const route of ["/dashboard", "/reports?view=overview&chartView=graph"]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      const surfaces = page.locator('[data-slot="chart"] svg.recharts-surface');
      await expect(surfaces.first()).toBeVisible();
      expect(await surfaces.count(), `${route} retains visible Recharts SVG graphs`).toBeGreaterThan(0);
      if (route === "/dashboard") {
        // The numeric geometry must remain the configured first-paint geometry;
        // a completed measurement would hide the responsive-layout regression.
        const initialGeometry = await page.locator('[data-slot="chart"] .recharts-wrapper').evaluateAll((elements) => elements.map((element) => {
          const chart = element.closest('[data-slot="chart"]') as HTMLElement;
          return { width: Number(element.getAttribute("width")), initialWidth: Number(chart.dataset.initialWidth), height: element.getBoundingClientRect().height };
        }));
        expect(initialGeometry.length).toBeGreaterThan(0);
        for (const geometry of initialGeometry) {
          expect(geometry.width).toBe(geometry.initialWidth);
          expect(geometry.width).toBeGreaterThan(0);
          expect(geometry.height).toBeGreaterThan(0);
        }
      }
      await expectNoDocumentOverflow(page);
      const overflow = await page.locator('[data-slot="chart"] .recharts-wrapper, [data-slot="chart"] svg.recharts-surface').evaluateAll((elements) => elements.flatMap((element) => {
        const chart = element.closest('[data-slot="chart"]');
        if (!chart) return [];
        const plot = element.getBoundingClientRect();
        const container = chart.getBoundingClientRect();
        return plot.width > container.width + 2 || plot.right > container.right + 2 || plot.left < container.left - 2
          ? [{ chart: chart.getAttribute("data-chart"), plotWidth: plot.width, containerWidth: container.width, plotLeft: plot.left, plotRight: plot.right, containerLeft: container.left, containerRight: container.right }]
          : [];
      }));
      expect(overflow, `${route}: complete initial chart geometry stays inside its container`).toEqual([]);
    }
    expect(errors, "chart registration remains functional before responsive measurements").toEqual([]);
  });
}
