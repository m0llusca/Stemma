import { expect, test, type Locator, type Page } from "@playwright/test";
import { resolveDemoSeedNow } from "../../prisma/demo-calendar";
import { buildDemoDateExpectations } from "./helpers/demo-date-expectations";

test.setTimeout(120_000);

const demoSeedAnchor = resolveDemoSeedNow(process.env);
const expectedDates = buildDemoDateExpectations(demoSeedAnchor);

async function signInThroughDemo(page: Page) {
  await page.goto("/auth/login?returnTo=/dashboard");
  await page.getByRole("button", { name: "Демо-вход" }).click();
  await page.getByRole("button", { name: "Войти в демо-режиме" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();
}

async function expectPositiveMetric(locator: Locator, label: string) {
  const visibleText = await locator.innerText();
  const value = Number(visibleText.match(/\d+/)?.[0] ?? "0");

  expect(value, `${label} should be nonzero`).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await signInThroughDemo(page);
});

test("dashboard shows nonzero rolling seven-day activity", async ({ page }) => {
  const weeklyChecks = page.getByRole("link", { name: /Проверок за неделю/ });

  await expect(weeklyChecks).toBeVisible();
  await expectPositiveMetric(weeklyChecks, "Проверок за неделю");
  await expect(page.getByText("Качество за 7 дней", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Тренд средней оценки" })).toBeVisible();
  await expect(page.getByText("Нет проверок за неделю")).toHaveCount(0);
});

test("current and previous 22-21 reports render populated charts", async ({ page }) => {
  const periods = [
    {
      id: "vk-current",
      heading: expectedDates.reportHeadings.current
    },
    {
      id: "vk-previous",
      heading: expectedDates.reportHeadings.previous
    }
  ] as const;

  for (const period of periods) {
    await page.goto(`/reports?period=${period.id}`);

    await expect(page.getByRole("heading", { name: "Аналитика качества" })).toBeVisible();
    await expect(page.getByLabel("Период", { exact: true })).toHaveValue(period.id);
    await expect(page.getByText(period.heading).first()).toBeVisible();
    // The quality trend is an app-owned interactive group (aria-hidden Recharts svg inside),
    // not a role="img" — see quality-trend-chart.client.tsx.
    await expect(page.getByRole("group", { name: "Динамика качества" })).toBeVisible();

    const distribution = page.getByRole("group", { name: "Распределение оценок" });
    await expect(distribution).toBeVisible();
    // The bar labels/counts render inside the deferred (code-split) visual, which by
    // design arms only near the viewport (Task 6 contract): scroll the group into
    // view first instead of relying on incidental above-fold geometry.
    await distribution.scrollIntoViewIfNeeded();
    await expect(
      distribution.locator('[data-slot="deferred-chart-visual"]')
    ).toHaveAttribute("data-deferred-state", "ready");
    const scoreRanges = ["0-50", "51-70", "71-85", "86-100"] as const;
    for (const range of scoreRanges) {
      await expect(distribution.getByText(range, { exact: true })).toBeVisible();
    }
    // The counts render as SVG <text> nodes (aria-hidden rich visual); SVG
    // elements have no innerText (undefined → NaN), so read textContent.
    const scoreCounts = (
      await distribution.getByText(/^\d+$/, { exact: true }).allTextContents()
    ).map((text) => Number(text.trim()));
    expect(scoreCounts, "every score range should expose its visible count").toHaveLength(scoreRanges.length);
    expect(
      scoreCounts.reduce((total, count) => total + count, 0),
      `${period.id} score distribution should be populated`
    ).toBeGreaterThan(0);
    await expect(page.getByText("Нет завершенных проверок")).toHaveCount(0);
  }
});

test("review queue exposes every active state and mixed SLA dates", async ({ page }) => {
  const queueCases = [
    {
      status: "QUEUED",
      subject: "Без назначенного оператора и проверяющего",
      dueDate: expectedDates.queueDueDates.QUEUED
    },
    {
      status: "ASSIGNED",
      subject: "Назначена проверка после сигнала руководителя",
      dueDate: expectedDates.queueDueDates.ASSIGNED
    },
    {
      status: "IN_PROGRESS",
      subject: "Проверка в работе: позитивный сложный кейс",
      dueDate: expectedDates.queueDueDates.IN_PROGRESS
    },
    {
      status: "REOPENED",
      subject: "Переоткрыта после апелляции по компенсации",
      dueDate: expectedDates.queueDueDates.REOPENED
    }
  ] as const;

  for (const queueCase of queueCases) {
    await page.goto(`/reviews?qaStatus=${queueCase.status}`);

    await expect(page.locator('[data-slot="page-shell"] h1')).toHaveText("Очередь проверок", {
      timeout: 15_000
    });
    // «Статус проверки» is an advanced ("Точные фильтры") control; target by id so
    // portaled panel markup outside the command-bar region still matches.
    await expect(page.locator("#queue-filter-qaStatus")).toHaveValue(queueCase.status);

    // Prefer DOM row class: cold Chromium a11y trees sometimes omit name/text on role=row.
    const scenarioRow = page.locator("tr.queue-row", { hasText: queueCase.subject });
    await expect(scenarioRow).toBeVisible({ timeout: 15_000 });
    // Due cell is "DD.MM.YYYY" + "— просрочено" siblings; exact text match on a leaf fails.
    await expect(scenarioRow).toContainText(queueCase.dueDate);
  }
});

test("coaching shows open, in-progress, and done work around the anchor", async ({ page }) => {
  await page.goto("/coaching");

  const workspace = page.getByLabel("Рабочая область обучения");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("cell", { name: "Новая", exact: true }).first()).toBeVisible();
  await expect(workspace.getByRole("cell", { name: "В работе", exact: true }).first()).toBeVisible();
  for (const dueDate of expectedDates.coachingDueDates) {
    await expect(workspace.getByText(`до ${dueDate}`, { exact: true })).toBeVisible();
  }

  const viewNav = workspace.getByRole("navigation", { name: "Виды разборов" });
  await viewNav.getByRole("link", { name: /^Закрытые \d+$/ }).click();
  await expect(page).toHaveURL(/\/coaching\?view=done/);
  await expect(viewNav.getByRole("link", { name: /^Закрытые \d+$/ })).toHaveAttribute("aria-current", "page");
  await expect(workspace.getByRole("cell", { name: "Готово", exact: true }).first()).toBeVisible();
});

async function coachingViewNavGeometry(page: Page) {
  const workspace = page.getByLabel("Рабочая область обучения");
  const viewNav = workspace.getByRole("navigation", { name: "Виды разборов" });
  const viewLinks = viewNav.getByRole("link");
  const filterForm = workspace.locator('form[action="/coaching"]');

  await expect(workspace).toBeVisible();
  await expect(viewNav).toBeVisible();
  await expect(viewLinks).toHaveCount(7);
  await expect(filterForm).toBeVisible();

  const [navBox, linkBoxes, filterFormBox, navMetrics] = await Promise.all([
    viewNav.boundingBox(),
    viewLinks.evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          label: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom
        };
      })
    ),
    filterForm.boundingBox(),
    viewNav.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }))
  ]);
  expect(navBox).not.toBeNull();
  expect(filterFormBox).not.toBeNull();

  const nav = navBox!;
  const form = filterFormBox!;
  const navRight = nav.x + nav.width;
  const navBottom = nav.y + nav.height;
  const maxLinkBottom = Math.max(...linkBoxes.map((link) => link.bottom));
  const rowTops = linkBoxes
    .map((link) => link.top)
    .sort((left, right) => left - right)
    .filter((top, index, tops) => index === 0 || Math.abs(top - tops[index - 1]) > 1);
  const overlappingLinkPairs: string[] = [];

  for (let leftIndex = 0; leftIndex < linkBoxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < linkBoxes.length; rightIndex += 1) {
      const left = linkBoxes[leftIndex];
      const right = linkBoxes[rightIndex];
      const separated =
        left.right <= right.left + 1 ||
        right.right <= left.left + 1 ||
        left.bottom <= right.top + 1 ||
        right.bottom <= left.top + 1;

      if (!separated) {
        overlappingLinkPairs.push(`${left.label} / ${right.label}`);
      }
    }
  }

  return {
    nav,
    form,
    linkBoxes,
    rowTops,
    overlappingLinkPairs,
    linksContained: linkBoxes.every(
      (link) =>
        link.left >= nav.x - 1 &&
        link.top >= nav.y - 1 &&
        link.right <= navRight + 1 &&
        link.bottom <= navBottom + 1
    ),
    horizontallyScrollable: navMetrics.scrollWidth > navMetrics.clientWidth + 1,
    formStartsBelowNav: form.y >= navBottom - 1,
    formStartsBelowLinks: form.y >= maxLinkBottom - 1
  };
}

test("coaching view nav keeps one scrollable row above filters at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/coaching");

  const geometry = await coachingViewNavGeometry(page);

  expect(geometry.rowTops, JSON.stringify(geometry)).toHaveLength(1);
  expect(geometry.overlappingLinkPairs, JSON.stringify(geometry)).toEqual([]);
  expect(geometry.horizontallyScrollable, JSON.stringify(geometry)).toBe(true);
  expect(geometry.formStartsBelowNav, JSON.stringify(geometry)).toBe(true);
  expect(geometry.formStartsBelowLinks, JSON.stringify(geometry)).toBe(true);
});

test("coaching view nav keeps one fully contained row above filters at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/coaching");

  const geometry = await coachingViewNavGeometry(page);

  expect(geometry.rowTops, JSON.stringify(geometry)).toHaveLength(1);
  expect(geometry.linksContained, JSON.stringify(geometry)).toBe(true);
  expect(geometry.horizontallyScrollable, JSON.stringify(geometry)).toBe(false);
  expect(geometry.overlappingLinkPairs, JSON.stringify(geometry)).toEqual([]);
  expect(geometry.formStartsBelowNav, JSON.stringify(geometry)).toBe(true);
  expect(geometry.formStartsBelowLinks, JSON.stringify(geometry)).toBe(true);
});

test("calibration shows draft, active, completed, and archived sessions", async ({ page }) => {
  await page.goto("/calibration");

  const sessions = page.getByLabel("Сессии калибровки", { exact: true });
  await expect(sessions).toBeVisible();
  await expect(sessions.getByRole("link", { name: /^Черновик / })).toBeVisible();
  await expect(sessions.getByRole("link", { name: /^Активна / })).toBeVisible();
  await expect(sessions.getByRole("link", { name: /^Завершена / })).toBeVisible();
  await expect(sessions.getByRole("link", { name: /^В архиве / })).toBeVisible();
});

test("integration detail shows a recent run and its visible error", async ({ page }) => {
  await page.goto("/admin/integrations");

  await page.getByRole("link", { name: "Jira Service Management" }).click();
  await expect(page.getByRole("heading", { name: "Jira Service Management" })).toBeVisible();
  const integrationSummary = page.getByText(/· Ошибка · последний запуск /);
  await expect(integrationSummary).toBeVisible();
  await expect(integrationSummary).not.toContainText("Нет данных");
  await expect(page.getByText("Последняя ошибка", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo: токен истек, нужен повторный live dry-run.", { exact: true })).toBeVisible();
});
