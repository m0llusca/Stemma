import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import { isLocalPlaywrightVerifyDatabase } from "@/lib/local-playwright-verify-database";
import { findSeededDemoAdmin, findSeededDemoAgent, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow, rect } from "./helpers/layout";

const widths = [320, 390, 768, 1280, 1914] as const;
const fixtureRunId = randomUUID();
const planId = `coaching-layout-plan-${fixtureRunId}`;
const assignmentIds = ["done", "open"].map((status) => `coaching-layout-${status}-${fixtureRunId}`);
const planTitle = "Развитие качества: корректная маршрутизация сложных обращений и согласование следующего шага с клиентом";
const planFocusArea = "Неверная маршрутизация / Владение обращением / Сроки следующего обновления";
const assignmentTitles = [
  "Проверить маршрутизацию сложного обращения и назвать клиенту ответственного, срок и следующий шаг",
  "Закрепить персонализированный ответ клиенту после передачи обращения в профильную команду"
];
let fixtureWorkspaceId: string | undefined;

test.setTimeout(120_000);
test.describe.configure({ mode: "default" });

function requireDisposableVerifyDatabase() {
  // Fixture writes must always target the canonical disposable database, even
  // if an unrelated caller configured a custom Playwright database-name override.
  if (!isLocalPlaywrightVerifyDatabase({ ...process.env, QC_PLAYWRIGHT_DATABASE_NAME: undefined })) {
    throw new Error("Coaching layout fixtures require matching local qc_app_demo_verify:public DATABASE_URL and TEST_DATABASE_URL.");
  }
}

test.beforeAll(async () => {
  requireDisposableVerifyDatabase();
  const [admin, agent] = await Promise.all([findSeededDemoAdmin(), findSeededDemoAgent()]);
  expect(agent.workspaceId).toBe(admin.workspaceId);
  const review = await prisma.review.findFirstOrThrow({
    where: {
      workspaceId: admin.workspaceId,
      status: "FINALIZED",
      reviewSource: "HUMAN",
      conversation: { assigneeId: agent.id }
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, conversationId: true }
  });
  fixtureWorkspaceId = admin.workspaceId;
  await prisma.$transaction(async (transaction) => {
    await transaction.coachingPlan.create({
      data: {
        id: planId,
        workspaceId: admin.workspaceId,
        agentName: agent.name,
        title: planTitle,
        focusArea: planFocusArea,
        status: "active",
        reviewId: review.id,
        conversationId: review.conversationId,
        createdById: admin.id
      }
    });
    await transaction.trainingAssignment.createMany({
      data: assignmentIds.map((id, index) => ({
        id,
        workspaceId: admin.workspaceId,
        reviewId: review.id,
        assigneeId: agent.id,
        assigneeName: agent.name,
        assignedById: admin.id,
        coachingPlanId: planId,
        title: assignmentTitles[index],
        description: "Разобрать контекст обращения, объяснить причину передачи, согласовать срок следующего обновления и проверить, что клиент понимает дальнейшие действия команды поддержки.",
        status: index === 0 ? "done" : "open"
      }))
    });
  });
});

test.afterAll(async () => {
  requireDisposableVerifyDatabase();
  if (!fixtureWorkspaceId) return;
  await prisma.$transaction(async (transaction) => {
    await transaction.trainingAssignment.deleteMany({
      where: { id: { in: assignmentIds }, workspaceId: fixtureWorkspaceId, coachingPlanId: planId }
    });
    await transaction.coachingPlan.deleteMany({
      where: { id: planId, workspaceId: fixtureWorkspaceId }
    });
  });
});

async function expectChildrenContained(container: Locator) {
  const violations = await container.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [...element.children].flatMap((child) => {
      const box = child.getBoundingClientRect();
      if (!box.width || !box.height) return [];
      return box.left < bounds.left - 2 || box.right > bounds.right + 2
        ? [{ text: child.textContent?.slice(0, 80), left: box.left, right: box.right, parent: bounds.width }]
        : [];
    });
  });
  expect(violations, "coaching section children must fit their own section").toEqual([]);
}

async function expectCoachingGeometry(page: Page, width: number) {
  const populatedPlan = page.locator(`[id="coaching-plan-${planId}"]`);
  await expect(populatedPlan).toBeVisible();
  await expect(populatedPlan.getByRole("heading", { name: planTitle, exact: true })).toBeVisible();
  await expectChildrenContained(populatedPlan);
  await expectChildrenContained(populatedPlan.locator(':scope > [data-slot="card"]'));
  const progress = populatedPlan.getByRole("progressbar", { name: `Прогресс плана «${planTitle}»`, exact: true });
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress).toHaveAttribute("aria-valuemax", "2");
  await expect(progress).toHaveAttribute("aria-valuetext", "1/2 закрыто");
  await expect.poll(async () => {
    const track = await rect(progress.locator('[data-slot="progress-track"]'));
    const indicator = await rect(progress.locator('[data-slot="progress-indicator"]'));
    return indicator.width / track.width;
  }, { message: "one completed assignment out of two paints 50% progress" }).toBeCloseTo(0.5, 2);
  await expect(populatedPlan.getByText("1/2 закрыто", { exact: true })).toBeVisible();
  await expect(populatedPlan.getByText(planFocusArea, { exact: true })).toBeVisible();
  await expect(populatedPlan.getByRole("link", { name: "Исходная проверка", exact: true })).toBeVisible();
  const planAssignments = populatedPlan.getByRole("list", { name: `Задания плана «${planTitle}»`, exact: true });
  await expect(planAssignments.getByRole("listitem")).toHaveCount(2);
  for (const title of assignmentTitles) {
    await expect(planAssignments.getByText(title, { exact: true })).toBeVisible();
  }
  if (width < 640) {
    for (const item of await planAssignments.getByRole("listitem").all()) {
      const [itemBox, contentBox, statusBox] = await Promise.all([
        rect(item), rect(item.locator('[data-slot="item-content"]')), rect(item.locator(':scope > [data-slot="badge"]'))
      ]);
      expect(contentBox.width, "mobile plan assignment keeps a full readable text column").toBeGreaterThan(itemBox.width - 24);
      expect(statusBox.y, "status follows the full assignment text on mobile").toBeGreaterThanOrEqual(contentBox.y + contentBox.height);
    }
  }
  await expect(planAssignments.getByText("Готово", { exact: true })).toBeVisible();
  await expect(planAssignments.getByText("Новая", { exact: true })).toBeVisible();
  for (const block of await populatedPlan.locator('[data-slot="card-header"], [data-slot="card-content"], [data-slot="card-footer"], [data-slot="item"], [data-slot="item-content"]').all()) {
    await expectChildrenContained(block);
  }
  await expectChildrenContained(progress.locator(".."));
  if (width === 320 || width === 1280) {
    await populatedPlan.screenshot({ path: test.info().outputPath("populated-coaching-plan.png"), caret: "initial" });
  }
  if (width < 640) {
    for (const name of ["Планы коучинга", "Правила для разбора"]) {
      const section = page.getByLabel(name, { exact: true });
      const header = section.locator(':scope > [data-slot="card-header"]');
      const action = header.locator('[data-slot="card-action"]');
      if (await action.locator('button, a[href]').count()) {
        const description = await rect(header.locator('[data-slot="card-description"]'));
        const actionBox = await rect(action);
        expect(actionBox.y, "long coaching header actions follow the description on mobile").toBeGreaterThanOrEqual(description.y + description.height);
      }
    }
  }
  const trend = page.getByLabel("Динамика качества и зоны роста", { exact: true });
  if (await trend.count()) {
    await expectChildrenContained(trend);
    const sparkline = trend.locator('[data-slot="interactive-sparkline-chart"]');
    if (await sparkline.count()) {
      await expectChildrenContained(sparkline);
    }
    for (const row of await trend.locator("ol > li").all()) {
      await expectChildrenContained(row);
      const category = row.locator(":scope > span").nth(1);
      const textFits = await category.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return text.left >= box.left - 2 && text.right <= box.right + 2;
      });
      expect(textFits, "growth categories remain fully readable instead of truncating").toBe(true);
    }
  }

  const assignments = page.getByRole("list", { name: "Учебные задачи", exact: true });
  if (await assignments.count()) {
    for (const assignment of await assignments.getByRole("listitem").all()) {
      await expectChildrenContained(assignment);
      if (width < 640) {
        const content = await rect(assignment.locator('[data-slot="item-content"]'));
        const actions = await rect(assignment.locator('[data-slot="item-actions"]'));
        const item = await rect(assignment);
        expect(content.width, "mobile task text keeps the available row width").toBeGreaterThan(item.width - 30);
        expect(actions.y, "task actions follow its text instead of compressing the text column").toBeGreaterThanOrEqual(content.y + content.height);
      }
    }
  }
  await expectNoDocumentOverflow(page);
}

for (const width of widths) {
  test(`coaching queue and creation forms stay contained at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 1000 });
    await signInE2EUser(context, await findSeededDemoAdmin(), "coaching-layout-admin");
    await page.goto("/coaching");
    await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
    await expectCoachingGeometry(page, width);

    await page.goto("/coaching?create=1&rule=1&plan=1&agentName=" + encodeURIComponent("Иван Петров"));
    for (const name of ["Новый план коучинга", "Новая учебная задача", "Новая типовая ошибка"]) {
      const form = page.getByRole("form", { name, exact: true });
      await expect(form).toBeVisible();
      await expectChildrenContained(form);
      for (const input of await form.locator('input:not([type="hidden"]), select, textarea').all()) {
        const box = await rect(input);
        expect(box.width, "creation control has usable width").toBeGreaterThan(120);
      }
    }
    const rule = page.getByRole("form", { name: "Новая типовая ошибка", exact: true });
    await rule.getByLabel("Категория", { exact: true }).selectOption("__new__");
    await expect(rule.getByLabel("Новая категория", { exact: true })).toBeVisible();

    const theme = page.getByRole("button", { name: /^Подставить тему «/ }).first();
    if (await theme.count()) {
      await theme.click();
      await expect(page.getByLabel("Фокус-тема", { exact: true })).not.toHaveValue("");
      await expectChildrenContained(page.getByLabel("Темы из недавних проверок", { exact: true }));
    }
    await expectCoachingGeometry(page, width);

    // Filtering exercises an honest empty queue without creating or changing tasks.
    await page.goto("/coaching?q=__coaching_layout_no_results__");
    await expect(page.getByText("В этом срезе нет задач", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Учебные задачи", exact: true })).toHaveCount(0);
    await expectNoDocumentOverflow(page);
  });

  test(`operator coaching keeps personal tasks contained at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 1000 });
    await signInE2EUser(context, await findSeededDemoAgent(), "coaching-layout-operator");
    await page.goto("/coaching");
    await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Новая задача", exact: true })).toHaveCount(0);
    await expectCoachingGeometry(page, width);
    await page.goto("/coaching?q=__coaching_layout_no_results__");
    await expect(page.getByRole("list", { name: "Учебные задачи", exact: true })).toHaveCount(0);
    await expectNoDocumentOverflow(page);
  });
}
