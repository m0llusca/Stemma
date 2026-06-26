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
  "/admin/appearance",
  "/admin/audit",
  "/admin/integrations",
  "/admin/integrations/new",
  "/admin/localization",
  "/admin/sampling",
  "/admin/scorecards",
  "/admin/system",
  "/admin/tokens",
  "/admin/users"
] as const;

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
    await expect(page.locator(".app-topbar"), `${route} topbar`).toBeVisible();
    await expect(page.locator(".app-sidebar"), `${route} sidebar`).toBeVisible();

    const mainHeight = await page.locator("#main-content").evaluate((element) => element.getBoundingClientRect().height);
    expect.soft(mainHeight, `${route} main content height`).toBeGreaterThan(200);

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

      const kpiFootnote = firstKpi.locator(":scope > small");
      const [iconLeft, valueLeft, labelLeft, footnoteLeft] = await Promise.all([
        firstKpi.locator(".dashboard-kpi__icon").evaluate((element) => element.getBoundingClientRect().left),
        kpiValue.evaluate((element) => element.getBoundingClientRect().left),
        kpiLabel.evaluate((element) => element.getBoundingClientRect().left),
        kpiFootnote.evaluate((element) => element.getBoundingClientRect().left)
      ]);
      expect(valueLeft, "dashboard KPI value should align to the icon glyph axis, not the icon box edge").toBeGreaterThan(iconLeft);
      expect(Math.abs(valueLeft - labelLeft), "dashboard KPI value and title should share the same inset").toBeLessThanOrEqual(1);
      expect(Math.abs(valueLeft - footnoteLeft), "dashboard KPI value and footnote should share the same inset").toBeLessThanOrEqual(1);

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
});
