import { expect, test, type Locator, type Page } from "@playwright/test";
import { buildReportCatalogSlug } from "@/lib/reports/report-filter-slug";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow, rect } from "./helpers/layout";

const certifiedWidths = [320, 390, 640, 641, 720, 768, 1023, 1280, 1440] as const;
const reportStates = [
  ["overview", "graph"],
  ["overview", "table"],
  ["performance", "graph"],
  ["performance", "table"],
  ["process", "graph"],
  ["process", "table"],
  ["details", "graph"]
] as const;

const canonicalOverviewHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";
const longFilterHref = `/reports?view=overview&period=vk-current&compare=previous&grain=week&team=${encodeURIComponent(
  buildReportCatalogSlug("Процессные эскалации")
)}&source=freshdesk&risk=high_plus&block=${encodeURIComponent(
  buildReportCatalogSlug("Процессы")
)}&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget`;

test.setTimeout(180_000);

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  await signInE2EUser(context, admin, "playwright-report-visualization-layout");
});

async function gridTracks(locator: Locator) {
  return locator.evaluate((node) =>
    getComputedStyle(node)
      .gridTemplateColumns.split(/\s+/)
      .filter(Boolean)
  );
}

async function expectChildrenContainedInRow(locator: Locator) {
  const owner = await rect(locator);
  const children = locator.locator(":scope > *:visible");
  const count = await children.count();

  for (let index = 0; index < count; index += 1) {
    const child = await rect(children.nth(index));
    expect(child.y, `child ${index} starts inside the report lens`).toBeGreaterThanOrEqual(
      owner.y - 1
    );
    expect(
      child.y + child.height,
      `child ${index} ends inside the report lens`
    ).toBeLessThanOrEqual(owner.y + owner.height + 1);
  }
}

async function expectReportLensOwnsHorizontalScroll(
  page: Page,
  lens: Locator
) {
  const parameterRail = lens.locator('form[action="/reports"]');
  const actionRail = lens.locator(":scope > *").nth(1);
  const chipRail = lens.locator(":scope > *").nth(2);
  const step = lens.getByLabel("Шаг");
  const savedViewAction = lens.getByRole("button", {
    name: /Сохранённый вид/
  });
  const lastChip = lens.getByText("Ещё 1", { exact: true });
  await expect(parameterRail).toBeVisible();
  await expect(actionRail).toBeVisible();
  await expect(chipRail).toBeVisible();
  await expect(step).toBeVisible();
  await expect(savedViewAction).toBeVisible();
  await expect(lastChip).toBeVisible();

  const geometry = await parameterRail.evaluate((node) => {
    const lensNode = node.closest<HTMLElement>(
      '[aria-label="Параметры отчёта"]'
    );
    const stepNode = node.querySelector<HTMLElement>("#analysis-grain");
    if (!lensNode || !stepNode) {
      throw new Error("Report lens geometry owners are missing");
    }

    const lensBox = lensNode.getBoundingClientRect();
    const formBox = node.getBoundingClientRect();
    const stepBox = stepNode.getBoundingClientRect();
    return {
      viewportRight: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      lensRight: lensBox.right,
      lensClientWidth: lensNode.clientWidth,
      lensScrollWidth: lensNode.scrollWidth,
      formRight: formBox.right,
      formClientWidth: node.clientWidth,
      formScrollWidth: node.scrollWidth,
      stepRight: stepBox.right,
      formOverflowX: getComputedStyle(node).overflowX,
      rails: Array.from(lensNode.children).map((child, index) => {
        const rail = child as HTMLElement;
        return {
          index,
          right: rail.getBoundingClientRect().right,
          clientWidth: rail.clientWidth,
          scrollWidth: rail.scrollWidth,
          overflowX: getComputedStyle(rail).overflowX
        };
      })
    };
  });
  const diagnostic = JSON.stringify(geometry);

  expect(geometry.lensRight, diagnostic).toBeLessThanOrEqual(
    geometry.viewportRight + 1
  );
  expect(
    geometry.lensScrollWidth - geometry.lensClientWidth,
    diagnostic
  ).toBeLessThanOrEqual(1);
  expect(geometry.formRight, diagnostic).toBeLessThanOrEqual(
    geometry.lensRight + 1
  );
  expect(geometry.formClientWidth, diagnostic).toBeGreaterThan(0);
  expect(geometry.formScrollWidth, diagnostic).toBeGreaterThan(
    geometry.formClientWidth
  );
  expect(geometry.formOverflowX, diagnostic).toMatch(/auto|scroll/);
  expect(geometry.rails, diagnostic).toHaveLength(3);
  for (const rail of geometry.rails) {
    expect(rail.right, diagnostic).toBeLessThanOrEqual(geometry.lensRight + 1);
    expect(rail.clientWidth, diagnostic).toBeGreaterThan(0);
    expect(rail.scrollWidth, diagnostic).toBeGreaterThan(rail.clientWidth);
    expect(rail.overflowX, diagnostic).toMatch(/auto|scroll/);
  }

  await parameterRail.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  const [formBox, stepBox] = await Promise.all([
    rect(parameterRail),
    rect(step)
  ]);
  const visibleStepWidth =
    Math.min(stepBox.x + stepBox.width, formBox.x + formBox.width) -
    Math.max(stepBox.x, formBox.x);
  expect(visibleStepWidth, diagnostic).toBeGreaterThanOrEqual(
    Math.min(stepBox.width, formBox.width) - 2
  );
  expect(stepBox.x + stepBox.width, diagnostic).toBeLessThanOrEqual(
    formBox.x + formBox.width + 1
  );
  await step.focus();
  await expect(step).toBeFocused();

  await actionRail.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  const [actionBox, savedViewBox] = await Promise.all([
    rect(actionRail),
    rect(savedViewAction)
  ]);
  const visibleSavedViewWidth =
    Math.min(savedViewBox.x + savedViewBox.width, actionBox.x + actionBox.width) -
    Math.max(savedViewBox.x, actionBox.x);
  expect(visibleSavedViewWidth, diagnostic).toBeGreaterThanOrEqual(
    Math.min(savedViewBox.width, actionBox.width) - 2
  );
  expect(savedViewBox.x + savedViewBox.width, diagnostic).toBeLessThanOrEqual(
    actionBox.x + actionBox.width + 1
  );
  await savedViewAction.focus();
  await expect(savedViewAction).toBeFocused();

  await chipRail.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  const [chipRailBox, lastChipBox] = await Promise.all([
    rect(chipRail),
    rect(lastChip)
  ]);
  const visibleLastChipWidth =
    Math.min(
      lastChipBox.x + lastChipBox.width,
      chipRailBox.x + chipRailBox.width
    ) - Math.max(lastChipBox.x, chipRailBox.x);
  expect(visibleLastChipWidth, diagnostic).toBeGreaterThanOrEqual(
    Math.min(lastChipBox.width, chipRailBox.width) - 2
  );
  expect(lastChipBox.x + lastChipBox.width, diagnostic).toBeLessThanOrEqual(
    chipRailBox.x + chipRailBox.width + 1
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollLeft || document.body.scrollLeft
    )
  ).toBe(0);
  await expectNoDocumentOverflow(page);
}

async function expectReportDocumentContained(page: Page, context: string) {
  const diagnostics = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const overflow =
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth;
    const xOwnerValues = new Set(["auto", "scroll", "hidden", "clip"]);
    const candidates = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || box.right <= viewportWidth + 2) {
          return false;
        }

        let owner = element.parentElement;
        while (owner && owner !== document.body) {
          if (xOwnerValues.has(getComputedStyle(owner).overflowX)) {
            return owner.getBoundingClientRect().right > viewportWidth + 2;
          }
          owner = owner.parentElement;
        }
        return true;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          slot: element.dataset.slot ?? null,
          id: element.id || null,
          ariaLabel: element.getAttribute("aria-label"),
          className: element.className.toString().slice(0, 180),
          left: Math.round(box.left * 100) / 100,
          right: Math.round(box.right * 100) / 100,
          width: Math.round(box.width * 100) / 100,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: style.overflowX
        };
      })
      .sort((left, right) => right.right - left.right)
      .slice(0, 12);

    return {
      url: window.location.href,
      viewportWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      overflow,
      candidates
    };
  });

  expect(
    diagnostics.overflow,
    `${context}: ${JSON.stringify(diagnostics)}`
  ).toBeLessThanOrEqual(2);
}

async function expectExactColumnRatio(region: Locator, ratio: number) {
  const first = await rect(region.locator(":scope > *").nth(0));
  const second = await rect(region.locator(":scope > *").nth(1));
  expect(first.width / second.width).toBeCloseTo(ratio, 1);
}

for (const width of certifiedWidths) {
  test(`report lens remains a contained 56px row at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(longFilterHref);

    const lens = page.getByRole("region", { name: "Параметры отчёта" });
    await expect(lens).toBeVisible();
    const lensBox = await rect(lens);
    expect(lensBox.height).toBeLessThanOrEqual(58);
    expect(
      await lens.evaluate((node) => getComputedStyle(node).flexDirection)
    ).toBe("row");
    await expectChildrenContainedInRow(lens);

    const chips = page.getByTestId("active-report-filter-chip");
    await expect(chips).toHaveCount(3);
    await expect(lens.getByText("Ещё 1", { exact: true })).toBeVisible();
    const chipStrip = chips.first().locator("..");
    expect(
      await chipStrip.evaluate((node) => getComputedStyle(node).overflowX)
    ).toMatch(/auto|scroll/);

    if (width === 320) {
      await expectReportLensOwnsHorizontalScroll(page, lens);
    } else {
      await expectNoDocumentOverflow(page);
    }
  });
}

for (const [width, height, expectedPosition] of [
  [1023, 900, "static"],
  [1024, 699, "static"],
  [1024, 700, "sticky"]
] as const) {
  test(`report lens sticky boundary is ${expectedPosition} at ${width}x${height}`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(longFilterHref);

    const lens = page.getByRole("region", { name: "Параметры отчёта" });
    await expect(lens).toBeVisible();
    expect(await lens.evaluate((node) => getComputedStyle(node).position)).toBe(
      expectedPosition
    );

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);

    if (expectedPosition === "sticky") {
      const topbar = page.locator("header").first();
      const lensBox = await rect(lens);
      const topbarBox = await rect(topbar);
      expect(
        Math.abs(lensBox.y - topbarBox.height),
        "sticky lens top stays within 2px of the topbar edge"
      ).toBeLessThanOrEqual(2);
      expect(
        await lens.evaluate((node) => getComputedStyle(node).backgroundColor)
      ).not.toBe("rgba(0, 0, 0, 0)");
      const [lensZ, topbarZ] = await Promise.all([
        lens.evaluate((node) => Number(getComputedStyle(node).zIndex)),
        topbar.evaluate((node) => Number(getComputedStyle(node).zIndex))
      ]);
      expect(lensZ).toBeLessThan(topbarZ);

      const target = page.locator("#chart-quality-overview-title");
      await target.evaluate((node) => {
        const heading = node as HTMLElement;
        heading.tabIndex = -1;
        heading.focus();
        heading.scrollIntoView({ block: "start" });
      });
      const [targetBox, stickyBox] = await Promise.all([rect(target), rect(lens)]);
      expect(targetBox.y).toBeGreaterThanOrEqual(
        stickyBox.y + stickyBox.height + 6
      );
    }

    await expectNoDocumentOverflow(page);
  });
}

for (const width of [320, 390, 768, 1280] as const) {
  test(`report KPI tracks match the responsive contract at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(canonicalOverviewHref);

    const grid = page.getByRole("list", {
      name: "Ключевые показатели периода"
    });
    const tiles = grid.getByRole("listitem");
    const tracks = await gridTracks(grid);
    expect(tracks).toHaveLength(width === 320 ? 1 : width < 1280 ? 2 : 6);

    const gridBox = await rect(grid);
    const heroBox = await rect(tiles.nth(0));

    if (width === 320) {
      expect(heroBox.width).toBeCloseTo(gridBox.width, 0);
      const firstSupport = await rect(tiles.nth(1));
      const secondSupport = await rect(tiles.nth(2));
      expect(firstSupport.x).toBeCloseTo(secondSupport.x, 0);
      expect(secondSupport.y).toBeGreaterThan(firstSupport.y);
    } else if (width < 1280) {
      expect(heroBox.width).toBeCloseTo(gridBox.width, 0);
      const firstSupport = await rect(tiles.nth(1));
      const secondSupport = await rect(tiles.nth(2));
      const thirdSupport = await rect(tiles.nth(3));
      expect(firstSupport.y).toBeCloseTo(secondSupport.y, 0);
      expect(secondSupport.x).toBeGreaterThan(firstSupport.x);
      expect(thirdSupport.y).toBeGreaterThan(firstSupport.y);
    } else {
      const tileBoxes = await Promise.all(
        Array.from({ length: 5 }, (_, index) => rect(tiles.nth(index)))
      );
      for (const tile of tileBoxes.slice(1)) {
        expect(tile.y).toBeCloseTo(tileBoxes[0].y, 0);
      }
      const columnGap = await grid.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).columnGap)
      );
      const expectedHeroWidth =
        Number.parseFloat(tracks[0]) + Number.parseFloat(tracks[1]) + columnGap;
      expect(tileBoxes[0].width).toBeCloseTo(expectedHeroWidth, 0);
      expect(tileBoxes[0].width).toBeCloseTo(
        tileBoxes[1].width * 2 + columnGap,
        0
      );
      expect(tileBoxes[0].width / expectedHeroWidth).toBeCloseTo(1, 2);
      await expect(tiles.nth(0)).toHaveAttribute(
        "data-desktop-track-span",
        "2"
      );
    }

    await expectNoDocumentOverflow(page);
  });
}

for (const width of [768, 1280] as const) {
  test(`overview main pairs ${width < 1280 ? "stack" : "use 2:1 tracks"} at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(canonicalOverviewHref);

    for (const name of [
      "Динамика качества и факторы",
      "Распределение оценок и связь с CSAT"
    ]) {
      const region = page.getByRole("region", { name });
      const first = await rect(region.locator(":scope > *").nth(0));
      const second = await rect(region.locator(":scope > *").nth(1));
      if (width < 1280) {
        expect(second.y).toBeGreaterThan(first.y + first.height - 1);
      } else {
        expect(second.y).toBeCloseTo(first.y, 0);
        await expectExactColumnRatio(region, 2);
      }
    }
  });
}

for (const width of [320, 390, 640] as const) {
  test(`mobile report filters fill the viewport at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(canonicalOverviewHref);

    // Wait for lens hydration so the filter trigger has its click handlers
    // attached; slower engines (webkit) otherwise drop the pre-hydration tap.
    const lens = page.getByRole("region", { name: "Параметры отчёта" });
    await expect(lens).toHaveAttribute("data-hydrated", "true");
    const trigger = page.getByRole("button", { name: /^Фильтры \(/ });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "Фильтры отчёта" });
    await expect(sheet).toHaveAttribute("data-slot", "sheet-content");
    const box = await rect(sheet);
    expect(box.width).toBeCloseTo(width, 0);
    expect(box.height).toBeCloseTo(900, 0);
    await expect(sheet.getByRole("button", { name: "Закрыть" })).toBeVisible();
    await sheet.getByRole("button", { name: "Закрыть" }).click();
    await expect(trigger).toBeFocused();
  });
}

test("desktop report filters use a Popover at 641px", async ({ page }) => {
  await page.setViewportSize({ width: 641, height: 900 });
  await page.goto(canonicalOverviewHref);

  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  const trigger = page.getByRole("button", { name: /^Фильтры \(/ });
  await trigger.click();

  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(
    popover.getByText("Фильтры отчёта", { exact: true })
  ).toBeVisible();
  const popoverBox = await rect(popover);
  expect(popoverBox.width).toBeLessThan(641);
  expect(popoverBox.height).toBeLessThan(900);

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(trigger).toBeFocused();
  await expectNoDocumentOverflow(page);
});

for (const width of [320, 390, 640, 768, 1280] as const) {
  test(`report evidence Sheet preserves geometry and exact focus at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(canonicalOverviewHref);

    const lens = page.getByRole("region", { name: "Параметры отчёта" });
    await expect(lens).toHaveAttribute("data-hydrated", "true");
    const trigger = page.getByRole("button", {
      name: "Показать данные выбранного среза"
    });
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "Данные и примеры" });
    const box = await rect(sheet);
    if (width <= 640) {
      expect(box.width).toBeCloseTo(width, 0);
      expect(box.height).toBeCloseTo(900, 0);
    } else {
      expect(box.width).toBeGreaterThanOrEqual(384);
      expect(box.width).toBeLessThanOrEqual(448);
    }
    const close = sheet.getByRole("button", { name: "Закрыть" });
    await expect(close).toBeVisible();
    await close.click();
    await expect(trigger).toBeFocused();
  });
}

test("evidence Sheet survives reload and preserves push-history focus fallbacks", async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // domcontentloaded: after a long single-worker webkit run the document
  // commits but a late subresource can stall the load event; readiness below
  // is certified by the data-hydrated wait, not by the load event.
  await page.goto(canonicalOverviewHref, { waitUntil: "domcontentloaded" });
  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  const lensOwner = page.locator(
    'section[role="region"][aria-label="Параметры отчёта"]'
  );
  await expect(lens).toHaveAttribute("data-hydrated", "true");

  const chartHeading = page.getByRole("heading", {
    name: "Динамика качества",
    exact: true
  });
  await expect(chartHeading).toHaveAttribute(
    "id",
    "chart-quality-overview-title"
  );
  await page
    .getByRole("button", { name: "Показать данные выбранного среза" })
    .click();

  const evidenceSheet = page.getByRole("dialog", {
    name: "Данные и примеры"
  });
  await expect(evidenceSheet).toBeVisible();
  await expect(page).toHaveURL(/(?:\?|&)evidenceType=/);
  await expect(page).toHaveURL(/(?:\?|&)evidenceKey=/);
  const evidenceUrl = page.url();

  await page.reload();
  await expect(page).toHaveURL(evidenceUrl);
  await expect(lensOwner).toHaveAttribute("data-hydrated", "true");
  await expect(evidenceSheet).toBeVisible();

  await evidenceSheet.getByRole("button", { name: "Закрыть" }).click();
  await expect(page).not.toHaveURL(/(?:\?|&)evidenceType=/);
  await expect(page).not.toHaveURL(/(?:\?|&)evidenceKey=/);
  await expect(evidenceSheet).toBeHidden();
  await expect(chartHeading).toBeFocused();
  const closedUrl = page.url();

  await page.goBack();
  await expect(page).toHaveURL(evidenceUrl);
  await expect(lensOwner).toHaveAttribute("data-hydrated", "true");
  await expect(evidenceSheet).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(closedUrl);
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  await expect(evidenceSheet).toBeHidden();
  await expect(chartHeading).toBeFocused();
});

test("Graph/Table, filter, evidence, history, and reload keep one URL authority", async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);

  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  const comparison = page.getByLabel("Сравнение");
  await expect(comparison).toBeEnabled();
  await comparison.selectOption("none");
  await expect(page).toHaveURL(/compare=none/);
  await expect(comparison).toHaveValue("none");
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);

  await page.getByRole("link", { name: "Таблица" }).first().click();
  await expect(page).toHaveURL(/chartView=table/);
  await expect(page).toHaveURL(/compare=none/);
  // In-page reload: the Playwright firefox driver's Page.reload pushes an
  // extra session-history entry, which would shift the goBack target below.
  await page.evaluate(() => window.location.reload());
  await page.waitForLoadState("load");
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByLabel("Сравнение")).toHaveValue("none");
  await expect(
    page.getByRole("link", { name: "Таблица" }).first()
  ).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/chartView=graph/);
  await expect(page).toHaveURL(/compare=previous/);
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByLabel("Сравнение")).toHaveValue("previous");
  await expect(
    page.getByRole("link", { name: "График" }).first()
  ).toHaveAttribute("aria-current", "page");
  const restoredQualityTrendPlot = page.locator(
    '[data-slot="quality-trend-plot"]'
  );
  await expect(restoredQualityTrendPlot).toHaveCount(1);
  await expect(restoredQualityTrendPlot).toBeVisible();
  await expect(
    page.getByRole("table", {
      name: "Табличные данные: Динамика качества"
    })
  ).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/chartView=table/);
  await expect(page).toHaveURL(/compare=none/);
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByLabel("Сравнение")).toHaveValue("none");
  await expect(
    page.getByRole("link", { name: "Таблица" }).first()
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("table", {
      name: "Табличные данные: Динамика качества"
    })
  ).toBeVisible();
  await expect(
    page.locator('[data-slot="quality-trend-plot"]')
  ).toHaveCount(0);

  const evidenceTrigger = page.getByRole("button", {
    name: "Показать данные выбранного среза"
  });
  await evidenceTrigger.click();
  await expect(page).toHaveURL(/evidenceType=/);
  const evidenceSheet = page.getByRole("dialog", {
    name: "Данные и примеры"
  });
  await expect(evidenceSheet).toBeVisible();
  await expect(evidenceSheet.getByText("Сравнение", { exact: true })).toBeVisible();
  await expect(evidenceSheet.getByText("Выборка", { exact: true })).toBeVisible();
  await expect(
    evidenceSheet.getByText("Данные больше недоступны", { exact: true })
  ).toHaveCount(0);

  await evidenceSheet.getByRole("button", { name: "Закрыть" }).click();
  await expect(evidenceSheet).toBeHidden();
  await expect(evidenceTrigger).toBeFocused();
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);

  await expect(comparison).toBeVisible();
  await expect(comparison).toBeEnabled();
  await comparison.selectOption("year");
  await expect(page).toHaveURL(/compare=year/);
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);
});

test("criterion matrix uses the page heading as its single scroll-region name", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(
    "/reports?view=performance&period=vk-current&compare=previous&grain=day&chartView=graph&series=score"
  );

  const matrix = page.getByRole("region", { name: "Операторы × критерии" });
  await expect(matrix).toBeVisible();
  await expect(matrix).toHaveAttribute("tabindex", "0");
  await matrix.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  expect(await matrix.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await expectNoDocumentOverflow(page);
});

for (const width of certifiedWidths) {
  test(`all report views and Graph/Table stay contained at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });

    for (const [view, chartView] of reportStates) {
      await page.goto(
        `/reports?view=${view}&period=vk-current&compare=previous&grain=day&chartView=${chartView}&series=score%2Cvolume%2Cprevious%2Ctarget`
      );
      await expect(
        page.getByRole("region", { name: "Параметры отчёта" })
      ).toBeVisible();
      await expectReportDocumentContained(
        page,
        `${width}px ${view}/${chartView}`
      );
    }

    await page.goto(longFilterHref);
    await expectReportDocumentContained(page, `${width}px filtered overview`);
  });
}
