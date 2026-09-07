import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/db";
import { findSeededDemoAgent, signInE2EUser } from "./helpers/auth";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("SUPPORT_AGENT opens a deduction pack and can start an appeal", async ({ browser }) => {
  const agent = await findSeededDemoAgent();
  const conversation = await prisma.conversation.findFirst({
    where: {
      workspaceId: agent.workspaceId,
      assigneeId: agent.id,
      qaStatus: "FINALIZED",
      reviews: { some: { reviewSource: "HUMAN", status: "FINALIZED" } }
    },
    select: {
      id: true,
      reviews: {
        where: { reviewSource: "HUMAN", status: "FINALIZED" },
        select: { id: true },
        orderBy: [{ finalizedAt: "desc" }, { createdAt: "desc" }],
        take: 1
      }
    }
  });

  expect(conversation?.reviews[0]?.id).toBeTruthy();
  await prisma.review.update({
    where: { id: conversation!.reviews[0]!.id },
    data: {
      appealStatus: "none",
      feedbackStatus: "feedback_sent"
    }
  });

  const context = await browser.newContext();
  await signInE2EUser(context, agent, "playwright-agent-feedback-pack");
  const page = await context.newPage();

  await page.goto("/self-review");
  await expect(page.getByRole("heading", { name: "Моя обратная связь" })).toBeVisible();
  await expect(page.getByText("вы провалили")).toHaveCount(0);
  await expect(page.getByText("лидерборд", { exact: false })).toHaveCount(0);

  const deductions = page.getByRole("list", { name: "Снижения по критериям" }).first();
  await expect(deductions).toBeVisible();

  const firstDeduction = deductions.getByRole("listitem").first();
  const toggle = firstDeduction.getByRole("button").first();
  await expect(toggle).toContainText(/есть цитата|цитата недоступна/);
  await expect(toggle).toContainText("есть как исправить");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }

  await expect(firstDeduction.getByRole("heading", { name: "Цитата" })).toBeVisible();
  await expect(firstDeduction.getByRole("heading", { name: "Снятие" })).toBeVisible();
  await expect(firstDeduction.getByRole("heading", { name: "Как исправить" })).toBeVisible();
  await expect(firstDeduction.getByRole("heading", { name: "Апелляция" })).toBeVisible();
  await expect(firstDeduction.getByText(/баллов/)).toBeVisible();

  const appealTrigger = firstDeduction.getByRole("button", { name: "Апелляция" });
  await expect(appealTrigger).toBeEnabled();
  await appealTrigger.click();
  await expect(firstDeduction.getByLabel("Обоснование")).toBeVisible();
  await expect(firstDeduction.getByRole("button", { name: "Открыть апелляцию" })).toBeVisible();

  await context.close();
});
