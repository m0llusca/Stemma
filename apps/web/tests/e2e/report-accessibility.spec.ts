import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

// Task 10 axe certification (brief section 9.2).
//
// Deterministic demo data is required: the web server must run against the
// dedicated verify database seeded with DEMO_SEED_NOW=2026-09-03T09:00:00.000Z.
//
// Gate: zero `critical` and zero `serious` axe violations on /dashboard and on
// every report view (src/lib/reports/report-format.ts: overview, performance,
// process, details) in both the graph and the table representation, in the
// light (Graphite) and dark (Night Ops) themes. Lower-impact violations are
// attached to the test report and logged, but do not fail the gate.

const reportViewIds = ["overview", "performance", "process", "details"] as const;
const chartViewIds = ["graph", "table"] as const;
const reportBaseQuery =
  "period=vk-current&compare=previous&grain=day&series=score%2Cvolume%2Cprevious%2Ctarget";

// Theme ids/modes mirror src/lib/ui-theme.ts (uiThemeOptions): "graphite" is
// the light default, "ops" (Night Ops) is the dark operations theme.
const themes = [
  { id: "graphite", label: "Graphite", mode: "light" },
  { id: "ops", label: "Night Ops", mode: "dark" }
] as const;

type AxeTarget = {
  name: string;
  path: string;
  ready: (page: Page) => Promise<void>;
};

async function dashboardReady(page: Page) {
  await expect(
    page.getByRole("region", { name: "Ключевые показатели" })
  ).toBeVisible();
  await expect(page.locator('[data-slot="dashboard-primary-grid"]')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function reportsReady(page: Page) {
  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("data-hydrated", "true");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

const targets: AxeTarget[] = [
  { name: "dashboard", path: "/dashboard", ready: dashboardReady },
  ...reportViewIds.flatMap((view) =>
    chartViewIds.map((chartView) => ({
      name: `reports ${view}/${chartView}`,
      path: `/reports?view=${view}&${reportBaseQuery}&chartView=${chartView}`,
      ready: reportsReady
    }))
  )
];

test.setTimeout(180_000);

test.beforeEach(async ({ context }) => {
  const admin = await findSeededDemoAdmin();

  await signInE2EUser(context, admin, "playwright-report-accessibility");
});

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

/**
 * Theme flips animate `transition-colors` (0.15s) on cards/nav/chips; under
 * chart-hydration load the transition start can be delayed by seconds, so a
 * scan right after the flip would measure mid-fade colors (Night Ops is the
 * only light↔dark flip whose intermediate pairs drop below threshold). Wait
 * one frame so the flip's style recalc creates the transitions, then drain
 * every running CSS transition before measuring. Assertion strength is
 * unchanged — only the measurement timing is stabilized.
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

/**
 * Applies a workspace UI theme exactly the way the admin appearance live
 * preview does (src/lib/ui-theme-dom.ts, syncUiAppearanceToDocument):
 * `data-theme` on <html>, the `dark` class, and `color-scheme` — the theme CSS
 * in globals.css keys off `[data-theme="…"]`.
 */
async function applyUiTheme(
  page: Page,
  theme: (typeof themes)[number]
) {
  await page.evaluate(({ id, mode }) => {
    const root = document.documentElement;
    root.dataset.theme = id;
    root.classList.toggle("dark", mode === "dark");
    root.style.colorScheme = mode;
  }, theme);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
  const applied = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    colorScheme: document.documentElement.style.colorScheme
  }));
  expect(applied.dark, `${theme.label} dark class`).toBe(theme.mode === "dark");
  expect(applied.colorScheme, `${theme.label} color scheme`).toBe(theme.mode);
  await drainThemeTransitions(page);
}

type SerializedViolation = {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
};

function serializeViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]
): SerializedViolation[] {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? "unknown",
    help: violation.help,
    nodes: violation.nodes
      .slice(0, 10)
      .map((node) => node.target.join(" "))
  }));
}

async function runAxeGate(page: Page, testInfo: TestInfo, label: string) {
  const results = await new AxeBuilder({ page }).analyze();

  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === "critical" || violation.impact === "serious"
  );
  const advisory = results.violations.filter(
    (violation) =>
      violation.impact !== "critical" && violation.impact !== "serious"
  );

  // Lower-severity findings are recorded (attachment + log), never a failure.
  if (advisory.length > 0 || results.incomplete.length > 0) {
    await testInfo.attach(`axe-advisory ${label}`, {
      body: JSON.stringify(
        {
          advisoryViolations: serializeViolations(advisory),
          incomplete: serializeViolations(results.incomplete)
        },
        null,
        2
      ),
      contentType: "application/json"
    });
    if (advisory.length > 0) {
      console.log(
        `[axe advisory] ${label}: ${advisory
          .map(
            (violation) =>
              `${violation.id}(${violation.impact ?? "unknown"})×${violation.nodes.length}`
          )
          .join(", ")}`
      );
    }
  }

  expect(
    serializeViolations(blocking),
    `${label}: axe critical/serious violations`
  ).toEqual([]);
}

for (const theme of themes) {
  test.describe(`axe in ${theme.label} (${theme.mode})`, () => {
    for (const target of targets) {
      test(`${target.name} has zero critical/serious violations`, async ({
        page
      }, testInfo) => {
        const consoleMessages = collectUnexpectedConsole(page);
        await page.setViewportSize({ width: 1280, height: 900 });

        const response = await page.goto(target.path);
        expect(
          response?.ok(),
          `${target.path} responds successfully`
        ).toBe(true);
        await target.ready(page);
        await applyUiTheme(page, theme);

        await runAxeGate(page, testInfo, `${target.name} / ${theme.label}`);

        expect.soft(
          consoleMessages,
          `${target.name} / ${theme.label} console`
        ).toEqual([]);
      });
    }
  });
}
