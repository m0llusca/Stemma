import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("completes the seeded refund request review workflow", async ({ page }) => {
  await page.goto("/reviews");

  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();

  await page.getByRole("link", { name: "Refund request after delayed delivery" }).click();

  await expect(page.getByRole("heading", { name: "Refund request after delayed delivery" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversation timeline" })).toBeVisible();

  await page.getByLabel("Review summary").fill("Agent gave the correct refund options and set a clear follow-up.");
  await page.getByLabel("Root cause").fill("Carrier delay created refund-policy ambiguity.");
  await page.getByLabel("Evidence summary").fill("The agent explained store credit and refund timing before resolving.");
  await page.getByLabel("Coaching action").fill("Reinforce proactive delivery-date expectations.");
  await page.getByLabel("Category").fill("Refund policy");

  await page.getByRole("button", { name: "Complete review" }).click();

  await expect(page.getByText("Latest score")).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();
});
