import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RankedDriverChart } from "@/components/charts/ranked-driver-chart.client";
import { PeriodMovementPanel } from "@/components/reports/report-panels";
import { HorizontalBarChart, QuotaProgressBars, RankedList, SparklineChart } from "@/components/reports/report-charts";
import { formatQualityScore } from "@/lib/score-display";
import type { ChartModel } from "@/lib/charts/contracts";

vi.mock("next/link", () => ({
  default: ({
    scroll,
    prefetch,
    replace: _replace,
    ...props
  }: ComponentProps<"a"> & {
    scroll?: boolean;
    prefetch?: boolean;
    replace?: boolean;
  }) => (
    <a
      {...props}
      data-next-scroll={scroll === undefined ? undefined : String(scroll)}
      data-next-prefetch={prefetch === undefined ? undefined : String(prefetch)}
    />
  )
}));

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search)
}));

vi.mock("@/components/charts/recharts-visuals.client", () => ({
  RankedDriverVisual: () => (
    <svg aria-hidden="true" className="recharts-surface" tabIndex={-1}>
      <g
        data-series="down"
        data-direction="negative"
        data-animation-active="false"
      />
      <g
        data-series="up"
        data-direction="positive"
        data-animation-active="false"
      />
    </svg>
  )
}));

describe("QuotaProgressBars", () => {
  it("renders quota progress as percent without quality-score point labels", () => {
    render(<QuotaProgressBars rows={[{ label: "Операторы", planned: 10, actual: 7 }]} />);

    expect(screen.getByText("7 из 10")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Операторы: 70%" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.queryByText(/балл/)).not.toBeInTheDocument();
  });

  it("links quota rows to filtered review queues when drilldown href is provided", () => {
    render(<QuotaProgressBars rows={[{ label: "Иван Петров", planned: 10, actual: 7, href: "/reviews?assignee=Иван+Петров" }]} />);

    expect(screen.getByRole("link", { name: /Иван Петров/ })).toHaveAttribute("href", "/reviews?assignee=Иван+Петров");
  });
});

describe("HorizontalBarChart", () => {
  it("formats quality score values with point pluralization", () => {
    render(
      <HorizontalBarChart
        rows={[
          { label: "Один", value: 1 },
          { label: "Двадцать два", value: 22 },
          { label: "Двадцать пять", value: 25 }
        ]}
        valueFormatter={formatQualityScore}
        maxValue={100}
      />
    );

    expect(screen.getByText("1 балл")).toBeInTheDocument();
    expect(screen.getByText("22 балла")).toBeInTheDocument();
    expect(screen.getByText("25 баллов")).toBeInTheDocument();
  });
});

describe("SparklineChart", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders its own target-aware SVG presentation", () => {
    const { container } = render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50 },
          { label: "02.05", value: 100 }
        ]}
        target={0}
      />
    );

    const svg = screen.getByRole("img", { name: "Тренд средней оценки" });
    const chartRoot = svg.closest('[data-slot="interactive-sparkline-chart"]');
    const path = container.querySelector('[data-slot="sparkline-line"]');
    const circles = container.querySelectorAll('[data-slot="sparkline-point"]');
    const target = container.querySelector('[data-slot="sparkline-target"]');
    const targetBand = container.querySelector('[data-slot="sparkline-target-band"]');
    const targetLabel = container.querySelector('[data-slot="sparkline-target-label"]');
    const axis = container.querySelector('[data-slot="sparkline-axis"]');
    const scale = container.querySelector('[data-slot="sparkline-scale"]');

    expect(svg).toHaveAttribute("height", "132");
    expect(svg).toHaveAttribute("width", "100%");
    expect(svg).not.toHaveAttribute("aria-hidden");
    expect(chartRoot).toBeInTheDocument();
    expect(path).toHaveAttribute("d", "M 0.0 66.0 L 360.0 0.0");
    expect(path).toHaveAttribute("fill", "none");
    expect(path).toHaveAttribute("stroke", "var(--primary)");
    expect(path).toHaveAttribute("stroke-width", "3");
    expect(circles[0]).toHaveAttribute("cy", "66");
    expect(circles[1]).toHaveAttribute("cy", "0");
    expect(circles[0]).toHaveAttribute("fill", "var(--card)");
    expect(circles[0]).toHaveAttribute("stroke", "var(--primary)");
    expect(target).toHaveAttribute("stroke-dasharray", "6 6");
    expect(targetBand).toHaveAttribute("aria-hidden", "true");
    expect(target).toHaveAttribute("aria-hidden", "true");
    expect(targetLabel).toHaveAttribute("aria-hidden", "true");
    expect(axis).toHaveAttribute("aria-hidden", "true");
    expect(scale).toHaveAttribute("aria-hidden", "true");
  });

  it("uses deterministic fallback geometry when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { container } = render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50 },
          { label: "02.05", value: 100 }
        ]}
      />
    );

    expect(screen.getByRole("img", { name: "Тренд средней оценки" })).toHaveAttribute(
      "viewBox",
      "0 0 360 132"
    );
    expect(container.querySelector('[data-slot="sparkline-line"]')).toHaveAttribute(
      "d",
      "M 0.0 132.0 L 360.0 0.0"
    );
  });

  it("recomputes plot geometry from ResizeObserver measurements", () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe = observe;
        unobserve = vi.fn();
        disconnect = disconnect;
      }
    );
    const { container, unmount } = render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50 },
          { label: "02.05", value: 100 }
        ]}
      />
    );

    expect(observe).toHaveBeenCalledTimes(1);

    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 720 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    expect(screen.getByRole("img", { name: "Тренд средней оценки" })).toHaveAttribute(
      "viewBox",
      "0 0 720 132"
    );
    expect(container.querySelector('[data-slot="sparkline-line"]')).toHaveAttribute(
      "d",
      "M 0.0 132.0 L 720.0 0.0"
    );

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("exposes point details through keyboard-operable controls and a linked tooltip", () => {
    render(
      <SparklineChart
        points={[
          { label: "22 июн", value: 73, detail: "12 проверок" },
          { label: "29 июн", value: 81, detail: "17 проверок" }
        ]}
        target={85}
      />
    );

    const controls = screen.getAllByRole("button", { name: /проверок/ });

    expect(controls).toHaveLength(2);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(controls[1]);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("29 июн");
    expect(tooltip).toHaveTextContent("81 балл");
    expect(tooltip).toHaveTextContent("17 проверок, +8 баллов к предыдущей точке");
    expect(controls[1]).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("shows and clears the described tooltip through hover and pointer interaction", () => {
    render(
      <SparklineChart
        points={[
          { label: "22 июн", value: 73, detail: "12 проверок" },
          { label: "29 июн", value: 81, detail: "17 проверок" }
        ]}
      />
    );

    const controls = screen.getAllByRole("button", { name: /проверок/ });
    const control = controls[0];

    fireEvent.pointerEnter(control);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("22 июн");
    expect(tooltip).toHaveTextContent("73 балла");
    expect(control).toHaveAttribute("aria-describedby", tooltip.id);

    fireEvent.pointerLeave(control);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(control).not.toHaveAttribute("aria-describedby");

    fireEvent.mouseEnter(controls[1]);

    expect(screen.getByRole("tooltip")).toHaveTextContent("29 июн");

    fireEvent.mouseLeave(controls[1]);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("links trend points to the underlying filtered review queue", () => {
    render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50, detail: "1 проверка", href: "/reviews?finalizedFrom=2026-05-01&finalizedTo=2026-05-01" },
          { label: "02.05", value: 100, detail: "2 проверки", href: "/reviews?finalizedFrom=2026-05-02&finalizedTo=2026-05-02" }
        ]}
      />
    );

    expect(screen.getByRole("link", { name: "02.05, 100 баллов, 2 проверки, +50 баллов к предыдущей точке. Открыть проверки" })).toHaveAttribute(
      "href",
      "/reviews?finalizedFrom=2026-05-02&finalizedTo=2026-05-02"
    );
  });

  it("disables prefetch for report-local points while preserving position only for exact evidence", () => {
    const evidenceHref =
      `/reports?view=overview&evidenceType=trend&evidenceKey=ev1_${"C".repeat(43)}`;

    render(
      <SparklineChart
        points={[
          {
            label: "01.05",
            value: 50,
            detail: "1 проверка",
            href: evidenceHref
          },
          {
            label: "02.05",
            value: 100,
            detail: "2 проверки",
            href: "/reviews?period=current"
          }
        ]}
      />
    );

    const [evidenceLink, ordinaryLink] = screen.getAllByRole("link");

    expect(evidenceLink).toHaveAttribute("data-next-scroll", "false");
    expect(evidenceLink).toHaveAttribute("data-next-prefetch", "false");
    expect(ordinaryLink).not.toHaveAttribute("data-next-scroll");
    expect(ordinaryLink).toHaveAttribute("data-next-prefetch", "false");
  });

  it("partitions the plot into non-overlapping point targets for pointer access", () => {
    render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50, detail: "1 проверка" },
          { label: "02.05", value: 75, detail: "2 проверки" },
          { label: "03.05", value: 100, detail: "3 проверки" }
        ]}
      />
    );

    const controls = screen.getAllByRole("button", { name: /провер/ });

    expect(controls[0]).toHaveStyle({ left: "0%", width: "25%" });
    expect(controls[1]).toHaveStyle({ left: "25%", width: "50%" });
    expect(controls[2]).toHaveStyle({ left: "75%", width: "25%" });
  });

  it("uses displayed rounded score points for sparkline deltas", () => {
    render(
      <SparklineChart
        points={[
          { label: "01.05", value: 72.6, detail: "прошлый период" },
          { label: "02.05", value: 74.4, detail: "текущий период" }
        ]}
      />
    );

    expect(screen.getByLabelText("02.05, 74 балла, текущий период, +1 балл к предыдущей точке")).toBeInTheDocument();
    expect(screen.queryByLabelText(/\+2 балла к предыдущей точке/)).not.toBeInTheDocument();
  });

  it("marks the focused point with radius and stroke changes, not color alone", () => {
    const { container } = render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50, detail: "1 проверка" },
          { label: "02.05", value: 100, detail: "2 проверки" }
        ]}
      />
    );

    const points = container.querySelectorAll('[data-slot="sparkline-point"]');
    const point = screen.getByRole("button", {
      name: "01.05, 50 баллов, 1 проверка, первая точка периода"
    });

    fireEvent.focus(point);

    expect(points[0]).toHaveAttribute("r", "7");
    expect(points[0]).toHaveAttribute("stroke-width", "3");
    expect(points[0]).toHaveAttribute("fill", "var(--primary)");
  });

  it("centers endpoint focus rings while keeping edge tooltips inside the plot", () => {
    const { container } = render(
      <SparklineChart
        points={[
          { label: "01.05", value: 50, detail: "1 проверка" },
          { label: "02.05", value: 100, detail: "2 проверки" }
        ]}
      />
    );

    const controls = screen.getAllByRole("button", { name: /провер/ });
    const rings = container.querySelectorAll('[data-slot="sparkline-focus-ring"]');

    expect(rings[0]).toHaveStyle({
      left: "0%",
      transform: "translate(-50%, -50%)"
    });
    expect(rings[1]).toHaveStyle({
      right: "0%",
      transform: "translate(50%, -50%)"
    });

    fireEvent.focus(controls[0]);
    const firstTooltip = screen.getByRole("tooltip");
    expect(firstTooltip).toHaveStyle({ left: "0%" });
    expect(firstTooltip).not.toHaveStyle({ transform: "translate(-50%, -50%)" });

    fireEvent.blur(controls[0]);
    fireEvent.focus(controls[1]);
    const lastTooltip = screen.getByRole("tooltip");
    expect(lastTooltip).toHaveStyle({ right: "0%" });
    expect(lastTooltip).not.toHaveStyle({ transform: "translate(50%, -50%)" });
  });

  it("keeps the final focus ring on the endpoint when measured geometry introduces percent drift", () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      }
    );
    const { container } = render(
      <SparklineChart
        points={Array.from({ length: 12 }, (_, index) => ({
          label: `${index + 1}`,
          value: index + 1,
          detail: `${index + 1} проверок`
        }))}
      />
    );

    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 356 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    const controls = screen.getAllByRole("button", { name: /проверок/ });
    const rings = container.querySelectorAll('[data-slot="sparkline-focus-ring"]');
    const finalRing = rings[rings.length - 1];

    expect(finalRing).toHaveStyle({
      right: "0%",
      transform: "translate(50%, -50%)"
    });

    fireEvent.focus(controls[controls.length - 1]);

    expect(screen.getByRole("tooltip")).toHaveStyle({ right: "0%" });
  });
});

describe("RankedList", () => {
  it("renders ranked rows with metadata and drilldown action", () => {
    render(
      <RankedList
        rows={[
          {
            label: "Демо-импорт",
            value: 82,
            delta: -4,
            detail: "3 проверки",
            href: "/reviews?source=demo_import"
          }
        ]}
        valueFormatter={formatQualityScore}
        actionLabel="Открыть"
      />
    );

    expect(screen.getByText("Демо-импорт")).toBeInTheDocument();
    expect(screen.getByText("82 балла")).toBeInTheDocument();
    expect(screen.getByText("-4 балла")).toBeInTheDocument();
    expect(screen.getByText("3 проверки")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть" })).toHaveAttribute("href", "/reviews?source=demo_import");
  });
});

describe("RankedDriverChart", () => {
  const evidenceHref =
    "/reports?view=overview&evidenceType=driver&evidenceKey=ev1_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  const driverModel: ChartModel<"down" | "up"> = {
    id: "quality-drivers",
    title: "Факторы изменения",
    description: "Наиболее заметные просадки и улучшения к прошлому периоду.",
    xLabel: "Изменение, баллы",
    yLabel: "Фактор",
    series: [
      {
        key: "down",
        label: "Просадка",
        unit: "quality-score",
        tone: "danger"
      },
      {
        key: "up",
        label: "Улучшение",
        unit: "quality-score",
        tone: "success"
      }
    ],
    points: [
      {
        id: "source-freshdesk",
        label: "Freshdesk",
        sortKey: "001",
        values: { down: 6, up: null },
        detail: "Источники · 74 балла",
        sampleSize: 12,
        href: "/reviews?source=freshdesk"
      },
      {
        id: "team-retention",
        label: "Retention",
        sortKey: "002",
        values: { down: null, up: 4 },
        detail: "Команды · 91 балл",
        sampleSize: 9,
        href: "/reviews?teamName=Retention"
      }
    ],
    emptyTitle: "Нет сопоставимых факторов",
    emptyDescription: "Нужны текущий и прошлый периоды."
  };

  beforeEach(() => {
    navigation.push.mockReset();
    navigation.replace.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("renders a keyboard-operable diverging factor chart with static bars", async () => {
    const { container } = render(<RankedDriverChart model={driverModel} />);

    const plot = screen.getByRole("group", { name: "Факторы изменения" });
    expect(plot).toHaveAttribute("tabindex", "0");
    expect(plot).toHaveAttribute("data-accessibility-layer", "app-owned");
    expect(plot).toHaveAttribute(
      "aria-roledescription",
      "интерактивный график"
    );
    expect(plot).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape"
    );
    await waitFor(() => {
      expect(container.querySelector('[data-series="down"]')).toHaveAttribute(
        "data-direction",
        "negative"
      );
    });
    expect(container.querySelector('[data-series="up"]')).toHaveAttribute(
      "data-direction",
      "positive"
    );
    expect(container.querySelectorAll("[data-animation-active=true]")).toHaveLength(0);

    fireEvent.focus(plot);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Freshdesk");
    expect(screen.getByRole("tooltip")).toHaveTextContent("−6 баллов");
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).toHaveAttribute("data-point-id", "source-freshdesk");
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).toHaveAttribute("data-marker-direction", "negative");
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).toHaveStyle({
      left: `${(104 / 440) * 100}%`,
      top: `${(55.5 / 220) * 100}%`
    });

    fireEvent.keyDown(plot, { key: "ArrowDown" });
    expect(plot).toHaveAttribute("data-active-point-id", "team-retention");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Retention");
    expect(screen.getByRole("tooltip")).toHaveTextContent("+4 балла");
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).toHaveAttribute("data-point-id", "team-retention");
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).toHaveAttribute("data-marker-direction", "positive");
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).toHaveStyle({
      left: `${(369 / 440) * 100}%`,
      top: `${(146.5 / 220) * 100}%`
    });

    fireEvent.keyDown(plot, { key: "Escape" });
    expect(plot).not.toHaveAttribute("data-active-point-id");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).not.toBeInTheDocument();
  });

  it("maps ranked pointer rows through responsive viewBox scaling", () => {
    class TestPointerEvent extends MouseEvent {
      pointerType: string;

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);

    const { container } = render(<RankedDriverChart model={driverModel} />);
    const plot = screen.getByRole("group", { name: "Факторы изменения" });
    const bounds = vi.spyOn(plot, "getBoundingClientRect");

    bounds.mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 440,
      bottom: 220,
      width: 440,
      height: 220,
      toJSON: () => ({})
    });
    fireEvent.pointerMove(plot, { clientY: 55.5, pointerType: "mouse" });
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).toHaveAttribute("data-point-id", "source-freshdesk");

    bounds.mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 880,
      bottom: 440,
      width: 880,
      height: 440,
      toJSON: () => ({})
    });
    fireEvent.pointerMove(plot, { clientY: 293, pointerType: "mouse" });
    expect(
      container.querySelector('[data-slot="ranked-selected-marker"]')
    ).toHaveAttribute("data-point-id", "team-retention");
    vi.unstubAllGlobals();
  });

  it("preserves report scroll only for exact evidence opened from a ranked driver", () => {
    const reviewView = render(<RankedDriverChart model={driverModel} />);
    const reviewPlot = screen.getByRole("group", {
      name: "Факторы изменения"
    });

    fireEvent.focus(reviewPlot);
    fireEvent.keyDown(reviewPlot, { key: "Enter" });
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/reviews?source=freshdesk",
      undefined
    );
    reviewView.unmount();

    const evidenceModel = {
      ...driverModel,
      points: driverModel.points.map((point, index) =>
        index === 0 ? { ...point, href: evidenceHref } : point
      )
    };
    render(<RankedDriverChart model={evidenceModel} />);
    const evidencePlot = screen.getByRole("group", {
      name: "Факторы изменения"
    });

    fireEvent.focus(evidencePlot);
    fireEvent.keyDown(evidencePlot, { key: "Enter" });
    // Exact evidence targets commit through the native History API; the
    // Evidence Sheet resolves the payload on demand, so no App Router
    // navigation is dispatched (its commit can be dropped on a fresh page
    // load on Next 16.2.x).
    expect(window.location.pathname + window.location.search).toBe(
      evidenceHref
    );
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it("uses the shared Graph/Table frame for factors without removing the action chain", () => {
    render(
      <PeriodMovementPanel
        negativeItems={[
          {
            scope: "Источники",
            label: "Freshdesk",
            count: 12,
            currentScore: 74,
            previousScore: 80,
            delta: -6,
            href: "/reviews?source=freshdesk"
          }
        ]}
        positiveItems={[
          {
            scope: "Команды",
            label: "Retention",
            count: 9,
            currentScore: 91,
            previousScore: 87,
            delta: 4,
            href: "/reviews?teamName=Retention"
          }
        ]}
        driverItems={[
          {
            label: "Источник",
            value: "Freshdesk",
            evidence: "74 балла · 12 проверок",
            action: "Сравнить канал с общей выборкой",
            href: "/reviews?source=freshdesk"
          }
        ]}
        view="graph"
        currentHref="/reports?view=overview&chartView=graph&series=score"
        periodLabel="1–31 июля 2026"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Факторы изменения" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Таблица" })).toHaveAttribute(
      "href",
      "/reports?view=overview&chartView=table&series=score"
    );
    expect(screen.getByRole("group", { name: "Факторы изменения" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Сравнить канал с общей выборкой/ })
    ).toHaveAttribute("href", "/reviews?source=freshdesk");
  });

  it("renders factor table parity from the same model and removes the inactive visual", () => {
    render(
      <PeriodMovementPanel
        negativeItems={[
          {
            scope: "Источники",
            label: "Freshdesk",
            count: 12,
            currentScore: 74,
            previousScore: 80,
            delta: -6,
            href: "/reviews?source=freshdesk"
          }
        ]}
        positiveItems={[
          {
            scope: "Команды",
            label: "Retention",
            count: 9,
            currentScore: 91,
            previousScore: 87,
            delta: 4,
            href: "/reviews?teamName=Retention"
          }
        ]}
        driverItems={[]}
        view="table"
        currentHref="/reports?view=overview&chartView=table&series=score"
        periodLabel="1–31 июля 2026"
      />
    );

    const table = screen.getByRole("table", {
      name: "Табличные данные: Факторы изменения"
    });
    const rows = within(table).getAllByRole("row");

    expect(within(rows[0]).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Фактор",
      "Просадка, баллы качества",
      "Улучшение, баллы качества",
      "Выборка, количество"
    ]);
    expect(within(rows[1]).getByRole("link", { name: "Freshdesk" })).toHaveAttribute(
      "href",
      "/reviews?source=freshdesk"
    );
    expect(screen.queryByRole("group", { name: "Факторы изменения" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="deferred-chart-visual"]')).not.toBeInTheDocument();
  });
});
