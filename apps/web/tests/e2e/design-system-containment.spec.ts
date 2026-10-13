import { expect, test } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow, rect } from "./helpers/layout";

test.beforeEach(async ({ context }) => {
  await signInE2EUser(context, await findSeededDemoAdmin(), "design-system-containment");
});

for (const width of [320, 390, 768, 1280, 1914]) {
  test(`global navigation controls remain separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    const banner = page.getByRole("banner", { name: "Глобальная навигация" });
    await expect(banner.getByRole("button", { name: "Поиск или команда", exact: true })).toBeVisible();
    const controls = await banner.locator("a,button,summary").evaluateAll((elements) => {
      const banner = elements[0]?.closest("header")?.getBoundingClientRect();
      if (!banner) throw new Error("Navigation banner missing");
      return elements.flatMap((element) => {
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height || box.top < banner.top || box.bottom > banner.bottom) return [];
        return [{ label: element.getAttribute("aria-label") || element.textContent, left: box.left, right: box.right, top: box.top, bottom: box.bottom }];
      });
    });
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const [index, control] of controls.entries()) {
      expect(control.left, `${control.label} left edge`).toBeGreaterThanOrEqual(0);
      expect(control.right, `${control.label} right edge`).toBeLessThanOrEqual(width);
      for (const other of controls.slice(index + 1)) {
        const horizontalOverlap = Math.min(control.right, other.right) - Math.max(control.left, other.left);
        const verticalOverlap = Math.min(control.bottom, other.bottom) - Math.max(control.top, other.top);
        expect(horizontalOverlap > 1 && verticalOverlap > 1, `${control.label} overlaps ${other.label}`).toBe(false);
      }
    }
    const pulse = banner.getByRole("button", { name: "Рабочий пульс", exact: true });
    const queueLink = banner.locator('a[aria-label^="Очередь:"]');
    if (width < 1024) {
      await expect(pulse).toBeVisible();
      await expect(queueLink).not.toBeVisible();
      await pulse.click();
      const menu = page.getByRole("menu", { name: "Рабочий пульс", exact: true });
      await expect(menu.getByRole("menuitem")).toHaveCount(3);
      await page.keyboard.press("Escape");
      await expect(menu).not.toBeVisible();
      await expect(pulse).toBeFocused();
    } else {
      await expect(pulse).not.toBeVisible();
      await expect(queueLink).toBeVisible();
    }
    // Compact labels still expose the original controls and their keyboard flow.
    await banner.getByRole("button", { name: /^Профиль:/ }).click();
    await expect(banner.getByRole("button", { name: "Выйти", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(banner.getByRole("button", { name: "Выйти", exact: true })).not.toBeVisible();
    await expectNoDocumentOverflow(page);
  });
}

test("narrow chart cards keep their description above their view controls", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/reports");
    const charts = page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="chart-frame-content"]') });
    await expect(charts.first()).toBeVisible();
    for (const card of await charts.all()) {
      const header = card.locator(':scope > [data-slot="card-header"]');
      const action = header.locator('[data-slot="card-action"]');
      const description = header.locator('[data-slot="card-description"]');
      if (await description.count()) {
        const [descriptionBox, actionBox] = await Promise.all([rect(description), rect(action)]);
        expect(descriptionBox.width, "chart copy retains the card width").toBeGreaterThan(width - 80);
        expect(actionBox.y, "chart controls follow the full description").toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height);
      }
      const [cardBox, actionBox] = await Promise.all([rect(card), rect(action)]);
      expect(actionBox.x).toBeGreaterThanOrEqual(cardBox.x);
      expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    }
    await expectNoDocumentOverflow(page);
  }
});

test("long review breadcrumbs stay inside the mobile page shell", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/reviews");
  const links = page.locator('tbody a[href^="/reviews/"]');
  await expect(links.first()).toBeVisible();
  const href = await links.evaluateAll((elements) => [...elements]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]?.getAttribute("href"));
  expect(href).toBeTruthy();
  await page.goto(href!);
  const breadcrumb = page.getByRole("navigation", { name: "Навигационная цепочка", exact: true });
  const shell = page.locator('[data-slot="page-shell"]');
  const [crumbBox, shellBox] = await Promise.all([rect(breadcrumb), rect(shell)]);
  expect(crumbBox.x).toBeGreaterThanOrEqual(shellBox.x);
  expect(crumbBox.x + crumbBox.width).toBeLessThanOrEqual(shellBox.x + shellBox.width);
  expect(await breadcrumb.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
  await expectNoDocumentOverflow(page);
});

test("ranked report names remain readable beside their metrics and actions", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/reports?view=performance&period=vk-previous");
    const panel = page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "По операторам", exact: true }) });
    const names = panel.locator("article h3");
    await expect(names.first()).toBeVisible();
    for (const name of await names.all()) {
      expect((await rect(name)).width, "operator names must not collapse behind metrics").toBeGreaterThan(80);
      const contained = await name.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].every((box) => box.left >= bounds.left - 1 && box.right <= bounds.right + 1);
      });
      expect(contained, "complete operator names fit inside their visible text column").toBe(true);
    }
    await expectNoDocumentOverflow(page);
  }
});

test("mobile triage actions follow the full-width copy", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/reports");
    const strip = page.locator('[data-slot="triage-strip"]');
    const [copy, action, banner] = await Promise.all([
      rect(strip.locator('[data-slot="triage-strip-copy"]')),
      rect(strip.locator('[data-slot="triage-strip-action"]')),
      rect(strip)
    ]);
    expect(action.y).toBeGreaterThanOrEqual(copy.y + copy.height);
    expect(copy.width).toBeGreaterThan(banner.width - 40);
    expect(action.width).toBeGreaterThan(banner.width - 40);
    await expectNoDocumentOverflow(page);
  }
});
