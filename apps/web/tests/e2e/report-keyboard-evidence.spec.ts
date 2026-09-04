import { expect, test, type Locator, type Page } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

// Task 10 keyboard/evidence certification (brief section 9.2).
//
// Deterministic demo data is required: the web server must run against the
// dedicated verify database seeded with DEMO_SEED_NOW=2026-09-03T09:00:00.000Z,
// which guarantees a non-empty vk-current quality trend and movement factors.
//
// Certified contracts exercised here (Task 5/6/7/8):
// - one app-owned plot tab stop: [data-accessibility-layer="app-owned"],
//   roving active point via data-active-point-id, aria-keyshortcuts,
//   non-focusable aria-hidden Recharts SVG (task-5-report.md);
// - Evidence Sheet (dialog "Данные и примеры"): focus trap, Escape close,
//   exact-trigger focus restore, deep-link close falls back to the relevant
//   chart heading id (task-7-report.md, report-evidence-sheet.tsx);
// - Graph/Table parity through ChartDataTable ("Табличные данные: …") and the
//   shared ChartModel (chart-data-table.tsx, lib/charts/builders.ts).

const canonicalGraphHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";
const canonicalTableHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score%2Cvolume%2Cprevious%2Ctarget";

const trendPlotSelector = '[data-slot="quality-trend-plot"]';
const driverPlotSelector =
  '[data-accessibility-layer="app-owned"][aria-label="Факторы изменения"]';
const sheetContentSelector = '[data-slot="sheet-content"]';
const focusableSelector =
  'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

test.setTimeout(240_000);

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  await signInE2EUser(context, admin, "playwright-report-keyboard-evidence");
});

function collectUnexpectedConsole(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      messages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
  return messages;
}

async function openReports(page: Page, href: string) {
  await page.goto(href);
  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  return lens;
}

async function expectChartVisualReady(plot: Locator) {
  await expect(
    plot.locator('[data-slot="deferred-chart-visual"]')
  ).toHaveAttribute("data-deferred-state", /ready|waiting|loading/);
}

/**
 * Reads the app-owned live tooltip (role="tooltip") rendered next to the
 * active chart point: `label` is the point label, `lines` maps the visible
 * dt labels to dd values.
 */
async function readTooltip(plot: Locator) {
  return plot.evaluate((node) => {
    const tooltip = node.querySelector('[role="tooltip"]');
    if (!tooltip) {
      return null;
    }

    const lines: Record<string, string> = {};
    for (const row of tooltip.querySelectorAll("dl > div")) {
      const term = row.querySelector("dt")?.textContent?.trim();
      const value = row.querySelector("dd")?.textContent?.trim();
      if (term && value) {
        lines[term] = value;
      }
    }

    return {
      label: tooltip.querySelector("p")?.textContent?.trim() ?? "",
      lines
    };
  });
}

/** Presses Tab until the focused element matches `selector` (bounded scan). */
async function tabTo(page: Page, selector: string, maxTabs: number) {
  const visited: string[] = [];

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate((focusTarget) => {
      const element = document.activeElement as HTMLElement | null;
      return {
        matches: Boolean(element?.matches(focusTarget)),
        summary: element
          ? [
              element.tagName.toLowerCase(),
              element.id ? `#${element.id}` : "",
              element.getAttribute("data-slot")
                ? `[data-slot=${element.getAttribute("data-slot")}]`
                : "",
              element.getAttribute("aria-label")
                ? `[aria-label=${element.getAttribute("aria-label")}]`
                : ""
            ].join("")
          : "(none)"
      };
    }, selector);
    visited.push(active.summary);
    if (active.matches) {
      return visited;
    }
  }

  throw new Error(
    `Tab never reached ${selector} within ${maxTabs} stops. Visited:\n${visited.join("\n")}`
  );
}

async function activeElementInside(page: Page, selector: string) {
  return page.evaluate((containerSelector) => {
    const container = document.querySelector(containerSelector);
    return Boolean(
      container &&
        document.activeElement &&
        container.contains(document.activeElement)
    );
  }, selector);
}

/** Mirrors src/lib/score-display.ts — the certified rounding contract. */
function qualityScorePointWord(value: number) {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return "баллов";
  }
  if (last === 1) {
    return "балл";
  }
  if (last >= 2 && last <= 4) {
    return "балла";
  }
  return "баллов";
}

function expectedTooltipScore(tableValue: number | null) {
  if (tableValue == null) {
    return "Нет данных";
  }
  const score = Math.max(0, Math.min(100, Math.round(tableValue)));
  return `${score} ${qualityScorePointWord(score)}`;
}

function reviewCountWord(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return "проверок";
  }
  if (last === 1) {
    return "проверка";
  }
  if (last >= 2 && last <= 4) {
    return "проверки";
  }
  return "проверок";
}

function parseRussianNumber(text: string): number | null {
  if (text === "Нет данных") {
    return null;
  }
  // ru-RU formatting may use NBSP/narrow-NBSP group separators and a comma
  // decimal separator.
  const normalized = text
    .replace(/[\s  ]/g, "")
    .replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Table cell is not a ru-RU number: "${text}"`);
  }
  return value;
}

type TrendTableData = {
  headers: string[];
  rows: Array<{ label: string; href: string | null; cells: string[] }>;
};

async function readTrendTable(page: Page): Promise<TrendTableData> {
  const table = page.getByRole("table", {
    name: "Табличные данные: Динамика качества"
  });
  await expect(table).toBeVisible();
  return table.evaluate((node) => {
    const headers = Array.from(node.querySelectorAll("thead th")).map(
      (cell) => cell.textContent?.trim() ?? ""
    );
    const rows = Array.from(node.querySelectorAll("tbody tr")).map((row) => {
      const rowHeader = row.querySelector("th");
      const link = rowHeader?.querySelector("a");
      return {
        label: rowHeader?.textContent?.trim() ?? "",
        href: link?.getAttribute("href") ?? null,
        cells: Array.from(row.querySelectorAll("td")).map(
          (cell) => cell.textContent?.trim() ?? ""
        )
      };
    });
    return { headers, rows };
  });
}

function evidenceParams(url: string) {
  const parsed = new URL(url, "http://localhost:3000");
  return {
    pathname: parsed.pathname,
    evidenceType: parsed.searchParams.get("evidenceType"),
    evidenceKey: parsed.searchParams.get("evidenceKey")
  };
}

test("keyboard journey: parameter lens → chart tab stop → arrow selection → Enter opens the Evidence Sheet → Escape closes and restores focus", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const lens = await openReports(page, canonicalGraphHref);

  // 1. Journey starts inside the parameter lens region.
  const period = lens.getByLabel("Период");
  await period.focus();
  await expect(period).toBeFocused();
  expect(
    await activeElementInside(
      page,
      'section[role="region"][aria-label="Параметры отчёта"]'
    ),
    "keyboard journey starts inside the report parameter lens"
  ).toBe(true);

  // 2. Tab reaches the single app-owned chart tab stop.
  await tabTo(page, trendPlotSelector, 80);
  const plot = page.locator(trendPlotSelector);
  await expect(plot).toBeFocused();
  await expect(plot).toHaveAttribute("data-accessibility-layer", "app-owned");
  await expect(plot).toHaveAttribute("tabindex", "0");
  await expect(plot).toHaveRole("group");
  await expect(plot).toHaveAttribute(
    "aria-roledescription",
    "интерактивный график"
  );
  await expect(plot).toHaveAttribute(
    "aria-keyshortcuts",
    "ArrowLeft ArrowRight Enter Escape"
  );

  // The trend card owns exactly one app-owned tab stop and no focusable
  // descendants; the presentation SVG stays aria-hidden.
  const trendCard = page.locator(
    'div[data-slot="card"][aria-labelledby="chart-quality-overview-title"]'
  );
  await expect(
    trendCard.locator('[data-accessibility-layer="app-owned"]')
  ).toHaveCount(1);
  await expect(
    plot.locator('[data-slot="deferred-chart-visual"]')
  ).toHaveAttribute("data-deferred-state", "ready");
  const focusableInsidePlot = await plot.evaluate(
    (node, selector) => node.querySelectorAll(selector).length,
    focusableSelector
  );
  expect(
    focusableInsidePlot,
    "the app-owned plot is the only tab stop of the chart surface"
  ).toBe(0);
  const svgAccessibility = await plot.evaluate((node) =>
    Array.from(node.querySelectorAll("svg")).map(
      (svg) => svg.getAttribute("aria-hidden") ?? "missing"
    )
  );
  for (const [index, hidden] of svgAccessibility.entries()) {
    expect(hidden, `chart svg ${index} stays aria-hidden`).toBe("true");
  }

  // 3. Focus selects the first point; arrows rove; the URL never mutates.
  const urlBeforeInspection = page.url();
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-1");
  await expect(plot.locator('[role="tooltip"]')).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-2");
  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-3");
  await page.keyboard.press("ArrowLeft");
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-2");
  const tooltip = await readTooltip(plot);
  expect(tooltip, "arrow selection shows the linked tooltip").not.toBeNull();
  expect(tooltip!.lines, "tooltip carries the certified fact lines").toEqual(
    expect.objectContaining({
      "Средний балл": expect.any(String),
      "Выборка": expect.any(String)
    })
  );
  expect(
    page.url(),
    "keyboard inspection must not mutate the URL"
  ).toBe(urlBeforeInspection);

  // 4. Enter opens evidence for the selected point. Gap days carry no evidence
  // href by design (resolving one would be a dead end), so rove back to the
  // first point and then forward to the first data-bearing day — the pinned
  // demo seed intentionally leaves missing-day null gaps in the period.
  await page.keyboard.press("ArrowLeft");
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-1");
  let dataPointReached = false;
  for (let step = 0; step < 40 && !dataPointReached; step += 1) {
    const currentTooltip = await readTooltip(plot);
    const sample = currentTooltip?.lines["Выборка"];
    if (sample && sample !== "Нет данных" && !sample.startsWith("0 ")) {
      dataPointReached = true;
      break;
    }
    await page.keyboard.press("ArrowRight");
  }
  expect(
    dataPointReached,
    "the seeded period exposes a data-bearing trend point"
  ).toBe(true);
  const enteredPointId = await plot.getAttribute("data-active-point-id");
  expect(enteredPointId, "a trend point is selected before Enter").not.toBeNull();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/(?:\?|&)evidenceType=trend/);
  await expect(page).toHaveURL(/(?:\?|&)evidenceKey=ev1_/);
  const sheet = page.getByRole("dialog", { name: "Данные и примеры" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-slot", "sheet-content");

  // 5. Navigation inside the Sheet: the review list is reachable, focus stays
  //    trapped in both directions.
  await expect(
    sheet.getByRole("heading", { name: "Проверки" })
  ).toBeVisible();
  const reviewLinks = sheet.locator('a[href^="/reviews/"]');
  expect(
    await reviewLinks.count(),
    "evidence sheet lists review links"
  ).toBeGreaterThan(0);

  const focusedReviewHrefs = new Set<string>();
  let closeButtonFocused = false;
  for (let index = 0; index < 15; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await activeElementInside(page, sheetContentSelector),
      `Tab stop ${index + 1} stays inside the evidence Sheet`
    ).toBe(true);
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return {
        href: element?.getAttribute("href") ?? null,
        text: element?.textContent?.trim() ?? ""
      };
    });
    if (focused.href?.startsWith("/reviews/")) {
      focusedReviewHrefs.add(focused.href);
    }
    if (focused.text === "Закрыть") {
      closeButtonFocused = true;
    }
  }
  expect(
    focusedReviewHrefs.size,
    "keyboard navigation reaches evidence review links inside the Sheet"
  ).toBeGreaterThan(0);
  expect(closeButtonFocused, "keyboard navigation reaches the Закрыть control").toBe(
    true
  );
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(
      await activeElementInside(page, sheetContentSelector),
      `Shift+Tab stop ${index + 1} stays inside the evidence Sheet`
    ).toBe(true);
  }

  // 6. Escape closes the Sheet, cleans the URL, and returns focus to the
  //    app-owned origin; the selection feedback stays visible.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);
  await expect(plot).toBeFocused();
  await expect(plot).toHaveAttribute("data-active-point-id", enteredPointId!);

  expect(consoleMessages, "keyboard journey console").toEqual([]);
});

test("factor chart supports arrow-key factor selection and Escape reset without URL mutation", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openReports(page, canonicalGraphHref);

  const driverPlot = page.locator(driverPlotSelector);
  await expect(driverPlot).toBeVisible();
  await expect(driverPlot).toHaveAttribute("tabindex", "0");
  await expect(driverPlot).toHaveAttribute(
    "aria-keyshortcuts",
    "ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape"
  );
  await expectChartVisualReady(driverPlot);

  const urlBefore = page.url();
  const trendPlot = page.locator(trendPlotSelector);
  await trendPlot.focus();
  await expect(trendPlot).toBeFocused();
  // Keyboard-only hop from the trend plot to the factor plot.
  await tabTo(page, driverPlotSelector, 40);
  await expect(driverPlot).toBeFocused();
  await expect(driverPlot).toHaveAttribute("data-active-point-id", "driver-1");
  await expect(driverPlot.locator('[role="tooltip"]')).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(driverPlot).toHaveAttribute("data-active-point-id", "driver-2");
  await page.keyboard.press("ArrowUp");
  await expect(driverPlot).toHaveAttribute("data-active-point-id", "driver-1");
  const tooltip = await readTooltip(driverPlot);
  expect(tooltip, "factor tooltip renders on arrow selection").not.toBeNull();
  expect(tooltip!.lines).toEqual(
    expect.objectContaining({
      "Изменение": expect.any(String),
      "Выборка": expect.any(String)
    })
  );

  await page.keyboard.press("Escape");
  await expect(driverPlot).not.toHaveAttribute(
    "data-active-point-id",
    /driver-/
  );
  expect(
    page.url(),
    "factor inspection must not mutate the URL"
  ).toBe(urlBefore);

  expect(consoleMessages, "factor chart console").toEqual([]);
});

test("Sheet opened from the trigger returns focus to the exact trigger; deep-link close focuses the relevant chart heading", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openReports(page, canonicalGraphHref);

  const trigger = page.getByRole("button", {
    name: "Показать данные выбранного среза"
  });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const sheet = page.getByRole("dialog", { name: "Данные и примеры" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/(?:\?|&)evidenceType=/);
  const evidenceUrl = page.url();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);
  await expect(
    trigger,
    "trigger-opened Sheet restores focus to the exact trigger"
  ).toBeFocused();

  // Deep link: a fresh document load with the evidence URL — no trigger was
  // ever interacted with, so closing must focus the relevant chart heading.
  await page.goto(evidenceUrl);
  // The Evidence Sheet opens directly from the deep link and, as a modal,
  // aria-hides the rest of the page: the lens has no accessible name while the
  // Sheet is open, so the hydration wait must use attributes, not role+name.
  const lensAfterDeepLink = page.locator(
    'section[role="region"][aria-label="Параметры отчёта"]'
  );
  await expect(lensAfterDeepLink).toHaveAttribute("data-hydrated", "true");
  await expect(sheet).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);
  const focusedHeading = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return {
      id: element?.id ?? null,
      tag: element?.tagName.toLowerCase() ?? null,
      text: element?.textContent?.trim() ?? null
    };
  });
  expect(
    focusedHeading.id,
    `deep-link close focuses the overview chart heading (got ${JSON.stringify(focusedHeading)})`
  ).toBe("chart-quality-overview-title");
  await expect(
    page.getByRole("heading", { name: "Динамика качества", exact: true })
  ).toBeFocused();

  expect(consoleMessages, "trigger/deep-link focus console").toEqual([]);
});

test("Graph/Table parity: same facts, order, rounding, units, and null handling", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Table representation is the fact source.
  await openReports(page, canonicalTableHref);
  const tableUnitsText = await page
    .locator('div[data-slot="card"][aria-labelledby="chart-quality-overview-title"]')
    .getByText(/^Единицы:/)
    .innerText();
  const tableData = await readTrendTable(page);
  expect(tableData.rows.length, "trend table has rows").toBeGreaterThan(0);
  expect(tableData.headers[0], "x-axis column matches the model").toBe("Дата");

  // Every series column advertises a unit listed in the card units line.
  for (const header of tableData.headers.slice(1)) {
    const unit = header.split(", ").at(-1) ?? "";
    expect(
      tableUnitsText.includes(unit),
      `column "${header}" unit "${unit}" appears in "${tableUnitsText}"`
    ).toBe(true);
  }

  const scoreColumn = tableData.headers.indexOf("Средний балл, баллы качества");
  const sampleColumn = tableData.headers.indexOf("Выборка, количество");
  expect(scoreColumn, "score column exists").toBeGreaterThan(0);
  expect(sampleColumn, "sample column exists").toBeGreaterThan(0);

  // Graph representation.
  await openReports(page, canonicalGraphHref);
  const graphUnitsText = await page
    .locator('div[data-slot="card"][aria-labelledby="chart-quality-overview-title"]')
    .getByText(/^Единицы:/)
    .innerText();
  expect(
    graphUnitsText,
    "Graph and Table advertise identical units"
  ).toBe(tableUnitsText);

  const plot = page.locator(trendPlotSelector);
  await plot.focus();
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-1");
  await expect(
    plot.locator('[data-slot="deferred-chart-visual"]')
  ).toHaveAttribute("data-deferred-state", "ready");

  const graphPoints: Array<{ label: string; lines: Record<string, string> }> = [];
  for (let index = 0; index < tableData.rows.length; index += 1) {
    await expect(plot).toHaveAttribute(
      "data-active-point-id",
      `trend-${index + 1}`
    );
    const tooltip = await readTooltip(plot);
    expect(tooltip, `tooltip for point ${index + 1}`).not.toBeNull();
    graphPoints.push(tooltip!);
    if (index < tableData.rows.length - 1) {
      await page.keyboard.press("ArrowRight");
    }
  }

  // The plot exposes exactly the table's rows — the roving index clamps at the
  // last point instead of inventing extra facts.
  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute(
    "data-active-point-id",
    `trend-${tableData.rows.length}`
  );

  // Order parity: point labels equal row labels, same sequence.
  expect(
    graphPoints.map((point) => point.label),
    "Graph point order matches Table row order"
  ).toEqual(tableData.rows.map((row) => row.label));

  // Value, rounding, and null parity per point.
  for (const [index, row] of tableData.rows.entries()) {
    const tooltip = graphPoints[index];
    const tableScore = parseRussianNumber(row.cells[scoreColumn - 1]);
    expect(
      tooltip.lines["Средний балл"],
      `point ${index + 1} (${row.label}) score parity`
    ).toBe(expectedTooltipScore(tableScore));

    const tableSample = parseRussianNumber(row.cells[sampleColumn - 1]);
    const expectedSample =
      tableSample == null
        ? "Нет данных"
        : `${tableSample} ${reviewCountWord(tableSample)}`;
    expect(
      tooltip.lines["Выборка"],
      `point ${index + 1} (${row.label}) sample parity`
    ).toBe(expectedSample);
  }

  expect(consoleMessages, "Graph/Table parity console").toEqual([]);
});

test("Graph/Table parity: evidence targets match between Enter on a point and the table row link", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  await openReports(page, canonicalTableHref);
  const tableData = await readTrendTable(page);
  const linkedIndex = tableData.rows.findIndex((row) => row.href != null);
  expect(linkedIndex, "trend table has at least one evidence link").toBeGreaterThanOrEqual(0);
  const tableEvidence = evidenceParams(tableData.rows[linkedIndex].href!);
  expect(tableEvidence.pathname).toBe("/reports");
  expect(tableEvidence.evidenceType).toBe("trend");
  expect(tableEvidence.evidenceKey).toMatch(/^ev1_[A-Za-z0-9_-]{43}$/);

  await openReports(page, canonicalGraphHref);
  const plot = page.locator(trendPlotSelector);
  await plot.focus();
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-1");
  for (let step = 0; step < linkedIndex; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(plot).toHaveAttribute(
    "data-active-point-id",
    `trend-${linkedIndex + 1}`
  );
  await page.keyboard.press("Enter");

  const sheet = page.getByRole("dialog", { name: "Данные и примеры" });
  await expect(sheet).toBeVisible();
  const graphEvidence = evidenceParams(page.url());
  expect(
    { type: graphEvidence.evidenceType, key: graphEvidence.evidenceKey },
    "Enter on the graph point targets the same evidence as the table row link"
  ).toEqual({
    type: tableEvidence.evidenceType,
    key: tableEvidence.evidenceKey
  });

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  expect(consoleMessages, "evidence parity console").toEqual([]);
});

test.describe("touch interaction", () => {
  test.use({ hasTouch: true });

  test("first touch inspects the chart without mutating the URL and controls stay available", async ({
    page
  }) => {
    const consoleMessages = collectUnexpectedConsole(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await openReports(page, canonicalGraphHref);

    const plot = page.locator(trendPlotSelector);
    await plot.scrollIntoViewIfNeeded();
    await expectChartVisualReady(plot);
    const box = await plot.boundingBox();
    expect(box, "trend plot geometry").not.toBeNull();

    const urlBefore = page.url();
    // First touch: inspection only.
    await page.touchscreen.tap(
      box!.x + box!.width * 0.85,
      box!.y + box!.height * 0.6
    );
    await expect(plot).toHaveAttribute("data-active-point-id", /^trend-\d+$/);
    const firstPointId = await plot.getAttribute("data-active-point-id");
    await expect(plot.locator('[role="tooltip"]')).toBeVisible();
    expect(page.url(), "first touch must not mutate the URL").toBe(urlBefore);
    await expect(
      page.getByRole("dialog", { name: "Данные и примеры" })
    ).toHaveCount(0);

    // A second touch keeps inspecting (roving selection), still no URL change.
    await page.touchscreen.tap(
      box!.x + box!.width * 0.15,
      box!.y + box!.height * 0.6
    );
    await expect(plot).toHaveAttribute("data-active-point-id", /^trend-\d+$/);
    const secondPointId = await plot.getAttribute("data-active-point-id");
    expect(
      secondPointId,
      "touch on a different x position selects a different point"
    ).not.toBe(firstPointId);
    expect(page.url(), "touch inspection must not mutate the URL").toBe(
      urlBefore
    );

    // Explicit controls remain available under touch: the evidence trigger
    // opens the Sheet and Закрыть closes it.
    const trigger = page.getByRole("button", {
      name: "Показать данные выбранного среза"
    });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.tap();
    const sheet = page.getByRole("dialog", { name: "Данные и примеры" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/(?:\?|&)evidenceType=/);
    await sheet.getByRole("button", { name: "Закрыть" }).tap();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);

    expect(consoleMessages, "touch interaction console").toEqual([]);
  });
});
