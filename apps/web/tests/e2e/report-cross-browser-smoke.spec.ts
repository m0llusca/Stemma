import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";
import { expectNoDocumentOverflow } from "./helpers/layout";

// Компактный кроссбраузерный smoke для Firefox/WebKit (проходит и в chromium).
// Только кроссбраузерные Playwright API: никаких CDP-вызовов и chromium-only фич.
const canonicalOverviewHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";

const overflowTargets = [
  { route: "/dashboard", landmark: '[data-slot="dashboard-primary-grid"]' },
  { route: "/reports", landmark: 'section[aria-label="Параметры отчёта"]' }
] as const;
const overflowWidths = [390, 1280] as const;

// Допустимый браузерный шум: только ресурсные 404 на favicon; всё остальное
// (console.error и pageerror) считается неожиданным — как в analytics-shell-layout.
// Отдельный WebKit-only случай: при навигации WebKit абортирует в-flight
// RSC-prefetch-запросы Next Link и репортит их как pageerror "…_rsc=… due to
// access control checks". Prefetch — это оптимизация, не функциональность:
// на тихой странице те же запросы отвечают 200, а контент-assertions проходят.
const allowedConsolePatterns: readonly RegExp[] = [
  /Failed to load resource.*favicon/i,
  /_rsc=.*due to access control checks/i
];

function collectUnexpectedConsole(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    if (allowedConsolePatterns.some((pattern) => pattern.test(text))) {
      return;
    }
    messages.push(`error: ${text}`);
  });
  page.on("pageerror", (error) => {
    // Pageerror проходит через тот же allowlist, что и console.error:
    // WebKit-аборт RSC-prefetch — это pageerror, а не console-сообщение.
    if (allowedConsolePatterns.some((pattern) => pattern.test(error.message))) {
      return;
    }
    messages.push(`pageerror: ${error.message}`);
  });
  return messages;
}

async function readThemeState(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const background = getComputedStyle(document.body).backgroundColor;
    // Chromium serializes oklch-authored colors as lab()/oklab(), not rgb().
    const rgbMatch = background.match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/
    );
    const labMatch = background.match(
      /(?:ok)?lab\(\s*([\d.]+)%?/ /* first channel is Lightness 0..100 */
    );
    let backgroundLuminance: number;
    if (rgbMatch) {
      const [red, green, blue] = [
        Number(rgbMatch[1]),
        Number(rgbMatch[2]),
        Number(rgbMatch[3])
      ];
      backgroundLuminance =
        (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    } else if (labMatch) {
      backgroundLuminance = Number(labMatch[1]) / 100;
    } else {
      throw new Error(`unparseable background color: ${background}`);
    }

    return {
      theme: root.dataset.theme ?? null,
      hasDarkClass: root.classList.contains("dark"),
      colorScheme: getComputedStyle(root).colorScheme,
      background,
      backgroundLuminance
    };
  });
}

async function isFocused(target: Locator) {
  return target.evaluate((node) => node === document.activeElement);
}

// Клавиатурный маршрут до графика без браузероспецифичных допущений:
// WebKit по умолчанию пропускает ссылки при Tab, поэтому число нажатий
// не фиксируется — только верхняя граница.
async function tabUntilFocused(page: Page, target: Locator, maxPresses: number) {
  for (let press = 0; press < maxPresses; press += 1) {
    if (await isFocused(target)) {
      return;
    }
    await page.keyboard.press("Tab");
  }

  expect(
    await isFocused(target),
    `график должен получить фокус не более чем за ${maxPresses} нажатий Tab`
  ).toBe(true);
}

test.setTimeout(120_000);

let workspaceId: string;

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  workspaceId = admin.workspaceId;
  await signInE2EUser(context, admin, "playwright-report-cross-browser-smoke");
});

test("appearance switches Graphite and Night Ops through the real mechanism", async ({
  page
}) => {
  // Базовое состояние делаем детерминированным даже после упавшего прогона.
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { uiTheme: "graphite", uiPaletteOverridesJson: "{}" }
  });

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/reports");
    await expect(
      page.getByRole("region", { name: "Параметры отчёта" })
    ).toBeVisible();

    const graphite = await readThemeState(page);
    expect(graphite.theme, "тема по умолчанию").toBe("graphite");
    expect(graphite.hasDarkClass, "graphite без класса dark").toBe(false);
    expect(graphite.colorScheme, "graphite color-scheme").toContain("light");
    expect(
      graphite.backgroundLuminance,
      `graphite фон должен быть светлым: ${graphite.background}`
    ).toBeGreaterThan(0.6);

    // Механизм appearance: форма /admin/appearance синхронизирует data-theme
    // на <html> через syncUiAppearanceToDocument и автосейвом пишет workspace.
    await page.goto("/admin/appearance");
    await page.getByRole("tab", { name: "Тема" }).click();
    await page.getByText("Night Ops", { exact: true }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "ops");
    const opsPreview = await readThemeState(page);
    expect(opsPreview.hasDarkClass, "живой предпросмотр включает dark").toBe(true);
    expect(opsPreview.colorScheme, "ops color-scheme").toContain("dark");

    await expect
      .poll(
        async () =>
          (
            await prisma.workspace.findUniqueOrThrow({
              where: { id: workspaceId },
              select: { uiTheme: true }
            })
          ).uiTheme,
        { timeout: 20_000, message: "автосейв темы Night Ops" }
      )
      .toBe("ops");
    await expect(
      page.getByRole("status").filter({ hasText: "Все изменения сохранены" })
    ).toBeVisible();

    // Сервер рендерит сохранённую тему на обычной странице.
    await page.goto("/reports");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "ops");
    const ops = await readThemeState(page);
    expect(ops.hasDarkClass, "серверный рендер ops с классом dark").toBe(true);
    expect(ops.colorScheme, "серверный ops color-scheme").toContain("dark");
    expect(
      ops.backgroundLuminance,
      `ops фон должен быть тёмным: ${ops.background}`
    ).toBeLessThan(0.4);
    expect(ops.background, "фон реально меняется").not.toBe(graphite.background);

    // Возврат к Graphite тем же механизмом.
    await page.goto("/admin/appearance");
    await page.getByRole("tab", { name: "Тема" }).click();
    await page.getByText("Graphite", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "graphite");
    await expect
      .poll(
        async () =>
          (
            await prisma.workspace.findUniqueOrThrow({
              where: { id: workspaceId },
              select: { uiTheme: true }
            })
          ).uiTheme,
        { timeout: 20_000, message: "автосейв возврата Graphite" }
      )
      .toBe("graphite");

    await page.goto("/reports");
    const restored = await readThemeState(page);
    expect(restored.theme).toBe("graphite");
    expect(restored.hasDarkClass).toBe(false);
    expect(restored.backgroundLuminance).toBeGreaterThan(0.6);
  } finally {
    // Общая база e2e (workers: 1): гарантированно возвращаем seed-состояние.
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { uiTheme: "graphite", uiPaletteOverridesJson: "{}" }
    });
  }
});

test("keyboard evidence flow opens the sheet and returns focus to the plot", async ({
  page
}) => {
  const unexpectedConsole = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);

  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true");

  const plot = page.locator('[data-slot="quality-trend-plot"]');
  await expect(plot).toBeVisible();
  await expect(plot).toHaveAttribute("tabindex", "0");

  // Начинаем с пустого фокуса и идём Tab'ом до графика.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await tabUntilFocused(page, plot, 120);

  // Выбор точки стрелкой: появляется активная точка, маркер и tooltip-статус.
  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute("data-active-point-id", /.+/);
  await expect(
    page.locator('[data-slot="quality-selected-marker"]')
  ).toBeVisible();
  await expect(plot.getByText("Средний балл", { exact: true })).toBeVisible();

  // Gap days carry no evidence href by design (Enter is inert on them):
  // rove to the first data-bearing point before pressing Enter.
  for (let step = 0; step < 40; step += 1) {
    const sample = await plot.locator('[role="tooltip"]').evaluate((node) => {
      for (const row of node.querySelectorAll("dl > div")) {
        if (row.querySelector("dt")?.textContent?.trim() === "Выборка") {
          return row.querySelector("dd")?.textContent?.trim() ?? null;
        }
      }
      return null;
    });
    if (sample && sample !== "Нет данных" && !sample.startsWith("0 ")) {
      break;
    }
    await page.keyboard.press("ArrowRight");
  }

  // Enter открывает Evidence Sheet через URL-авторитет.
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/(?:\?|&)evidenceType=/);
  await expect(page).toHaveURL(/(?:\?|&)evidenceKey=/);
  const evidenceSheet = page.getByRole("dialog", { name: "Данные и примеры" });
  await expect(evidenceSheet).toBeVisible();

  // Escape закрывает и возвращает фокус точно на график (focus origin).
  await page.keyboard.press("Escape");
  await expect(evidenceSheet).toBeHidden();
  await expect(page).not.toHaveURL(/evidenceType|evidenceKey/);
  expect(await isFocused(plot), "фокус вернулся на график").toBe(true);

  expect(unexpectedConsole, "консоль клавиатурного evidence-флоу").toEqual([]);
});

test("Graph/Table switch renders table data and restores the plot", async ({
  page
}) => {
  const unexpectedConsole = collectUnexpectedConsole(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);

  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator('[data-slot="quality-trend-plot"]')).toBeVisible();

  await page.getByRole("link", { name: "Таблица" }).first().click();
  await expect(page).toHaveURL(/chartView=table/);
  await expect(
    page.getByRole("link", { name: "Таблица" }).first()
  ).toHaveAttribute("aria-current", "page");

  const table = page.getByRole("table", {
    name: "Табличные данные: Динамика качества"
  });
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  expect(await rows.count(), "таблица содержит данные").toBeGreaterThan(0);
  await expect(rows.first().locator("td, th").first()).not.toHaveText("");
  await expect(page.locator('[data-slot="quality-trend-plot"]')).toHaveCount(0);

  await page.getByRole("link", { name: "График" }).first().click();
  await expect(page).toHaveURL(/chartView=graph/);
  await expect(page.locator('[data-slot="quality-trend-plot"]')).toBeVisible();
  await expect(table).toHaveCount(0);

  expect(unexpectedConsole, "консоль Graph/Table переключения").toEqual([]);
});

test("dashboard and reports stay horizontally contained at 390 and 1280", async ({
  page
}) => {
  const unexpectedConsole = collectUnexpectedConsole(page);

  for (const width of overflowWidths) {
    await page.setViewportSize({ width, height: 900 });

    for (const { route, landmark } of overflowTargets) {
      await page.goto(route);
      await expect(
        page.locator(landmark).first(),
        `${route} landmark at ${width}px`
      ).toBeVisible();
      // Внутри helper: scrollWidth - clientWidth документа <= 2.
      await expectNoDocumentOverflow(page);
    }
  }

  expect(unexpectedConsole, "консоль overflow-обхода").toEqual([]);
});

test("report filters use a full-width Sheet at 390 and a Popover at 1280", async ({
  page
}) => {
  const unexpectedConsole = collectUnexpectedConsole(page);

  // Мобильный вариант: полноэкранный Sheet.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(canonicalOverviewHref);
  // Клик по триггеру имеет смысл только после гидратации обработчиков;
  // в WebKit гидратация медленнее, чем в Chromium, и ранний клик теряется.
  await expect(
    page.locator('section[role="region"][aria-label="Параметры отчёта"]')
  ).toHaveAttribute("data-hydrated", "true");
  const mobileTrigger = page.getByRole("button", { name: /^Фильтры \(/ });
  await expect(mobileTrigger).toBeVisible();
  await mobileTrigger.click();

  const sheet = page.getByRole("dialog", { name: "Фильтры отчёта" });
  await expect(sheet).toHaveAttribute("data-slot", "sheet-content");
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(sheetBox!.width, "мобильный Sheet во всю ширину").toBeCloseTo(390, 0);
  expect(sheetBox!.height, "мобильный Sheet во всю высоту").toBeCloseTo(900, 0);
  await sheet.getByRole("button", { name: "Закрыть" }).click();
  await expect(sheet).toBeHidden();
  await expect(mobileTrigger).toBeFocused();

  // Desktop вариант: компактный Popover, Sheet не монтируется.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);
  await expect(
    page.locator('section[role="region"][aria-label="Параметры отчёта"]')
  ).toHaveAttribute("data-hydrated", "true");
  const desktopTrigger = page.getByRole("button", { name: /^Фильтры \(/ });
  await desktopTrigger.click();

  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(
    popover.getByText("Фильтры отчёта", { exact: true })
  ).toBeVisible();
  const popoverBox = await popover.boundingBox();
  expect(popoverBox).not.toBeNull();
  expect(popoverBox!.width, "Popover компактнее вьюпорта").toBeLessThan(1280);
  expect(popoverBox!.height, "Popover не полноэкранный").toBeLessThan(900);

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(desktopTrigger).toBeFocused();
  await expectNoDocumentOverflow(page);

  expect(unexpectedConsole, "консоль фильтров Sheet/Popover").toEqual([]);
});

test.describe("prefers-reduced-motion: reduce", () => {
  test("shortens interface transitions to at most 1ms", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(canonicalOverviewHref);

    const trigger = page.getByRole("button", { name: /^Фильтры \(/ });
    await expect(trigger).toBeVisible();

    const motion = await trigger.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        transitionDurations: styles.transitionDuration
          .split(",")
          .map((value) => Number.parseFloat(value)),
        animationDurations: styles.animationDuration
          .split(",")
          .map((value) => Number.parseFloat(value)),
        fastToken: getComputedStyle(document.documentElement)
          .getPropertyValue("--motion-duration-fast")
          .trim()
      };
    });

    expect(motion.fastToken, "токен --motion-duration-fast").toBe("1ms");
    for (const duration of motion.transitionDurations) {
      // Значения в секундах: 1ms => 0.001s; допускаем и 0s.
      expect(duration, "transition-duration <= 1ms").toBeLessThanOrEqual(0.0011);
    }
    for (const duration of motion.animationDurations) {
      expect(duration, "animation-duration <= 1ms").toBeLessThanOrEqual(0.0011);
    }
  });
});
