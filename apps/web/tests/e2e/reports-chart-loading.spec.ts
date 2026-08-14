import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import { demoEntityIds } from "../../prisma/demo-seed-bootstrap";

type BudgetInventory = {
  deferredRichChartReachableChunks: Array<{ path: string }>;
  deferredRichChartEdges: Array<{ from: string; to: string }>;
};

// The inventory must come from the freshest certified route-budget report for
// the build under test: rich chunk filenames are content-hashed, so any chart
// source change renames them. Task 10's Agent B report tracks the current
// production build; the historical task-6 report names a stale chunk.
const inventoryPath = resolve(
  process.cwd(),
  "../../.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/task-10/route-budgets.json"
);
const inventory = JSON.parse(
  readFileSync(inventoryPath, "utf8")
) as BudgetInventory;
const richPaths = new Set(
  inventory.deferredRichChartReachableChunks.map((chunk) => chunk.path)
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
  test(`table ${view} scrolls to the end without requesting a rich chart response`, async ({
    page
  }) => {
    const responses = trackJavaScript(page);
    await page.goto(
      `/reports?period=vk-current&view=${view}&chartView=table`
    );
    await expect(
      page.getByRole("heading", { name: "Аналитика качества" })
    ).toBeVisible();
    await fullScroll(page);

    const requestedRich = new Set(
      responses.filter((path) => richPaths.has(path))
    );
    expect([...requestedRich]).toEqual([]);
  });
}

test("graph performance does not request the rich renderer before near-viewport", async ({
  page
}) => {
  const responses = trackJavaScript(page);
  await page.goto(
    "/reports?period=vk-current&view=performance&chartView=graph"
  );
  await expect(
    page.getByRole("heading", { name: "Аналитика качества" })
  ).toBeVisible();
  await settle(page);

  const alreadyLoadedBeforeArm = new Set(responses);
  expect(
    [...alreadyLoadedBeforeArm].filter((path) => richPaths.has(path))
  ).toEqual([]);
});

test("graph performance requests the shared rich renderer once after near-viewport", async ({
  page
}) => {
  const responses = trackJavaScript(page);
  await page.goto(
    "/reports?period=vk-current&view=performance&chartView=graph"
  );
  await expect(
    page.getByRole("heading", { name: "Аналитика качества" })
  ).toBeVisible();
  await settle(page);
  const alreadyLoadedBeforeArm = new Set(responses);
  expect(
    [...alreadyLoadedBeforeArm].filter((path) => richPaths.has(path))
  ).toEqual([]);

  const agreement = page.locator('[data-slot="ranked-breakdown-chart"]');
  await agreement.scrollIntoViewIfNeeded();
  await expect(agreement).toBeVisible();
  await settle(page);

  const afterArm = new Set(responses);
  const newJavaScript = [...afterArm].filter(
    (path) => !alreadyLoadedBeforeArm.has(path)
  );
  const expectedRich = [...richPaths].filter(
    (path) => !alreadyLoadedBeforeArm.has(path)
  );
  expect(new Set(newJavaScript)).toEqual(new Set(expectedRich));
  for (const path of expectedRich) {
    expect(
      responses.filter((responsePath) => responsePath === path),
      `${path} should be requested once`
    ).toHaveLength(1);
  }

  const knownPaths = new Set([
    ...inventory.deferredRichChartReachableChunks.map((chunk) => chunk.path),
    ...inventory.deferredRichChartEdges.flatMap((edge) => [
      edge.from,
      edge.to
    ])
  ]);
  expect(
    newJavaScript.filter((path) => !knownPaths.has(path)),
    "new JavaScript after arming must reconcile with the production rich inventory"
  ).toEqual([]);
});

test("graph process keeps static skeleton geometry until the shared renderer resolves", async ({
  page
}) => {
  let releaseRenderer!: () => void;
  const rendererReleased = new Promise<void>((resolvePromise) => {
    releaseRenderer = resolvePromise;
  });
  let intercepted = 0;

  for (const path of richPaths) {
    await page.route(`**/_next/${path}`, async (route) => {
      intercepted += 1;
      await rendererReleased;
      await route.continue();
    });
  }

  await page.goto("/reports?period=vk-current&view=process&chartView=graph");
  const reason = page.locator('[data-slot="reason-trend-chart"]');
  await reason.scrollIntoViewIfNeeded();
  await expect(reason).toBeVisible();
  const deferred = reason.locator('[data-slot="deferred-chart-visual"]');
  await expect(deferred).toHaveAttribute("data-deferred-state", "loading");
  await expect
    .poll(() => intercepted, { message: "rich renderer request should be held" })
    .toBeGreaterThan(0);

  const skeleton = deferred.getByRole("status", {
    name: "Загрузка визуального представления"
  });
  await expect(skeleton).toBeVisible();
  const before = await skeleton.boundingBox();
  expect(before).not.toBeNull();
  await page.waitForTimeout(200);
  const whileHeld = await skeleton.boundingBox();
  expect(whileHeld).toEqual(before);
  await expect(
    skeleton.locator('[aria-hidden="true"][data-qc-motion="none"]')
  ).toBeVisible();

  releaseRenderer();
  await expect(reason.locator("svg.recharts-surface")).toBeVisible();
  await expect(deferred).toHaveAttribute("data-deferred-state", "ready");
});
