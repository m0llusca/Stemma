import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/db";
import { signInE2EUser } from "./helpers/auth";

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
  "/admin/sampling",
  "/admin/scorecards",
  "/admin/system",
  "/admin/tokens",
  "/admin/users"
] as const;

const operationalFrameRoutes = new Set<string>([
  "/dashboard",
  "/reviews",
  "/coaching",
  "/reports",
  "/admin/integrations"
]);

function expectsOperationalFrame(route: string) {
  return operationalFrameRoutes.has(route) || /^\/reviews\/[^/]+$/.test(route);
}

test.setTimeout(120_000);

let authenticatedWorkspaceId: string;

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(async ({ context }) => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });

  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, workspaceId: true }
  });

  authenticatedWorkspaceId = admin.workspaceId;

  await signInE2EUser(context, admin, "playwright-app-shell-routes");
});

test("authenticated app shell routes render stable chrome and content", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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
      where: { workspaceId: authenticatedWorkspaceId },
      orderBy: { createdAt: "asc" },
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
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });

    expect.soft(response?.ok(), `${route} should return ok`).toBe(true);
    const routeTopbar = page.locator(".app-nav");
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

    if (expectsOperationalFrame(route)) {
      const operationsFrame = page.locator(".operational-page-frame");
      await expect(operationsFrame, `${route} operational frame`).toBeVisible();
      await expect(operationsFrame.locator(":scope > .operational-page-frame__action .priority-action-panel"), `${route} priority action`).toBeVisible();
      await expect(operationsFrame.locator(":scope > .operational-page-frame__evidence > .evidence-drawer"), `${route} evidence drawer`).toBeVisible();
      const operationsSlots = await operationsFrame.evaluate((frame) =>
        Array.from(frame.children)
          .map((child) => Array.from(child.classList).find((className) => className.startsWith("operational-page-frame__")))
          .filter(Boolean)
      );
      expect(operationsSlots, `${route} should keep signals -> action -> details -> evidence order`).toEqual([
        "operational-page-frame__signals",
        "operational-page-frame__action",
        "operational-page-frame__details",
        "operational-page-frame__evidence"
      ]);
    }

    if (route === "/dashboard") {
      const topbar = page.locator(".app-nav");
      const brand = page.locator(".app-nav__brand");
      const areaNav = page.locator(".app-nav__areas");
      const commandTrigger = page.locator(".app-command-trigger");
      const workPulse = page.locator(".work-pulse");
      const identityChip = page.locator(".app-nav__identity-summary").first();

      await expect(commandTrigger).toBeVisible();
      await expect(page.locator(".work-pulse__item").first()).toBeVisible();
      // The active product area is highlighted on the top bar.
      await expect(page.locator('.app-nav__area[aria-current="page"]')).toHaveText(/Сегодня/);

      const [topbarBox, brandBox, areaBox, commandBox, pulseBox, identityBox] = await Promise.all([
        topbar.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
        brand.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
        areaNav.evaluate((element) => {
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
      expect(areaBox.left, "area tabs should sit to the right of the brand mark").toBeGreaterThanOrEqual(brandBox.right);
      expect(commandBox.left, "command trigger should sit to the right of the area tabs").toBeGreaterThanOrEqual(areaBox.right - 1);
      expect(pulseBox.left, "work pulse should sit to the right of the command trigger").toBeGreaterThanOrEqual(commandBox.right - 1);
      expect(topbarBox.right - identityBox.right, "identity menu should keep only a small right padding").toBeLessThanOrEqual(28);
    }

    if (route === "/dashboard") {
      await expect(page.getByText(/qa\.reopened/)).toHaveCount(0);
      await expect(page.getByText(/conversation\.workflow_updated/)).toHaveCount(0);
      await expect(page.getByText("Проверка возвращена в работу").first()).toBeVisible();

      const firstKpi = page.locator(".dashboard-kpi").first();
      const kpiValue = firstKpi.locator(".metric-value__value");
      const kpiLabel = firstKpi.locator(":scope > span").filter({ hasText: "Проверок за неделю" });
      await expect(kpiValue).toBeVisible();
      const [kpiValueFontSize, kpiLabelFontSize] = await Promise.all([
        kpiValue.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
        kpiLabel.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
      ]);
      expect(kpiValueFontSize, "dashboard KPI value should keep large metric typography").toBeGreaterThanOrEqual(28);
      expect(kpiValueFontSize, "dashboard KPI value should be visibly larger than its label").toBeGreaterThan(kpiLabelFontSize * 2);

      const kpiAlignments = await page.locator(".dashboard-kpi").evaluateAll((cards) =>
        cards.map((card, index) => {
          const icon = card.querySelector(".dashboard-kpi__icon");
          const value = card.querySelector(".metric-value__value");
          const title = card.querySelector(":scope > span:not(.dashboard-kpi__icon):not(.metric-value)");
          const footnote = card.querySelector(":scope > small");

          return {
            index,
            iconLeft: icon?.getBoundingClientRect().left ?? 0,
            valueLeft: value?.getBoundingClientRect().left ?? 0,
            titleLeft: title?.getBoundingClientRect().left ?? 0,
            footnoteLeft: footnote?.getBoundingClientRect().left ?? 0
          };
        })
      );

      for (const alignment of kpiAlignments) {
        expect(alignment.valueLeft - alignment.iconLeft, `dashboard KPI ${alignment.index} value should sit to the right of icon badge`).toBeGreaterThanOrEqual(44);
        expect(Math.abs(alignment.titleLeft - alignment.valueLeft), `dashboard KPI ${alignment.index} title should align with value column`).toBeLessThanOrEqual(1);
        expect(Math.abs(alignment.footnoteLeft - alignment.valueLeft), `dashboard KPI ${alignment.index} footnote should align with value column`).toBeLessThanOrEqual(1);
      }

      const focusMetric = page.locator(".dashboard-focus-row__metric.status-tone--negative em, .dashboard-focus-row__metric.status-tone--warning em").first();
      await expect(focusMetric).toBeVisible();
      const [metricColor, bodyColor] = await Promise.all([
        focusMetric.evaluate((element) => getComputedStyle(element).color),
        page.locator("body").evaluate((element) => getComputedStyle(element).color)
      ]);
      expect(metricColor, "dashboard focus metric should use semantic status color").not.toBe(bodyColor);
    }

    if (route === "/reports") {
      const negativeFactors = page.getByText("Негативные факторы");
      const positiveFactors = page.getByText("Позитивные факторы");
      await expect(negativeFactors).toBeVisible();
      await expect(positiveFactors).toBeVisible();

      const [negativeTop, positiveTop] = await Promise.all([
        negativeFactors.evaluate((element) => element.getBoundingClientRect().top),
        positiveFactors.evaluate((element) => element.getBoundingClientRect().top)
      ]);
      expect(negativeTop, "negative analytics factors should appear above positive factors").toBeLessThan(positiveTop);
    }
  }

  const dashboardTopbarChrome = topbarChromeByRoute.get("/dashboard");
  expect(dashboardTopbarChrome, "dashboard topbar chrome baseline").toBeDefined();
  expect(topbarChromeByRoute.get("/reviews"), "reviews topbar should use the same chrome as dashboard").toEqual(dashboardTopbarChrome);
  expect(topbarChromeByRoute.get("/coaching"), "coaching topbar should use the same chrome as dashboard").toEqual(dashboardTopbarChrome);
});

test("dashboard shell reaches first content quickly", async ({ page }) => {
  const startedAt = Date.now();

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.locator(".app-nav").waitFor({ state: "visible" });
  await page.getByText(/Фокус сейчас|Последняя активность/).first().waitFor({ state: "visible" });

  expect(Date.now() - startedAt).toBeLessThan(2_500);
});
