import { expect, test, type Page } from "@playwright/test";
import {
  defaultUiContrast,
  defaultUiCorners,
  defaultUiDensity,
  uiThemeOptions,
  type UiThemeId
} from "@/lib/ui-theme";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

/**
 * Task 10 — контрастная сертификация (план §Task 10, task-10-brief.md §9.2).
 *
 * Для всех семи тем (uiThemeOptions из src/lib/ui-theme.ts) на /dashboard и
 * /reports overview graph читаются реальные computed colors и проверяется
 * WCAG-контраст (relative luminance из sRGB):
 * - обычный текст ≥ 4.5:1 (заголовки, body-текст, muted-текст, бейджи);
 * - крупный текст (≥24px или ≥18.66px при weight ≥700) ≥ 3:1;
 * - контролы (кнопки/поля/переключатели: фон, граница или текстовый
 *   идентификатор против окружения) ≥ 3:1;
 * - focus-visible ring (outline/box-shadow после клавиатурного Tab) ≥ 3:1;
 * - существенные метки графиков (SVG text) и штрихи серий/ориентиров
 *   (line/path/polyline stroke) ≥ 3:1.
 *
 * Цвета нормализуются через canvas 2d (fillStyle → пиксель), поэтому и sRGB,
 * и OKLCH/color() значения сводятся к одному пространству. Элементы поверх
 * градиентов/изображений (неоднозначный фон) исключаются и учитываются в
 * skippedUnknownBackground. Все нарушения собираются и выводятся одним списком.
 *
 * Тема применяется тем же механизмом, что live-preview /admin/appearance
 * (syncUiAppearanceToDocument): data-атрибуты корня + класс "dark" + colorScheme.
 */

const graphHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";

const focusTabStops = 8;

type Rgba = [number, number, number, number];

type QcColorHelpers = {
  colorToRgba: (color: string) => Rgba | null;
  compositeOver: (fg: Rgba, bg: Rgba) => Rgba;
  contrastRatio: (fg: Rgba, bg: Rgba) => number;
  effectiveBackground: (start: Element | null) => Rgba | null;
  formatRgba: (rgba: Rgba) => string;
  describeElement: (el: Element) => string;
  isVisible: (el: Element) => boolean;
  directText: (el: Element) => string;
};

type ScanViolation = {
  category: string;
  target: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
};

type ContrastViolation = ScanViolation & { page: string; theme: string };

type ScanResult = {
  violations: ScanViolation[];
  textChecked: number;
  controlChecked: number;
  svgTextChecked: number;
  svgStrokeChecked: number;
  skippedUnknownBackground: number;
};

test.setTimeout(300_000);

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  await signInE2EUser(context, admin, "playwright-appearance-contrast");
});

/**
 * Переключение темы анимирует `transition-colors` (0.15s) на карточках,
 * навигации и бейджах; под нагрузкой (гидратация chart-чанков) старт
 * перехода может задерживаться на секунды, поэтому скан сразу после
 * переключения измеряет промежуточные цвета перехода (Night Ops — единственный
 * light↔dark перепад, где промежуточные пары падают ниже порога). Ждём кадр,
 * чтобы пересчёт стилей создал переходы, затем дожидаемся завершения всех
 * бегущих CSS transitions. Сила проверок не меняется — стабилизируется только
 * момент измерения.
 */
async function drainThemeTransitions(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  await page.evaluate(async () => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const running = (
        document.getAnimations as (options?: { subtree?: boolean }) => Animation[]
      )({ subtree: true }).filter(
          (anim) =>
            anim instanceof CSSTransition && anim.playState === "running"
        );
      if (running.length === 0 || Date.now() > deadline) {
        return;
      }
      await Promise.allSettled(running.map((anim) => anim.finished));
    }
  });
}

async function applyTheme(page: Page, theme: UiThemeId) {
  const mode = uiThemeOptions.find((option) => option.id === theme)?.mode ?? "light";

  await page.evaluate(
    ({ themeId, density, corners, contrast, themeMode }) => {
      const root = document.documentElement;
      root.dataset.theme = themeId;
      root.dataset.density = density;
      root.dataset.corners = corners;
      root.dataset.contrast = contrast;
      root.classList.toggle("dark", themeMode === "dark");
      root.style.colorScheme = themeMode;
    },
    {
      themeId: theme,
      density: defaultUiDensity,
      corners: defaultUiCorners,
      contrast: defaultUiContrast,
      themeMode: mode
    }
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await drainThemeTransitions(page);
}

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

async function openDashboard(page: Page, theme: UiThemeId) {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { level: 1, name: "Сегодня" })
  ).toBeVisible();
  await applyTheme(page, theme);
  await settleDeferredCharts(page);
}

async function openReportsOverviewGraph(page: Page, theme: UiThemeId) {
  await page.goto(graphHref);
  await expect(
    page.locator('section[role="region"][aria-label="Параметры отчёта"]')
  ).toHaveAttribute("data-hydrated", "true");
  await expect(
    page.getByRole("heading", { level: 1, name: "Аналитика качества" })
  ).toBeVisible();
  await applyTheme(page, theme);
  await settleDeferredCharts(page);
}

/**
 * Ставит на window.__qcColor набор чистых функций расчёта контраста по WCAG:
 * relative luminance из линеаризованного sRGB, композиция полупрозрачных
 * цветов и разрешение эффективного фона по цепочке предков.
 */
async function installColorHelpers(page: Page) {
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const colorToRgba = (color: string): [number, number, number, number] | null => {
      if (!ctx || !color || color === "none") {
        return null;
      }
      if (color.startsWith("url(")) {
        return null;
      }
      ctx.globalCompositeOperation = "copy";
      ctx.fillStyle = "#010203";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2], data[3] / 255];
    };

    const compositeOver = (
      fg: [number, number, number, number],
      bg: [number, number, number, number]
    ): [number, number, number, number] => {
      const alpha = fg[3] + bg[3] * (1 - fg[3]);
      if (alpha === 0) {
        return [0, 0, 0, 0];
      }
      return [
        (fg[0] * fg[3] + bg[0] * bg[3] * (1 - fg[3])) / alpha,
        (fg[1] * fg[3] + bg[1] * bg[3] * (1 - fg[3])) / alpha,
        (fg[2] * fg[3] + bg[2] * bg[3] * (1 - fg[3])) / alpha,
        alpha
      ];
    };

    const relativeLuminance = (rgba: [number, number, number, number]) => {
      const [r, g, b] = [rgba[0], rgba[1], rgba[2]].map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : Math.pow((channel + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const contrastRatio = (
      fg: [number, number, number, number],
      bg: [number, number, number, number]
    ) => {
      const solidFg = fg[3] < 1 ? compositeOver(fg, bg) : fg;
      const first = relativeLuminance(solidFg);
      const second = relativeLuminance(bg);
      const lighter = Math.max(first, second);
      const darker = Math.min(first, second);
      return (lighter + 0.05) / (darker + 0.05);
    };

    const effectiveBackground = (
      start: Element | null
    ): [number, number, number, number] | null => {
      const layers: [number, number, number, number][] = [];
      let node: Element | null = start;
      let sawOpaque = false;

      while (node) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== "none") {
          // Градиент/изображение: фон неоднозначен, элемент исключается из выборки.
          return null;
        }
        const bg = colorToRgba(style.backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) {
            sawOpaque = true;
            break;
          }
        }
        node = node.parentElement;
      }

      let result: [number, number, number, number] = sawOpaque
        ? layers.pop()!
        : document.documentElement.classList.contains("dark")
          ? [11, 15, 23, 1]
          : [255, 255, 255, 1];
      while (layers.length) {
        result = compositeOver(layers.pop()!, result);
      }
      return result;
    };

    const formatRgba = (rgba: [number, number, number, number]) =>
      `rgba(${Math.round(rgba[0])}, ${Math.round(rgba[1])}, ${Math.round(rgba[2])}, ${rgba[3].toFixed(2)})`;

    const describeElement = (el: Element): string => {
      const slot = el.getAttribute("data-slot");
      const aria = el.getAttribute("aria-label");
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
      return [
        el.tagName.toLowerCase(),
        slot ? `[data-slot=${slot}]` : "",
        aria ? `[aria-label=${aria}]` : "",
        text ? `«${text}»` : ""
      ]
        .filter(Boolean)
        .join(" ");
    };

    const isVisible = (el: Element): boolean => {
      if (el.closest('[aria-hidden="true"]')) {
        return false;
      }
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility !== "visible") {
        return false;
      }
      if (Number.parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) {
        // sr-only и другие визуально скрытые (clip 1×1) элементы.
        return false;
      }
      return el.getClientRects().length > 0;
    };

    const directText = (el: Element): string => {
      let text = "";
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent ?? "";
        }
      }
      return text.replace(/\s+/g, " ").trim();
    };

    (window as Window & { __qcColor?: unknown }).__qcColor = {
      colorToRgba,
      compositeOver,
      contrastRatio,
      effectiveBackground,
      formatRgba,
      describeElement,
      isVisible,
      directText
    };
  });
}

async function scanContrast(page: Page): Promise<ScanResult> {
  return page.evaluate(() => {
    const helpers = (window as Window & { __qcColor?: QcColorHelpers }).__qcColor;
    if (!helpers) {
      throw new Error("qc color helpers are not installed");
    }

    const violations: ScanViolation[] = [];
    const seen = new Set<string>();
    let textChecked = 0;
    let controlChecked = 0;
    let svgTextChecked = 0;
    let svgStrokeChecked = 0;
    let skippedUnknownBackground = 0;

    const record = (violation: ScanViolation) => {
      const key = `${violation.category}|${violation.target}|${violation.fg}|${violation.bg}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      violations.push(violation);
    };

    // --- Текст: заголовки, body-текст, muted-текст, бейджи, подписи ---
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!(el instanceof HTMLElement)) {
        continue;
      }
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") {
        continue;
      }
      const text = helpers.directText(el);
      if (!text) {
        continue;
      }
      if (!helpers.isVisible(el)) {
        continue;
      }
      if (el.closest('[disabled], [aria-disabled="true"]')) {
        continue;
      }

      const style = getComputedStyle(el);
      const fg = helpers.colorToRgba(style.color);
      if (!fg || fg[3] === 0) {
        skippedUnknownBackground += 1;
        continue;
      }
      const bg = helpers.effectiveBackground(el);
      if (!bg) {
        skippedUnknownBackground += 1;
        continue;
      }

      const fontSize = Number.parseFloat(style.fontSize);
      const weight = style.fontWeight === "bold" ? 700 : Number.parseFloat(style.fontWeight) || 400;
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
      const required = isLarge ? 3 : 4.5;
      const ratio = helpers.contrastRatio(fg, bg);
      textChecked += 1;

      if (ratio + 1e-9 < required) {
        record({
          category: isLarge ? "large-text" : "text",
          target: helpers.describeElement(el),
          fg: helpers.formatRgba(fg),
          bg: helpers.formatRgba(bg),
          ratio: Math.round(ratio * 100) / 100,
          required
        });
      }
    }

    // --- Контролы: различимость против окружения ≥3:1 (фон, граница или текст) ---
    const controlSelector = [
      "button",
      "select",
      "textarea",
      'input:not([type="hidden"])',
      '[role="button"]',
      '[role="tab"]',
      '[role="switch"]',
      '[role="combobox"]',
      '[data-slot="button"]',
      '[data-slot="input"]',
      '[data-slot="native-select"]',
      'a[data-slot="button"]'
    ].join(", ");
    const controls = new Set(
      Array.from(document.body.querySelectorAll(controlSelector))
    );

    for (const el of controls) {
      if (!(el instanceof HTMLElement) || !helpers.isVisible(el)) {
        continue;
      }
      if (el.closest('[disabled], [aria-disabled="true"]')) {
        continue;
      }

      const style = getComputedStyle(el);
      const parentBg = helpers.effectiveBackground(el.parentElement);
      if (!parentBg) {
        skippedUnknownBackground += 1;
        continue;
      }

      const candidates: number[] = [];
      const ownBgColor = helpers.colorToRgba(style.backgroundColor);
      if (ownBgColor && ownBgColor[3] > 0) {
        candidates.push(helpers.contrastRatio(ownBgColor, parentBg));
      }
      const borderWidth = Number.parseFloat(style.borderTopWidth) || 0;
      if (borderWidth > 0 && style.borderTopStyle !== "none") {
        const borderColor = helpers.colorToRgba(style.borderTopColor);
        if (borderColor && borderColor[3] > 0) {
          candidates.push(helpers.contrastRatio(borderColor, parentBg));
        }
      }
      // Текстовый идентификатор контрола (ghost-кнопки без фона/границы).
      // D13: icon-only контрол (пустой текст, svg с currentColor, напр. lucide
      // CircleHelp в tooltip-trigger) — идентификатором служит вычисленный
      // color иконки; семантика «лучший из кандидатов» не меняется.
      const label = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (label || (!label && el.querySelector("svg"))) {
        const fg = helpers.colorToRgba(style.color);
        const ownBg = helpers.effectiveBackground(el);
        if (fg && fg[3] > 0 && ownBg) {
          candidates.push(helpers.contrastRatio(fg, ownBg));
        }
      }

      controlChecked += 1;
      const best = candidates.length ? Math.max(...candidates) : 0;
      if (best + 1e-9 < 3) {
        record({
          category: "control",
          target: helpers.describeElement(el),
          fg: `лучший идентификатор ${Math.round(best * 100) / 100}:1`,
          bg: helpers.formatRgba(parentBg),
          ratio: Math.round(best * 100) / 100,
          required: 3
        });
      }
    }

    // --- Существенные метки графиков: SVG text (оси, подписи) ≥3:1 ---
    // Богатые chart-SVG намеренно aria-hidden (app-owned a11y exception:
    // доступная альтернатива — таблица/подписи карточки). Контраст — визуальное
    // свойство, поэтому aria-hidden здесь НЕ исключает метки из проверки;
    // видимость определяется clientRects/visibility/opacity.
    for (const el of Array.from(document.querySelectorAll("svg text"))) {
      if (!el.getClientRects().length) {
        continue;
      }
      const style = getComputedStyle(el);
      if (style.visibility !== "visible" || Number.parseFloat(style.opacity) === 0) {
        continue;
      }
      const fill = helpers.colorToRgba(style.fill);
      if (!fill) {
        skippedUnknownBackground += 1;
        continue;
      }
      const fillOpacity = Number.parseFloat(style.fillOpacity);
      const fg: [number, number, number, number] = [
        fill[0],
        fill[1],
        fill[2],
        fill[3] * (Number.isNaN(fillOpacity) ? 1 : fillOpacity)
      ];
      if (fg[3] === 0) {
        continue;
      }
      const bg = helpers.effectiveBackground(el.parentElement);
      if (!bg) {
        skippedUnknownBackground += 1;
        continue;
      }
      svgTextChecked += 1;
      const ratio = helpers.contrastRatio(fg, bg);
      if (ratio + 1e-9 < 3) {
        record({
          category: "chart-mark",
          target: helpers.describeElement(el),
          fg: helpers.formatRgba(fg),
          bg: helpers.formatRgba(bg),
          ratio: Math.round(ratio * 100) / 100,
          required: 3
        });
      }
    }

    // --- Существенные штрихи графиков: stroke линий серий/ориентиров ≥3:1 ---
    // Тот же разбор, что у SVG text выше (aria-hidden не исключает), но для
    // штрихов: сегменты серий внутри [data-series] (линия «Цель» в --chart-4,
    // score/previous/confidence/reserve) и референс-линии с data-reference-value
    // («Ориентир 80%»). Декоративная сетка осей (line без data-series) и
    // заливки столбцов объёма (fill без stroke) сюда не входят.
    const chartStrokeSelector = [
      "svg [data-series] line",
      "svg [data-series] path",
      "svg [data-series] polyline",
      "svg line[data-reference-value]"
    ].join(", ");
    for (const el of Array.from(document.querySelectorAll(chartStrokeSelector))) {
      if (!el.getClientRects().length) {
        continue;
      }
      const style = getComputedStyle(el);
      if (style.visibility !== "visible" || Number.parseFloat(style.opacity) === 0) {
        continue;
      }
      const strokeWidth = Number.parseFloat(style.strokeWidth);
      if (Number.isNaN(strokeWidth) || strokeWidth <= 0 || style.stroke === "none") {
        continue;
      }
      const stroke = helpers.colorToRgba(style.stroke);
      if (!stroke) {
        skippedUnknownBackground += 1;
        continue;
      }
      const strokeOpacity = Number.parseFloat(style.strokeOpacity);
      const fg: [number, number, number, number] = [
        stroke[0],
        stroke[1],
        stroke[2],
        stroke[3] * (Number.isNaN(strokeOpacity) ? 1 : strokeOpacity)
      ];
      if (fg[3] === 0) {
        continue;
      }
      const bg = helpers.effectiveBackground(el.parentElement);
      if (!bg) {
        skippedUnknownBackground += 1;
        continue;
      }
      svgStrokeChecked += 1;
      const ratio = helpers.contrastRatio(fg, bg);
      if (ratio + 1e-9 < 3) {
        record({
          category: "chart-stroke",
          target: helpers.describeElement(el),
          fg: helpers.formatRgba(fg),
          bg: helpers.formatRgba(bg),
          ratio: Math.round(ratio * 100) / 100,
          required: 3
        });
      }
    }

    return {
      violations,
      textChecked,
      controlChecked,
      svgTextChecked,
      svgStrokeChecked,
      skippedUnknownBackground
    };
  });
}

/**
 * Клавиатурный Tab по первым focusTabStops остановкам: у активного элемента
 * читается outline/box-shadow; кольцо должно контрастировать ≥3:1 с фоном
 * элемента или его окружения. UA-кольцо (outline-style: auto) считается валидным.
 */
async function collectFocusRingViolations(page: Page): Promise<ScanViolation[]> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    window.scrollTo(0, 0);
  });

  const found: ScanViolation[] = [];
  const seen = new Set<string>();

  for (let step = 0; step < focusTabStops; step += 1) {
    await page.keyboard.press("Tab");
    const check = await page.evaluate(() => {
      const helpers = (window as Window & { __qcColor?: QcColorHelpers }).__qcColor;
      if (!helpers) {
        throw new Error("qc color helpers are not installed");
      }
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body) {
        return null;
      }

      const style = getComputedStyle(el);
      if (style.outlineStyle === "auto") {
        return { target: helpers.describeElement(el), pass: true, ratio: 21, detail: "UA outline" };
      }

      const ringColors: string[] = [];
      const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
      if (style.outlineStyle !== "none" && outlineWidth > 0) {
        ringColors.push(style.outlineColor);
      }
      if (style.boxShadow && style.boxShadow !== "none") {
        const matches =
          style.boxShadow.match(
            /(?:rgba?|hsla?|oklch|oklab|lch|lab|color)\([^)]+\)|#[0-9a-fA-F]{3,8}/g
          ) ?? [];
        ringColors.push(...matches);
      }

      const backgrounds = [
        helpers.effectiveBackground(el.parentElement),
        helpers.effectiveBackground(el)
      ].filter((bg): bg is [number, number, number, number] => bg !== null);
      if (!backgrounds.length) {
        // Неоднозначный фон (градиент): исключаем из выборки, как и в основном скане.
        return { target: helpers.describeElement(el), pass: true, ratio: 0, detail: "unknown background" };
      }

      let best = 0;
      let bestColor = "";
      for (const color of ringColors) {
        const rgba = helpers.colorToRgba(color);
        if (!rgba || rgba[3] === 0) {
          continue;
        }
        for (const bg of backgrounds) {
          const ratio = helpers.contrastRatio(rgba, bg);
          if (ratio > best) {
            best = ratio;
            bestColor = color;
          }
        }
      }

      return {
        target: helpers.describeElement(el),
        pass: ringColors.length > 0 && best >= 3,
        ratio: Math.round(best * 100) / 100,
        detail:
          ringColors.length === 0
            ? "нет видимого focus-индикатора (outline/box-shadow)"
            : `кольцо ${bestColor || "—"}`
      };
    });

    if (!check || seen.has(check.target)) {
      continue;
    }
    seen.add(check.target);
    if (!check.pass) {
      found.push({
        category: "focus-ring",
        target: check.target,
        fg: check.detail,
        bg: "",
        ratio: check.ratio,
        required: 3
      });
    }
  }

  return found;
}

function formatContrastViolations(violations: ContrastViolation[]) {
  return [
    `Нарушения контраста (${violations.length}):`,
    ...violations.map(
      (violation) =>
        `- [${violation.page} / ${violation.theme}] (${violation.category}) ${violation.target}: ${violation.fg}${violation.bg ? ` на ${violation.bg}` : ""} → ${violation.ratio}:1, требуется ≥${violation.required}:1`
    )
  ].join("\n");
}

const surfaces = [
  { id: "dashboard", open: openDashboard, requireChartText: false },
  { id: "reports-overview-graph", open: openReportsOverviewGraph, requireChartText: true }
] as const;

for (const theme of uiThemeOptions) {
  test(`контраст выдерживается в теме ${theme.id}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const allViolations: ContrastViolation[] = [];

    for (const surface of surfaces) {
      await surface.open(page, theme.id);
      await installColorHelpers(page);

      const result = await scanContrast(page);
      // Санити: скан не должен быть пустым — иначе тест ничего не сертифицирует.
      expect(
        result.textChecked,
        `${surface.id}/${theme.id}: проверено текстовых элементов`
      ).toBeGreaterThan(30);
      expect(
        result.controlChecked,
        `${surface.id}/${theme.id}: проверено контролов`
      ).toBeGreaterThan(5);
      if (surface.requireChartText) {
        expect(
          result.svgTextChecked,
          `${surface.id}/${theme.id}: проверены SVG-метки графиков`
        ).toBeGreaterThan(0);
        expect(
          result.svgStrokeChecked,
          `${surface.id}/${theme.id}: проверены SVG-штрихи графиков`
        ).toBeGreaterThan(0);
      }

      for (const violation of result.violations) {
        allViolations.push({ ...violation, page: surface.id, theme: theme.id });
      }

      const focusViolations = await collectFocusRingViolations(page);
      for (const violation of focusViolations) {
        allViolations.push({ ...violation, page: surface.id, theme: theme.id });
      }
    }

    expect(allViolations, formatContrastViolations(allViolations)).toEqual([]);
  });
}
