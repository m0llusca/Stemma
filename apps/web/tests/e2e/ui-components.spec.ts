import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { resolvePlaywrightTestDatabaseUrl } from "../../playwright-database-guard";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

// These checks use the seeded verify database, but never submit a settings or
// scorecard action. Destructive confirmation is exercised on an unsaved draft.
test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

test.beforeEach(async ({ context }) => {
  await signInE2EUser(context, await findSeededDemoAdmin(), "playwright-ui-components");
});

async function axeGate(page: Page, testInfo: TestInfo, label: string) {
  // Audit settled colors, not a translucent frame of the popup entrance.
  // Keep animations enabled; only await finite animations, never shimmer loops.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const animations = document.getAnimations().filter((animation) =>
      (animation.playState === "running" || animation.pending) &&
      Number.isFinite(animation.effect?.getComputedTiming().endTime)
    );
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
  const results = await new AxeBuilder({ page }).analyze();
  await testInfo.attach(`axe-${label}`, {
    body: JSON.stringify({ violations: results.violations, incomplete: results.incomplete }, null, 2),
    contentType: "application/json"
  });
  expect(results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious"), `${label}: critical/serious axe violations`).toEqual([]);
}

function reportRange() {
  const anchor = new Date(process.env.DEMO_SEED_NOW ?? Date.now());
  const month = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, end: `${month}-20`, nextStart: `${month}-03`, nextEnd: `${month}-15` };
}

async function reportReady(page: Page) {
  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  return lens;
}

for (const width of [1280, 390]) {
  test(`UI14 reports range Apply/Cancel and Russian calendar at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const range = reportRange();
    const params = new URLSearchParams({ view: "performance", period: "custom", start: range.start, end: range.end, compare: "year", grain: "week", source: "freshdesk", risk: "high_plus", chartView: "table", series: "score" });
    await page.goto(`/reports?${params}`);
    const lens = await reportReady(page);
    await lens.getByRole("button", { name: /^Фильтры \(/ }).click();
    let dialog = page.getByRole("dialog", { name: "Фильтры отчёта" });
    await expect(dialog).toBeVisible();

    // Read real workspace catalog values rather than inventing team/block slugs.
    const team = await dialog.getByLabel("Команда", { exact: true }).locator('option:not([value=""])').first().getAttribute("value");
    const block = await dialog.getByLabel("Блок", { exact: true }).locator('option:not([value=""])').first().getAttribute("value");
    expect(team).toBeTruthy();
    expect(block).toBeTruthy();
    params.set("team", team!);
    params.set("block", block!);
    await page.goto(`/reports?${params}`);
    await reportReady(page);
    await page.getByRole("button", { name: "Фильтры (4)", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Фильтры отчёта" });
    const from = dialog.getByLabel("С даты", { exact: true });
    const to = dialog.getByLabel("По дату", { exact: true });
    await expect(from).toHaveValue(range.start);
    await expect(to).toHaveValue(range.end);
    const appliedUrl = page.url();
    await from.fill(range.nextStart);
    await to.fill(range.nextEnd);
    expect(page.url()).toBe(appliedUrl);
    await dialog.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(from).toHaveValue(range.start);
    await expect(to).toHaveValue(range.end);
    expect(page.url()).toBe(appliedUrl);

    await dialog.getByRole("button", { name: "Выбрать в календаре", exact: true }).click();
    await expect(dialog.locator('[data-slot="calendar"]')).toBeVisible();
    await expect(dialog.locator('[data-slot="calendar"]')).toContainText(/январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь/i);
    await axeGate(page, testInfo, `report-calendar-${width}`);
    await dialog.getByRole("button", { name: "Отменить", exact: true }).click();
    await from.fill(range.nextStart);
    await to.fill("");
    await expect(dialog.getByRole("button", { name: "Применить период", exact: true })).toBeDisabled();
    expect(page.url()).toBe(appliedUrl);
    await to.fill(range.nextEnd);
    await dialog.getByRole("button", { name: "Применить период", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("start")).toBe(range.nextStart);
    await expect.poll(() => new URL(page.url()).searchParams.get("end")).toBe(range.nextEnd);
    for (const key of ["view", "period", "compare", "grain", "team", "source", "risk", "block", "chartView", "series"]) {
      expect(new URL(page.url()).searchParams.get(key), key).toBe(params.get(key));
    }
  });
}

test("UI14 report Menubar keyboard and canonical view/export/filter links", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const range = reportRange();
  const query = new URLSearchParams({ view: "performance", period: "custom", start: range.start, end: range.end, compare: "year", grain: "week", source: "freshdesk", risk: "high_plus", chartView: "table", series: "score" });
  await page.goto(`/reports?${query}`);
  await reportReady(page);
  let exportRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname.startsWith("/reports/export")) exportRequests += 1;
  });
  const menubar = page.getByRole("menubar", { name: "Действия отчёта" });
  const view = menubar.getByRole("menuitem", { name: "Представление", exact: true });
  await view.focus();
  await page.keyboard.press("ArrowRight");
  await expect(menubar.getByRole("menuitem", { name: "Фильтры", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(menubar.getByRole("menuitem", { name: "Экспорт", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const csv = page.getByRole("menuitem", { name: "CSV", exact: true });
  await expect(csv).toBeVisible();
  for (const [label, pathname] of [["CSV", "/reports/export"], ["XLSX", "/reports/export/xlsx"], ["PDF", "/reports/export/pdf"]]) {
    const url = new URL((await page.getByRole("menuitem", { name: label, exact: true }).getAttribute("href"))!, page.url());
    expect(url.pathname).toBe(pathname);
    for (const key of ["period", "start", "end", "source", "risk"]) expect(url.searchParams.get(key), `${label}: ${key}`).toBe(query.get(key));
  }
  await axeGate(page, testInfo, "report-export-menu");
  expect(exportRequests, "opening the menu must not prefetch attachment routes").toBe(0);
  const reportUrl = page.url();
  const [download] = await Promise.all([page.waitForEvent("download"), csv.click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  expect(await download.failure()).toBeNull();
  expect(exportRequests, "one download must make one attachment request").toBe(1);
  expect(page.url()).toBe(reportUrl);
  const downloadTrigger = menubar.getByRole("menuitem", { name: "Экспорт", exact: true });
  await expect(downloadTrigger).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(csv).toBeFocused();
  await page.keyboard.press("Escape");
  const exportTrigger = menubar.getByRole("menuitem", { name: "Экспорт", exact: true });
  await expect(exportTrigger).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(csv).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(csv).not.toBeVisible();
  expect(await page.evaluate(() => Boolean(document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('[aria-hidden="true"]')))).toBe(true);
  await exportTrigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(csv).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('[aria-hidden="true"]')))).toBe(true);
  await page.keyboard.press("Escape");
  await view.click();
  const process = page.getByRole("menuitem", { name: "Процесс", exact: true });
  const processUrl = new URL((await process.getAttribute("href"))!, page.url());
  expect(processUrl.searchParams.get("view")).toBe("process");
  for (const key of ["period", "start", "end", "compare", "grain", "source", "risk", "chartView", "series"]) expect(processUrl.searchParams.get(key), key).toBe(query.get(key));
  await page.keyboard.press("Escape");
  await menubar.getByRole("menuitem", { name: "Фильтры", exact: true }).click();
  const reset = new URL((await page.getByRole("menuitem", { name: "Сбросить срезы", exact: true }).getAttribute("href"))!, page.url());
  expect(reset.searchParams.has("source")).toBe(false);
  expect(reset.searchParams.has("risk")).toBe(false);
  for (const key of ["period", "start", "end", "compare", "grain", "chartView", "series"]) expect(reset.searchParams.get(key), key).toBe(query.get(key));
});

test("UI14 sampling Slider keyboard and exact number share one FormData value", async ({ page }, testInfo) => {
  await page.goto("/admin/sampling");
  await page.getByRole("button", { name: "Новое правило", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Новое правило выборки" });
  const number = dialog.getByRole("spinbutton", { name: "Доля, %", exact: true });
  const slider = dialog.getByRole("slider", { name: "Доля, %", exact: true });
  await number.fill("37");
  await expect(slider).toHaveAttribute("aria-valuenow", "37");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(number).toHaveValue("38");
  await page.keyboard.press("End");
  await expect(number).toHaveValue("100");
  await page.keyboard.press("Home");
  await expect(number).toHaveValue("1");
  await number.fill("43");
  await expect(slider).toHaveAttribute("aria-valuenow", "43");
  expect(await number.evaluate((element) => new FormData((element as HTMLInputElement).form!).getAll("targetPercent"))).toEqual(["43"]);
  await axeGate(page, testInfo, "sampling-slider");
  // Closing leaves no rule/action to clean up in the shared verify fixture.
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("UI14 AlertDialog cancels and confirms only an unsaved scorecard criterion", async ({ page }, testInfo) => {
  let writes = 0;
  page.on("request", (request) => { if (request.method() === "POST") writes += 1; });
  await page.goto("/admin/scorecards");
  await page.getByRole("button", { name: "Новая версия", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "Новая версия формы оценки" });
  await expect(draft).toBeVisible();
  const removeButtons = draft.getByRole("button", { name: "Удалить", exact: true });
  const original = await removeButtons.count();
  expect(original).toBeGreaterThan(0);
  await draft.getByRole("button", { name: "Добавить критерий", exact: true }).click();
  await expect(removeButtons).toHaveCount(original + 1);
  const remove = removeButtons.last();
  await remove.click();
  const confirmation = page.getByRole("alertdialog", { name: "Подтвердите действие" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText(/Он исчезнет из этой версии формы/)).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "Отмена", exact: true })).toBeFocused();
  await axeGate(page, testInfo, "scorecard-confirmation");
  await confirmation.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(removeButtons).toHaveCount(original + 1);
  await expect(remove).toBeFocused();
  await remove.click();
  await confirmation.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(removeButtons).toHaveCount(original);
  expect(writes).toBe(0);
  await page.keyboard.press("Escape");
  await expect(draft).not.toBeVisible();
});

for (const width of [1280, 390]) {
  test(`UI14 settings navigation keyboard and aria-current at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/scorecards");
    const nav = page.getByRole("navigation", { name: "Разделы администрирования" });
    const scorecards = nav.getByRole("link", { name: "Формы оценки", exact: true });
    const sampling = nav.getByRole("link", { name: "Правила выборки", exact: true });
    await expect(scorecards).toHaveAttribute("aria-current", "page");
    await scorecards.focus();
    await page.keyboard.press(width < 1024 ? "ArrowRight" : "ArrowDown");
    await expect(sampling).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/sampling$/);
    await expect(sampling).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await axeGate(page, testInfo, `settings-navigation-${width}`);
  });
}


test("UI14 queue operator Combobox searches, submits one exact filter, and clears", async ({ page }, testInfo) => {
  // The config guards server boot too; recheck before this test's optional writes.
  expect(resolvePlaywrightTestDatabaseUrl(process.env)).toBe(process.env.DATABASE_URL);
  const admin = await findSeededDemoAdmin();
  const namespace = `ui14-combobox-${randomUUID()}`;
  const fixtureIds = Array.from({ length: 8 }, (_, index) => `${namespace}-${index}`);
  const existing = await prisma.conversation.findMany({
    where: { workspaceId: admin.workspaceId, assigneeName: { not: null } },
    distinct: ["assigneeName"],
    select: { assigneeName: true },
    orderBy: { assigneeName: "asc" }
  });
  const existingNames = existing.map((row) => row.assigneeName).filter((value): value is string => Boolean(value));
  const needFixture = existingNames.length < 8;
  const target = needFixture ? `UI14 Оператор 4 ${namespace}` : existingNames[0];

  try {
    // Reuse an already long seeded catalog. Otherwise add only test-owned,
    // unreviewed conversations; no users, jobs, audit records or seed changes.
    if (needFixture) {
      await prisma.conversation.createMany({
        data: fixtureIds.map((id, index) => ({
          id,
          workspaceId: admin.workspaceId,
          externalSource: "ui14_combobox",
          externalId: id,
          channel: "CHAT" as const,
          subject: `UI14 проверка поиска оператора ${index + 1}`,
          status: "closed",
          tags: "",
          customerName: "UI14 browser fixture",
          assigneeName: `UI14 Оператор ${index + 1} ${namespace}`,
          qaStatus: "QUEUED" as const,
          samplingReason: "Изолированная браузерная проверка фильтра",
          samplingType: "MANUAL",
          csatBucket: "NO_SCORE",
          openedAt: new Date()
        }))
      });
    }

    await page.goto("/reviews");
    const openFilters = async () => {
      const sheet = page.getByRole("dialog", { name: "Точные фильтры", exact: true });
      if (!(await sheet.isVisible())) await page.getByRole("button", { name: /^Точные фильтры/ }).click();
      await expect(sheet).toBeVisible();
      return sheet;
    };
    let sheet = await openFilters();
    const operator = sheet.getByRole("combobox", { name: "Оператор", exact: true });
    await expect(operator).toHaveAttribute("aria-autocomplete", "list");
    const initialUrl = page.url();
    await operator.fill(target);
    const option = page.getByRole("option", { name: target, exact: true });
    await expect(option).toBeVisible();
    // Wait beyond the queue's 450ms text debounce: search text must never
    // navigate or become the submitted assignee before an actual selection.
    await page.waitForTimeout(600);
    expect(page.url()).toBe(initialUrl);
    const formValues = () => page.getByLabel("Поиск в очереди проверок", { exact: true }).evaluate((element) => new FormData((element as HTMLInputElement).form!).getAll("assignee"));
    expect(await formValues()).toEqual([""]);
    await option.click();
    await expect.poll(() => new URL(page.url()).searchParams.getAll("assignee")).toEqual([target]);
    sheet = await openFilters();
    await expect(sheet.getByRole("combobox", { name: "Оператор", exact: true })).toHaveValue(target);
    expect(await formValues()).toEqual([target]);
    await axeGate(page, testInfo, "queue-person-combobox");
    await sheet.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(sheet).not.toBeVisible();
    expect(await formValues()).toEqual([target]);
    sheet = await openFilters();
    await sheet.getByRole("button", { name: "Сбросить фильтр «Оператор»", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.has("assignee")).toBe(false);
    sheet = await openFilters();
    await expect(sheet.getByRole("combobox", { name: "Оператор", exact: true })).toHaveValue("");
    expect(await formValues()).toEqual([""]);
  } finally {
    if (needFixture) {
      await prisma.conversation.deleteMany({
        where: { id: { in: fixtureIds }, workspaceId: admin.workspaceId, externalSource: "ui14_combobox", externalId: { startsWith: namespace } }
      });
    }
  }
});
