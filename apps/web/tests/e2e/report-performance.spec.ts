import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { findSeededDemoAdmin, signInE2EUser } from "./helpers/auth";

// Task 10 Chromium performance lab (brief section 9.3).
//
// Lab profile: Chromium CDP, 4x CPU throttling, Fast 4G
// (1.6 Mbps down / 750 Kbps up / 150 ms RTT), one discarded warm-up
// navigation, then five cold navigations (browser cache, cookies, and
// local/session storage cleared before each) and five cached navigations.
//
// Metric methodology (all raw samples are persisted in the lab artifact):
// - LCP: buffered `largest-contentful-paint` PerformanceObserver; the final
//   candidate (last entry before first input) is the sample; nearest-rank p95
//   across each five-navigation series must stay <= 2.5 s.
// - Route INP proxy: buffered `event` PerformanceObserver
//   (durationThreshold 16 ms) over real Playwright-driven interactions
//   (pointer moves, click, arrow keys on the app-owned quality-trend plot);
//   the sample is the worst interaction duration (entries with an
//   interactionId, falling back to interaction event types); p95 <= 200 ms.
// - CLS: buffered `layout-shift` PerformanceObserver, entries with
//   hadRecentInput excluded. Page CLS is the cumulative sum (stricter than
//   the windowed metric). Chart CLS sums entries with at least one shift
//   source inside a chart container ([data-slot="deferred-chart-visual"] or
//   [data-slot="chart-frame-content"]). Budgets: chart <= 0.02, page <= 0.05.
// - Long tasks: buffered `longtask` PerformanceObserver. The hydration marks
//   are recorded synchronously inside the tasks that evaluate the rich module
//   and commit each island, so chart-mount long tasks are exactly the entries
//   whose interval contains a qc-chart-hydration-start/-end mark timestamp;
//   motion/interaction long tasks are the remaining entries after the
//   post-load interaction phase starts. Both must stay <= 50 ms.
// - Eager hydration: app-owned marks (Task 10 instrumentation in
//   recharts-visuals.client.tsx / deferred-chart-visual.client.tsx). The
//   start mark is set once at rich-module evaluation; each ready island sets
//   one end mark. Delta = first end mark after start; <= 100 ms per sample.
// - Tooltip/keyboard latency: 20 real interaction samples after a discarded
//   warm-up burst. Each sample is measured in-page as
//   requestAnimationFrame-time minus the trusted event's hardware timeStamp
//   (event-to-next-frame latency); nearest-rank p95 <= 100 ms.
// - Payload: chart models are serialized into the RSC flight stream
//   (self.__next_f) as plain JSON objects with id/series/points/emptyTitle
//   (src/lib/reports/report-chart-models.ts -> parseChartModel contract).
//   A string-aware balanced-brace scanner extracts each model and measures
//   its UTF-8 byte size: per-chart <= 50 KiB, route total <= 100 KiB.
// - Marks (SVG data elements): count of shape elements inside data series
//   groups of rendered rich chart surfaces
//   (svg.recharts-surface g[data-series] path/rect/circle/polyline/polygon/
//   line) after all deferred islands are ready; <= 500.
// - Table-only navigation (chartView=table) must not request any rich chunk
//   from the certified deferred-rich inventory (nor any URL matching
//   /recharts/i) after a cache clear.
// - No console errors, page errors, or hydration warnings anywhere in the
//   lab run.
//
// Every budget is asserted with expect.soft so a single run reports all
// actual numbers; any violation hard-fails the test. The full raw-sample lab
// report is written to
// ../../.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/task-10/performance-lab.json
// (also on partial failure).

const CPU_THROTTLING_RATE = 4;
const FAST_4G = {
  offline: false,
  latency: 150,
  // 1.6 Mbps down / 750 Kbps up, expressed in bytes per second.
  downloadThroughput: 1_600_000 / 8,
  uploadThroughput: 750_000 / 8
} as const;

const BUDGETS = {
  lcpMs: 2500,
  routeInpMs: 200,
  chartCls: 0.02,
  pageCls: 0.05,
  chartMountLongTaskMs: 50,
  motionLongTaskMs: 50,
  hydrationDeltaMs: 100,
  interactionP95Ms: 100,
  perChartPayloadBytes: 50 * 1024,
  routeChartPayloadBytes: 100 * 1024,
  totalMarks: 500
} as const;

const COLD_SAMPLES = 5;
const CACHED_SAMPLES = 5;
const INTERACTION_SAMPLE_COUNT = 20;
const INTERACTION_WARMUP_COUNT = 4;

const labRoute =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";
const tableRoute =
  "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score%2Cvolume%2Cprevious%2Ctarget";

const userAgentTag = "playwright-report-performance";

const artifactDir = resolve(
  process.cwd(),
  "../../.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/task-10"
);
const artifactPath = resolve(artifactDir, "performance-lab.json");

type BudgetInventory = {
  deferredRichChartReachableChunks: Array<{ path: string }>;
};

// The inventory must come from the freshest certified route-budget report for
// the build under test: rich chunk filenames are content-hashed, so any chart
// source change renames them. Task 10's Agent B report tracks the current
// production build; the historical task-6 report names a stale chunk.
const inventoryPath = resolve(
  process.cwd(),
  "../../.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/task-10/route-budgets.json"
);
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8")) as BudgetInventory;
const richPaths = new Set(
  inventory.deferredRichChartReachableChunks.map((chunk) => chunk.path)
);

type LabLayoutShift = { value: number; startTime: number; insideChart: boolean };
type LabLongTask = { startTime: number; duration: number; name: string };
type LabEvent = {
  type: string;
  startTime: number;
  duration: number;
  interactionId: number;
};
type LabInteractionSample = { type: string; latency: number; startTime: number };

type QcPerfLab = {
  lcp: Array<{ startTime: number; size: number }>;
  layoutShifts: LabLayoutShift[];
  longTasks: LabLongTask[];
  events: LabEvent[];
  interactionSamples: LabInteractionSample[];
  interactionPhaseStart: number | null;
  observerErrors: string[];
};

type ChartPayloadModel = {
  id: string;
  bytes: number;
  points: number;
  series: number;
};

type RawCollection = {
  lab: QcPerfLab;
  startMarks: number[];
  endMarks: number[];
  marksCount: number;
  payloadModels: ChartPayloadModel[];
};

type NavigationSample = {
  kind: "warmup" | "cold" | "cached";
  index: number;
  lcpMs: number | null;
  inpProxyMs: number;
  inpSource: "interaction-id" | "event-type-fallback" | "none";
  pageCls: number;
  chartCls: number;
  hydration: {
    startMs: number | null;
    endCount: number;
    firstEndMs: number | null;
    deltaMs: number | null;
  };
  longTasks: LabLongTask[];
  chartMountLongTaskMaxMs: number;
  motionLongTaskMaxMs: number;
  marksCount: number;
  chartPayload: {
    models: ChartPayloadModel[];
    maxModelBytes: number;
    totalBytes: number;
  };
  interactionSamples: LabInteractionSample[];
  observerErrors: string[];
};

function nearestRankP95(values: readonly number[]): number {
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(sorted.length * 0.95));
  return sorted[rank - 1];
}

function maxOrZero(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function emittedChunkPath(url: string): string | null {
  const pathname = new URL(url).pathname;
  const normalized = decodeURIComponent(pathname)
    .replace(/^\/?_next\//, "")
    .replace(/^\/+/, "");
  return normalized.startsWith("static/chunks/") && normalized.endsWith(".js")
    ? normalized
    : null;
}

// Installed on every document before any app script runs.
function installPerfLab(): void {
  const lab: QcPerfLab = {
    lcp: [],
    layoutShifts: [],
    longTasks: [],
    events: [],
    interactionSamples: [],
    interactionPhaseStart: null,
    observerErrors: []
  };
  (window as unknown as { __qcPerfLab: QcPerfLab }).__qcPerfLab = lab;

  const chartContainerSelector =
    '[data-slot="deferred-chart-visual"], [data-slot="chart-frame-content"]';

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const paint = entry as PerformanceEntry & { size?: number };
        lab.lcp.push({ startTime: entry.startTime, size: paint.size ?? 0 });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (error) {
    lab.observerErrors.push(`lcp: ${String(error)}`);
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: Array<{ node?: Node | null }>;
        };
        if (shift.hadRecentInput) {
          continue;
        }
        let insideChart = false;
        try {
          for (const source of shift.sources ?? []) {
            const node = source.node ?? null;
            const element =
              node instanceof Element ? node : node?.parentElement ?? null;
            if (element?.closest(chartContainerSelector)) {
              insideChart = true;
              break;
            }
          }
        } catch {
          // Detached shift sources stay attributed to the page bucket.
        }
        lab.layoutShifts.push({
          value: shift.value,
          startTime: entry.startTime,
          insideChart
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (error) {
    lab.observerErrors.push(`layout-shift: ${String(error)}`);
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        lab.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
          name: entry.name
        });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch (error) {
    lab.observerErrors.push(`longtask: ${String(error)}`);
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const timing = entry as PerformanceEntry & { interactionId?: number };
        lab.events.push({
          type: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
          interactionId: timing.interactionId ?? 0
        });
      }
    }).observe({
      type: "event",
      buffered: true,
      durationThreshold: 16
    } as PerformanceObserverInit);
  } catch (error) {
    lab.observerErrors.push(`event: ${String(error)}`);
  }

  // Tooltip/keyboard latency sampler: trusted event -> next animation frame.
  const sample = (event: Event) => {
    if (!event.isTrusted) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (!target.closest('[data-slot="quality-trend-plot"]')) {
      return;
    }
    const eventTimeStamp = event.timeStamp;
    requestAnimationFrame(() => {
      lab.interactionSamples.push({
        type: event.type,
        latency: performance.now() - eventTimeStamp,
        startTime: eventTimeStamp
      });
    });
  };
  window.addEventListener("keydown", sample, true);
  window.addEventListener("pointermove", sample, true);
}

async function waitForReportsReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Аналитика качества" })
  ).toBeVisible({ timeout: 60_000 });
  const lens = page.getByRole("region", { name: "Параметры отчёта" });
  await expect(lens).toHaveAttribute("data-hydrated", "true", {
    timeout: 60_000
  });
}

async function fullScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight);
    const limit = document.documentElement.scrollHeight;
    for (let offset = 0; offset <= limit; offset += step) {
      window.scrollTo(0, offset);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
    }
  });
}

async function armAllCharts(page: Page): Promise<void> {
  await fullScroll(page);
  await page.waitForFunction(
    () => {
      const islands = document.querySelectorAll(
        '[data-slot="deferred-chart-visual"]'
      );
      return (
        islands.length > 0 &&
        Array.from(islands).every(
          (island) => island.getAttribute("data-deferred-state") === "ready"
        )
      );
    },
    undefined,
    { timeout: 90_000 }
  );
}

async function performRouteInteraction(page: Page): Promise<void> {
  const plot = page.locator('[data-slot="quality-trend-plot"]').first();
  await plot.scrollIntoViewIfNeeded();
  const box = await plot.boundingBox();
  if (!box) {
    throw new Error("quality-trend plot has no bounding box");
  }
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5, {
    steps: 1
  });
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, {
    steps: 1
  });
  await plot.click({
    position: { x: box.width * 0.5, y: box.height * 0.5 }
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  // Let event-timing entries (reported after the next paint) and rAF-based
  // tooltip samples settle before collection.
  await page.waitForTimeout(400);
}

async function markInteractionPhaseStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const lab = (window as unknown as { __qcPerfLab?: QcPerfLab }).__qcPerfLab;
    if (lab) {
      lab.interactionPhaseStart = performance.now();
    }
  });
}

async function collectRaw(page: Page, flightHtml: string): Promise<RawCollection> {
  return page.evaluate((htmlText) => {
    const holder = window as unknown as {
      __qcPerfLab?: QcPerfLab;
    };
    const lab: QcPerfLab = holder.__qcPerfLab ?? {
      lcp: [],
      layoutShifts: [],
      longTasks: [],
      events: [],
      interactionSamples: [],
      interactionPhaseStart: null,
      observerErrors: ["lab was not installed"]
    };

    const startMarks = performance
      .getEntriesByName("qc-chart-hydration-start")
      .map((entry) => entry.startTime);
    const endMarks = performance
      .getEntriesByName("qc-chart-hydration-end")
      .map((entry) => entry.startTime);

    const marksCount = document.querySelectorAll(
      "svg.recharts-surface g[data-series] :is(path, rect, circle, polyline, polygon, line)"
    ).length;

    // Serialized chart payload: chart models are embedded in the RSC flight
    // stream as plain JSON ({"id":...,"series":[...],"points":[...],
    // "emptyTitle":...}). Extract each with a string-aware balanced scanner.
    // The flight rows are decoded from the captured document HTML: Next 16
    // empties window.__next_f after consuming the stream, so the live holder
    // is empty by collection time. Each inline row is
    // `<script>self.__next_f.push([1,"<JS string>"])</script>`; the argument
    // is JSON-compatible, so JSON.parse decodes it back to the flight text.
    const flightRows: string[] = [];
    const pushMarker = "self.__next_f.push(";
    let cursor = 0;
    while (cursor < htmlText.length) {
      const at = htmlText.indexOf(pushMarker, cursor);
      if (at === -1) {
        break;
      }
      const end = htmlText.indexOf(")</script>", at);
      if (end === -1) {
        break;
      }
      try {
        const parsed: unknown = JSON.parse(
          htmlText.slice(at + pushMarker.length, end)
        );
        if (Array.isArray(parsed) && typeof parsed[1] === "string") {
          flightRows.push(parsed[1]);
        }
      } catch {
        // Not a data row (e.g. the [0] bootstrap row) — skip.
      }
      cursor = end + 1;
    }
    const flight = flightRows.join("");
    const models: ChartPayloadModel[] = [];
    const needle = '{"id":"';
    let searchFrom = 0;
    let guard = 0;
    while (guard < 20000) {
      guard += 1;
      const start = flight.indexOf(needle, searchFrom);
      if (start === -1) {
        break;
      }
      searchFrom = start + 1;
      let depth = 0;
      let inString = false;
      let escaped = false;
      let end = -1;
      for (let index = start; index < flight.length; index += 1) {
        const character = flight[index];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (character === "\\") {
            escaped = true;
          } else if (character === '"') {
            inString = false;
          }
          continue;
        }
        if (character === '"') {
          inString = true;
          continue;
        }
        if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            end = index + 1;
            break;
          }
        }
      }
      if (end === -1) {
        continue;
      }
      const raw = flight.slice(start, end);
      if (raw.length > 1_000_000) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (parsed == null || typeof parsed !== "object") {
        continue;
      }
      const candidate = parsed as {
        id?: unknown;
        series?: unknown;
        points?: unknown;
        emptyTitle?: unknown;
      };
      if (
        typeof candidate.id !== "string" ||
        !Array.isArray(candidate.series) ||
        !Array.isArray(candidate.points) ||
        typeof candidate.emptyTitle !== "string"
      ) {
        continue;
      }
      models.push({
        id: candidate.id,
        bytes: new TextEncoder().encode(raw).length,
        points: candidate.points.length,
        series: candidate.series.length
      });
      // Skip past this model so nested point objects are not re-scanned.
      searchFrom = end;
    }

    return {
      lab: JSON.parse(JSON.stringify(lab)) as QcPerfLab,
      startMarks,
      endMarks,
      marksCount,
      payloadModels: models
    };
  }, flightHtml);
}

function computeSample(
  kind: NavigationSample["kind"],
  index: number,
  raw: RawCollection
): NavigationSample {
  const { lab } = raw;

  const lcpMs =
    lab.lcp.length === 0
      ? null
      : Math.max(...lab.lcp.map((entry) => entry.startTime));

  const interactionEntries = lab.events.filter(
    (entry) => entry.interactionId > 0
  );
  const fallbackEntries = lab.events.filter((entry) =>
    ["keydown", "keyup", "pointerdown", "pointerup", "click"].includes(entry.type)
  );
  let inpSource: NavigationSample["inpSource"] = "none";
  let inpEntries: LabEvent[] = [];
  if (interactionEntries.length > 0) {
    inpSource = "interaction-id";
    inpEntries = interactionEntries;
  } else if (fallbackEntries.length > 0) {
    inpSource = "event-type-fallback";
    inpEntries = fallbackEntries;
  }
  const inpProxyMs = maxOrZero(inpEntries.map((entry) => entry.duration));

  const pageCls = lab.layoutShifts.reduce((sum, entry) => sum + entry.value, 0);
  const chartCls = lab.layoutShifts
    .filter((entry) => entry.insideChart)
    .reduce((sum, entry) => sum + entry.value, 0);

  const startMs = raw.startMarks.length === 0 ? null : Math.min(...raw.startMarks);
  const endsAfterStart =
    startMs == null
      ? []
      : raw.endMarks.filter((end) => end >= startMs).sort((a, b) => a - b);
  const firstEndMs = endsAfterStart.length === 0 ? null : endsAfterStart[0];
  const deltaMs =
    startMs == null || firstEndMs == null ? null : firstEndMs - startMs;

  // The hydration marks are set synchronously inside the tasks that evaluate
  // the rich module and commit each island, so a long task belongs to chart
  // mounting exactly when its interval contains a mark timestamp.
  const markPoints = [...raw.startMarks, ...raw.endMarks];
  const containsMark = (task: LabLongTask) =>
    markPoints.some(
      (point) =>
        point >= task.startTime && point <= task.startTime + task.duration
    );
  const chartMountLongTasks = lab.longTasks.filter(containsMark);
  const interactionPhaseStart =
    lab.interactionPhaseStart ?? Number.POSITIVE_INFINITY;
  const motionLongTasks = lab.longTasks.filter(
    (task) => task.startTime >= interactionPhaseStart && !containsMark(task)
  );

  const totalBytes = raw.payloadModels.reduce(
    (sum, model) => sum + model.bytes,
    0
  );

  return {
    kind,
    index,
    lcpMs: lcpMs == null ? null : round(lcpMs),
    inpProxyMs: round(inpProxyMs),
    inpSource,
    pageCls: round(pageCls, 5),
    chartCls: round(chartCls, 5),
    hydration: {
      startMs: startMs == null ? null : round(startMs),
      endCount: raw.endMarks.length,
      firstEndMs: firstEndMs == null ? null : round(firstEndMs),
      deltaMs: deltaMs == null ? null : round(deltaMs)
    },
    longTasks: lab.longTasks,
    chartMountLongTaskMaxMs: round(
      maxOrZero(chartMountLongTasks.map((task) => task.duration))
    ),
    motionLongTaskMaxMs: round(
      maxOrZero(motionLongTasks.map((task) => task.duration))
    ),
    marksCount: raw.marksCount,
    chartPayload: {
      models: raw.payloadModels,
      maxModelBytes: maxOrZero(raw.payloadModels.map((model) => model.bytes)),
      totalBytes
    },
    interactionSamples: lab.interactionSamples,
    observerErrors: lab.observerErrors
  };
}

async function runNavigationSample(
  page: Page,
  kind: NavigationSample["kind"],
  index: number
): Promise<NavigationSample> {
  const response = await page.goto(labRoute, { waitUntil: "commit" });
  await waitForReportsReady(page);
  await armAllCharts(page);
  await markInteractionPhaseStart(page);
  await performRouteInteraction(page);
  // The document body carries the full flight stream identically on cold and
  // cached loads; capture it for the chart-payload scan.
  const flightHtml = response
    ? await response.text().catch(() => "")
    : "";
  const raw = await collectRaw(page, flightHtml);
  return computeSample(kind, index, raw);
}

async function prepareColdNavigation(
  page: Page,
  context: BrowserContext,
  session: CDPSession,
  admin: { id: string }
): Promise<void> {
  // The page is still on the app origin from the previous navigation, so
  // origin storage can be cleared directly before dropping cache and cookies.
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // Storage can be unavailable on non-app documents; cache and cookie
        // clearing below still guarantee a cold start.
      }
    })
    .catch(() => undefined);
  await session.send("Network.clearBrowserCache");
  await context.clearCookies();
  await signInE2EUser(context, admin, userAgentTag);
}

async function sampleInteractionLatency(
  page: Page
): Promise<LabInteractionSample[]> {
  const plot = page.locator('[data-slot="quality-trend-plot"]').first();
  await plot.scrollIntoViewIfNeeded();
  const box = await plot.boundingBox();
  if (!box) {
    throw new Error("quality-trend plot has no bounding box");
  }

  // Focus the plot so keyboard samples target the app-owned interaction layer.
  await plot.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });

  // Warm-up interactions: performed and then discarded.
  for (let index = 0; index < INTERACTION_WARMUP_COUNT; index += 1) {
    await page.keyboard.press(index % 2 === 0 ? "ArrowRight" : "ArrowLeft");
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const lab = (window as unknown as { __qcPerfLab?: QcPerfLab }).__qcPerfLab;
    if (lab) {
      lab.interactionSamples = [];
    }
  });

  // 20 measured samples: alternating tooltip pointer moves and keyboard
  // roving-point navigation on the quality-trend plot.
  for (let index = 0; index < INTERACTION_SAMPLE_COUNT; index += 1) {
    if (index % 2 === 0) {
      const fraction = 0.15 + (index / INTERACTION_SAMPLE_COUNT) * 0.7;
      await page.mouse.move(
        box.x + box.width * fraction,
        box.y + box.height * 0.5,
        { steps: 1 }
      );
    } else {
      await page.keyboard.press(index % 4 === 1 ? "ArrowRight" : "ArrowLeft");
    }
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(400);

  return page.evaluate(() => {
    const lab = (window as unknown as { __qcPerfLab?: QcPerfLab }).__qcPerfLab;
    return lab ? lab.interactionSamples : [];
  });
}

test.describe("report performance lab", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The CDP performance lab is Chromium-only"
  );

  test("chromium CDP lab certifies chart performance and payload budgets", async ({
    page,
    context
  }) => {
    test.setTimeout(900_000);

    const admin = await findSeededDemoAdmin();
    await signInE2EUser(context, admin, userAgentTag);

    await context.addInitScript(installPerfLab);

    const consoleFindings: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error") {
        consoleFindings.push(`console.error: ${text}`);
        return;
      }
      if (/hydrat|did not match|Extra attributes from the server/i.test(text)) {
        consoleFindings.push(`console.${message.type()}: ${text}`);
      }
    });
    page.on("pageerror", (error) => {
      consoleFindings.push(`pageerror: ${error.message}`);
    });

    const scriptResponses: string[] = [];
    page.on("response", (response) => {
      const path = emittedChunkPath(response.url());
      if (path && response.request().resourceType() === "script") {
        scriptResponses.push(path);
      }
    });

    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", { ...FAST_4G });
    await session.send("Emulation.setCPUThrottlingRate", {
      rate: CPU_THROTTLING_RATE
    });

    const report: {
      generatedAt: string;
      profile: Record<string, unknown>;
      budgets: typeof BUDGETS;
      warmup: NavigationSample | null;
      samples: { cold: NavigationSample[]; cached: NavigationSample[] };
      aggregates: Record<string, unknown>;
      interactionLatency: {
        warmupCount: number;
        samples: LabInteractionSample[];
        measured: number[];
        p95Ms: number | null;
      };
      tableOnly: {
        route: string;
        scriptResponses: string[];
        richRequests: string[];
      };
      consoleFindings: string[];
      incomplete?: string;
    } = {
      generatedAt: new Date().toISOString(),
      profile: {
        browser: "chromium",
        cpuThrottlingRate: CPU_THROTTLING_RATE,
        network: {
          preset: "Fast 4G",
          downloadBitsPerSecond: 1_600_000,
          uploadBitsPerSecond: 750_000,
          latencyMs: FAST_4G.latency
        },
        route: labRoute,
        tableRoute,
        coldSamples: COLD_SAMPLES,
        cachedSamples: CACHED_SAMPLES,
        discardedWarmups: 1
      },
      budgets: BUDGETS,
      warmup: null,
      samples: { cold: [], cached: [] },
      aggregates: {},
      interactionLatency: {
        warmupCount: INTERACTION_WARMUP_COUNT,
        samples: [],
        measured: [],
        p95Ms: null
      },
      tableOnly: { route: tableRoute, scriptResponses: [], richRequests: [] },
      consoleFindings
    };

    try {
      // One discarded warm-up navigation.
      report.warmup = await runNavigationSample(page, "warmup", 0);

      // Five cold navigations: cache, cookies, and origin storage cleared
      // before each sample; the session cookie is re-issued afterwards.
      for (let index = 1; index <= COLD_SAMPLES; index += 1) {
        await prepareColdNavigation(page, context, session, admin);
        report.samples.cold.push(
          await runNavigationSample(page, "cold", index)
        );
      }

      // Five cached navigations: no clearing between samples.
      for (let index = 1; index <= CACHED_SAMPLES; index += 1) {
        report.samples.cached.push(
          await runNavigationSample(page, "cached", index)
        );
      }

      // Tooltip/keyboard latency: warm-up burst plus 20 measured samples on
      // the final cached page.
      const latencySamples = await sampleInteractionLatency(page);
      const measured = latencySamples
        .slice(0, INTERACTION_SAMPLE_COUNT)
        .map((sample) => round(sample.latency));
      report.interactionLatency.samples = latencySamples;
      report.interactionLatency.measured = measured;
      report.interactionLatency.p95Ms =
        measured.length === 0 ? null : round(nearestRankP95(measured));

      // Table-only navigation must not request any rich/Recharts chunk even
      // with an empty browser cache.
      await session.send("Network.clearBrowserCache");
      const scriptCountBeforeTable = scriptResponses.length;
      await page.goto(tableRoute, { waitUntil: "commit" });
      await waitForReportsReady(page);
      await fullScroll(page);
      await page.waitForTimeout(500);
      const tableScripts = scriptResponses.slice(scriptCountBeforeTable);
      report.tableOnly.scriptResponses = tableScripts;
      report.tableOnly.richRequests = tableScripts.filter(
        (path) => richPaths.has(path) || /recharts/i.test(path)
      );

      const measuredSamples = [...report.samples.cold, ...report.samples.cached];
      const coldLcp = report.samples.cold.map(
        (sample) => sample.lcpMs ?? Number.POSITIVE_INFINITY
      );
      const cachedLcp = report.samples.cached.map(
        (sample) => sample.lcpMs ?? Number.POSITIVE_INFINITY
      );
      const coldInp = report.samples.cold.map((sample) => sample.inpProxyMs);
      const cachedInp = report.samples.cached.map((sample) => sample.inpProxyMs);
      report.aggregates = {
        lcpMs: {
          cold: { samples: coldLcp, p95: round(nearestRankP95(coldLcp)) },
          cached: { samples: cachedLcp, p95: round(nearestRankP95(cachedLcp)) }
        },
        inpProxyMs: {
          cold: { samples: coldInp, p95: round(nearestRankP95(coldInp)) },
          cached: { samples: cachedInp, p95: round(nearestRankP95(cachedInp)) }
        },
        pageClsMax: maxOrZero(measuredSamples.map((sample) => sample.pageCls)),
        chartClsMax: maxOrZero(measuredSamples.map((sample) => sample.chartCls)),
        hydrationDeltaMsMax: maxOrZero(
          measuredSamples.map(
            (sample) => sample.hydration.deltaMs ?? Number.POSITIVE_INFINITY
          )
        ),
        chartMountLongTaskMaxMs: maxOrZero(
          measuredSamples.map((sample) => sample.chartMountLongTaskMaxMs)
        ),
        motionLongTaskMaxMs: maxOrZero(
          measuredSamples.map((sample) => sample.motionLongTaskMaxMs)
        ),
        marksCountMax: maxOrZero(
          measuredSamples.map((sample) => sample.marksCount)
        ),
        perChartPayloadMaxBytes: maxOrZero(
          measuredSamples.map((sample) => sample.chartPayload.maxModelBytes)
        ),
        routeChartPayloadMaxBytes: maxOrZero(
          measuredSamples.map((sample) => sample.chartPayload.totalBytes)
        )
      };
    } catch (error) {
      report.incomplete = `lab run aborted: ${String(error)}`;
      throw error;
    } finally {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`);
      await test.info().attach("performance-lab.json", {
        path: artifactPath,
        contentType: "application/json"
      });
    }

    const measuredSamples = [...report.samples.cold, ...report.samples.cached];

    // Sanity: every measured navigation produced both hydration marks and a
    // non-empty chart payload/marks inventory.
    for (const sample of measuredSamples) {
      expect
        .soft(
          sample.hydration.startMs,
          `${sample.kind}#${sample.index}: qc-chart-hydration-start mark missing`
        )
        .not.toBeNull();
      expect
        .soft(
          sample.hydration.deltaMs,
          `${sample.kind}#${sample.index}: qc-chart-hydration-end mark missing (end count ${sample.hydration.endCount})`
        )
        .not.toBeNull();
      expect
        .soft(
          sample.marksCount,
          `${sample.kind}#${sample.index}: rendered chart data marks missing`
        )
        .toBeGreaterThan(0);
      expect
        .soft(
          sample.chartPayload.models.length,
          `${sample.kind}#${sample.index}: serialized chart models were not found in the flight payload`
        )
        .toBeGreaterThan(0);
      expect
        .soft(
          sample.observerErrors,
          `${sample.kind}#${sample.index}: PerformanceObserver setup errors`
        )
        .toEqual([]);
    }

    const coldLcpP95 = nearestRankP95(
      report.samples.cold.map((sample) => sample.lcpMs ?? Number.POSITIVE_INFINITY)
    );
    const cachedLcpP95 = nearestRankP95(
      report.samples.cached.map(
        (sample) => sample.lcpMs ?? Number.POSITIVE_INFINITY
      )
    );
    expect
      .soft(
        coldLcpP95,
        `cold LCP nearest-rank p95 ms (samples: ${report.samples.cold
          .map((sample) => sample.lcpMs)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.lcpMs);
    expect
      .soft(
        cachedLcpP95,
        `cached LCP nearest-rank p95 ms (samples: ${report.samples.cached
          .map((sample) => sample.lcpMs)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.lcpMs);

    const coldInpP95 = nearestRankP95(
      report.samples.cold.map((sample) => sample.inpProxyMs)
    );
    const cachedInpP95 = nearestRankP95(
      report.samples.cached.map((sample) => sample.inpProxyMs)
    );
    expect
      .soft(
        coldInpP95,
        `cold route INP proxy nearest-rank p95 ms (samples: ${report.samples.cold
          .map((sample) => `${sample.inpProxyMs} [${sample.inpSource}]`)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.routeInpMs);
    expect
      .soft(
        cachedInpP95,
        `cached route INP proxy nearest-rank p95 ms (samples: ${report.samples.cached
          .map((sample) => `${sample.inpProxyMs} [${sample.inpSource}]`)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.routeInpMs);

    expect
      .soft(
        maxOrZero(measuredSamples.map((sample) => sample.pageCls)),
        `page CLS max (samples: ${measuredSamples
          .map((sample) => sample.pageCls)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.pageCls);
    expect
      .soft(
        maxOrZero(measuredSamples.map((sample) => sample.chartCls)),
        `chart CLS max (samples: ${measuredSamples
          .map((sample) => sample.chartCls)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.chartCls);

    expect
      .soft(
        maxOrZero(
          measuredSamples.map(
            (sample) => sample.hydration.deltaMs ?? Number.POSITIVE_INFINITY
          )
        ),
        `eager hydration delta ms max (samples: ${measuredSamples
          .map((sample) => sample.hydration.deltaMs)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.hydrationDeltaMs);

    expect
      .soft(
        maxOrZero(
          measuredSamples.map((sample) => sample.chartMountLongTaskMaxMs)
        ),
        `chart mount long task max ms (samples: ${measuredSamples
          .map((sample) => sample.chartMountLongTaskMaxMs)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.chartMountLongTaskMs);
    expect
      .soft(
        maxOrZero(measuredSamples.map((sample) => sample.motionLongTaskMaxMs)),
        `motion/interaction long task max ms (samples: ${measuredSamples
          .map((sample) => sample.motionLongTaskMaxMs)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.motionLongTaskMs);

    expect
      .soft(
        maxOrZero(measuredSamples.map((sample) => sample.marksCount)),
        `total SVG data marks max (samples: ${measuredSamples
          .map((sample) => sample.marksCount)
          .join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.totalMarks);

    const payloadDetails = measuredSamples[0]?.chartPayload.models
      .map((model) => `${model.id}=${model.bytes}B`)
      .join(", ");
    expect
      .soft(
        maxOrZero(
          measuredSamples.map((sample) => sample.chartPayload.maxModelBytes)
        ),
        `per-chart serialized payload max bytes (models: ${payloadDetails})`
      )
      .toBeLessThanOrEqual(BUDGETS.perChartPayloadBytes);
    expect
      .soft(
        maxOrZero(
          measuredSamples.map((sample) => sample.chartPayload.totalBytes)
        ),
        `route chart payload total bytes (models: ${payloadDetails})`
      )
      .toBeLessThanOrEqual(BUDGETS.routeChartPayloadBytes);

    expect
      .soft(
        report.interactionLatency.measured.length,
        "tooltip/keyboard latency requires 20 measured samples"
      )
      .toBeGreaterThanOrEqual(INTERACTION_SAMPLE_COUNT);
    expect
      .soft(
        report.interactionLatency.p95Ms ?? Number.POSITIVE_INFINITY,
        `tooltip/keyboard nearest-rank p95 ms (samples: ${report.interactionLatency.measured.join(", ")})`
      )
      .toBeLessThanOrEqual(BUDGETS.interactionP95Ms);

    expect
      .soft(
        report.tableOnly.richRequests,
        `table-only navigation requested rich chart chunks (all scripts: ${report.tableOnly.scriptResponses.join(", ")})`
      )
      .toEqual([]);

    expect
      .soft(consoleFindings, "console/hydration findings must be empty")
      .toEqual([]);
  });
});
