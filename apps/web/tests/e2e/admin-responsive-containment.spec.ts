import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow, rect } from "./helpers/layout";

// The project's Playwright config restricts this suite to qc_app_demo_verify.
// Exercise actual rendered content: a document-only check misses clipped previews
// and wrapped tab rows that paint over the following panel.
test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(async ({ context }) => {
  await signInE2EUser(context, await findSeededDemoAdmin(), "admin-responsive-containment");
});

test("SSO metadata and provider tabs remain inside their card", async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/access?section=provider");
    const metadata = page.getByRole("alert").filter({ hasText: "Метаданные Entra/OIDC" });
    await expect(metadata).toBeVisible();
    await expectNoDocumentOverflow(page);
    const overflowingText = await metadata.locator("span").evaluateAll((elements) =>
      elements.filter((element) => element.scrollWidth > element.clientWidth + 2).map((element) => element.textContent)
    );
    expect(overflowingText, `SSO metadata at ${width}px`).toEqual([]);

    const tabs = page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "Адреса OIDC/SAML", exact: true }) });
    const panel = page.getByRole("tabpanel").filter({ has: page.getByLabel("Издатель токенов", { exact: true }) });
    const [tabBox, panelBox] = await Promise.all([rect(tabs), rect(panel)]);
    expect(tabBox.y + tabBox.height, `provider tabs at ${width}px`).toBeLessThanOrEqual(panelBox.y + 1);
  }
});

test("brand preview action and wrapped navigation remain contained", async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/appearance");
    const preview = page.getByLabel("Предпросмотр бренда", { exact: true });
    const action = preview.getByRole("button", { name: "Основное действие", exact: true });
    const [previewBox, actionBox] = await Promise.all([rect(preview), rect(action)]);
    expect(actionBox.x).toBeGreaterThanOrEqual(previewBox.x);
    expect(actionBox.x + actionBox.width, `preview action at ${width}px`).toBeLessThanOrEqual(previewBox.x + previewBox.width + 1);
    expect(await action.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);

    const tabs = page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "Брендинг", exact: true }) });
    const panel = page.getByRole("tabpanel", { name: "Брендинг", exact: true });
    const [tabBox, panelBox] = await Promise.all([rect(tabs), rect(panel)]);
    expect(tabBox.y + tabBox.height, `appearance tabs at ${width}px`).toBeLessThanOrEqual(panelBox.y + 1);
    await expectNoDocumentOverflow(page);
  }
});

test("closed admin selects show readable labels before opening the menu", async ({ page }) => {
  await page.goto("/admin/ai-scoring");
  await expect(page.getByLabel("Движок оценки", { exact: true }).locator('[data-slot="select-value"]')).toHaveText("Авто (первый настроенный)");

  await page.goto("/admin/sampling?section=create");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Тип", { exact: true }).locator('[data-slot="select-value"]')).toHaveText("Случайная");
  await expect(dialog.getByLabel("Канал", { exact: true }).locator('[data-slot="select-value"]')).toHaveText("Любой");
  await expect(dialog.getByLabel("CSAT", { exact: true }).locator('[data-slot="select-value"]')).toHaveText("Любой");
});

test("mobile scorecard criteria retain readable summaries beside editing actions", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/admin/scorecards?section=create");
  const dialog = page.getByRole("dialog");
  const criterion = dialog.getByText("Точность ответа", { exact: true }).first();
  await expect(criterion).toBeVisible();
  expect(await criterion.evaluate((element) => ({ width: element.clientWidth, overflow: element.scrollWidth - element.clientWidth }))).toMatchObject({ overflow: 0 });
  const criterionBox = await rect(criterion);
  const dialogBox = await rect(dialog);
  expect(criterionBox.x + criterionBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
  await expect(dialog.getByRole("button", { name: "Опустить", exact: true }).first()).toBeVisible();
});

test("OTRS operation controls stay inside their cards on narrow screens", async ({ page }) => {
  await page.goto("/admin/integrations");
  const source = page.getByRole("link", { name: "Znuny / OTRS / OTOBO", exact: true }).first();
  const sourceHref = await source.getAttribute("href");
  expect(sourceHref).toBeTruthy();

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${sourceHref}?section=operations`);
    const connection = page.getByRole("region", { name: "Настройка подключения", exact: true });
    await expect(connection).toBeVisible();
    for (const name of ["Настройка подключения", "Диагностика", "Предпросмотр / импорт"]) {
      const region = page.getByRole("region", { name, exact: true });
      const outsideControls = await region.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll("button,input,textarea,select"))
          .filter((control) => !control.closest('[data-slot="table-container"]'))
          .filter((control) => {
            const controlBox = control.getBoundingClientRect();
            return controlBox.width > 0 && controlBox.height > 0 &&
              (controlBox.left < box.left - 1 || controlBox.right > box.right + 1);
          })
          .map((control) => control.textContent || control.getAttribute("id"));
      });
      expect(outsideControls, `${name} controls at ${width}px`).toEqual([]);
    }
    for (const name of ["Подключение", "Авторизация", "Лимиты", "Дополнительно"]) {
      await connection.getByRole("tab", { name, exact: true }).click();
      const bounds = await rect(connection);
      const outsideFields = await connection.locator("input,textarea,select").evaluateAll(
        (controls, box) => controls.filter((control) => {
          const field = control.getBoundingClientRect();
          return field.width > 5 && field.height > 5 &&
            (field.left < box.x - 1 || field.right > box.x + box.width + 1);
        }).map((control) => control.id),
        bounds
      );
      expect(outsideFields, `${name} fields at ${width}px`).toEqual([]);
    }
    await expectNoDocumentOverflow(page);
  }
});

test("mobile admin card actions do not squeeze headings below their text width", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const { route, title } of [
      { route: "/admin/report-schedules", title: "Регулярные выгрузки" },
      { route: "/admin/scorecards", title: "Текущая методика оценки" }
    ]) {
      await page.goto(route);
      const heading = page.getByText(title, { exact: true });
      await expect(heading).toBeVisible();
      expect(
        await heading.evaluate((element) => element.scrollWidth - element.clientWidth),
        `${title} at ${width}px`
      ).toBeLessThanOrEqual(2);
      await expectNoDocumentOverflow(page);
    }
  }
});
