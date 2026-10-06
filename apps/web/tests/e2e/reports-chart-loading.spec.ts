import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import { demoEntityIds } from "../../prisma/demo-seed-bootstrap";

type BudgetInventory = {
  richChartReachableChunks: Array<{ path: string }>;
  richChartEdges: Array<{ from: string; to: string }>;
};

// Derive chunk hashes from the build actually under test. A historical report
// can silently miss rich downloads and cannot intercept newly renamed chunks.
const inventoryPath = resolve(process.cwd(), ".next/playwright-route-inventory.json");
execFileSync(process.execPath, [resolve(process.cwd(), "scripts/verify-route-budgets.mjs"), "--capture-baseline", inventoryPath]);
const inventory = JSON.parse(
  readFileSync(inventoryPath, "utf8")
) as BudgetInventory;
const richPaths = new Set(
  inventory.richChartReachableChunks.map((chunk) => chunk.path)
);
const fixturePromptVersion = "task6-chart-budget-e2e";
let fixtureIds: string[] = [];

function emittedChunkPath(url: string) {
  const pathname = new URL(url).pathname;
  const normalized = decodeURIComponent(pathname)
    .replace(/^\/?_next\//, "")
    .replace(/^\/+/, "");
  return normalized.startsWith("static/chunks/") && normalized.endsWith(".js")
    ? normalized
    : null;
}

function trackJavaScript(page: Page) {
  const responses: string[] = [];
  page.on("response", (response) => {
    const path = emittedChunkPath(response.url());
    if (path && response.request().resourceType() === "script") {
      responses.push(path);
    }
  });
  return responses;
}

async function signInThroughDemo(page: Page) {
  await page.goto("/auth/login?returnTo=/dashboard");
  await page.getByRole("button", { name: "Демо-вход" }).click();
  await page.getByRole("button", { name: "Войти в демо-режиме" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(150);
}

async function fullScroll(page: Page) {
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
  });
  await settle(page);
}

test.beforeAll(async () => {
  await prisma.aiQualityDraft.deleteMany({
    where: {
      workspaceId: demoEntityIds.workspace,
      promptVersion: fixturePromptVersion
    }
  });
  const reviews = await prisma.review.findMany({
    where: {
      workspaceId: demoEntityIds.workspace,
      status: "FINALIZED",
      reviewSource: "HUMAN",
      finalizedAt: { not: null }
    },
    orderBy: { finalizedAt: "desc" },
    take: 2,
    select: {
      id: true,
      workspaceId: true,
      conversationId: true,
      scores: {
        select: {
          criterionId: true,
          value: true,
          passed: true,
          isNotApplicable: true
        }
      }
    }
  });
  expect(reviews.length).toBeGreaterThan(0);
  fixtureIds = reviews.map(
    (review) => `task6-chart-budget-${review.id}`
  );
  const created = await prisma.aiQualityDraft.createMany({
    data: reviews.map((review, index) => ({
      id: fixtureIds[index],
      workspaceId: review.workspaceId,
      conversationId: review.conversationId,
      reviewId: review.id,
      kind: "score",
      status: "draft",
      modelVersion: "task6-e2e-real-model",
      promptVersion: fixturePromptVersion,
      confidence: 0.84 - index * 0.08,
      suggestedValueJson: JSON.stringify({
        criteria: review.scores.map((score) => ({
          criterionId: score.criterionId,
          value: score.value,
          passed: score.passed,
          isNotApplicable: score.isNotApplicable,
          confidence: 0.8
        }))
      }),
      evidenceRefsJson: "[]",
      createdAt: new Date()
    }))
  });
  expect(created.count).toBe(fixtureIds.length);
});

test.afterAll(async () => {
  const deleted = await prisma.aiQualityDraft.deleteMany({
    where: {
      workspaceId: demoEntityIds.workspace,
      id: { in: fixtureIds },
      promptVersion: fixturePromptVersion
    }
  });
  expect(deleted.count).toBe(fixtureIds.length);
  await expect(
    prisma.aiQualityDraft.count({
      where: {
        workspaceId: demoEntityIds.workspace,
        id: { in: fixtureIds }
      }
    })
  ).resolves.toBe(0);
});

test.beforeEach(async ({ page }) => {
  await signInThroughDemo(page);
});

for (const view of ["overview", "performance", "process"] as const) {
  test(`table ${view} renders without interactive chart surfaces`, async ({ page }) => {
    await page.goto(`/reports?period=vk-current&view=${view}&chartView=table`);
    await expect(page.getByRole("heading", { name: "Аналитика качества" })).toBeVisible();
    await fullScroll(page);
    await expect(page.getByRole("table").first()).toBeVisible();
    await expect(page.locator('[data-slot="deferred-chart-visual"]')).toHaveCount(0);
    await expect(page.locator("svg.recharts-surface")).toHaveCount(0);
  });
}

test("graph performance renders its static visual before scrolling into view", async ({ page }) => {
  await page.goto("/reports?period=vk-current&view=performance&chartView=graph");
  const agreement = page.locator('[data-slot="ranked-breakdown-chart"]');
  await expect(agreement.locator('[data-slot="deferred-chart-visual"]')).toHaveAttribute("data-deferred-state", "ready");
  await expect(agreement.locator("svg.recharts-surface")).toBeAttached();
  await expect(page.getByRole("status", { name: "Загрузка визуального представления" })).toHaveCount(0);
});

test("scrolling a ready graph does not download the rich renderer again", async ({ page }) => {
  const responses = trackJavaScript(page);
  await page.goto("/reports?period=vk-current&view=performance&chartView=graph");
  await settle(page);
  const beforeScroll = responses.filter((path) => richPaths.has(path));
  const agreement = page.locator('[data-slot="ranked-breakdown-chart"]');
  await agreement.scrollIntoViewIfNeeded();
  await expect(agreement.locator("svg.recharts-surface")).toBeVisible();
  await settle(page);
  expect(responses.filter((path) => richPaths.has(path))).toEqual(beforeScroll);
  expect(new Set(beforeScroll).size).toBe(beforeScroll.length);
});

test("graph process keeps stable geometry after its static visual is ready", async ({ page }) => {
  await page.goto("/reports?period=vk-current&view=process&chartView=graph");
  const reason = page.locator('[data-slot="reason-trend-chart"]');
  await expect(reason.locator('[data-slot="deferred-chart-visual"]')).toHaveAttribute("data-deferred-state", "ready");
  const visual = reason.locator("svg.recharts-surface");
  await expect(visual).toBeAttached();
  await reason.scrollIntoViewIfNeeded();
  await expect(visual).toBeVisible();
  await settle(page);
  const initial = await visual.boundingBox();
  await reason.scrollIntoViewIfNeeded();
  await settle(page);
  const settled = await visual.boundingBox();
  expect(initial).not.toBeNull();
  expect(settled).not.toBeNull();
  expect(initial!.height).toBeGreaterThan(100);
  expect(Math.abs(initial!.width - settled!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(initial!.height - settled!.height)).toBeLessThanOrEqual(1);
});
