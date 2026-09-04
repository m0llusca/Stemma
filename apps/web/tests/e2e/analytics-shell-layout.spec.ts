import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow, rect } from "./helpers/layout";

const viewportWidths = [390, 768, 1280, 1440] as const;
const shellViewportWidths = [320, 390, 640, 720, 768, 1280, 1440] as const;
const activitySheetWidths = [320, 390, 640] as const;
const summaryAuditWidths = [390, 768, 1440] as const;
const otrsAuditWidths = [390, 1280] as const;
const productAreas = ["Сегодня", "Проверки", "Калибровка", "Обучение", "Аналитика", "Настройки"] as const;

function collectUnexpectedConsole(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      messages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
  return messages;
}

async function horizontalOverflow(locator: Locator) {
  return locator.evaluate((node) => node.scrollWidth - node.clientWidth);
}

async function expectOrdinaryText(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible();
  expect(await locator.getAttribute("data-technical"), `${label} technical marker`).toBeNull();
  expect(
    await locator.evaluate((node) => getComputedStyle(node).wordBreak),
    `${label} should not break every character`
  ).not.toBe("break-all");
}

async function expectSemanticSection(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible();
  expect(await locator.evaluate((node) => node.tagName), `${label} semantic element`).toBe("SECTION");
}

async function expectContained(locator: Locator, owner: Locator, label: string) {
  const [childBox, ownerBox] = await Promise.all([rect(locator), rect(owner)]);
  expect(childBox.x, `${label} left edge`).toBeGreaterThanOrEqual(ownerBox.x - 1);
  expect(childBox.x + childBox.width, `${label} right edge`).toBeLessThanOrEqual(
    ownerBox.x + ownerBox.width + 1
  );
  expect(await horizontalOverflow(locator), `${label} horizontal overflow`).toBeLessThanOrEqual(1);
}

async function isFullyVisibleWithin(locator: Locator, owner: Locator) {
  if (!(await locator.isVisible())) {
    return false;
  }

  const [childBox, ownerBox] = await Promise.all([locator.boundingBox(), owner.boundingBox()]);
  if (!childBox || !ownerBox) {
    return false;
  }

  return (
    childBox.x >= ownerBox.x - 1 &&
    childBox.x + childBox.width <= ownerBox.x + ownerBox.width + 1 &&
    childBox.y >= ownerBox.y - 1 &&
    childBox.y + childBox.height <= ownerBox.y + ownerBox.height + 1
  );
}

test.setTimeout(120_000);

let authenticatedWorkspaceId: string;

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  authenticatedWorkspaceId = admin.workspaceId;
  await signInE2EUser(context, admin, "playwright-analytics-shell-layout");
});

test("integration source switching keeps the Base UI console clean", async ({ page }) => {
  const unexpectedConsole = collectUnexpectedConsole(page);
  const controlMessages: Array<{
    type: string;
    text: string;
    location: { url: string; lineNumber: number; columnNumber: number };
  }> = [];
  page.on("console", (message) => {
    if (
      (message.type() === "error" || message.type() === "warning") &&
      /uncontrolled|controlled|FieldControl/i.test(message.text())
    ) {
      controlMessages.push({
        type: message.type(),
        text: message.text(),
        location: message.location()
      });
    }
  });

  await page.goto("/admin/integrations/new");
  await page.getByRole("radio", { name: /Zendesk/ }).click();
  await page.getByLabel("Адрес источника").fill("https://example.zendesk.com");
  await page.getByLabel("Email агента").fill("agent@example.com");
  await page.getByRole("textbox", { name: /^API-токен/ }).fill("test-token");
  await expect(page.locator('input[name="source"]')).toHaveValue("zendesk");

  await page.getByRole("radio", { name: /OTRS Community Edition 6/ }).click();
  await expect(page.locator('input[name="source"]')).toHaveValue("otrs");
  await page.getByLabel("Адрес источника").fill("https://otrs.example.test");
  await page.getByLabel("Логин агента").fill("agent");
  await page.getByLabel("Пароль").fill("test-password");

  await page.getByRole("radio", { name: /Zendesk/ }).click();
  await expect(page.locator('input[name="source"]')).toHaveValue("zendesk");

  expect(controlMessages, "Base UI controlled/uncontrolled console messages").toEqual([]);
  expect(unexpectedConsole, "integration source switching console").toEqual([]);
});

test("PageShell keeps a 12px mobile gutter and one locally scrollable tab row", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/reports");

  const shell = page.locator('[data-slot="page-shell"]');
  const tabs = page.getByRole("navigation", { name: "Разделы страницы" });
  const tabsBox = await rect(tabs);
  const shellPadding = await shell.evaluate((node) => {
    const styles = getComputedStyle(node);
    return {
      left: Number.parseFloat(styles.paddingLeft),
      right: Number.parseFloat(styles.paddingRight)
    };
  });
  const tabBoxes = await tabs.getByRole("link").evaluateAll((links) =>
    links.map((link) => {
      const box = link.getBoundingClientRect();
      return { y: box.y, height: box.height };
    })
  );

  expect(shellPadding.left, "mobile PageShell left padding").toBe(12);
  expect(shellPadding.right, "mobile PageShell right padding").toBe(12);
  expect(tabsBox.x, "mobile PageShell content left gutter").toBeGreaterThanOrEqual(11);
  expect(tabsBox.x, "mobile PageShell content left gutter").toBeLessThanOrEqual(13);
  expect(320 - (tabsBox.x + tabsBox.width), "mobile PageShell content right gutter").toBeGreaterThanOrEqual(11);
  expect(320 - (tabsBox.x + tabsBox.width), "mobile PageShell content right gutter").toBeLessThanOrEqual(13);
  expect(
    await tabs.evaluate((node) => getComputedStyle(node).flexWrap),
    "page tabs stay on one row"
  ).toBe("nowrap");
  expect(await horizontalOverflow(tabs), "page tabs own local overflow").toBeGreaterThan(0);
  for (const [index, box] of tabBoxes.entries()) {
    expect(
      Math.abs(box.y - tabBoxes[0].y),
      `page tab ${index + 1} shares one row`
    ).toBeLessThanOrEqual(2);
  }
  await expectNoDocumentOverflow(page);
});

for (const width of [320, 390] as const) {
  test(`dashboard triage preserves readable action geometry at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");

    const triage = page.locator('[data-slot="triage-strip"]');
    const copy = triage.locator('[data-slot="triage-strip-copy"]');
    const action = triage.locator('[data-slot="triage-strip-action"]');
    const [triageBox, copyBox, actionBox] = await Promise.all([
      rect(triage),
      rect(copy),
      rect(action)
    ]);

    if (width === 320) {
      expect(actionBox.y, "320px triage action follows copy").toBeGreaterThanOrEqual(
        copyBox.y + copyBox.height + 3
      );
      expect(actionBox.x, "320px triage action aligns left").toBeLessThanOrEqual(
        triageBox.x + 17
      );
      expect(actionBox.width, "320px triage action spans the content row").toBeGreaterThanOrEqual(
        triageBox.width - 34
      );
    } else {
      expect(actionBox.x, "390px triage action returns inline").toBeGreaterThanOrEqual(
        copyBox.x + copyBox.width + 3
      );
      expect(
        Math.abs(
          actionBox.y + actionBox.height / 2 - (copyBox.y + copyBox.height / 2)
        ),
        "390px triage center alignment"
      ).toBeLessThanOrEqual(2);
    }
    await expectNoDocumentOverflow(page);
  });
}

for (const width of [320, 640, 768, 1280] as const) {
  test(`dashboard grids keep their certified tracks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");

    const kpis = page.getByRole("region", { name: "Ключевые показатели" });
    const primary = page.locator('[data-slot="dashboard-primary-grid"]');
    const secondary = page.locator('[data-slot="dashboard-secondary-grid"]');
    const kpiItems = kpis.locator(":scope > *");
    const primaryItems = primary.locator(":scope > *");
    const secondaryItems = secondary.locator(":scope > *");

    await expect(kpis).toBeVisible();
    await expect(kpiItems).toHaveCount(4);
    await expect(primary).toBeVisible();
    await expect(primaryItems).toHaveCount(3);
    await expect(secondary).toBeVisible();
    await expect(secondaryItems).toHaveCount(2);

    const kpiBoxes = await kpiItems.evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width };
      })
    );
    const primaryBoxes = await primaryItems.evaluateAll((items) =>
      items.slice(0, 2).map((item) => {
        const box = item.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width };
      })
    );
    const secondaryBoxes = await secondaryItems.evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width };
      })
    );

    const expectedKpiColumns = width < 640 ? 1 : width < 1280 ? 2 : 4;
    expect(
      new Set(kpiBoxes.map((box) => Math.round(box.x))).size,
      `KPI columns at ${width}px`
    ).toBe(expectedKpiColumns);

    for (const [label, boxes] of [
      ["primary", primaryBoxes],
      ["secondary", secondaryBoxes]
    ] as const) {
      if (width < 1280) {
        expect(boxes[1].y, `${label} pair stacks at ${width}px`).toBeGreaterThan(
          boxes[0].y + 2
        );
      } else {
        expect(Math.abs(boxes[0].y - boxes[1].y), `${label} pair aligns at 1280px`).toBeLessThanOrEqual(2);
        expect(
          boxes[0].width / boxes[1].width,
          `${label} pair uses 2/1 tracks at 1280px`
        ).toBeGreaterThanOrEqual(1.95);
        expect(
          boxes[0].width / boxes[1].width,
          `${label} pair uses 2/1 tracks at 1280px`
        ).toBeLessThanOrEqual(2.05);
      }
    }
    await expectNoDocumentOverflow(page);
  });
}

for (const width of activitySheetWidths) {
  test(`dashboard activity Sheet is flat, contained, and localized at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");

    const trigger = page.getByRole("button", { name: /Последняя активность/ });
    await expect(trigger).toBeVisible();
    expect(
      await trigger.evaluate((element) => element.closest('[data-slot="card"]') !== null),
      `activity trigger must not be wrapped in a card surface at ${width}px`
    ).toBe(false);
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Последняя активность" });
    const dialogBox = await rect(dialog);
    expect(dialogBox.width, `activity Sheet width at ${width}px`).toBeGreaterThanOrEqual(width - 1);
    expect(dialogBox.height, `activity Sheet height at ${width}px`).toBeGreaterThanOrEqual(899);
    await expect(dialog.getByRole("button", { name: "Закрыть" })).toBeVisible();
    await expectNoDocumentOverflow(page);
  });
}

test("dashboard and reports omit decorative PageShell eyebrows", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Рабочее пространство", { exact: true })).toHaveCount(0);

  await page.goto("/reports");
  await expect(page.getByText("Контроль качества", { exact: true })).toHaveCount(0);
});

for (const width of shellViewportWidths) {
  test(`global navigation keeps every product area reachable at ${width}px`, async ({ page }) => {
    const consoleMessages = collectUnexpectedConsole(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/reports");

    const globalNav = page.getByRole("banner", { name: "Глобальная навигация" });
    await expect(globalNav).toBeVisible();
    expect(await horizontalOverflow(globalNav), `global nav overflow at ${width}px`).toBeLessThanOrEqual(2);

    const missingAreas: string[] = [];
    for (const label of productAreas) {
      const link = globalNav.getByRole("link", { name: label, exact: true });
      if (!(await isFullyVisibleWithin(link, globalNav))) {
        missingAreas.push(label);
      }
    }

    if (missingAreas.length > 0) {
      const areaMenuTrigger = globalNav.locator('button[aria-label*="Разделы"]');
      await expect.soft(
        areaMenuTrigger,
        `compact area trigger should expose ${missingAreas.join(", ")} at ${width}px`
      ).toBeVisible();

      if (await areaMenuTrigger.isVisible()) {
        await areaMenuTrigger.click();
        const areaMenu = page.locator(
          '[data-slot="dropdown-menu-content"][aria-label="Основные разделы"]'
        );
        await expect(areaMenu).toBeVisible();
        for (const label of missingAreas) {
          await expect(
            areaMenu.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: label })
          ).toBeVisible();
        }
        await page.keyboard.press("Escape");
      }
    }

    if (width < 640) {
      const pulseTrigger = globalNav.getByRole("button", { name: "Рабочий пульс" });
      await expect(pulseTrigger).toBeVisible();
      await pulseTrigger.click();
      const pulseMenu = page.getByRole("menu", { name: "Рабочий пульс" });
      for (const label of [/^Очередь:/, /^Риск:/, /^Обучение:/, /^Взять следующий кейс$/]) {
        await expect(pulseMenu.getByRole("menuitem", { name: label })).toBeVisible();
      }
      await page.keyboard.press("Escape");
    } else {
      await expect(globalNav.getByRole("link", { name: /^Очередь:/ })).toBeVisible();
      await expect(globalNav.getByRole("link", { name: "Взять следующий кейс" })).toBeVisible();
    }

    await expectNoDocumentOverflow(page);
    expect.soft(consoleMessages, `navigation console at ${width}px`).toEqual([]);
  });
}

test.describe("coarse-pointer global navigation", () => {
  test.use({ hasTouch: true });

  for (const width of shellViewportWidths) {
    test(`keeps every visible topbar action at least 44px at ${width}px`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dashboard");

      const globalNav = page.getByRole("banner", { name: "Глобальная навигация" });
      const actions = globalNav.locator('a[href]:visible, button:visible');
      const boxes = await actions.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return {
            name: node.getAttribute("aria-label") ?? node.textContent?.trim() ?? node.tagName,
            width: box.width,
            height: box.height
          };
        })
      );

      expect(boxes.length, `visible topbar actions at ${width}px`).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box.width, `${box.name} width at ${width}px`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${box.name} height at ${width}px`).toBeGreaterThanOrEqual(44);
      }
      expect(await horizontalOverflow(globalNav), `coarse topbar overflow at ${width}px`).toBeLessThanOrEqual(2);
      await expectNoDocumentOverflow(page);
    });
  }
});

test("global navigation responds to container space instead of viewport width alone", async ({ page }) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/reports");

  const globalNav = page.getByRole("banner", { name: "Глобальная навигация" });
  await globalNav.locator(":scope > div").first().evaluate((node) => {
    node.style.width = "42rem";
    node.style.maxWidth = "42rem";
  });
  await expect(
    globalNav.locator('button[aria-label*="Разделы"]'),
    "a constrained desktop header should use the compact active-area trigger"
  ).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await globalNav.locator(":scope > div").first().evaluate((node) => {
    node.style.width = "100%";
    node.style.maxWidth = "none";
  });
  const areaNav = page.getByRole("navigation", { name: "Основные разделы" });
  await expect(areaNav).toBeVisible();
  const areaNavBox = await rect(areaNav);
  expect(
    areaNavBox.width,
    "full product-area links require at least 42rem of measured navigation space"
  ).toBeGreaterThanOrEqual(42 * 16);
  const areaBoxes = await Promise.all(
    productAreas.map((label) => rect(areaNav.getByRole("link", { name: label, exact: true })))
  );
  const firstAreaTop = areaBoxes[0].y;
  for (const [index, box] of areaBoxes.entries()) {
    expect(Math.abs(box.y - firstAreaTop), `${productAreas[index]} should stay on the same line`).toBeLessThanOrEqual(2);
  }

  expect.soft(consoleMessages, "responsive navigation console").toEqual([]);
});

for (const width of viewportWidths) {
  test(`integration labels and technical values wrap safely at ${width}px`, async ({ page }) => {
    const consoleMessages = collectUnexpectedConsole(page);
    const integration = await prisma.integration.findFirstOrThrow({
      where: {
        workspaceId: authenticatedWorkspaceId,
        source: "salesforce",
        baseUrl: { not: null }
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayName: true,
        baseUrl: true
      }
    });
    const technicalJob = await prisma.backendJob.findFirstOrThrow({
      where: {
        workspaceId: authenticatedWorkspaceId,
        type: "INTEGRATION_IMPORT",
        payloadJson: { contains: `"integrationId":"${integration.id}"` }
      },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });

    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(`/admin/integrations/${integration.id}?section=operations`);
    expect(response?.ok(), "integration detail response").toBe(true);

    const ordinaryLabels: Array<[string, Locator]> = [
      ["integration title", page.locator("h1").filter({ hasText: integration.displayName })],
      ["source summary heading", page.getByRole("heading", { name: "Сводка источника" })],
      ["integration type", page.getByText("Служба поддержки", { exact: true })]
    ];
    for (const [label, locator] of ordinaryLabels) {
      await expectOrdinaryText(locator, `${label} at ${width}px`);
    }

    const sourceSummary = page.getByRole("region", { name: "Сводка источника" });
    await expectSemanticSection(sourceSummary, `source summary at ${width}px`);

    const technicalUrl = page.getByText(integration.baseUrl!, { exact: true });
    await expect(technicalUrl).toHaveAttribute("data-technical", "true");
    await expectContained(technicalUrl, sourceSummary, `technical URL at ${width}px`);

    const jobIdToken = technicalJob.id.slice(0, 8);
    const jobLink = page.getByRole("link", { name: new RegExp(`^Задача ${jobIdToken}`) });
    await expect(jobLink).toBeVisible();
    await expectOrdinaryText(
      jobLink.getByText("Задача", { exact: true }),
      `job label at ${width}px`
    );
    const technicalId = jobLink.getByText(jobIdToken, { exact: true });
    await expect(technicalId).toHaveAttribute("data-technical", "true");
    await expectContained(technicalId, jobLink, `technical ID at ${width}px`);

    await expectNoDocumentOverflow(page);
    expect.soft(consoleMessages, `integration console at ${width}px`).toEqual([]);
  });
}

for (const width of summaryAuditWidths) {
  test(`integration summary keeps adapter readiness sectioned at ${width}px`, async ({ page }) => {
    const consoleMessages = collectUnexpectedConsole(page);
    const integration = await prisma.integration.findFirstOrThrow({
      where: {
        workspaceId: authenticatedWorkspaceId,
        source: "salesforce"
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayName: true
      }
    });

    await page.setViewportSize({ width, height: 1000 });
    const response = await page.goto(`/admin/integrations/${integration.id}?section=summary`);
    expect(response?.ok(), "integration summary response").toBe(true);

    const summary = page.getByRole("region", { name: "Сводка источника" });
    const readiness = summary.getByRole("region", { name: "Готовность адаптера" });
    const command = readiness.getByRole("region", { name: "Командный контур" });
    const route = readiness.getByRole("region", { name: "Маршрут готовности источника" });

    await expect(summary).toBeVisible();
    await expectSemanticSection(readiness, `adapter readiness at ${width}px`);
    await expectSemanticSection(command, `adapter command contour at ${width}px`);
    await expectSemanticSection(route, `adapter readiness route at ${width}px`);
    await expectContained(readiness, summary, `adapter readiness at ${width}px`);
    await expectContained(command, readiness, `adapter command contour at ${width}px`);
    await expectContained(route, readiness, `adapter readiness route at ${width}px`);

    const ordinaryLabels: Array<[string, Locator]> = [
      ["adapter heading", readiness.getByRole("heading", { name: "Готовность адаптера" })],
      ["command heading", command.getByRole("heading", { name: "Командный контур" })],
      ["route label", route.getByText("Профиль", { exact: true })]
    ];
    for (const [label, locator] of ordinaryLabels) {
      await expectOrdinaryText(locator, `${label} at ${width}px`);
    }

    await expectNoDocumentOverflow(page);
    expect.soft(consoleMessages, `integration summary console at ${width}px`).toEqual([]);
  });
}

for (const width of otrsAuditWidths) {
  test(`integration disabled OTRS diagnostics stays sectioned at ${width}px`, async ({ page }) => {
    const consoleMessages = collectUnexpectedConsole(page);
    const fixture = await prisma.integration.create({
      data: {
        workspaceId: authenticatedWorkspaceId,
        source: `otrs-layout-disabled-${width}`,
        displayName: `OTRS без доступов ${width}`,
        type: "otrs_family",
        status: "draft",
        baseUrl: "https://support.example.test/otrs/very/long/technical/path"
      },
      select: {
        id: true
      }
    });

    try {
      await page.setViewportSize({ width, height: 1000 });
      const response = await page.goto(`/admin/integrations/${fixture.id}?section=operations`);
      expect(response?.ok(), "disabled OTRS response").toBe(true);

      const operations = page.getByRole("region", { name: "Настройка и проверки" });
      const route = operations.getByRole("region", { name: "Маршрут OTRS операций" });
      const diagnostics = operations.getByRole("region", { name: "Диагностика", exact: true });

      await expect(operations).toBeVisible();
      await expectSemanticSection(route, `OTRS route at ${width}px`);
      await expectSemanticSection(diagnostics, `disabled OTRS diagnostics at ${width}px`);
      await expectContained(route, operations, `OTRS route at ${width}px`);
      await expectContained(diagnostics, operations, `disabled OTRS diagnostics at ${width}px`);
      await expectOrdinaryText(
        diagnostics.getByRole("heading", { name: "Диагностика", exact: true }),
        `disabled diagnostics heading at ${width}px`
      );
      await expect(
        diagnostics.getByText(
          "Ожидает доступы. Секреты write-only: сохранённые значения в UI не отображаются — введите пароль или API-секрет заново, чтобы обновить."
        )
      ).toBeVisible();

      await expectNoDocumentOverflow(page);
      expect.soft(consoleMessages, `disabled OTRS console at ${width}px`).toEqual([]);
    } finally {
      await prisma.integration.delete({ where: { id: fixture.id } });
    }
  });
}

for (const width of viewportWidths) {
  test(`report parameter lens keeps controls measurable at ${width}px`, async ({ page }) => {
    const consoleMessages = collectUnexpectedConsole(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );

    const lens = page.getByRole("region", { name: "Параметры отчёта" });
    await expect(lens).toBeVisible();

    const controls: Array<[string, Locator]> = [
      ["parameter form", lens.locator('form[action="/reports"]')],
      ["period select", lens.getByLabel("Период", { exact: true })],
      ["comparison select", lens.getByLabel("Сравнение", { exact: true })],
      ["grain select", lens.getByLabel("Шаг", { exact: true })],
      ["filters trigger", lens.getByRole("button", { name: /^Фильтры \(\d+\)$/ })]
    ];
    for (const [label, locator] of controls) {
      const box = await rect(locator);
      expect(box.width, `${label} width at ${width}px`).toBeGreaterThan(80);
    }

    await expectNoDocumentOverflow(page);
    expect.soft(consoleMessages, `report controls console at ${width}px`).toEqual([]);
  });
}

test("quality trend chart renders strokes and keeps one arrow-key tab stop", async ({ page }) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
  );

  const plot = page.locator('[data-slot="quality-trend-plot"]');
  await expect(plot).toBeVisible();
  await expect(plot).toHaveAttribute("role", "group");
  await expect(plot).toHaveAttribute("aria-roledescription", "интерактивный график");
  await expect(plot).toHaveAttribute("tabindex", "0");

  // The deferred chart svg stays presentation-only, so the plot group is the single tab stop.
  const innerSvg = plot.locator("svg").first();
  await expect(innerSvg).toBeVisible();
  await expect(innerSvg).toHaveAttribute("aria-hidden", "true");
  await expect(innerSvg).toHaveAttribute("tabindex", "-1");
  expect(
    await plot.locator('[tabindex="0"]').count(),
    "no descendant of the plot may add a second tab stop"
  ).toBe(0);

  const strokes = await innerSvg
    .locator("path, line")
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).stroke));
  expect(
    strokes.some((stroke) => stroke !== "" && stroke !== "none" && stroke !== "transparent"),
    `quality trend should paint at least one visible stroke: ${JSON.stringify(strokes)}`
  ).toBe(true);

  await plot.focus();
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-1");
  const tooltip = plot.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Средний балл");

  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-2");
  await page.keyboard.press("ArrowLeft");
  await expect(plot).toHaveAttribute("data-active-point-id", "trend-1");
  await page.keyboard.press("Escape");
  await expect(plot).not.toHaveAttribute("data-active-point-id", /./);
  await expect(tooltip).toHaveCount(0);

  await expectNoDocumentOverflow(page);
  expect.soft(consoleMessages, "quality trend keyboard console").toEqual([]);
});

test("reports show a Russian empty state for a deliberately empty custom range", async ({ page }) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.goto("/reports?view=overview&period=custom&start=2000-01-01&end=2000-01-02&grain=day&chartView=graph");

  await expect(page.getByRole("heading", { name: "Аналитика качества" })).toBeVisible();
  await expect(page.getByLabel("Период", { exact: true })).toHaveValue("custom");
  await expect(page.getByText("Нет завершённых проверок").first()).toBeVisible();
  await expect(
    page.getByText("Данные появятся после первой финализированной проверки.").first()
  ).toBeVisible();
  await expect(page.locator('[data-slot="quality-trend-plot"]')).toHaveCount(0);

  await expectNoDocumentOverflow(page);
  expect.soft(consoleMessages, "empty custom range console").toEqual([]);
});
