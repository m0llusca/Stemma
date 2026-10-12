import { expect, test } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

test.setTimeout(120_000);

test("saved report dialog keeps keyboard focus after its menu unmounts and restores the trigger", async ({ page, context }) => {
  await signInE2EUser(context, await findSeededDemoAdmin(), "playwright-saved-view-focus");
  let writes = 0;
  page.on("request", (request) => { if (request.method() === "POST") writes += 1; });
  await page.goto("/reports?view=overview&period=vk-current&compare=year&grain=week&source=freshdesk&risk=high_plus&chartView=table&series=score");
  await expect(page.getByRole("region", { name: "Параметры отчёта" })).toHaveAttribute("data-hydrated", "true");
  const trigger = page.getByRole("button", { name: /^Сохранённый вид:/ });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // Keep the actual node: role locators omit an exiting hidden menu before
  // its focus cleanup runs, which would miss the original regression.
  const closingMenu = await menu.elementHandle();
  expect(closingMenu).not.toBeNull();
  await menu.getByRole("menuitem", { name: "Сохранить текущий вид", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Сохранить текущий вид", exact: true });
  const name = dialog.getByRole("textbox", { name: "Название", exact: true });
  await expect(dialog).toBeVisible();
  await expect(name).toBeFocused();
  await expect.poll(() => closingMenu!.evaluate((element) => element.isConnected)).toBe(false);
  await expect(name).toBeFocused();
  await page.keyboard.type("Рабочий вид без сохранения");
  await expect(name).toHaveValue("Рабочий вид без сохранения");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("combobox", { name: "Доступ", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(name).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(writes).toBe(0);
  // A subsequent ordinary dismissal still returns to the original trigger.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(writes).toBe(0);
});
