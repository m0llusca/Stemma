import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow, rect } from "./helpers/layout";

const queueCases = [
  { width: 390, sideBySide: false },
  { width: 768, sideBySide: false },
  { width: 1280, sideBySide: true },
  { width: 1440, sideBySide: true }
] as const;

const seededLongMessageBody =
  "Помогу разобраться. Заказ еще в пути, поэтому сегодня можем предложить бонусный кредит или оформить возврат после подтверждения перевозчика.";

const detailCases = [
  { width: 390, narrow: true },
  { width: 768, narrow: true },
  { width: 900, narrow: true },
  { width: 1280, narrow: false },
  { width: 1440, narrow: false }
] as const;

test.setTimeout(120_000);

function collectUnexpectedBrowserDiagnostics(page: Page) {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      diagnostics.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  return diagnostics;
}

async function renderedZeroSizeControls(page: Page) {
  return page
    .locator('button, a[href], input, select, textarea, [role="button"]')
    .evaluateAll((controls) =>
      controls.flatMap((control) => {
        const bounds = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        const rendered =
          control.getClientRects().length > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden";

        if (!rendered || (bounds.width > 0 && bounds.height > 0)) {
          return [];
        }

        return [
          {
            tag: control.tagName.toLowerCase(),
            label:
              control.getAttribute("aria-label") ??
              control.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ??
              ""
          }
        ];
      })
    );
}

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

for (const scenario of queueCases) {
  test(`queue geometry at ${scenario.width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    const admin = await findSeededDemoAdmin();
    await signInE2EUser(context, admin, "reviews-layout");
    await page.goto("/reviews");

    const workspace = page.locator('[data-slot="review-queue-workspace"]');
    const focus = page.getByRole("region", { name: "Где смотреть в очереди сейчас" });
    const list = page.locator('[data-slot="review-queue-list"]');
    const preview = page.locator('[data-slot="review-queue-preview"]');

    await expect(workspace).toBeVisible();
    await expect(focus).toBeVisible();
    const [listBox, previewBox] = await Promise.all([rect(list), rect(preview)]);
    expect(Math.abs(listBox.y - previewBox.y) < 8).toBe(scenario.sideBySide);
    await expectNoDocumentOverflow(page);
  });
}

for (const scenario of detailCases) {
  test(`detail workbench geometry at ${scenario.width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    const admin = await findSeededDemoAdmin();
    const seededMessage = await prisma.message.findFirstOrThrow({
      where: {
        externalId: "msg-2",
        conversation: {
          externalSource: "demo_import",
          externalId: "conv-1001"
        }
      },
      select: { conversationId: true }
    });
    await signInE2EUser(context, admin, "reviews-layout");
    await page.goto(`/reviews/${seededMessage.conversationId}`);

    const workspace = page.locator("#review-workspace");
    const masterDetail = workspace.locator(".master-detail");
    const list = masterDetail.locator(".master-detail__list");
    const detail = masterDetail.locator(".master-detail__detail");
    const dialogPane = list.locator('[data-slot="review-dialog-pane"]');
    const scorePane = detail.locator('[data-slot="review-score-pane"]');
    const timeline = dialogPane.locator(".review-conversation-panel");
    const toggle = page.getByRole("group", { name: "Переключение панели" });
    const dialogButton = toggle.getByRole("button", { name: "Диалог" });
    const scoreButton = toggle.getByRole("button", { name: "Оценка" });

    await expect(workspace).toBeVisible();
    await expect(masterDetail).toHaveCount(1);
    await expect(list).toHaveCount(1);
    await expect(detail).toHaveCount(1);
    await expect(dialogPane).toHaveCount(1);
    await expect(scorePane).toHaveCount(1);

    if (scenario.narrow) {
      await expect(toggle).toBeVisible();
      await expect(workspace).toHaveAttribute("data-active-pane", "dialog");
      await expect(list).toBeVisible();
      await expect(detail).toBeHidden();
      await expect(dialogPane).toBeVisible();
      await expect(scorePane).toBeHidden();

      await dialogButton.focus();
      await expect(dialogButton).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(scoreButton).toBeFocused();
      await page.keyboard.press("Space");

      await expect(workspace).toHaveAttribute("data-active-pane", "score");
      await expect(list).toBeHidden();
      await expect(detail).toBeVisible();
      await expect(dialogPane).toBeHidden();
      await expect(scorePane).toBeVisible();
      await expect(masterDetail.locator(".master-detail__list")).toHaveCount(1);
      await expect(masterDetail.locator(".master-detail__detail")).toHaveCount(1);
    } else {
      await expect(toggle).toBeHidden();
      await expect(list).toBeVisible();
      await expect(detail).toBeVisible();

      await workspace.evaluate((node) => {
        const top = node.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top + 200 });
      });

      await expect.poll(async () => (await rect(list)).y).toBeGreaterThanOrEqual(70);
      const [listBox, detailBox, stickyStyle, timelineOverflow] = await Promise.all([
        rect(list),
        rect(detail),
        list.evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            position: style.position,
            overflowY: style.overflowY,
            maxHeight: Number.parseFloat(style.maxHeight)
          };
        }),
        timeline.evaluate((node) => node.scrollWidth - node.clientWidth)
      ]);

      expect(detailBox.x).toBeGreaterThan(listBox.x + listBox.width - 1);
      expect(Math.abs(listBox.y - detailBox.y)).toBeGreaterThan(8);
      expect(stickyStyle.position).toBe("sticky");
      expect(stickyStyle.overflowY).toBe("auto");
      expect(stickyStyle.maxHeight).toBeLessThanOrEqual(797);
      expect(listBox.y + listBox.height).toBeLessThanOrEqual(869);
      expect(timelineOverflow).toBeLessThanOrEqual(2);
    }

    await expectNoDocumentOverflow(page);
  });
}

test("OTRS-2602 review detail stays contained at 390px", async ({ page, context }) => {
  const diagnostics = collectUnexpectedBrowserDiagnostics(page);
  await page.setViewportSize({ width: 390, height: 900 });
  const admin = await findSeededDemoAdmin();
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: {
      externalSource: "otrs_family",
      externalId: "OTRS-2602"
    },
    select: { id: true, subject: true }
  });

  expect(conversation.subject).toBe("Неверный отдел для технической ошибки");
  await signInE2EUser(context, admin, "reviews-layout-otrs-2602");
  await page.goto(`/reviews/${conversation.id}`);
  await expect(page.getByRole("heading", { name: conversation.subject })).toBeVisible();
  await expect(page.locator("#review-evidence")).toBeVisible();
  const latestFindingHeading = page.getByRole("heading", {
    level: 2,
    name: "Последнее замечание"
  });
  await expect(latestFindingHeading).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "История проверок" })
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });

  await expectNoDocumentOverflow(page);
  expect(await renderedZeroSizeControls(page)).toEqual([]);
  expect(diagnostics, "Browser warning/error/pageerror on OTRS-2602 detail").toEqual([]);
});

test("conversation timeline keeps avatar and long content in separate columns", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const admin = await findSeededDemoAdmin();
  const seededMessage = await prisma.message.findFirstOrThrow({
    where: {
      externalId: "msg-2",
      body: seededLongMessageBody,
      conversation: {
        externalSource: "demo_import",
        externalId: "conv-1001"
      }
    },
    select: { id: true, conversationId: true }
  });
  await signInE2EUser(context, admin, "reviews-layout");
  await page.goto(`/reviews/${seededMessage.conversationId}`);

  const message = page.locator(
    `[data-slot="conversation-message"][id="msg-${seededMessage.id}"]`
  );
  const avatar = message.locator('[data-slot="conversation-message-avatar"]');
  const content = message.locator('[data-slot="conversation-message-content"]');
  await expect(message).toContainText(seededLongMessageBody);
  const [messageBox, avatarBox, contentBox] = await Promise.all([
    rect(message),
    rect(avatar),
    rect(content)
  ]);

  expect(contentBox.x).toBeGreaterThan(avatarBox.x + avatarBox.width);
  expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(messageBox.x + messageBox.width + 1);
  await expectNoDocumentOverflow(page);
});
