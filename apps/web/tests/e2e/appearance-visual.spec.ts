import { expect, test, type Page } from "@playwright/test";
import {
  defaultUiContrast,
  defaultUiCorners,
  defaultUiDensity,
  uiContrastOptions,
  uiCornersOptions,
  uiDensityOptions,
  uiThemeOptions,
  type UiContrastId,
  type UiCornersId,
  type UiDensityId,
  type UiThemeId
} from "@/lib/ui-theme";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

/**
 * Task 10 — визуальная матрица оформления (task-10-brief.md §9.4).
 *
 * Базовая матрица: ровно 42 скриншота —
 * {dashboard, reports overview graph, admin appearance} × 7 тем × {390, 1440}.
 * Дополнительно: reports Graph/Table на 390/1440 (Graphite), pairwise-покрытие
 * модификаторов density/corners/contrast в Graphite и Ops, reflow-прокси 640/720.
 *
 * Список тем и модификаторов — канонический источник apps/web/src/lib/ui-theme.ts
 * (uiThemeOptions / uiDensityOptions / uiCornersOptions / uiContrastOptions).
 * Переключение выполняется тем же механизмом, что live-preview страницы
 * /admin/appearance: syncUiAppearanceToDocument (src/lib/ui-theme-dom.ts) ставит
 * data-theme/data-density/data-corners/data-contrast, класс "dark" и colorScheme
 * на <html>; localStorage не используется — состояние живёт в DOM-атрибутах.
 */

const graphHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";
const tableHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score%2Cvolume%2Cprevious%2Ctarget";

const baseWidths = [390, 1440] as const;
const reflowWidths = [640, 720] as const;
const baseRoutes = ["dashboard", "reports-overview-graph", "admin-appearance"] as const;

type AppearanceState = {
  theme: UiThemeId;
  density: UiDensityId;
  corners: UiCornersId;
  contrast: UiContrastId;
};

/**
 * Pairwise-покрытие density(3) × corners(3) × contrast(2): 9 комбинаций,
 * содержащих все 9 пар density×corners, все 6 пар density×contrast и все
 * 6 пар corners×contrast (проверяется отдельным guard-тестом ниже).
 */
const pairwiseModifierMatrix = [
  { density: "compact", corners: "sharp", contrast: "standard" },
  { density: "compact", corners: "medium", contrast: "high" },
  { density: "compact", corners: "soft", contrast: "standard" },
  { density: "comfortable", corners: "sharp", contrast: "high" },
  { density: "comfortable", corners: "medium", contrast: "standard" },
  { density: "comfortable", corners: "soft", contrast: "high" },
  { density: "spacious", corners: "sharp", contrast: "standard" },
  { density: "spacious", corners: "medium", contrast: "high" },
  { density: "spacious", corners: "soft", contrast: "standard" }
] as const satisfies readonly Omit<AppearanceState, "theme">[];

test.setTimeout(300_000);

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  await signInE2EUser(context, admin, "playwright-appearance-visual");
});

function themedAppearance(
  theme: UiThemeId,
  overrides: Partial<Omit<AppearanceState, "theme">> = {}
): AppearanceState {
  return {
    theme,
    density: overrides.density ?? defaultUiDensity,
    corners: overrides.corners ?? defaultUiCorners,
    contrast: overrides.contrast ?? defaultUiContrast
  };
}

/**
 * Тот же контракт, что syncUiAppearanceToDocument: data-атрибуты корня,
 * класс "dark" для тёмного режима и colorScheme. Палитровые overrides в
 * demo-seed отсутствуют, поэтому CSS-переменные не трогаем.
 */
async function applyAppearance(page: Page, appearance: AppearanceState) {
  const mode =
    uiThemeOptions.find((option) => option.id === appearance.theme)?.mode ?? "light";

  await page.evaluate(
    ({ theme, density, corners, contrast, themeMode }) => {
      const root = document.documentElement;
      root.dataset.theme = theme;
      root.dataset.density = density;
      root.dataset.corners = corners;
      root.dataset.contrast = contrast;
      root.classList.toggle("dark", themeMode === "dark");
      root.style.colorScheme = themeMode;
    },
    { ...appearance, themeMode: mode }
  );
}

async function settleVisuals(page: Page, appearance: AppearanceState) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", appearance.theme);
  await expect(html).toHaveAttribute("data-density", appearance.density);
  await expect(html).toHaveAttribute("data-corners", appearance.corners);
  await expect(html).toHaveAttribute("data-contrast", appearance.contrast);
}

// Конвенция task8-screenshot-capture.spec.ts: каждая деферред-графика должна
// дойти до data-deferred-state="ready" до снимка.
async function settleDeferredCharts(page: Page) {
  const charts = page.locator('[data-slot="deferred-chart-visual"]');
  const count = await charts.count();
  for (let index = 0; index < count; index += 1) {
    const chart = charts.nth(index);
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toHaveAttribute("data-deferred-state", "ready", {
      timeout: 15_000
    });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function captureFullPage(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: "disabled"
  });
}

async function openDashboard(page: Page, appearance: AppearanceState) {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { level: 1, name: "Сегодня" })
  ).toBeVisible();
  await applyAppearance(page, appearance);
  await settleVisuals(page, appearance);
  await settleDeferredCharts(page);
}

async function openReportsOverviewGraph(page: Page, appearance: AppearanceState) {
  await page.goto(graphHref);
  await expect(
    page.locator('section[role="region"][aria-label="Параметры отчёта"]')
  ).toHaveAttribute("data-hydrated", "true");
  await expect(
    page.getByRole("heading", { level: 1, name: "Аналитика качества" })
  ).toBeVisible();
  await applyAppearance(page, appearance);
  await settleVisuals(page, appearance);
  await settleDeferredCharts(page);
}

async function openReportsOverviewTable(page: Page, appearance: AppearanceState) {
  await page.goto(tableHref);
  await expect(
    page.getByRole("table", { name: "Табличные данные: Динамика качества" })
  ).toBeVisible();
  await applyAppearance(page, appearance);
  await settleVisuals(page, appearance);
  await settleDeferredCharts(page);
}

async function openAdminAppearance(page: Page, appearance: AppearanceState) {
  await page.goto("/admin/appearance");
  await expect(
    page.getByRole("heading", { level: 1, name: "Внешний вид" })
  ).toBeVisible();
  await expect(page.locator("#appearance-settings-title")).toBeVisible();
  await applyAppearance(page, appearance);
  await settleVisuals(page, appearance);
}

test("базовая матрица содержит ровно 42 скриншота и все 7 тем", () => {
  expect(baseRoutes.length * uiThemeOptions.length * baseWidths.length).toBe(42);
  expect(uiThemeOptions.map((theme) => theme.id)).toEqual([
    "graphite",
    "azure",
    "emerald",
    "violet",
    "amber",
    "rose",
    "ops"
  ]);
});

test("pairwise-матрица покрывает каждую пару значений модификаторов", () => {
  const covered = new Set<string>();
  for (const combo of pairwiseModifierMatrix) {
    covered.add(`density=${combo.density}&corners=${combo.corners}`);
    covered.add(`density=${combo.density}&contrast=${combo.contrast}`);
    covered.add(`corners=${combo.corners}&contrast=${combo.contrast}`);
  }

  for (const density of uiDensityOptions) {
    for (const corners of uiCornersOptions) {
      expect(
        covered.has(`density=${density.id}&corners=${corners.id}`),
        `пара density=${density.id} × corners=${corners.id} покрыта`
      ).toBe(true);
    }
    for (const contrast of uiContrastOptions) {
      expect(
        covered.has(`density=${density.id}&contrast=${contrast.id}`),
        `пара density=${density.id} × contrast=${contrast.id} покрыта`
      ).toBe(true);
    }
  }
  for (const corners of uiCornersOptions) {
    for (const contrast of uiContrastOptions) {
      expect(
        covered.has(`corners=${corners.id}&contrast=${contrast.id}`),
        `пара corners=${corners.id} × contrast=${contrast.id} покрыта`
      ).toBe(true);
    }
  }
});

// --- Базовая матрица: 3 маршрута × 7 тем × 2 ширины = 42 скриншота ---
for (const width of baseWidths) {
  for (const theme of uiThemeOptions) {
    test(`базовая матрица: ${theme.id} на ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const appearance = themedAppearance(theme.id);

      await openDashboard(page, appearance);
      await captureFullPage(page, `dashboard-${theme.id}-${width}.png`);

      await openReportsOverviewGraph(page, appearance);
      await captureFullPage(page, `reports-overview-graph-${theme.id}-${width}.png`);

      await openAdminAppearance(page, appearance);
      await captureFullPage(page, `admin-appearance-${theme.id}-${width}.png`);
    });
  }
}

// --- Reports Graph/Table на 390/1440 (текущая тема Graphite). Graph-поверхность
// Graphite на этих ширинах уже входит в базовую матрицу под стабильными именами
// reports-overview-graph-graphite-{390,1440}.png; здесь добавляется табличное
// представление, замыкающее пару Graph/Table. ---
for (const width of baseWidths) {
  test(`reports Graph/Table (Graphite) на ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const appearance = themedAppearance("graphite");

    await openReportsOverviewTable(page, appearance);
    await captureFullPage(page, `reports-overview-table-graphite-${width}.png`);
  });
}

// --- Pairwise density/corners/contrast в Graphite и Ops (dashboard, 1440px) ---
for (const theme of ["graphite", "ops"] as const) {
  test(`pairwise-модификаторы на dashboard: ${theme}`, async ({ page }) => {
    test.setTimeout(540_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const combo of pairwiseModifierMatrix) {
      const appearance = themedAppearance(theme, combo);
      await openDashboard(page, appearance);
      await captureFullPage(
        page,
        `dashboard-${theme}-${combo.density}-${combo.corners}-${combo.contrast}-1440.png`
      );
    }
  });
}

// --- Reflow-прокси 640/720: dashboard + reports overview (Graphite) ---
for (const width of reflowWidths) {
  test(`reflow-прокси на ${width}px (Graphite)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const appearance = themedAppearance("graphite");

    await openDashboard(page, appearance);
    await captureFullPage(page, `dashboard-graphite-${width}.png`);

    await openReportsOverviewGraph(page, appearance);
    await captureFullPage(page, `reports-overview-graph-graphite-${width}.png`);
  });
}
