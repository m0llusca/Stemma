import { expect, test, type Locator, type Page } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

const canonicalOverviewHref =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";
// The direct flex-column owner of the interactive quality trend plot: it holds
// the plot, its sr-only instructions, and its own "Ряды графика" legend group.
const qualityTrendOwnerSelector = 'div:has(> [data-slot="quality-trend-plot"])';

test.setTimeout(180_000);

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

async function settleFrames(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

async function armDeferredCharts(page: Page) {
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
  });
  await settleFrames(page);
  await expect
    .poll(
      () =>
        page
          .locator('[data-slot="deferred-chart-visual"][data-deferred-state="loading"]')
          .count(),
      { message: "deferred chart visuals should leave the loading state" }
    )
    .toBe(0);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await settleFrames(page);
}

type MotionOffender = {
  tag: string;
  slot: string | null;
  aria: string | null;
  className: string;
  transitionDuration?: string;
  animationName?: string;
  animationDuration?: string;
  animationIterationCount?: string;
};

async function scanVisibleMotion(page: Page) {
  return page.evaluate(() => {
    const toMilliseconds = (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) return 0;
      const value = Number.parseFloat(trimmed);
      if (!Number.isFinite(value)) return 0;
      return trimmed.endsWith("ms") ? value : value * 1000;
    };
    const longest = (list: string) => {
      const values = list.split(",").map(toMilliseconds);
      return values.length === 0 ? 0 : Math.max(...values);
    };
    const describe = (element: Element) => ({
      tag: element.tagName.toLowerCase(),
      slot: element.getAttribute("data-slot"),
      aria: element.getAttribute("aria-label"),
      className: (element.getAttribute("class") ?? "").slice(0, 140)
    });

    const transitionOffenders: MotionOffender[] = [];
    const animationOffenders: MotionOffender[] = [];
    let visibleElementCount = 0;

    for (const element of Array.from(document.querySelectorAll("body *"))) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      visibleElementCount += 1;

      const transitionMs = longest(style.transitionDuration);
      if (transitionMs > 1.005) {
        transitionOffenders.push({
          ...describe(element),
          transitionDuration: style.transitionDuration
        });
      }

      if (style.animationName !== "none") {
        const animationMs = longest(style.animationDuration);
        const infinite = style.animationIterationCount
          .split(",")
          .some((count) => count.trim() === "infinite");
        if (animationMs > 1.005 || infinite) {
          animationOffenders.push({
            ...describe(element),
            animationName: style.animationName,
            animationDuration: style.animationDuration,
            animationIterationCount: style.animationIterationCount
          });
        }
      }
    }

    const infiniteRunningAnimations = document
      .getAnimations()
      .filter((animation) => animation.playState === "running")
      .map((animation) => {
        const timing =
          animation.effect && "getTiming" in animation.effect
            ? animation.effect.getTiming()
            : null;
        if (!timing || timing.iterations !== Infinity) return null;
        const cssName =
          "animationName" in animation
            ? String(
                (animation as unknown as { animationName: string }).animationName
              )
            : null;
        return cssName ?? animation.id ?? "unnamed-animation";
      })
      .filter((name): name is string => name !== null);

    return {
      reducedMotionActive: matchMedia("(prefers-reduced-motion: reduce)").matches,
      visibleElementCount,
      transitionOffenderCount: transitionOffenders.length,
      transitionOffenders: transitionOffenders.slice(0, 15),
      animationOffenderCount: animationOffenders.length,
      animationOffenders: animationOffenders.slice(0, 15),
      infiniteRunningAnimations
    };
  });
}

async function expectStaticSelectionFeedback(page: Page, plot: Locator) {
  const owner = page.locator(qualityTrendOwnerSelector);
  const marker = owner.locator('[data-slot="quality-selected-marker"]');
  const tooltip = owner.locator('[role="tooltip"]');

  await plot.focus();
  await expect(plot).toBeFocused();
  await expect(plot).toHaveAttribute("data-active-point-id", /^trend-\d+$/);
  const firstPointId = await plot.getAttribute("data-active-point-id");

  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute("data-active-point-id", /^trend-\d+$/);
  const secondPointId = await plot.getAttribute("data-active-point-id");
  expect(secondPointId, "ArrowRight must move the active point").not.toBe(
    firstPointId
  );

  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute("data-point-id", secondPointId!);
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByText("Средний балл", { exact: true })).toBeVisible();
  await expect(tooltip.getByText("Выборка", { exact: true })).toBeVisible();

  const markerMotion = await marker.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
      opacity: Number.parseFloat(style.opacity)
    };
  });
  expect(markerMotion.animationName, JSON.stringify(markerMotion)).toBe("none");
  for (const token of markerMotion.transitionDuration.split(",")) {
    const value = Number.parseFloat(token);
    const milliseconds = token.trim().endsWith("ms") ? value : value * 1000;
    expect(milliseconds, JSON.stringify(markerMotion)).toBeLessThanOrEqual(1.005);
  }
  expect(markerMotion.opacity).toBeGreaterThan(0.9);

  // Static means the feedback neither auto-dismisses nor keeps moving.
  const before = await marker.boundingBox();
  expect(before).not.toBeNull();
  await page.waitForTimeout(400);
  await expect(marker).toBeVisible();
  await expect(tooltip).toBeVisible();
  const after = await marker.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);

  return { marker, tooltip };
}

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  await signInE2EUser(context, admin, "playwright-report-reduced-motion");
});

test("dashboard clamps every visible transition and animation under reduced motion", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");

  await expect(
    page.getByRole("region", { name: "Ключевые показатели" })
  ).toBeVisible();
  await armDeferredCharts(page);

  const scan = await scanVisibleMotion(page);
  const diagnostic = JSON.stringify(scan, null, 2);
  expect(scan.reducedMotionActive, "reduced-motion emulation must be active").toBe(
    true
  );
  expect(scan.visibleElementCount, diagnostic).toBeGreaterThan(50);
  expect(scan.transitionOffenderCount, diagnostic).toBe(0);
  expect(scan.animationOffenderCount, diagnostic).toBe(0);
  expect(scan.infiniteRunningAnimations, diagnostic).toEqual([]);
  expect(consoleMessages, "dashboard reduced-motion console").toEqual([]);
});

test("reports overview graph clamps every visible transition and animation under reduced motion", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);

  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  await armDeferredCharts(page);

  const scan = await scanVisibleMotion(page);
  const diagnostic = JSON.stringify(scan, null, 2);
  expect(scan.reducedMotionActive, "reduced-motion emulation must be active").toBe(
    true
  );
  expect(scan.visibleElementCount, diagnostic).toBeGreaterThan(50);
  expect(scan.transitionOffenderCount, diagnostic).toBe(0);
  expect(scan.animationOffenderCount, diagnostic).toBe(0);
  expect(scan.infiniteRunningAnimations, diagnostic).toEqual([]);
  expect(consoleMessages, "reports reduced-motion console").toEqual([]);
});

test("keyboard point selection keeps a visible static selection under reduced motion", async ({
  page
}) => {
  const consoleMessages = collectUnexpectedConsole(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);

  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true");

  const plot = page.locator('[data-slot="quality-trend-plot"]');
  await plot.scrollIntoViewIfNeeded();
  await expect(plot).toBeVisible();
  await expect(plot).toHaveAttribute("data-accessibility-layer", "app-owned");

  await expectStaticSelectionFeedback(page, plot);
  expect(consoleMessages, "keyboard selection console").toEqual([]);
});

test("forced colors keeps axes, active point, selection, focus, and legend distinguishable without color", async ({
  browserName,
  page
}) => {
  test.skip(
    browserName === "webkit",
    "forced-colors media emulation is certified in Chromium/Firefox projects"
  );

  const consoleMessages = collectUnexpectedConsole(page);
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(canonicalOverviewHref);

  expect(
    await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
    "forced-colors emulation must be active"
  ).toBe(true);

  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true");

  const owner = page.locator(qualityTrendOwnerSelector);
  const plot = page.locator('[data-slot="quality-trend-plot"]');
  await plot.scrollIntoViewIfNeeded();
  await expect(plot).toBeVisible();
  await expect(
    plot.locator('[data-slot="deferred-chart-visual"]')
  ).toHaveAttribute("data-deferred-state", "ready");
  await expect(plot.locator("svg.recharts-surface")).toBeVisible();

  // Axes and series marks must carry non-colour structure: tick text, axis
  // grid lines, dash patterns, and per-point geometric markers.
  const svgFacts = await plot.evaluate((node) => {
    const svg = node.querySelector("svg.recharts-surface");
    if (!svg) return null;
    const texts = Array.from(svg.querySelectorAll("text")).map((text) =>
      (text.textContent ?? "").trim()
    );
    const score = svg.querySelector('g[data-series="score"]');
    const previous = svg.querySelector('g[data-series="previous"]');
    const target = svg.querySelector('g[data-series="target"]');
    return {
      textCount: texts.length,
      texts: texts.slice(0, 60),
      axisLineCount: svg.querySelectorAll("line").length,
      scoreMarkerCount: score
        ? score.querySelectorAll("circle[data-point-id]").length
        : 0,
      previousMarkerCount: previous
        ? previous.querySelectorAll("rect[data-point-id]").length
        : 0,
      previousMarkerShape: previous?.getAttribute("data-marker") ?? null,
      previousDash: previous?.getAttribute("stroke-dasharray") ?? null,
      targetDash:
        target?.querySelector("line")?.getAttribute("stroke-dasharray") ?? null,
      targetLabel:
        texts.find((value) => value.startsWith("Цель")) ?? null
    };
  });
  expect(svgFacts, "quality trend svg must be rendered").not.toBeNull();
  const svgDiagnostic = JSON.stringify(svgFacts, null, 2);
  for (const tick of ["0", "25", "50", "75", "100"]) {
    expect(svgFacts!.texts, svgDiagnostic).toContain(tick);
  }
  expect(svgFacts!.textCount, svgDiagnostic).toBeGreaterThanOrEqual(10);
  expect(svgFacts!.axisLineCount, svgDiagnostic).toBeGreaterThanOrEqual(5);
  expect(svgFacts!.scoreMarkerCount, svgDiagnostic).toBeGreaterThan(0);
  expect(svgFacts!.previousMarkerCount, svgDiagnostic).toBeGreaterThan(0);
  expect(svgFacts!.previousMarkerShape, svgDiagnostic).toBe("diamond");
  expect(svgFacts!.previousDash, svgDiagnostic).toBe("6 5");
  expect(svgFacts!.targetDash, svgDiagnostic).toBe("2 4");
  expect(svgFacts!.targetLabel, svgDiagnostic).toMatch(/^Цель \d+/);

  // The legend differentiates series by text label, aria-pressed state, and
  // border style (solid/dashed/dotted), none of which depend on colour.
  const legend = owner.getByRole("group", { name: "Ряды графика" });
  await expect(legend).toBeVisible();
  const expectedLegend: ReadonlyArray<readonly [string, string]> = [
    ["Средний балл", "solid"],
    ["Прошлый период", "dashed"],
    ["Цель 90 баллов", "dotted"],
    ["Проверки", "solid"]
  ];
  for (const [label, borderStyle] of expectedLegend) {
    const button = legend.getByRole("button", { name: label });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const markerStyle = await button.evaluate((node) => {
      const swatch = node.querySelector('span[aria-hidden="true"]');
      if (!swatch) return null;
      const style = getComputedStyle(swatch);
      return {
        borderTopStyle: style.borderTopStyle,
        borderTopWidth: Number.parseFloat(style.borderTopWidth)
      };
    });
    expect(markerStyle, `${label} legend swatch`).not.toBeNull();
    expect(markerStyle!.borderTopStyle, `${label} legend swatch style`).toBe(
      borderStyle
    );
    expect(
      markerStyle!.borderTopWidth,
      `${label} legend swatch width`
    ).toBeGreaterThanOrEqual(1.5);
  }

  // Keyboard selection: the current point stays announced through attributes,
  // a bordered geometric marker, and textual status lines.
  const describedByBefore = (await plot.getAttribute("aria-describedby"))!
    .split(/\s+/)
    .filter(Boolean);
  expect(describedByBefore).toHaveLength(2);

  await plot.focus();
  await expect(plot).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute("data-active-point-id", /^trend-\d+$/);

  const describedByActive = (await plot.getAttribute("aria-describedby"))!
    .split(/\s+/)
    .filter(Boolean);
  expect(
    describedByActive,
    "active selection must add the textual tooltip to aria-describedby"
  ).toHaveLength(3);

  const marker = owner.locator('[data-slot="quality-selected-marker"]');
  await expect(marker).toBeVisible();
  const markerFacts = await marker.evaluate((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      borderTopWidth: Number.parseFloat(style.borderTopWidth),
      borderTopStyle: style.borderTopStyle,
      visibility: style.visibility,
      pointId: node.getAttribute("data-point-id")
    };
  });
  const markerDiagnostic = JSON.stringify(markerFacts);
  expect(markerFacts.width, markerDiagnostic).toBeGreaterThanOrEqual(10);
  expect(markerFacts.height, markerDiagnostic).toBeGreaterThanOrEqual(10);
  expect(markerFacts.borderTopWidth, markerDiagnostic).toBeGreaterThanOrEqual(1);
  expect(markerFacts.borderTopStyle, markerDiagnostic).toBe("solid");
  expect(markerFacts.visibility, markerDiagnostic).toBe("visible");
  expect(markerFacts.pointId, markerDiagnostic).toMatch(/^trend-\d+$/);

  const tooltip = owner.locator('[role="tooltip"]');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByText("Средний балл", { exact: true })).toBeVisible();
  await expect(
    tooltip.getByText("К прошлому периоду", { exact: true })
  ).toBeVisible();
  await expect(tooltip.getByText("Выборка", { exact: true })).toBeVisible();

  expect(consoleMessages, "forced-colors console").toEqual([]);
});
