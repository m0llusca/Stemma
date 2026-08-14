import { expect, test, type Page } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

const canonicalOverviewHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";
// Well-formed but unknown descriptors: the parser accepts the shape, the
// server-side resolver never rebuilds them from the workspace catalog.
const foreignEvidenceKey = `ev1_${"A".repeat(43)}`;
const staleEvidenceKey = `ev1_${"b".repeat(42)}9`;
const evidenceKeyPattern = /^ev1_[A-Za-z0-9_-]{43}$/;
const unavailableEvidenceTitle = "Данные больше недоступны";
const unavailableEvidenceDescription =
  "Выбранный фрагмент нельзя открыть. Обновите отчёт и попробуйте снова.";

test.setTimeout(180_000);

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

function searchParam(page: Page, name: string) {
  return new URL(page.url()).searchParams.get(name);
}

function historyLength(page: Page) {
  return page.evaluate(() => window.history.length);
}

async function expectHydratedReportLens(page: Page) {
  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  return lens;
}

async function normalizedDialogText(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Данные и примеры" });
  await expect(dialog).toBeVisible();
  return (await dialog.innerText()).replace(/\s+/g, " ").trim();
}

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  await signInE2EUser(context, admin, "playwright-report-history-state");
});

test("Back, Forward, and reload restore filters, representation, series, and the open Evidence Sheet", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);
  await expectHydratedReportLens(page);

  const comparison = page.getByLabel("Сравнение");
  const graphLink = page.getByRole("link", { name: "График" }).first();
  const tableLink = page.getByRole("link", { name: "Таблица" }).first();
  const plot = page.locator('[data-slot="quality-trend-plot"]');
  const dataTable = page.getByRole("table", {
    name: "Табличные данные: Динамика качества"
  });
  const evidenceDialog = page.getByRole("dialog", { name: "Данные и примеры" });
  const legend = page.getByRole("group", { name: "Ряды графика" }).first();

  await expect(comparison).toHaveValue("previous");
  await expect(graphLink).toHaveAttribute("aria-current", "page");
  await expect(plot).toHaveCount(1);
  for (const label of [
    "Средний балл",
    "Прошлый период",
    "Цель 90 баллов",
    "Проверки"
  ]) {
    await expect(legend.getByRole("button", { name: label })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  }
  expect(searchParam(page, "series")).toBe("score,volume,previous,target");
  const canonicalUrl = page.url();

  // Filter change: pushes a new history entry and clears nothing else.
  await comparison.selectOption("none");
  await expect(page).toHaveURL(/compare=none/);
  await expect(comparison).toHaveValue("none");
  const filteredUrl = page.url();

  // Representation change: replaces the current entry (presentation is not a
  // separate analysis state), so the filtered entry becomes the table entry.
  await tableLink.click();
  await expect(page).toHaveURL(/chartView=table/);
  await expect(tableLink).toHaveAttribute("aria-current", "page");
  await expect(dataTable).toBeVisible();
  await expect(plot).toHaveCount(0);
  const tableUrl = page.url();
  expect(tableUrl).not.toBe(filteredUrl);

  // Evidence open: pushes a dedicated history entry with the evidence pair.
  const evidenceTrigger = page.getByRole("button", {
    name: "Показать данные выбранного среза"
  });
  await evidenceTrigger.click();
  await expect(evidenceDialog).toBeVisible();
  await expect(page).toHaveURL(/(?:\?|&)evidenceType=/);
  expect(searchParam(page, "evidenceKey")).toMatch(evidenceKeyPattern);
  const evidenceUrl = page.url();

  // Reload restores filters, representation, series, and the open Sheet.
  await page.reload();
  await expect(page).toHaveURL(evidenceUrl);
  // The Evidence Sheet reopens from the evidence URL and, as a modal,
  // aria-hides the rest of the page: the lens has no accessible name while
  // the Sheet is open, so the hydration wait uses attributes, not role+name.
  await expect(
    page.locator('section[role="region"][aria-label="Параметры отчёта"]')
  ).toHaveAttribute("data-hydrated", "true");
  // The Sheet is open (modal; the page is aria-hidden), so these checks use
  // attribute locators instead of role queries — same defect class as D7.
  await expect(
    page.locator('select[aria-label="Сравнение"]')
  ).toHaveValue("none");
  await expect(
    page.locator("a", { hasText: "Таблица" }).first()
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.locator('table[aria-label="Табличные данные: Динамика качества"]')
  ).toBeVisible();
  await expect(evidenceDialog).toBeVisible();
  expect(searchParam(page, "series")).toBe("score,volume,previous,target");

  // Back leaves the evidence entry, keeping the table representation.
  await page.goBack();
  await expect(page).toHaveURL(tableUrl);
  await expectHydratedReportLens(page);
  await expect(evidenceDialog).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Таблица" }).first()
  ).toHaveAttribute("aria-current", "page");
  await expect(dataTable).toBeVisible();

  // Back again returns to the canonical entry with graph representation.
  await page.goBack();
  await expect(page).toHaveURL(canonicalUrl);
  await expectHydratedReportLens(page);
  await expect(page.getByLabel("Сравнение")).toHaveValue("previous");
  await expect(
    page.getByRole("link", { name: "График" }).first()
  ).toHaveAttribute("aria-current", "page");
  await expect(plot).toHaveCount(1);
  await expect(dataTable).toHaveCount(0);
  expect(searchParam(page, "series")).toBe("score,volume,previous,target");

  // Forward replays the exact same states, including the open Sheet.
  await page.goForward();
  await expect(page).toHaveURL(tableUrl);
  await expectHydratedReportLens(page);
  await expect(dataTable).toBeVisible();
  await expect(evidenceDialog).toBeHidden();

  await page.goForward();
  await expect(page).toHaveURL(evidenceUrl);
  // The Sheet is open again on this entry (modal; the lens is aria-hidden),
  // so the hydration wait uses attributes, not role+name.
  await expect(
    page.locator('section[role="region"][aria-label="Параметры отчёта"]')
  ).toHaveAttribute("data-hydrated", "true");
  await expect(evidenceDialog).toBeVisible();
  await expect(
    evidenceDialog.getByRole("heading", { name: unavailableEvidenceTitle })
  ).toHaveCount(0);

  expect(consoleMessages, "history restore console").toEqual([]);
});

test("series selection survives reload and stays a replace-only URL edit", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);
  await expectHydratedReportLens(page);

  const legend = page.getByRole("group", { name: "Ряды графика" }).first();
  const volume = legend.getByRole("button", { name: "Проверки" });
  await expect(volume).toHaveAttribute("aria-pressed", "true");
  const historyBefore = await historyLength(page);

  await volume.click();
  await expect(volume).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() => searchParam(page, "series"), {
      message: "series toggle must rewrite the canonical series parameter"
    })
    .toBe("score,previous,target");
  expect(
    await historyLength(page),
    "series toggling replaces the entry instead of pushing a new one"
  ).toBe(historyBefore);
  const seriesUrl = page.url();

  await page.reload();
  await expect(page).toHaveURL(seriesUrl);
  await expectHydratedReportLens(page);
  expect(searchParam(page, "series")).toBe("score,previous,target");
  const restoredLegend = page.getByRole("group", { name: "Ряды графика" }).first();
  await expect(
    restoredLegend.getByRole("button", { name: "Проверки" })
  ).toHaveAttribute("aria-pressed", "false");
  for (const label of ["Средний балл", "Прошлый период", "Цель 90 баллов"]) {
    await expect(
      restoredLegend.getByRole("button", { name: label })
    ).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.locator('[data-slot="quality-trend-plot"]')).toHaveCount(1);

  expect(consoleMessages, "series restore console").toEqual([]);
});

test("hover and keyboard inspection of the chart never mutates the URL", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);
  await expectHydratedReportLens(page);

  const plot = page.locator('[data-slot="quality-trend-plot"]');
  await plot.scrollIntoViewIfNeeded();
  await expect(plot).toBeVisible();
  const urlBefore = page.url();
  const historyBefore = await historyLength(page);

  await plot.hover();
  await expect(plot).toHaveAttribute("data-active-point-id", /^trend-\d+$/);
  expect(page.url(), "hover inspection must not rewrite the URL").toBe(urlBefore);

  await plot.focus();
  await expect(plot).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute("data-active-point-id", /^trend-\d+$/);
  expect(page.url(), "focus and arrow inspection must not rewrite the URL").toBe(
    urlBefore
  );

  await page.keyboard.press("Escape");
  await expect(plot).not.toHaveAttribute("data-active-point-id", /.+/);
  expect(page.url(), "clearing the selection must not rewrite the URL").toBe(
    urlBefore
  );
  expect(
    await historyLength(page),
    "chart inspection must not add history entries"
  ).toBe(historyBefore);
  await expect(
    page.getByRole("dialog", { name: "Данные и примеры" })
  ).toHaveCount(0);

  expect(consoleMessages, "chart inspection console").toEqual([]);
});

test.describe("coarse-pointer chart inspection", () => {
  test.use({ hasTouch: true });

  test("the first touch inspects the chart without mutating the URL", async ({
    page
  }) => {
    const consoleMessages = collectUnexpectedConsole(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(canonicalOverviewHref);
    await expectHydratedReportLens(page);

    const plot = page.locator('[data-slot="quality-trend-plot"]');
    await plot.scrollIntoViewIfNeeded();
    await expect(plot).toBeVisible();
    const box = await plot.boundingBox();
    expect(box).not.toBeNull();
    const urlBefore = page.url();
    const historyBefore = await historyLength(page);

    await page.touchscreen.tap(
      box!.x + box!.width * 0.6,
      box!.y + box!.height * 0.5
    );
    await expect(plot).toHaveAttribute("data-active-point-id", /^trend-\d+$/);
    expect(page.url(), "the first touch must only inspect, never navigate").toBe(
      urlBefore
    );
    expect(await historyLength(page)).toBe(historyBefore);
    await expect(
      page.getByRole("dialog", { name: "Данные и примеры" })
    ).toHaveCount(0);

    expect(consoleMessages, "touch inspection console").toEqual([]);
  });
});

test("an incompatible filter change clears the open evidence safely", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);
  await expectHydratedReportLens(page);

  const evidenceTrigger = page.getByRole("button", {
    name: "Показать данные выбранного среза"
  });
  await evidenceTrigger.click();
  const evidenceDialog = page.getByRole("dialog", { name: "Данные и примеры" });
  await expect(evidenceDialog).toBeVisible();
  expect(searchParam(page, "evidenceKey")).toMatch(evidenceKeyPattern);

  // The analytical grain changes the bucket the descriptor was built from, so
  // the evidence pair must be dropped rather than silently re-pointed.
  const grain = page.getByLabel("Шаг");
  await expect(grain).toHaveValue("day");
  await grain.selectOption("week");

  await expect(page).toHaveURL(/grain=week/);
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);
  expect(searchParam(page, "evidenceType")).toBeNull();
  expect(searchParam(page, "evidenceKey")).toBeNull();
  await expectHydratedReportLens(page);
  await expect(page.getByLabel("Шаг")).toHaveValue("week");
  await expect(evidenceDialog).toBeHidden();
  await expect(
    page.getByText(unavailableEvidenceTitle, { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Аналитика качества" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Показать данные выбранного среза" })
  ).toBeVisible();

  expect(consoleMessages, "evidence clearing console").toEqual([]);
});

test("an invalid deep link renders the canonical safe fallback without errors", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  const junkHref =
    "/reports?view=%D0%BC%D1%83%D1%81%D0%BE%D1%80&period=%3Cscript%3E" +
    "&compare=42&grain=999&chartView=hologram&series=score%2C%2C%2C" +
    "&team=%2F%2Fevil.example&source=__proto__&risk=constructor" +
    "&block=..%2F..%2Fetc%2Fpasswd&section=nope&start=not-a-date&end=9999-99-99" +
    "&evidenceType=trend&evidenceKey=definitely-not-an-evidence-key" +
    "&unknownParam=1&unknownParam=2";
  const response = await page.goto(junkHref);
  expect(response?.status(), "invalid deep link response status").toBe(200);

  await expect(
    page.getByRole("heading", { name: "Аналитика качества" })
  ).toBeVisible();
  await expectHydratedReportLens(page);

  // Every unparsable value falls back to the canonical default state.
  await expect(page.getByLabel("Период", { exact: true })).toHaveValue("vk-current");
  await expect(page.getByLabel("Сравнение")).toHaveValue("previous");
  await expect(page.getByLabel("Шаг")).toHaveValue("day");
  await expect(
    page.getByRole("link", { name: "График" }).first()
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-slot="quality-trend-plot"]')).toHaveCount(1);

  // A malformed evidence pair never opens a Sheet and never renders an error.
  // (The canonical page legitimately renders non-error role="alert" content —
  // the HIGH+ risk callout and the empty toast live-region — so the error-free
  // contract is pinned by the unavailable-evidence copy and console checks.)
  await expect(
    page.getByRole("dialog", { name: "Данные и примеры" })
  ).toHaveCount(0);
  await expect(
    page.getByText(unavailableEvidenceTitle, { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Динамика качества", exact: true })
  ).toHaveAttribute("id", "chart-quality-overview-title");

  expect(consoleMessages, "invalid deep link console").toEqual([]);
});

test("foreign, stale, and mismatched evidence deep links render one identical safe UI", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // A real, resolvable descriptor first: it proves the safe UI below differs
  // from the available one for the same URL shape.
  await page.goto(canonicalOverviewHref);
  await expectHydratedReportLens(page);
  await page
    .getByRole("button", { name: "Показать данные выбранного среза" })
    .click();
  const evidenceDialog = page.getByRole("dialog", { name: "Данные и примеры" });
  await expect(evidenceDialog).toBeVisible();
  const realEvidenceKey = searchParam(page, "evidenceKey");
  const realEvidenceType = searchParam(page, "evidenceType");
  expect(realEvidenceKey).toMatch(evidenceKeyPattern);
  expect(realEvidenceType).toBe("trend");
  await expect(
    evidenceDialog.getByText("Сравнение", { exact: true })
  ).toBeVisible();
  await expect(
    evidenceDialog.getByText("Выборка", { exact: true })
  ).toBeVisible();
  const availableText = await normalizedDialogText(page);
  expect(availableText).not.toContain(unavailableEvidenceTitle);

  const unavailableHrefs: ReadonlyArray<readonly [string, string]> = [
    // Foreign workspace shape: valid descriptor grammar, unknown to this catalog.
    ["foreign", `${canonicalOverviewHref}&evidenceType=trend&evidenceKey=${foreignEvidenceKey}`],
    // Stale shape: a descriptor that no longer exists for the active period.
    ["stale", `${canonicalOverviewHref}&evidenceType=kpi&evidenceKey=${staleEvidenceKey}`],
    // Type/key mismatch: a real key requested under the wrong evidence type.
    [
      "mismatched",
      `${canonicalOverviewHref}&evidenceType=driver&evidenceKey=${realEvidenceKey}`
    ]
  ];

  const renderedTexts: string[] = [];
  for (const [label, href] of unavailableHrefs) {
    await page.goto(href);
    // The unavailable-evidence Sheet is modal and aria-hides the page behind
    // it, so the hydration wait uses attributes instead of the role+name query.
    await expect(
      page.locator('section[role="region"][aria-label="Параметры отчёта"]')
    ).toHaveAttribute("data-hydrated", "true");

    const dialog = page.getByRole("dialog", { name: "Данные и примеры" });
    await expect(dialog, `${label} evidence Sheet`).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: unavailableEvidenceTitle }),
      `${label} unavailable title`
    ).toBeVisible();
    await expect(
      dialog.getByText(unavailableEvidenceDescription, { exact: true }),
      `${label} unavailable description`
    ).toBeVisible();
    // No sample facts, comparison labels, or review rows may leak.
    await expect(
      dialog.getByText("Сравнение", { exact: true }),
      `${label} comparison leak`
    ).toHaveCount(0);
    await expect(
      dialog.getByText("Выборка", { exact: true }),
      `${label} sample leak`
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("heading", { name: "Проверки" }),
      `${label} review list leak`
    ).toHaveCount(0);
    await expect(dialog.getByRole("link"), `${label} review link leak`).toHaveCount(
      0
    );
    // The deep link itself is preserved; nothing rewrites it behind the user.
    expect(searchParam(page, "evidenceKey"), `${label} evidence key`).toMatch(
      evidenceKeyPattern
    );

    renderedTexts.push(await normalizedDialogText(page));
  }

  expect(
    new Set(renderedTexts).size,
    `foreign/stale/mismatched evidence must render one identical UI: ${JSON.stringify(renderedTexts)}`
  ).toBe(1);
  expect(renderedTexts[0]).not.toBe(availableText);

  // Closing a direct deep link returns focus to the relevant chart heading and
  // clears only the evidence pair from the URL.
  const dialog = page.getByRole("dialog", { name: "Данные и примеры" });
  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);
  await expect(page).toHaveURL(/view=overview/);
  await expect(
    page.getByRole("heading", { name: "Динамика качества", exact: true })
  ).toBeFocused();

  expect(consoleMessages, "unavailable evidence console").toEqual([]);
});
