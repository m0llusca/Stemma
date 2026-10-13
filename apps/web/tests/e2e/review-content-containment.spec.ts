import { expect, test } from "@playwright/test";
import { findSeededDemoAdmin, findSeededDemoAgent, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow, rect } from "./helpers/layout";

test("narrow queue filter counter stays inside its trigger", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await signInE2EUser(context, await findSeededDemoAdmin(), "queue-content-containment");
  await page.goto("/reviews");

  const trigger = page.getByRole("button", { name: /Точные фильтры/ });
  const box = await rect(trigger);
  const children = await trigger.locator(":scope > *").evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
    })
  );

  for (const child of children) {
    expect(child.left).toBeGreaterThanOrEqual(box.x - 1);
    expect(child.right).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(child.top).toBeGreaterThanOrEqual(box.y - 1);
    expect(child.bottom).toBeLessThanOrEqual(box.y + box.height + 1);
  }
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Точные фильтры" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expectNoDocumentOverflow(page);
});

test("agent review headers and the expanded appeal fit narrow cards", async ({ page, context }) => {
  await signInE2EUser(context, await findSeededDemoAgent(), "agent-content-containment");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/self-review");
    const triggers = page.getByRole("button", { name: /^Разбор:/ });
    await expect(triggers.first()).toBeVisible();

    for (const trigger of await triggers.all()) {
      const box = await rect(trigger);
      const card = await rect(trigger.locator('xpath=ancestor::*[@data-slot="card"][1]'));
      expect(box.x).toBeGreaterThanOrEqual(card.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1);
    }

    const first = triggers.first();
    if ((await first.getAttribute("aria-expanded")) !== "true") await first.click();
    const card = first.locator('xpath=ancestor::*[@data-slot="card"][1]');
    await card.getByRole("button", { name: "Оспорить оценку", exact: true }).click();
    const appealForm = card.locator("form").filter({ has: page.getByLabel("Обоснование", { exact: true }) });
    const [cardBox, fieldBox, submitBox] = await Promise.all([
      rect(card),
      rect(appealForm.getByLabel("Обоснование", { exact: true })),
      rect(appealForm.getByRole("button", { name: "Отправить", exact: true }))
    ]);
    for (const box of [fieldBox, submitBox]) {
      expect(box.x).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    }
    await expectNoDocumentOverflow(page);
  }
});

test("an unbroken transcript URL stays inside its message column", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await signInE2EUser(context, await findSeededDemoAdmin(), "transcript-content-containment");
  await page.goto("/reviews");
  await page.locator('tbody a[href^="/reviews/"]').first().click();
  await page.getByRole("button", { name: "Оценка", exact: true }).click();
  await page.getByRole("button", { name: "Диалог", exact: true }).click();

  const message = page.locator('[data-slot="conversation-message"]').first();
  const surface = message.locator('[data-slot="conversation-message-surface"]');
  await surface.locator("p").last().evaluate((node) => {
    node.textContent = `https://example.com/${"x".repeat(300)}`;
  });
  const [messageBox, surfaceBox] = await Promise.all([rect(message), rect(surface)]);
  expect(surfaceBox.x).toBeGreaterThanOrEqual(messageBox.x - 1);
  expect(surfaceBox.x + surfaceBox.width).toBeLessThanOrEqual(messageBox.x + messageBox.width + 1);
  expect(await surface.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(2);
  await expectNoDocumentOverflow(page);
});
