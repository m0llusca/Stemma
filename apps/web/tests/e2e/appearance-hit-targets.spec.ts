import { expect, test, type Page } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

/**
 * Task 10 — coarse-pointer hit targets (план §Task 10, task-10-brief.md §9.2).
 *
 * Мобильный touch-контекст 390×900 (hasTouch + isMobile): все видимые
 * интерактивные контролы на /dashboard, /reports (overview) и в верхней
 * навигации (header «Глобальная навигация») обязаны иметь bounding box
 * ≥ 44×44 CSS px с допуском -0.5px (порог 43.5). CSS-контракт живёт в
 * globals.css: @media (any-pointer: coarse) → --interactive-min-size: 44px.
 *
 * Документированные исключения из проверки размера:
 * 1. Инлайновые текстовые ссылки внутри параграфов/предложений — <a> с
 *    computed display:inline, у родителя которых есть собственный текст
 *    помимо ссылки (inline-исключение WCAG 2.5.8 Target Size).
 * 2. Визуально скрытые элементы (sr-only/clip: rect ≤ 1×1 px).
 * 3. Отключённые контролы ([disabled]/aria-disabled) и aria-hidden поддеревья.
 * Для checkbox/radio целью считается объединение input с его <label>.
 *
 * Отдельно проверяются открытые оверлеи мобильного фильтра отчёта: на 390px
 * фильтр рендерится Sheet-ом (роль dialog «Фильтры отчёта», data-slot
 * sheet-content) — Popover-вариант существует только от 641px и в этом
 * coarse-390 контексте недостижим. Дополнительно проверяется evidence Sheet
 * «Данные и примеры» и close-кнопки обоих оверлеев.
 */

const overviewHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";

// 44px с допуском -0.5px.
const minTargetSize = 43.5;

test.use({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
// isMobile не поддерживается Firefox; сертификация coarse-pointer идёт в проекте
// chromium (task-10-brief.md §9.2), Firefox/WebKit получают отдельный smoke-набор.
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "coarse-pointer сертификация выполняется только в Chromium"
);

test.setTimeout(180_000);

type HitTargetScan = {
  checked: number;
  headerChecked: number;
  inlineExempted: number;
  violations: {
    target: string;
    width: number;
    height: number;
    inHeader: boolean;
  }[];
};

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  await signInE2EUser(context, admin, "playwright-appearance-hit-targets");
});

// Self-contained: выполняется в браузере через locator.evaluate.
const collectHitTargets = (root: HTMLElement, minSize: number): HitTargetScan => {
  const selector = [
    "a[href]",
    "button",
    'input:not([type="hidden"])',
    "select",
    "textarea",
    "summary",
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="combobox"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(", ");

  const violations: HitTargetScan["violations"] = [];
  let checked = 0;
  let headerChecked = 0;
  let inlineExempted = 0;

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
      // sr-only/clip-скрытые элементы (например skip-link вне фокуса).
      return false;
    }
    return el.getClientRects().length > 0;
  };

  const describe = (el: Element): string => {
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

  for (const el of Array.from(root.querySelectorAll(selector))) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }
    if (!isVisible(el)) {
      continue;
    }
    if (
      el.closest('[disabled], [aria-disabled="true"]') ||
      ((el instanceof HTMLInputElement ||
        el instanceof HTMLButtonElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement) &&
        el.disabled)
    ) {
      continue;
    }

    const style = getComputedStyle(el);
    // Исключение №1: инлайновая текстовая ссылка внутри текстового потока.
    if (el.tagName === "A" && style.display === "inline") {
      const parentText = (el.parentElement?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const ownText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (parentText.length > ownText.length) {
        inlineExempted += 1;
        continue;
      }
    }

    const rect = el.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;

    // Для checkbox/radio целевой областью считается input вместе с label.
    if (
      el instanceof HTMLInputElement &&
      (el.type === "checkbox" || el.type === "radio")
    ) {
      const labels: HTMLLabelElement[] = Array.from(el.labels ?? []);
      const wrapper = el.closest("label");
      if (wrapper instanceof HTMLLabelElement && !labels.includes(wrapper)) {
        labels.push(wrapper);
      }
      for (const label of labels) {
        const labelRect = label.getBoundingClientRect();
        const left = Math.min(rect.left, labelRect.left);
        const right = Math.max(rect.right, labelRect.right);
        const top = Math.min(rect.top, labelRect.top);
        const bottom = Math.max(rect.bottom, labelRect.bottom);
        width = Math.max(width, right - left);
        height = Math.max(height, bottom - top);
      }
    }

    const inHeader = Boolean(el.closest("header"));
    checked += 1;
    if (inHeader) {
      headerChecked += 1;
    }

    if (width < minSize || height < minSize) {
      violations.push({
        target: describe(el),
        width: Math.round(width * 100) / 100,
        height: Math.round(height * 100) / 100,
        inHeader
      });
    }
  }

  return { checked, headerChecked, inlineExempted, violations };
};

function formatViolations(context: string, scan: HitTargetScan) {
  return [
    `${context}: нарушений ${scan.violations.length} (проверено ${scan.checked}, из них в топ-навигации ${scan.headerChecked}, inline-исключений ${scan.inlineExempted})`,
    ...scan.violations.map(
      (violation) =>
        `- ${violation.inHeader ? "[топ-навигация] " : ""}${violation.target}: ${violation.width}×${violation.height}px (нужно ≥44×44, допуск -0.5px)`
    )
  ].join("\n");
}

async function expectCoarsePointer(page: Page) {
  expect(
    await page.evaluate(() => window.matchMedia("(any-pointer: coarse)").matches),
    "эмуляция coarse pointer (any-pointer: coarse) активна"
  ).toBe(true);
}

async function settleFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function scanPage(page: Page): Promise<HitTargetScan> {
  return page.locator("body").evaluate(collectHitTargets, minTargetSize);
}

test("dashboard: контролы и верхняя навигация не меньше 44×44 при coarse pointer", async ({
  page
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { level: 1, name: "Сегодня" })
  ).toBeVisible();
  await settleFonts(page);
  await expectCoarsePointer(page);

  const scan = await scanPage(page);
  expect(scan.checked, "на dashboard найдены интерактивные контролы").toBeGreaterThan(10);
  expect(
    scan.headerChecked,
    "верхняя навигация (header «Глобальная навигация») попала в выборку"
  ).toBeGreaterThan(0);
  expect(scan.violations, formatViolations("/dashboard", scan)).toEqual([]);
});

test("reports overview: контролы и верхняя навигация не меньше 44×44 при coarse pointer", async ({
  page
}) => {
  await page.goto(overviewHref);
  await expect(
    page.locator('section[role="region"][aria-label="Параметры отчёта"]')
  ).toHaveAttribute("data-hydrated", "true");
  await settleFonts(page);
  await expectCoarsePointer(page);

  const scan = await scanPage(page);
  expect(scan.checked, "на reports найдены интерактивные контролы").toBeGreaterThan(10);
  expect(
    scan.headerChecked,
    "верхняя навигация (header «Глобальная навигация») попала в выборку"
  ).toBeGreaterThan(0);
  expect(scan.violations, formatViolations("/reports overview", scan)).toEqual([]);
});

test("мобильный фильтр отчёта (Sheet) и evidence Sheet держат 44×44, включая close-кнопки", async ({
  page
}) => {
  await page.goto(overviewHref);
  await expect(
    page.locator('section[role="region"][aria-label="Параметры отчёта"]')
  ).toHaveAttribute("data-hydrated", "true");
  await settleFonts(page);
  await expectCoarsePointer(page);

  // На 390px фильтр открывается Sheet-ом; Popover-вариант доступен только с 641px.
  const filterTrigger = page.getByRole("button", { name: /^Фильтры \(/ });
  await expect(filterTrigger).toBeVisible();
  await filterTrigger.click();

  const filterSheet = page.getByRole("dialog", { name: "Фильтры отчёта" });
  await expect(filterSheet).toBeVisible();
  await expect(filterSheet).toHaveAttribute("data-slot", "sheet-content");

  const filterScan = await filterSheet.evaluate(collectHitTargets, minTargetSize);
  expect(
    filterScan.checked,
    "внутри Sheet фильтров найдены интерактивные контролы"
  ).toBeGreaterThan(0);
  expect(
    filterScan.violations,
    formatViolations("Sheet «Фильтры отчёта»", filterScan)
  ).toEqual([]);

  const filterClose = filterSheet.getByRole("button", { name: "Закрыть" });
  await expect(filterClose).toBeVisible();
  const filterCloseBox = await filterClose.boundingBox();
  expect(filterCloseBox).not.toBeNull();
  expect(
    filterCloseBox!.width,
    "ширина close-кнопки Sheet фильтров"
  ).toBeGreaterThanOrEqual(minTargetSize);
  expect(
    filterCloseBox!.height,
    "высота close-кнопки Sheet фильтров"
  ).toBeGreaterThanOrEqual(minTargetSize);
  await filterClose.click();
  await expect(filterSheet).toBeHidden();

  // Evidence Sheet «Данные и примеры» — второй мобильный оверлей отчёта.
  const evidenceTrigger = page.getByRole("button", {
    name: "Показать данные выбранного среза"
  });
  await evidenceTrigger.click();
  const evidenceSheet = page.getByRole("dialog", { name: "Данные и примеры" });
  await expect(evidenceSheet).toBeVisible();

  const evidenceScan = await evidenceSheet.evaluate(collectHitTargets, minTargetSize);
  expect(
    evidenceScan.checked,
    "внутри evidence Sheet найдены интерактивные контролы"
  ).toBeGreaterThan(0);
  expect(
    evidenceScan.violations,
    formatViolations("Sheet «Данные и примеры»", evidenceScan)
  ).toEqual([]);

  const evidenceClose = evidenceSheet.getByRole("button", { name: "Закрыть" });
  await expect(evidenceClose).toBeVisible();
  const evidenceCloseBox = await evidenceClose.boundingBox();
  expect(evidenceCloseBox).not.toBeNull();
  expect(
    evidenceCloseBox!.width,
    "ширина close-кнопки evidence Sheet"
  ).toBeGreaterThanOrEqual(minTargetSize);
  expect(
    evidenceCloseBox!.height,
    "высота close-кнопки evidence Sheet"
  ).toBeGreaterThanOrEqual(minTargetSize);
  await evidenceClose.click();
  await expect(evidenceSheet).toBeHidden();
});
