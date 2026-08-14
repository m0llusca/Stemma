import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

const staticAuthenticatedRoutes = [
  "/dashboard",
  "/reviews",
  "/self-review",
  "/calibration",
  "/coaching",
  "/reports",
  "/admin",
  "/admin/access",
  "/admin/ai-scoring",
  "/admin/appearance",
  "/admin/audit",
  "/admin/channels",
  "/admin/integrations",
  "/admin/integrations/new",
  "/admin/localization",
  "/admin/report-schedules",
  "/admin/sampling",
  "/admin/scorecards",
  "/admin/system",
  "/admin/tokens",
  "/admin/users"
] as const;

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

async function settleBrowserFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

test.setTimeout(120_000);

let authenticatedWorkspaceId: string;

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(async ({ context }) => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });

  const admin = await findSeededDemoAdmin();

  authenticatedWorkspaceId = admin.workspaceId;

  await signInE2EUser(context, admin, "playwright-app-shell-routes");
});

test("authenticated app shell routes render stable chrome and content", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const unexpectedConsole = collectUnexpectedConsole(page);
  const topbarChromeByRoute = new Map<
    string,
    {
      backgroundColor: string;
      borderBottomColor: string;
      borderBottomWidth: string;
    }
  >();

  const conversation = await prisma.conversation.findFirst({
    where: {
      reviews: { some: { reviewSource: "HUMAN" } }
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });

  expect(conversation, "seeded review conversation").not.toBeNull();

  const [integration, backendJob] = await Promise.all([
    prisma.integration.findFirstOrThrow({
      where: {
        workspaceId: authenticatedWorkspaceId,
        source: "custom_api"
      },
      select: { id: true }
    }),
    prisma.backendJob.findFirstOrThrow({
      where: { workspaceId: authenticatedWorkspaceId },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    })
  ]);

  const routes = [
    ...staticAuthenticatedRoutes,
    `/reviews/${conversation?.id}`,
    `/admin/integrations/${integration.id}`,
    `/admin/system/jobs/${backendJob.id}`
  ];

  for (const route of routes) {
    const consoleStart = unexpectedConsole.length;
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });

    expect.soft(response?.ok(), `${route} should return ok`).toBe(true);
    const routeTopbar = page.getByRole("banner", { name: "Глобальная навигация" });
    await expect(routeTopbar, `${route} nav`).toBeVisible();

    if (route === "/dashboard" || route === "/reviews" || route === "/coaching") {
      topbarChromeByRoute.set(
        route,
        await routeTopbar.evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            backgroundColor: styles.backgroundColor,
            borderBottomColor: styles.borderBottomColor,
            borderBottomWidth: styles.borderBottomWidth
          };
        })
      );
    }

    const mainHeight = await page.locator("#main-content").evaluate((element) => element.getBoundingClientRect().height);
    expect.soft(mainHeight, `${route} main content height`).toBeGreaterThan(200);

    if (route === "/admin/integrations") {
      const integrationFrame = page.getByRole("region", { name: "Интеграции" });
      const priorityAction = integrationFrame
        .getByRole("link", { name: /Открыть журнал|Открыть источники|Новый источник/ })
        .first();
      const readiness = integrationFrame
        .locator('[data-slot="card-title"]')
        .filter({ hasText: "Путь от доступа до мониторинга" });
      const evidence = integrationFrame.getByRole("button", {
        name: /Свидетельства готовности/
      });

      await expect(integrationFrame, "integrations operational region").toBeVisible();
      await expect(priorityAction, "integrations priority action").toBeVisible();
      await expect(readiness, "integrations readiness details").toBeVisible();
      await expect(evidence, "integrations evidence trigger").toBeVisible();

      const [actionTop, readinessTop, evidenceTop] = await Promise.all([
        priorityAction.evaluate((element) => element.getBoundingClientRect().top),
        readiness.evaluate((element) => element.getBoundingClientRect().top),
        evidence.evaluate((element) => element.getBoundingClientRect().top)
      ]);
      expect(actionTop, "integrations action should precede readiness details").toBeLessThan(readinessTop);
      expect(readinessTop, "integrations details should precede evidence").toBeLessThan(evidenceTop);
    }

    if (route === "/dashboard") {
      const topbar = routeTopbar;
      const brand = topbar.locator('a[href="/dashboard"]').first();
      const areaNav = topbar.getByRole("navigation", { name: "Основные разделы" });
      const areaMenuTrigger = topbar.locator('button[aria-label*="Разделы"]');
      const commandTrigger = topbar.getByRole("button", { name: "Поиск или команда" });
      // Имя «Рабочий пульс» делят два элемента: мобильная кнопка меню и
      // десктоп-контейнер ссылок — геометрию и ссылки смотрим в контейнере.
      const workPulse = topbar.locator('div[aria-label="Рабочий пульс"]');
      const identityChip = topbar.locator('[data-slot="dropdown-menu-trigger"]').last();

      await expect(commandTrigger).toBeVisible();
      await expect(workPulse.getByRole("link").first()).toBeVisible();

      const areaControl = (await areaNav.isVisible()) ? areaNav : areaMenuTrigger;
      await expect(areaControl).toBeVisible();
      if (await areaNav.isVisible()) {
        await expect(areaNav.locator('[aria-current="page"]')).toHaveText(/Сегодня/);
      } else {
        await areaMenuTrigger.click();
        const areaMenu = page.locator(
          '[data-slot="dropdown-menu-content"][aria-label="Основные разделы"]'
        );
        await expect(areaMenu.locator('[aria-current="page"]')).toHaveText(/Сегодня/);
        await page.keyboard.press("Escape");
      }

      const [topbarBox, brandBox, areaBox, commandBox, pulseBox, identityBox] = await Promise.all([
        topbar.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
        brand.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
        areaControl.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
        commandTrigger.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
        workPulse.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
        identityChip.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        })
      ]);
      expect(brandBox.left - topbarBox.left, "brand mark should keep only a small left padding").toBeLessThanOrEqual(28);
      expect(areaBox.left, "area navigation should sit to the right of the brand mark").toBeGreaterThanOrEqual(brandBox.right);
      expect(commandBox.left, "command trigger should sit to the right of the area navigation").toBeGreaterThanOrEqual(areaBox.right - 1);
      expect(pulseBox.left, "work pulse should sit to the right of the command trigger").toBeGreaterThanOrEqual(commandBox.right - 1);
      expect(topbarBox.right - identityBox.right, "identity menu should keep only a small right padding").toBeLessThanOrEqual(28);
    }

    if (route === "/dashboard") {
      const activityTrigger = page.getByRole("button", { name: /Последняя активность/ });
      await expect(activityTrigger).toBeVisible();
      await activityTrigger.click();
      const activitySheet = page.getByRole("dialog", { name: "Последняя активность" });
      const firstActivity = activitySheet.locator(".dashboard-activity-row").first();
      await expect(activitySheet).toBeVisible();
      await expect(firstActivity).toBeVisible();
      await expect(page.getByText(/qa\.reopened/)).toHaveCount(0);
      await expect(page.getByText(/conversation\.workflow_updated/)).toHaveCount(0);
      expect(await firstActivity.locator("strong").innerText(), "dashboard activity label").not.toMatch(
        /(?:qa|conversation|review)\.[a-z_]+/
      );
      await page.keyboard.press("Escape");
      await expect(activitySheet).toBeHidden();

      const kpiRegion = page.getByRole("region", { name: "Ключевые показатели" });
      const kpiLinks = kpiRegion.getByRole("link");
      const firstKpi = kpiRegion.getByRole("link", { name: /Проверок за неделю/ });
      const kpiValue = firstKpi.locator('[data-slot="card-title"]');
      const kpiLabel = firstKpi.locator('[data-slot="card-description"]');

      await expect(kpiRegion).toBeVisible();
      await expect(kpiLinks).toHaveCount(4);
      await expect(kpiValue).toBeVisible();
      const [kpiValueFontSize, kpiLabelFontSize] = await Promise.all([
        kpiValue.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
        kpiLabel.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
      ]);
      expect(kpiValueFontSize, "dashboard KPI value should keep hero metric typography").toBeGreaterThanOrEqual(24);
      expect(kpiValueFontSize, "dashboard KPI value should be visibly larger than its label").toBeGreaterThan(
        kpiLabelFontSize * 1.5
      );

      const [labelLeft, valueLeft, contentLeft] = await Promise.all([
        kpiLabel.evaluate((element) => element.getBoundingClientRect().left),
        kpiValue.evaluate((element) => element.getBoundingClientRect().left),
        firstKpi
          .locator('[data-slot="card-content"] > div')
          .first()
          .evaluate((element) => element.getBoundingClientRect().left)
      ]);
      expect(Math.abs(labelLeft - valueLeft), "dashboard KPI label and value should share one text column").toBeLessThanOrEqual(1);
      expect(Math.abs(valueLeft - contentLeft), "dashboard KPI value and supporting content should align").toBeLessThanOrEqual(1);
    }

    if (route === "/reports") {
      // The movement factors render as one "Факторы изменения" chart (down/up series);
      // the old separate "Негативные/Позитивные факторы" sections no longer exist.
      const movementFactors = page.getByRole("group", { name: "Факторы изменения" });
      await expect(movementFactors).toBeVisible();

      await expect(page.getByRole("button", { name: "Показать данные выбранного среза" })).toBeVisible();
    }

    await settleBrowserFrame(page);
    expect.soft(
      unexpectedConsole.slice(consoleStart),
      `${route} should not emit browser warnings, errors, or page errors`
    ).toEqual([]);
  }

  const dashboardTopbarChrome = topbarChromeByRoute.get("/dashboard");
  expect(dashboardTopbarChrome, "dashboard topbar chrome baseline").toBeDefined();
  expect(topbarChromeByRoute.get("/reviews"), "reviews topbar should use the same chrome as dashboard").toEqual(dashboardTopbarChrome);
  expect(topbarChromeByRoute.get("/coaching"), "coaching topbar should use the same chrome as dashboard").toEqual(dashboardTopbarChrome);
});

test("global navigation keeps a flat opaque surface", async ({ page }) => {
  const unexpectedConsole = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const globalNav = page.getByRole("banner", { name: "Глобальная навигация" });
  await expect(globalNav).toBeVisible();

  const [backdropFilter, webkitBackdropFilter] = await Promise.all([
    globalNav.evaluate((element) => getComputedStyle(element).backdropFilter),
    globalNav.evaluate(
      (element) =>
        (
          getComputedStyle(element) as CSSStyleDeclaration & {
            webkitBackdropFilter?: string;
          }
        ).webkitBackdropFilter ?? "none"
    )
  ]);

  expect(backdropFilter, "global navigation should remain a flat surface").toBe("none");
  expect(webkitBackdropFilter, "global navigation should remain flat in WebKit").toBe("none");

  await settleBrowserFrame(page);
  expect(unexpectedConsole, "global navigation console").toEqual([]);
});

test("dashboard focus metrics use semantic status color", async ({ page }) => {
  const unexpectedConsole = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const focusCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Ещё в фокусе" })
    .first();
  const focusMetric = focusCard.getByRole("link").first().locator("em");
  await expect(focusMetric).toBeVisible();

  const [metricColor, bodyColor] = await Promise.all([
    focusMetric.evaluate((element) => getComputedStyle(element).color),
    page.locator("body").evaluate((element) => getComputedStyle(element).color)
  ]);
  expect(metricColor, "dashboard focus metric should use semantic status color").not.toBe(bodyColor);

  await settleBrowserFrame(page);
  expect(unexpectedConsole, "dashboard focus metric console").toEqual([]);
});

test("dashboard shell reaches first content quickly", async ({ page }) => {
  const unexpectedConsole = collectUnexpectedConsole(page);
  const startedAt = Date.now();

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("banner", { name: "Глобальная навигация" })
    .waitFor({ state: "visible" });
  await page.getByText(/Фокус сейчас|Последняя активность/).first().waitFor({ state: "visible" });

  expect(Date.now() - startedAt).toBeLessThan(2_500);
  await settleBrowserFrame(page);
  expect(unexpectedConsole, "dashboard speed smoke console").toEqual([]);
});
