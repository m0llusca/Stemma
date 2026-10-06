import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/db";
import { resolveReportPeriod } from "@/lib/report-period";
import { findSeededDemoAnalyst, signInE2EUser } from "./helpers/auth";

test.setTimeout(120_000);
test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("overlapping calibrations use their pinned rubric and separate draft grades", async ({ page, context }) => {
  const analyst = await findSeededDemoAnalyst();
  await signInE2EUser(context, analyst, "audit-calibration");
  const scorecard = await prisma.scorecard.findFirstOrThrow({ where: { workspaceId: analyst.workspaceId, isActive: true }, include: { criteria: true } });
  const conversation = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: analyst.workspaceId, qaStatus: "FINALIZED" } });
  const sessions: Array<{ id: string }> = [];
  for (const name of ["Audit calibration A", "Audit calibration B"]) {
    sessions.push(await prisma.calibrationSession.create({ data: {
      workspaceId: analyst.workspaceId, ownerId: analyst.id, scorecardId: scorecard.id, name, status: "active",
      participants: { create: { userId: analyst.id } }, items: { create: { conversationId: conversation.id } }
    } }));
  }
  const latest = await prisma.scorecard.findFirstOrThrow({ where: { workspaceId: analyst.workspaceId }, orderBy: { version: "desc" } });
  await prisma.scorecard.update({ where: { id: scorecard.id }, data: { isActive: false } });
  await prisma.scorecard.create({ data: { workspaceId: analyst.workspaceId, name: "New active rubric", version: latest.version + 1,
    criteria: { create: scorecard.criteria.map(({ key, label, block, kind, weight, required, order }) => ({ key, label, block, kind, weight, required, order })) } } });

  const href = (sessionId: string) => `/reviews/${conversation.id}?${new URLSearchParams({
    reviewSource: "CALIBRATION", calibrationSessionId: sessionId, returnTo: `/calibration?session=${sessionId}`
  })}`;
  await page.goto(href(sessions[0].id));
  await expect(page.locator('input[name="scorecardId"]')).toHaveValue(scorecard.id);
  await expect(page.getByRole("button", { name: "Завершить и взять следующий" })).toHaveCount(0);
  await page.getByLabel("Итог проверки").fill("Draft for calibration A only");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page).toHaveURL(new RegExp(`/calibration\\?session=${sessions[0].id}`));
  await expect.poll(() => prisma.review.count({ where: { calibrationSessionId: sessions[0].id, status: "DRAFT" } })).toBe(1);

  await page.goto(href(sessions[1].id));
  await expect(page.locator('input[name="scorecardId"]')).toHaveValue(scorecard.id);
  await expect(page.getByLabel("Итог проверки")).toHaveValue("");
  await page.getByLabel("Итог проверки").fill("Draft for calibration B only");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect.poll(() => prisma.review.count({ where: { calibrationSessionId: { in: sessions.map((session) => session.id) }, status: "DRAFT" } })).toBe(2);
});

test("report exports retain the source and risk selected in the browser", async ({ page, context }) => {
  const analyst = await findSeededDemoAnalyst();
  await signInE2EUser(context, analyst, "audit-report-export");
  const period = resolveReportPeriod({});
  const review = await prisma.review.findFirstOrThrow({ where: {
    workspaceId: analyst.workspaceId, reviewSource: "HUMAN", status: "FINALIZED",
    finalizedAt: { gte: period.start, lte: period.end }, findings: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } }
  }, select: { conversation: { select: { externalSource: true } } } });
  const source = review.conversation.externalSource;
  await page.goto(`/reports?${new URLSearchParams({ source, risk: "high_plus" })}`);
  await expect(page.getByRole("heading", { name: "Аналитика качества" })).toBeVisible();
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const csv = page.getByRole("menuitem", { name: "CSV", exact: true });
  const href = await csv.getAttribute("href");
  expect(new URL(href!, "http://localhost").searchParams.get("source")).toBe(source);
  expect(href).toContain("risk=high_plus");
  const response = await context.request.get(href!);
  expect(response.status()).toBe(200);
  const rows = (await response.text()).trim().split("\n");
  expect(rows.length).toBeGreaterThan(1);
  for (const row of rows.slice(1)) {
    expect(row).toContain(source);
    expect(row).toMatch(/HIGH|CRITICAL/);
  }
});
