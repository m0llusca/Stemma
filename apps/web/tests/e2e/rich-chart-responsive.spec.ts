import { expect, test } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow } from "./helpers/layout";

test.setTimeout(120_000);

for (const width of [320, 390]) {
  test(`rich charts retain readable SVG typography and aligned keyboard points at ${width}px`, async ({ page, context }) => {
    await signInE2EUser(context, await findSeededDemoAdmin(), "playwright-rich-chart-responsive");
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["overview", "performance", "process"]) {
      await page.goto(`/reports?period=vk-previous&view=${view}&chartView=graph`);
      const visuals = page.locator('[data-slot="chart"] svg.recharts-surface');
      await expect(visuals.first()).toBeVisible();
      await expect.poll(() => visuals.evaluateAll((nodes) => nodes.every((svg) => Math.abs((svg as SVGSVGElement).viewBox.baseVal.width - svg.getBoundingClientRect().width) < 1))).toBe(true);
      const textMetrics = await visuals.evaluateAll((nodes) => nodes.flatMap((svg) => [...svg.querySelectorAll("text")].map((text) => {
        const ctm = text.getScreenCTM();
        return { text: text.textContent, px: Number.parseFloat(getComputedStyle(text).fontSize) * Math.hypot(ctm?.a ?? 0, ctm?.b ?? 0) };
      })));
      expect(textMetrics.length, `${view} contains actual axis/category labels`).toBeGreaterThan(0);
      expect(textMetrics.filter(({ px }) => px < 10), `${view} effective SVG text size`).toEqual([]);
      await expectNoDocumentOverflow(page);
      if (view === "overview") {
        const plot = page.locator('[data-slot="quality-trend-plot"]');
        await expect(plot.locator('[data-series="score"] circle').first()).toBeVisible();
        await plot.focus();
        // Calendar buckets before the first completed review have no score mark.
        for (let index = 0; index < 40 && await plot.locator('[data-slot="quality-selected-marker"]').count() === 0; index += 1) {
          await page.keyboard.press("ArrowRight");
        }
        await expect(plot.locator('[data-slot="quality-selected-marker"]')).toBeVisible();
        const alignment = await plot.evaluate((node) => {
          const id = node.getAttribute("data-active-point-id");
          const marker = node.querySelector('[data-slot="quality-selected-marker"]')!;
          const point = node.querySelector(`[data-series="score"] circle[data-point-id="${id}"]`)!;
          const a = marker.getBoundingClientRect();
          const b = point.getBoundingClientRect();
          return { dx: Math.abs(a.x + a.width / 2 - b.x - b.width / 2), dy: Math.abs(a.y + a.height / 2 - b.y - b.height / 2) };
        });
        expect(alignment.dx).toBeLessThanOrEqual(1);
        expect(alignment.dy).toBeLessThanOrEqual(1);
        await page.keyboard.press("Escape");
        await expect(plot.locator('[data-slot="quality-selected-marker"]')).toHaveCount(0);
      }
    }
  });
}
