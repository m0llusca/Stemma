import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QualityTrendChart } from "@/components/charts/quality-trend-chart.client";
import {
  buildChartSeriesHref,
  ChartLegendControls
} from "@/components/charts/chart-legend-controls";
import { PrimaryScorePanel } from "@/components/reports/report-score-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChartModel } from "@/lib/charts/contracts";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search)
}));

vi.mock("@/components/charts/recharts-visuals.client", () => ({
  QualityTrendVisual: ({
    visibleSeries
  }: {
    visibleSeries: readonly string[];
  }) => (
    <svg aria-hidden="true" className="recharts-surface" tabIndex={-1}>
      {visibleSeries.includes("score") ? (
        <g data-series="score" data-animation-active="false" />
      ) : null}
      {visibleSeries.includes("previous") ? (
        <g
          data-series="previous"
          data-animation-active="false"
          data-marker="diamond"
          strokeDasharray="6 5"
        />
      ) : null}
      {visibleSeries.includes("target") ? (
        <g data-series="target" aria-label="Цель 90 баллов" />
      ) : null}
      {visibleSeries.includes("volume") ? (
        <g
          data-series="volume"
          data-tone="neutral"
          data-animation-active="false"
        />
      ) : null}
    </svg>
  )
}));

type TrendSeries = "score" | "previous" | "target" | "volume";

const model: ChartModel<TrendSeries> = {
  id: "quality-overview",
  title: "Динамика качества",
  description:
    "Средний балл, прошлый период, цель и число завершённых проверок.",
  xLabel: "Дата",
  yLabel: "Баллы качества",
  series: [
    {
      key: "score",
      label: "Средний балл",
      unit: "quality-score",
      tone: "primary"
    },
    {
      key: "previous",
      label: "Прошлый период",
      unit: "quality-score",
      tone: "secondary"
    },
    {
      key: "target",
      label: "Цель 90 баллов",
      unit: "quality-score",
      tone: "reference"
    },
    {
      key: "volume",
      label: "Проверки",
      unit: "count",
      tone: "secondary"
    }
  ],
  points: [
    {
      id: "2026-07-01",
      label: "1 июля",
      sortKey: "2026-07-01",
      values: { score: 82, previous: 84, target: 90, volume: 7 },
      detail: "Первая неделя",
      sampleSize: 7,
      href: "/reviews?finalizedFrom=2026-07-01&finalizedTo=2026-07-01"
    },
    {
      id: "2026-07-08",
      label: "8 июля",
      sortKey: "2026-07-08",
      values: { score: 87, previous: 83, target: 90, volume: 11 },
      detail: "Вторая неделя",
      sampleSize: 11,
      href: "/reviews?finalizedFrom=2026-07-08&finalizedTo=2026-07-08"
    }
  ],
  emptyTitle: "Нет завершённых проверок",
  emptyDescription: "Данные появятся после первой финализированной проверки."
};

const currentHref =
  "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&chartView=graph&series=score%2Cprevious%2Ctarget%2Cvolume";

const allSeries: TrendSeries[] = ["score", "previous", "target", "volume"];
const evidenceHref =
  "/reports?view=overview&evidenceType=trend&evidenceKey=ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const geometryModel: ChartModel<TrendSeries> = {
  ...model,
  points: [
    model.points[0],
    {
      id: "2026-07-04",
      label: "4 июля",
      sortKey: "2026-07-04",
      values: { score: 50, previous: 60, target: 90, volume: 5 },
      detail: "Середина периода",
      sampleSize: 5
    },
    model.points[1]
  ]
};

function renderChart(visibleSeries: readonly TrendSeries[] = allSeries) {
  return render(
    <QualityTrendChart
      model={model}
      visibleSeries={visibleSeries}
      currentHref={currentHref}
    />
  );
}

function focusableElements(root: HTMLElement) {
  return [
    ...(root.matches(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
      ? [root]
      : []),
    ...Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    )
  ];
}

describe("QualityTrendChart", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    window.history.replaceState(null, "", "/");
    class TestPointerEvent extends MouseEvent {
      pointerType: string;

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    }

    vi.stubGlobal("PointerEvent", TestPointerEvent);
  });

  it("gives the plot an accessible name, description, and exactly one tab stop", async () => {
    const { container } = renderChart();

    const plot = screen.getByRole("group", { name: "Динамика качества" });
    const description = screen.getByText(model.description);

    expect(plot).toHaveAttribute("aria-describedby", expect.stringContaining(description.id));
    expect(plot).toHaveAttribute("data-accessibility-layer", "app-owned");
    expect(plot).toHaveAttribute(
      "aria-roledescription",
      "интерактивный график"
    );
    expect(plot).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowLeft ArrowRight Enter Escape"
    );
    expect(focusableElements(plot)).toEqual([plot]);
    await waitFor(
      () => {
        expect(container.querySelector(".recharts-surface")).toHaveAttribute(
          "tabindex",
          "-1"
        );
        expect(container.querySelector(".recharts-surface")).toHaveAttribute(
          "aria-hidden",
          "true"
        );
      },
      { timeout: 3_000 }
    );
  });

  it("uses the renderer plot geometry for first, middle, last, and hidden-score markers", () => {
    const { container, rerender } = render(
      <QualityTrendChart
        model={geometryModel}
        visibleSeries={allSeries}
        currentHref={currentHref}
      />
    );
    const plot = screen.getByRole("group", { name: "Динамика качества" });

    act(() => plot.focus());

    let marker = container.querySelector<HTMLElement>(
      '[data-slot="quality-selected-marker"]'
    );
    expect(marker).toHaveAttribute("data-marker-series", "score");
    expect(marker).toHaveStyle({
      left: `${(42 / 720) * 100}%`,
      top: `${((20 + 262 - (82 / 100) * 262) / 320) * 100}%`
    });

    fireEvent.keyDown(plot, { key: "ArrowRight" });
    marker = container.querySelector<HTMLElement>(
      '[data-slot="quality-selected-marker"]'
    );
    expect(marker).toHaveStyle({
      left: `${(372 / 720) * 100}%`,
      top: `${(151 / 320) * 100}%`
    });

    fireEvent.keyDown(plot, { key: "ArrowRight" });
    marker = container.querySelector<HTMLElement>(
      '[data-slot="quality-selected-marker"]'
    );
    expect(marker).toHaveStyle({
      left: `${(702 / 720) * 100}%`,
      top: `${((20 + 262 - (87 / 100) * 262) / 320) * 100}%`
    });

    rerender(
      <QualityTrendChart
        model={geometryModel}
        visibleSeries={["previous"]}
        currentHref={currentHref}
      />
    );
    marker = container.querySelector<HTMLElement>(
      '[data-slot="quality-selected-marker"]'
    );
    expect(marker).toHaveAttribute("data-marker-series", "previous");
    expect(marker).toHaveStyle({
      left: `${(702 / 720) * 100}%`,
      top: `${((20 + 262 - (83 / 100) * 262) / 320) * 100}%`
    });
  });

  it("maps pointer selection through the same viewBox at compact and wide sizes", () => {
    const { container } = render(
      <QualityTrendChart
        model={geometryModel}
        visibleSeries={allSeries}
        currentHref={currentHref}
      />
    );
    const plot = screen.getByRole("group", { name: "Динамика качества" });
    const bounds = vi.spyOn(plot, "getBoundingClientRect");

    bounds.mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 360,
      bottom: 160,
      width: 360,
      height: 160,
      toJSON: () => ({})
    });
    fireEvent.pointerMove(plot, { clientX: 180, pointerType: "mouse" });
    expect(
      container.querySelector('[data-slot="quality-selected-marker"]')
    ).toHaveAttribute("data-point-id", "2026-07-04");

    bounds.mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1440,
      bottom: 640,
      width: 1440,
      height: 640,
      toJSON: () => ({})
    });
    fireEvent.pointerMove(plot, { clientX: 1404, pointerType: "mouse" });
    expect(
      container.querySelector('[data-slot="quality-selected-marker"]')
    ).toHaveAttribute("data-point-id", "2026-07-08");
  });

  it("moves through points with arrows, drills down only on Enter, and clears on Escape", () => {
    const { container } = renderChart();

    const plot = screen.getByRole("group", { name: "Динамика качества" });
    act(() => {
      plot.focus();
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent("1 июля");
    expect(
      container.querySelector('[data-slot="quality-selected-marker"]')
    ).toHaveAttribute("data-point-id", "2026-07-01");
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.keyDown(plot, { key: "ArrowRight" });

    const tooltip = screen.getByRole("tooltip");
    expect(plot).toHaveAttribute("data-active-point-id", "2026-07-08");
    expect(tooltip).toHaveTextContent("8 июля");
    expect(tooltip).toHaveTextContent("87 баллов");
    expect(tooltip).toHaveTextContent("+4 балла к прошлому периоду");
    expect(tooltip).toHaveTextContent("11 проверок");
    expect(plot).toHaveAttribute("aria-describedby", expect.stringContaining(tooltip.id));
    expect(
      container.querySelector('[data-slot="quality-selected-marker"]')
    ).toHaveAttribute("data-point-id", "2026-07-08");
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.keyDown(plot, { key: "Enter" });
    expect(navigation.push).toHaveBeenCalledWith(
      "/reviews?finalizedFrom=2026-07-08&finalizedTo=2026-07-08",
      undefined
    );

    fireEvent.keyDown(plot, { key: "Escape" });
    expect(plot).not.toHaveAttribute("data-active-point-id");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="quality-selected-marker"]')
    ).not.toBeInTheDocument();
    expect(plot).toHaveFocus();
  });

  it("opens exact chart evidence through the address bar without an App Router navigation", () => {
    // The client router on a fresh page load can drop router.push commits
    // (Next 16.2.x), which made Enter-to-evidence intermittently no-op.
    // Exact evidence targets now commit through native history; the Evidence
    // Sheet watches the URL and resolves the payload on demand.
    const evidenceModel = {
      ...model,
      points: model.points.map((point, index) =>
        index === 0 ? { ...point, href: evidenceHref } : point
      )
    };
    render(
      <QualityTrendChart
        model={evidenceModel}
        visibleSeries={allSeries}
        currentHref={currentHref}
      />
    );
    const plot = screen.getByRole("group", { name: "Динамика качества" });

    fireEvent.focus(plot);
    fireEvent.keyDown(plot, { key: "Enter" });

    expect(window.location.pathname + window.location.search).toBe(evidenceHref);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("shows the same tooltip for pointer, focus, and first touch without drilling down", () => {
    const { container } = renderChart();

    const plot = screen.getByRole("group", { name: "Динамика качества" });
    vi.spyOn(plot, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 240,
      width: 200,
      height: 240,
      toJSON: () => ({})
    });

    fireEvent.pointerMove(plot, { clientX: 190, pointerType: "mouse" });
    const pointerText = screen.getByRole("tooltip").textContent;
    expect(pointerText).toContain("8 июля");
    expect(
      container.querySelector('[data-slot="quality-selected-marker"]')
    ).toHaveAttribute("data-point-id", "2026-07-08");

    fireEvent.keyDown(plot, { key: "Escape" });
    act(() => {
      plot.focus();
    });
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    expect(screen.getByRole("tooltip")).toHaveTextContent(pointerText ?? "");

    fireEvent.keyDown(plot, { key: "Escape" });
    fireEvent.pointerDown(plot, {
      clientX: 190,
      pointerType: "touch"
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent(pointerText ?? "");
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="quality-selected-marker"]')
    ).toHaveAttribute("data-point-id", "2026-07-08");

    vi.unstubAllGlobals();
  });

  it("keeps the touch selection when the gesture ends with focus inside the plot", async () => {
    const { container } = renderChart();
    const plot = screen.getByRole("group", { name: "Динамика качества" });

    await waitFor(() => {
      expect(container.querySelector(".recharts-surface")).toBeInTheDocument();
    });

    vi.spyOn(plot, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 240,
      width: 200,
      height: 240,
      toJSON: () => ({})
    });

    // A real tap focuses the nearest focusable element inside the plot (the
    // tabIndex=-1 presentation svg), not the plot itself; Chromium then ends
    // the touch contact with a pointerleave.
    fireEvent.pointerDown(plot, { clientX: 190, pointerType: "touch" });
    expect(plot).toHaveAttribute("data-active-point-id", "2026-07-08");

    const surface = container.querySelector(".recharts-surface") as HTMLElement;
    surface.focus();
    expect(document.activeElement).toBe(surface);

    fireEvent.pointerOut(plot, {
      pointerType: "touch",
      relatedTarget: document.body
    });

    expect(plot).toHaveAttribute("data-active-point-id", "2026-07-08");
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("keeps the touch selection and tooltip when the contact leaves before tap focus lands", () => {
    const { container } = renderChart();
    const plot = screen.getByRole("group", { name: "Динамика качества" });
    vi.spyOn(plot, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 240,
      width: 200,
      height: 240,
      toJSON: () => ({})
    });

    // Under full-suite load the tap's compat-mouse focus can land after the
    // touch contact's pointerleave (activeElement is still <body>): the leave
    // must not race the inspection away — an active point keeps its tooltip.
    fireEvent.pointerDown(plot, { clientX: 190, pointerType: "touch" });
    expect(plot).toHaveAttribute("data-active-point-id", "2026-07-08");

    fireEvent.pointerOut(plot, {
      pointerType: "touch",
      relatedTarget: document.body
    });

    expect(plot).toHaveAttribute("data-active-point-id", "2026-07-08");
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="quality-selected-marker"]')
    ).toHaveAttribute("data-point-id", "2026-07-08");
    vi.unstubAllGlobals();
  });

  it("clears pointer inspection when the pointer leaves an unfocused plot", () => {
    const { container } = renderChart();
    const plot = screen.getByRole("group", { name: "Динамика качества" });
    vi.spyOn(plot, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 240,
      width: 200,
      height: 240,
      toJSON: () => ({})
    });

    fireEvent.pointerMove(plot, { clientX: 190, pointerType: "mouse" });
    expect(plot).toHaveAttribute("data-active-point-id", "2026-07-08");
    expect(container.querySelector('[data-slot="quality-selected-marker"]')).toBeInTheDocument();

    fireEvent.pointerOut(plot, {
      pointerType: "mouse",
      relatedTarget: document.body
    });

    expect(plot).not.toHaveAttribute("data-active-point-id");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders score, previous, target, and neutral volume as static distinguishable marks", async () => {
    const { container } = renderChart();

    await waitFor(() => {
      expect(container.querySelector('[data-series="score"]')).toBeInTheDocument();
    });
    expect(container.querySelector('[data-series="previous"]')).toHaveAttribute(
      "stroke-dasharray"
    );
    expect(container.querySelector('[data-series="previous"]')).toHaveAttribute(
      "data-marker",
      "diamond"
    );
    expect(container.querySelector('[data-series="target"]')).toHaveAttribute(
      "aria-label",
      "Цель 90 баллов"
    );
    expect(container.querySelector('[data-series="volume"]')).toHaveAttribute(
      "data-tone",
      "neutral"
    );

    for (const mark of container.querySelectorAll(
      '[data-series="score"], [data-series="previous"], [data-series="volume"]'
    )) {
      expect(mark).toHaveAttribute("data-animation-active", "false");
    }
  });

  it("keeps the initial and reduced-motion renders fully static", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );

    const { container } = renderChart();

    await waitFor(() => {
      expect(container.querySelector('[data-series="score"]')).toBeInTheDocument();
    });
    expect(container.querySelectorAll("[data-animation-active=true]")).toHaveLength(0);
    expect(container.querySelector('[data-series="volume"]')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("exposes a finite, named loading state while the rich visual waits for the viewport", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();

    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        unobserve = vi.fn();
        disconnect = disconnect;
      }
    );

    const { container, unmount } = renderChart();

    expect(
      screen.getByRole("status", { name: "Загрузка визуального представления" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Загрузка визуального представления" })
    ).toHaveClass(
      "h-[216px]",
      "min-[390px]:h-[232px]",
      "md:h-[280px]",
      "xl:h-[320px]"
    );
    expect(
      container.querySelector('[data-slot="deferred-chart-visual"]')
    ).toHaveAttribute("data-deferred-state", "waiting");
    expect(container.querySelector('[data-slot="skeleton"]')).toHaveAttribute(
      "data-qc-motion",
      "none"
    );
    const globalsCss = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8"
    );
    expect(globalsCss).toMatch(
      /\[data-slot="skeleton"\]\[data-qc-motion="none"\]\s*\{\s*animation:\s*none;?\s*\}/
    );
    expect(observe).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("ChartLegendControls", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("builds a canonical replace URL and prevents hiding the final series", () => {
    render(
      <ChartLegendControls
        series={model.series}
        visibleSeries={["score"]}
        currentHref={currentHref}
      />
    );

    const score = screen.getByRole("button", { name: "Средний балл" });
    const previous = screen.getByRole("button", { name: "Прошлый период" });

    expect(score).toHaveAttribute("aria-pressed", "true");
    expect(score).toBeDisabled();
    expect(previous).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(previous);

    // Series toggling is presentation state: it replaces the address-bar entry
    // through native history so the commit cannot be dropped by the client
    // router on a fresh page load (Next 16.2.x).
    expect(window.location.pathname + window.location.search).toBe(
      "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&chartView=graph&series=score%2Cprevious"
    );
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(buildChartSeriesHref(currentHref, allSeries, ["score"], "previous")).toBe(
      "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&chartView=graph&series=score%2Cprevious"
    );
  });
});

describe("PrimaryScorePanel Graph/Table parity", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("switches between graph and table from the address-bar chart view", async () => {
    const canonicalHref =
      "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&compare=previous&grain=day&chartView=graph&series=score%2Cprevious%2Ctarget%2Cvolume";
    window.history.replaceState(null, "", canonicalHref);
    const renderPanel = () => (
      <PrimaryScorePanel
        finalizedCount={18}
        previousCount={16}
        model={model}
        visibleSeries={allSeries}
        view="graph"
        currentHref={canonicalHref}
        periodLabel="1–31 июля 2026"
      />
    );
    const view = render(renderPanel());

    expect(
      screen.getByRole("group", { name: "Динамика качества" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Таблица" }));
    expect(window.location.search).toContain("chartView=table");

    // The mocked hooks re-read window.location on the next render; in the app
    // the router's native-history integration triggers that render.
    view.rerender(renderPanel());

    expect(
      await screen.findByRole("table", {
        name: "Табличные данные: Динамика качества"
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Динамика качества" })
    ).not.toBeInTheDocument();
  });

  it("renders table columns from the address-bar series selection", () => {
    const tableHref =
      "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&compare=previous&grain=day&chartView=table&series=score%2Cvolume";
    window.history.replaceState(null, "", tableHref);

    render(
      <PrimaryScorePanel
        finalizedCount={18}
        previousCount={16}
        model={model}
        visibleSeries={allSeries}
        view="graph"
        currentHref={currentHref}
        periodLabel="1–31 июля 2026"
      />
    );

    const table = screen.getByRole("table", {
      name: "Табличные данные: Динамика качества"
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual([
      "Дата",
      "Средний балл, баллы качества",
      "Проверки, количество",
      "Выборка, количество"
    ]);
  });

  it("restores the score-in-points help tooltip on the score panel", async () => {
    render(
      <TooltipProvider delay={0}>
        <PrimaryScorePanel
          finalizedCount={18}
          previousCount={16}
          model={model}
          visibleSeries={allSeries}
          view="graph"
          currentHref={currentHref}
          periodLabel="1–31 июля 2026"
        />
      </TooltipProvider>
    );

    const trigger = screen.getByRole("button", {
      name: "Как считать оценку в баллах?"
    });
    expect(trigger).toBeVisible();

    await act(async () => {
      trigger.focus();
    });
    fireEvent.focus(trigger);
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Итоговая оценка хранится как нормализованное значение от 0 до 100 и показывается как баллы."
      );
    });
  });

  it("renders only the active table representation with the same URL-owned series", () => {
    render(
      <PrimaryScorePanel
        finalizedCount={18}
        previousCount={16}
        model={model}
        visibleSeries={["score", "volume"]}
        view="table"
        currentHref={currentHref.replace("chartView=graph", "chartView=table")}
        periodLabel="1–31 июля 2026"
      />
    );

    const table = screen.getByRole("table", {
      name: "Табличные данные: Динамика качества"
    });

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual([
      "Дата",
      "Средний балл, баллы качества",
      "Проверки, количество",
      "Выборка, количество"
    ]);
    expect(screen.queryByRole("group", { name: "Динамика качества" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="deferred-chart-visual"]')).not.toBeInTheDocument();
  });

  it("keeps the honest empty state when the continuous model contains only null buckets", () => {
    render(
      <PrimaryScorePanel
        finalizedCount={0}
        previousCount={16}
        model={{
          ...model,
          points: model.points.map((point) => ({
            ...point,
            values: {
              score: null,
              previous: 84,
              target: 90,
              volume: 0
            },
            detail: "0 проверок",
            sampleSize: 0
          }))
        }}
        visibleSeries={allSeries}
        view="table"
        currentHref={currentHref.replace("chartView=graph", "chartView=table")}
        periodLabel="1–31 июля 2026"
      />
    );

    expect(screen.getByText("Нет завершённых проверок")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
