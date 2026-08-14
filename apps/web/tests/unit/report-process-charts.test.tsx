import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChartFrame } from "@/components/charts/chart-frame";
import { ReasonTrendChart } from "@/components/charts/reason-trend-chart.client";
import { ScoreDistributionChart } from "@/components/charts/score-distribution-chart.client";
import * as insightPanels from "@/components/reports/insight-correlation-panels";
import * as reportCharts from "@/components/reports/report-charts";
import * as reportChartModels from "@/lib/reports/report-chart-models";
import type { ChartModel } from "@/lib/charts/contracts";
import type { ReportPeriod } from "@/lib/report-period";

const navigation = vi.hoisted(() => ({
  push: vi.fn()
}));

type ProcessPanels = {
  ScoreDistributionPanel: React.ComponentType<Record<string, unknown>>;
  ReasonTrendPanel: React.ComponentType<Record<string, unknown>>;
};

const panels = {
  ScoreDistributionPanel: (
    reportCharts as unknown as Pick<ProcessPanels, "ScoreDistributionPanel">
  ).ScoreDistributionPanel,
  ReasonTrendPanel: (
    insightPanels as unknown as Pick<ProcessPanels, "ReasonTrendPanel">
  ).ReasonTrendPanel
};

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search)
}));

function keepRichVisualDeferred() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
}

type ReviewDate = Readonly<{ finalizedAt: Date | null }>;
type FindingDate = Readonly<{
  category: string;
  review: Readonly<{ finalizedAt: Date | null }>;
}>;

type ProcessBuilders = {
  buildScoreDistributionChart(input: {
    rows: readonly { label: string; value: number }[];
    href: string;
  }): {
    model: ChartModel<"count">;
    sample: { size: number; denominator?: number; minimum?: number };
    isEmpty: boolean;
    comparison:
      | { status: "current" }
      | { status: "missing"; message: string }
      | { status: "stale"; asOf: string };
  };
  buildReasonTimelineChart(input: {
    category: string;
    period: ReportPeriod;
    previousPeriod: ReportPeriod;
    currentReviews: readonly ReviewDate[];
    previousReviews: readonly ReviewDate[];
    currentFindings: readonly FindingDate[];
    previousFindings: readonly FindingDate[];
  }): {
    model: ChartModel<"current" | "previous">;
    sample: { size: number; denominator?: number; minimum?: number };
    isEmpty: boolean;
    comparison:
      | { status: "current" }
      | { status: "missing"; message: string }
      | { status: "stale"; asOf: string };
  };
  parseReportChartBundle(input: unknown): {
    model: ChartModel;
    sample: { size: number; denominator?: number; minimum?: number };
    isEmpty: boolean;
    comparison:
      | { status: "current" }
      | { status: "missing"; message: string }
      | { status: "stale"; asOf: string };
  };
};

const builders = reportChartModels as unknown as ProcessBuilders;

const period: ReportPeriod = {
  preset: "custom",
  start: new Date("2026-07-01T00:00:00.000Z"),
  end: new Date("2026-07-04T23:59:59.999Z"),
  label: "Произвольный период"
};

const previousPeriod: ReportPeriod = {
  preset: "previous",
  start: new Date("2026-06-27T00:00:00.000Z"),
  end: new Date("2026-06-30T23:59:59.999Z"),
  label: "Предыдущий сопоставимый период"
};
const evidenceHref =
  "/reports?view=process&evidenceType=trend&evidenceKey=ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const currentReviews: ReviewDate[] = [
  { finalizedAt: new Date("2026-07-01T08:00:00.000Z") },
  { finalizedAt: new Date("2026-07-02T09:00:00.000Z") },
  { finalizedAt: new Date("2026-07-04T11:00:00.000Z") }
];
const previousReviews: ReviewDate[] = [
  { finalizedAt: new Date("2026-06-27T08:00:00.000Z") },
  { finalizedAt: new Date("2026-06-28T09:00:00.000Z") }
];
const currentFindings: FindingDate[] = [
  {
    category: "Эмпатия",
    review: { finalizedAt: new Date("2026-07-01T08:00:00.000Z") }
  },
  {
    category: "Другая причина",
    review: { finalizedAt: new Date("2026-07-02T09:00:00.000Z") }
  },
  {
    category: "Эмпатия",
    review: { finalizedAt: new Date("2026-07-04T11:00:00.000Z") }
  }
];
const previousFindings: FindingDate[] = [
  {
    category: "Эмпатия",
    review: { finalizedAt: new Date("2026-06-27T08:00:00.000Z") }
  },
  {
    category: "Другая причина",
    review: { finalizedAt: new Date("2026-06-28T09:00:00.000Z") }
  }
];

function buildDistribution(rows = [0, 3, 0, 2]) {
  expect(typeof builders.buildScoreDistributionChart).toBe("function");
  return builders.buildScoreDistributionChart({
    rows: ["0-50", "51-70", "71-85", "86-100"].map((label, index) => ({
      label,
      value: rows[index]
    })),
    href: "/reviews?status=reviewed&finalizedFrom=2026-07-01&finalizedTo=2026-07-04"
  });
}

function buildReason(
  overrides: Partial<Parameters<ProcessBuilders["buildReasonTimelineChart"]>[0]> = {}
) {
  expect(typeof builders.buildReasonTimelineChart).toBe("function");
  return builders.buildReasonTimelineChart({
    category: "Эмпатия",
    period,
    previousPeriod,
    currentReviews,
    previousReviews,
    currentFindings,
    previousFindings,
    ...overrides
  });
}

describe("report process chart contracts", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    vi.unstubAllGlobals();
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
  it("buildScoreDistributionChart keeps all four buckets in fixed order including zero", () => {
    const bundle = buildDistribution();

    expect(bundle.model.points.map((point) => point.label)).toEqual([
      "0-50",
      "51-70",
      "71-85",
      "86-100"
    ]);
    expect(bundle.model.points.map((point) => point.values.count)).toEqual([
      0, 3, 0, 2
    ]);
  });

  it("score distribution graph and table receive the same normalized model", () => {
    const bundle = buildDistribution();
    const { rerender } = render(
      <ChartFrame
        model={bundle.model}
        view="graph"
        currentHref="/reports?view=overview&chartView=graph"
        periodLabel="01.07.2026 - 04.07.2026"
        sample={bundle.sample}
        graph={
          <div data-testid="distribution-graph" data-model-id={bundle.model.id} />
        }
      />
    );

    expect(screen.getByTestId("distribution-graph")).toHaveAttribute(
      "data-model-id",
      bundle.model.id
    );
    rerender(
      <ChartFrame
        model={bundle.model}
        view="table"
        currentHref="/reports?view=overview&chartView=table"
        periodLabel="01.07.2026 - 04.07.2026"
        sample={bundle.sample}
      />
    );
    expect(screen.getByRole("table")).toHaveTextContent("51-70");
    expect(screen.getByRole("table")).toHaveTextContent("3");
  });

  it("score distribution is empty only when the total sample is zero", () => {
    expect(buildDistribution([0, 0, 0, 0])).toMatchObject({
      sample: { size: 0, minimum: 5 },
      isEmpty: true
    });
    expect(buildDistribution([0, 0, 0, 1])).toMatchObject({
      sample: { size: 1, minimum: 5 },
      isEmpty: false
    });
  });

  it("buildReasonTimelineChart renders zero for reviewed days without the selected reason", () => {
    const bundle = buildReason();

    expect(bundle.model.points[1]).toMatchObject({
      sortKey: "2026-07-02",
      values: { current: 0, previous: 0 },
      sampleSize: 1
    });
  });

  it("buildReasonTimelineChart renders null gaps for days without finalized reviews", () => {
    const bundle = buildReason();

    expect(bundle.model.points[2]).toMatchObject({
      sortKey: "2026-07-03",
      values: { current: null, previous: null },
      sampleSize: 0
    });
  });

  it("buildReasonTimelineChart aligns the previous period by day offset", () => {
    const bundle = buildReason();

    expect(bundle.model.points.map((point) => point.values.previous)).toEqual([
      1,
      0,
      null,
      null
    ]);
  });

  it("buildReasonTimelineChart treats a sampled previous period as current even when its last review predates period end", () => {
    const bundle = buildReason();

    expect(bundle.comparison).toEqual({ status: "current" });
  });

  it("buildReasonTimelineChart marks an all-null previous series as missing with explicit server copy", () => {
    const bundle = buildReason({
      previousReviews: [],
      previousFindings: []
    });

    expect(bundle.model.points.every((point) => point.values.previous === null)).toBe(
      true
    );
    expect(bundle.comparison).toEqual({
      status: "missing",
      message:
        "Нет базы сравнения: в прошлом сопоставимом периоде нет завершённых проверок."
    });
  });

  it("parseReportChartBundle validates stale asOf without inferring stale from finalizedAt", () => {
    const bundle = buildReason();
    expect(bundle.comparison).toEqual({ status: "current" });
    expect(typeof builders.parseReportChartBundle).toBe("function");

    expect(
      builders.parseReportChartBundle({
        ...bundle,
        comparison: { status: "stale", asOf: "2026-07-04" }
      }).comparison
    ).toEqual({ status: "stale", asOf: "2026-07-04" });

    for (const asOf of ["2026-02-30", "2026-7-04", "04.07.2026"]) {
      expect(() =>
        builders.parseReportChartBundle({
          ...bundle,
          comparison: { status: "stale", asOf }
        })
      ).toThrow();
    }
  });

  it("reason panel preserves ranked owner, high-risk, previous count and category href", () => {
    const evidence = {
      category: "Эмпатия",
      count: 2,
      previousCount: 1,
      delta: 1,
      highRiskCount: 2,
      topOwnerType: "OPERATOR" as const,
      href: "/reviews?status=reviewed&findingCategory=%D0%AD%D0%BC%D0%BF%D0%B0%D1%82%D0%B8%D1%8F"
    };

    render(
      <article>
        <h3>{evidence.category}</h3>
        <p>Чаще всего отвечает: Оператор. Было {evidence.previousCount}.</p>
        <p>HIGH+ {evidence.highRiskCount}</p>
        <a href={evidence.href}>Открыть проверки</a>
      </article>
    );

    expect(screen.getByText(/Оператор\. Было 1/)).toBeInTheDocument();
    expect(screen.getByText("HIGH+ 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть проверки" })).toHaveAttribute(
      "href",
      evidence.href
    );
  });

  it("process table mode renders no Task 6 client chart shell", () => {
    const bundle = buildReason();
    const { container } = render(
      <ChartFrame
        model={bundle.model}
        view="table"
        currentHref="/reports?period=custom&start=2026-07-01&end=2026-07-04&view=process&trend=day&chartView=table&series=score"
        periodLabel="01.07.2026 - 04.07.2026"
        sample={bundle.sample}
        graph={<div data-slot="reason-trend-chart" />}
      />
    );

    expect(container.querySelector('[data-slot="reason-trend-chart"]')).toBeNull();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("process frames preserve Graph/Table href state, units, sample and drill-down", () => {
    const bundle = buildReason();
    render(
      <ChartFrame
        model={bundle.model}
        view="table"
        currentHref="/reports?period=custom&start=2026-07-01&end=2026-07-04&view=process&trend=day&chartView=table&series=score"
        periodLabel="01.07.2026 - 04.07.2026"
        sample={bundle.sample}
      />
    );

    expect(screen.getByText("Единицы: количество")).toBeInTheDocument();
    expect(screen.getByText("Выборка: 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "График" })).toHaveAttribute(
      "href",
      "/reports?period=custom&start=2026-07-01&end=2026-07-04&view=process&trend=day&chartView=graph&series=score"
    );
    const firstRow = screen.getAllByRole("row")[1];
    expect(within(firstRow).getByRole("link")).toHaveAttribute(
      "href",
      "/reviews?status=reviewed&finalizedFrom=2026-07-01&finalizedTo=2026-07-01&findingCategory=%D0%AD%D0%BC%D0%BF%D0%B0%D1%82%D0%B8%D1%8F"
    );
  });

  it("each process Task 6 chart exposes exactly one keyboard focus root", () => {
    keepRichVisualDeferred();
    const distribution = buildDistribution();
    const reason = buildReason();
    const { container } = render(
      <>
        <ScoreDistributionChart model={distribution.model} />
        <ReasonTrendChart model={reason.model} />
      </>
    );

    expect(
      container.querySelectorAll(
        '[data-slot="score-distribution-chart"][tabindex="0"]'
      )
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '[data-slot="reason-trend-chart"][tabindex="0"]'
      )
    ).toHaveLength(1);
  });

  it("keeps both deferred secondary plot roots on the responsive height contract", () => {
    keepRichVisualDeferred();
    const distribution = buildDistribution();
    const reason = buildReason();
    const { container } = render(
      <>
        <ScoreDistributionChart model={distribution.model} />
        <ReasonTrendChart model={reason.model} />
      </>
    );
    const expectedClasses = [
      "h-[200px]",
      "min-[390px]:h-[216px]",
      "md:h-[240px]",
      "xl:h-[260px]"
    ];

    for (const slot of [
      "score-distribution-chart",
      "reason-trend-chart"
    ]) {
      expect(
        container.querySelector(
          `[data-slot="${slot}"] [role="status"]`
        )
      ).toHaveClass(...expectedClasses);
    }
  });

  it("Arrow keys, Escape and Enter operate on the normalized process model", () => {
    keepRichVisualDeferred();
    const bundle = buildDistribution();
    const { container } = render(
      <ScoreDistributionChart model={bundle.model} />
    );
    const root = container.querySelector(
      '[data-slot="score-distribution-chart"]'
    ) as HTMLElement;

    fireEvent.focus(root);
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(root).toHaveAttribute(
      "data-active-point-id",
      "score-distribution-2"
    );
    fireEvent.keyDown(root, { key: "Enter" });
    expect(navigation.push).toHaveBeenCalledWith(
      "/reviews?status=reviewed&finalizedFrom=2026-07-01&finalizedTo=2026-07-04",
      undefined
    );
    fireEvent.keyDown(root, { key: "Escape" });
    expect(root).not.toHaveAttribute("data-active-point-id");
  });

  it("preserves report scroll only for exact evidence opened from process charts", () => {
    keepRichVisualDeferred();
    const distribution = buildDistribution();
    const distributionView = render(
      <ScoreDistributionChart
        model={{
          ...distribution.model,
          points: distribution.model.points.map((point, index) =>
            index === 0 ? { ...point, href: evidenceHref } : point
          )
        }}
      />
    );
    const distributionRoot = distributionView.container.querySelector(
      '[data-slot="score-distribution-chart"]'
    ) as HTMLElement;

    fireEvent.focus(distributionRoot);
    fireEvent.keyDown(distributionRoot, { key: "Enter" });
    // Exact evidence targets commit through the native History API; the
    // Evidence Sheet resolves the payload on demand, so no App Router
    // navigation is dispatched (its commit can be dropped on a fresh page
    // load on Next 16.2.x).
    expect(window.location.pathname + window.location.search).toBe(
      evidenceHref
    );
    expect(navigation.push).not.toHaveBeenCalled();
    distributionView.unmount();

    const reason = buildReason();
    const reasonView = render(<ReasonTrendChart model={reason.model} />);
    const reasonRoot = reasonView.container.querySelector(
      '[data-slot="reason-trend-chart"]'
    ) as HTMLElement;

    fireEvent.focus(reasonRoot);
    fireEvent.keyDown(reasonRoot, { key: "Enter" });
    expect(navigation.push).toHaveBeenLastCalledWith(
      reason.model.points[0].href,
      undefined
    );
    reasonView.unmount();

    const evidenceReasonView = render(
      <ReasonTrendChart
        model={{
          ...reason.model,
          points: reason.model.points.map((point, index) =>
            index === 0 ? { ...point, href: evidenceHref } : point
          )
        }}
      />
    );
    const evidenceReasonRoot = evidenceReasonView.container.querySelector(
      '[data-slot="reason-trend-chart"]'
    ) as HTMLElement;

    fireEvent.focus(evidenceReasonRoot);
    fireEvent.keyDown(evidenceReasonRoot, { key: "Enter" });
    expect(window.location.pathname + window.location.search).toBe(
      evidenceHref
    );
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it("pointer and touch select the same process point and arm deferred loading", async () => {
    keepRichVisualDeferred();
    const bundle = buildReason();
    const { container } = render(<ReasonTrendChart model={bundle.model} />);
    const root = container.querySelector(
      '[data-slot="reason-trend-chart"]'
    ) as HTMLElement;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 400, top: 0, height: 280 })
    });

    fireEvent.pointerMove(root, { clientX: 400, pointerType: "mouse" });
    expect(root).toHaveAttribute("data-active-point-id", "reason-2026-07-04");

    fireEvent.pointerDown(root, { clientX: 400, pointerType: "touch" });
    expect(root).toHaveAttribute("data-active-point-id", "reason-2026-07-04");
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="deferred-chart-visual"]')
      ).not.toHaveAttribute("data-deferred-state", "waiting");
    });
  });

  it("process server wrappers render one frame and preserve ranked reason evidence", () => {
    keepRichVisualDeferred();
    expect(typeof panels.ScoreDistributionPanel).toBe("function");
    const DistributionPanel = panels.ScoreDistributionPanel;
    const ReasonPanel = panels.ReasonTrendPanel;
    const rows = [
      {
        category: "Эмпатия",
        count: 2,
        previousCount: 1,
        delta: 1,
        highRiskCount: 2,
        topOwnerType: "AGENT",
        href: "/reviews?findingCategory=%D0%AD%D0%BC%D0%BF%D0%B0%D1%82%D0%B8%D1%8F"
      }
    ];
    render(
      <>
        <DistributionPanel
          bundle={buildDistribution()}
          view="graph"
          currentHref="/reports?view=overview&chartView=graph"
          periodLabel="01.07.2026 - 04.07.2026"
        />
        <ReasonPanel
          rows={rows}
          bundle={buildReason()}
          view="graph"
          currentHref="/reports?view=process&chartView=graph"
          periodLabel="01.07.2026 - 04.07.2026"
        />
      </>
    );

    expect(
      screen.getAllByRole("heading", { name: "Распределение оценок" })
    ).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: /Динамика причины/ })).toHaveLength(
      1
    );
    expect(screen.getByText(/Чаще всего отвечает/)).toHaveTextContent(
      "Было 1"
    );
    expect(screen.getByText("HIGH+ 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть проверки" })).toHaveAttribute(
      "href",
      rows[0].href
    );
  });

  it("process server wrappers preserve missing comparison copy and create no client shell in table mode", () => {
    expect(typeof panels.ScoreDistributionPanel).toBe("function");
    const DistributionPanel = panels.ScoreDistributionPanel;
    const ReasonPanel = panels.ReasonTrendPanel;
    const missingReason = buildReason({
      previousReviews: [],
      previousFindings: []
    });
    const { container } = render(
      <>
        <DistributionPanel
          bundle={buildDistribution()}
          view="table"
          currentHref="/reports?view=overview&chartView=table"
          periodLabel="01.07.2026 - 04.07.2026"
        />
        <ReasonPanel
          rows={[
            {
              category: "Эмпатия",
              count: 2,
              previousCount: 0,
              delta: 2,
              highRiskCount: 0,
              topOwnerType: "AGENT",
              href: "/reviews?findingCategory=%D0%AD%D0%BC%D0%BF%D0%B0%D1%82%D0%B8%D1%8F"
            }
          ]}
          bundle={missingReason}
          view="table"
          currentHref="/reports?view=process&chartView=table"
          periodLabel="01.07.2026 - 04.07.2026"
        />
      </>
    );

    expect(screen.getByText(/Нет базы сравнения: в прошлом/)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="score-distribution-chart"]')).toBeNull();
    expect(container.querySelector('[data-slot="reason-trend-chart"]')).toBeNull();
    expect(screen.getAllByRole("table")).toHaveLength(2);
  });
});
