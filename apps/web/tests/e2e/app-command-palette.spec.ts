import { expect, test } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

test("lazy command palette focuses its first input, filters, dismisses, and resets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInE2EUser(page.context(), await findSeededDemoAdmin(), "playwright-command-palette");
  await page.goto("/reports");
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("button", { name: "Поиск или команда", exact: true });
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Поиск и команды" });
  const input = dialog.getByRole("combobox", { name: "Поиск или команда" });
  await expect(input).toBeFocused();
  await input.fill("калибров");
  await expect(dialog.getByRole("option").first()).toContainText(/калибров/i);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  expect(errors).toEqual([]);
});
