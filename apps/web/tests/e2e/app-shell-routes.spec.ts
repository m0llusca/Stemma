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
  }
});
