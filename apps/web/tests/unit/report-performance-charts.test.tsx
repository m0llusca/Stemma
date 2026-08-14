import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChartFrame } from "@/components/charts/chart-frame";
import { PairedAiDriftCharts } from "@/components/charts/paired-ai-drift-charts.client";
import { RankedBreakdownChart } from "@/components/charts/ranked-breakdown-chart.client";
import * as analyticsIntelligence from "@/components/reports/analytics-intelligence";
import * as reportChartModels from "@/lib/reports/report-chart-models";
import type { AiHumanAgreementReport } from "@/lib/ai-quality/agreement-report";
import type { AiScoreDrift } from "@/lib/ai-quality/drift";
import type { ChartModel } from "@/lib/charts/contracts";
import type { ReportPeriod } from "@/lib/report-period";

const navigation = vi.hoisted(() => ({
  push: vi.fn()
}));

type PerformancePanels = {
  AiAgreementPanel: React.ComponentType<Record<string, unknown>>;
  AiDriftPanel: React.ComponentType<Record<string, unknown>>;
};

const panels = analyticsIntelligence as unknown as PerformancePanels;

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

type PerformanceBuilders = {
  buildAiDriftChart(input: {
    drift: AiScoreDrift | null;
    period: ReportPeriod;
  }): {
    model: ChartModel<"confidence" | "reserve">;
    sample: { size: number; denominator?: number; minimum?: number };
    isEmpty: boolean;
    comparison:
      | { status: "current" }
      | { status: "missing"; message: string }
      | { status: "stale"; asOf: string };
  };
  buildAgreementBreakdownChart(input: {
    report: AiHumanAgreementReport | null;
    period: ReportPeriod;
  }): {
    model: ChartModel<"agreement" | "reference">;
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

const builders = reportChartModels as unknown as PerformanceBuilders;

const period: ReportPeriod = {
  preset: "custom",
  start: new Date("2026-07-01T00:00:00.000Z"),
  end: new Date("2026-07-24T23:59:59.999Z"),
  label: "Произвольный период"
};
const evidenceHref =
  "/reports?view=performance&evidenceType=driver&evidenceKey=ev1_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

const drift: AiScoreDrift = {
  buckets: [
    {
      periodStart: "2026-06-29",
      count: 2,
      meanConfidence: 0.82,
      fallbackRate: 0.25
    },
    {
      periodStart: "2026-07-13",
      count: 3,
      meanConfidence: 0.61,
      fallbackRate: 0.5
    },
    {
      periodStart: "2026-07-20",
      count: 1,
      meanConfidence: null,
      fallbackRate: 1
    }
  ],
  regressions: [
    {
      periodStart: "2026-07-13",
      kind: "confidence_drop",
      detail: "Средняя уверенность упала с 0.82 до 0.61"
    },
    {
      periodStart: "2026-07-20",
      kind: "fallback_spike",
      detail: "Доля детерминированного фолбэка выросла с 50% до 100%"
    }
  ]
};

const agreement: AiHumanAgreementReport = {
  aggregate: {
    comparedCount: 12,
    agreeCount: 8,
    agreementRate: 8 / 12,
    meanScaleDelta: 0.5,
    conversationsCompared: 6,
    byCriterion: []
  },
  criteria: [
    {
      criterionId: "criterion-b",
      key: "b",
      label: "Одинаковый критерий",
      block: "Диалог",
      kind: "SCALE_1_3",
      comparedCount: 4,
      agreeCount: 2,
      agreementRate: 0.5,
      meanScaleDelta: 0.75
    },
    {
      criterionId: "criterion-a",
      key: "a",
      label: "Одинаковый критерий",
      block: "Процесс",
      kind: "SCALE_1_3",
      comparedCount: 4,
      agreeCount: 2,
      agreementRate: 0.5,
      meanScaleDelta: 0.5
    },
    {
      criterionId: "criterion-c",
      key: "c",
      label: "Лучший критерий",
      block: "Результат",
      kind: "PASS_FAIL",
      comparedCount: 4,
      agreeCount: 4,
      agreementRate: 1,
      meanScaleDelta: null
    },
    {
      criterionId: "criterion-empty",
      key: "empty",
      label: "Без сравнений",
      block: "Результат",
      kind: "PASS_FAIL",
      comparedCount: 0,
      agreeCount: 0,
      agreementRate: null,
      meanScaleDelta: null
    }
  ],
  reviewsConsidered: 10,
  aiComparedConversations: 6
};

function buildDrift() {
  expect(typeof builders.buildAiDriftChart).toBe("function");
  return builders.buildAiDriftChart({ drift, period });
}

function buildAgreement() {
  expect(typeof builders.buildAgreementBreakdownChart).toBe("function");
  return builders.buildAgreementBreakdownChart({ report: agreement, period });
}

describe("report performance chart contracts", () => {
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
  it("buildAiDriftChart aligns confidence and reserve on one ordered period set", () => {
    const bundle = buildDrift();

    expect(bundle.model.points.map((point) => point.sortKey)).toEqual([
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
      "2026-07-20"
    ]);
    expect(bundle.model.points.map((point) => Object.keys(point.values))).toEqual([
      ["confidence", "reserve"],
      ["confidence", "reserve"],
      ["confidence", "reserve"],
      ["confidence", "reserve"]
    ]);
  });

  it("buildAiDriftChart includes partial first, missing middle, and partial last UTC weeks", () => {
    const bundle = buildDrift();

    expect(bundle.model.points[0].values).toEqual({
      confidence: 82,
      reserve: 25
    });
    expect(bundle.model.points[1]).toMatchObject({
      values: { confidence: null, reserve: null },
      sampleSize: 0
    });
    expect(bundle.model.points[3]).toMatchObject({
      values: { confidence: null, reserve: 100 },
      sampleSize: 1
    });
  });

  it("buildAiDriftChart clamps finalizedFrom and finalizedTo to the selected report bounds", () => {
    const bundle = buildDrift();

    expect(bundle.model.points[0].href).toBe(
      "/reviews?status=reviewed&finalizedFrom=2026-07-01&finalizedTo=2026-07-05"
    );
    expect(bundle.model.points[3].href).toBe(
      "/reviews?status=reviewed&finalizedFrom=2026-07-20&finalizedTo=2026-07-24"
    );
  });

  it("buildAiDriftChart converts ratios to percentages and preserves real sample counts", () => {
    const bundle = buildDrift();

    expect(bundle.model.points[2]).toMatchObject({
      values: { confidence: 61, reserve: 50 },
      sampleSize: 3
    });
    expect(bundle.sample).toEqual({ size: 6, minimum: 5 });
    expect(bundle.isEmpty).toBe(false);
  });

  it("AI drift copy names reserve as a percent share while preserving regression facts and thresholds", () => {
    const bundle = buildDrift();

    expect(bundle.model.series).toEqual([
      expect.objectContaining({
        key: "confidence",
        label: "Уверенность модели",
        unit: "percent"
      }),
      expect.objectContaining({
        key: "reserve",
        label: "Доля резервной оценки",
        unit: "percent"
      })
    ]);
    expect(drift.regressions).toEqual([
      expect.objectContaining({
        kind: "confidence_drop",
        detail: expect.stringContaining("0.82")
      }),
      expect.objectContaining({
        kind: "fallback_spike",
        detail: expect.stringContaining("100%")
      })
    ]);
  });

  it("buildAgreementBreakdownChart applies the four deterministic tie-breakers", () => {
    const bundle = buildAgreement();

    expect(bundle.model.points.map((point) => point.id)).toEqual([
      "agreement-criterion-a",
      "agreement-criterion-b",
      "agreement-criterion-c",
      "agreement-criterion-empty"
    ]);
    expect(agreement.criteria.map((row) => row.criterionId)).toEqual([
      "criterion-b",
      "criterion-a",
      "criterion-c",
      "criterion-empty"
    ]);
  });

  it("buildAgreementBreakdownChart emits compared sample and the 80 percent reference", () => {
    const bundle = buildAgreement();

    expect(bundle.model.points[0]).toMatchObject({
      values: { agreement: 50, reference: 80 },
      sampleSize: 4
    });
    expect(bundle.model.points[3]).toMatchObject({
      values: { agreement: null, reference: null },
      sampleSize: 0
    });
    expect(bundle.sample).toEqual({
      size: 6,
      denominator: 10,
      minimum: 5
    });
  });

  it("parseReportChartBundle rejects invalid sample and comparison values outside the model", () => {
    const valid = buildAgreement();
    expect(typeof builders.parseReportChartBundle).toBe("function");

    class Sample {
      size = 1;
    }

    const invalid = [
      { ...valid, sample: { ...valid.sample, denominator: undefined } },
      { ...valid, sample: { ...valid.sample, size: Number.NaN } },
      { ...valid, sample: { ...valid.sample, size: Number.POSITIVE_INFINITY } },
      { ...valid, sample: new Sample() },
      {
        ...valid,
        comparison: {
          status: "stale",
          asOf: new Date("2026-07-24T00:00:00.000Z")
        }
      },
      { ...valid, comparison: { status: "stale", asOf: "2026-02-30" } },
      { ...valid, comparison: { status: "stale", asOf: "2026-7-01" } },
      {
        ...valid,
        comparison: { status: "missing", message: () => "Нет базы" }
      }
    ];

    for (const candidate of invalid) {
      expect(() => builders.parseReportChartBundle(candidate)).toThrow();
    }
  });

  it("parseReportChartBundle rejects symbol, hidden, and accessor properties before normalization", () => {
    const valid = buildAgreement();
    const hiddenSample = { ...valid.sample };
    Object.defineProperty(hiddenSample, "hidden", {
      value: 1,
      enumerable: false
    });
    const accessorComparison = { status: "current" };
    Object.defineProperty(accessorComparison, "message", {
      get: () => "Нет базы",
      enumerable: true
    });
    const topSymbol = { ...valid };
    Object.defineProperty(topSymbol, Symbol("hidden"), {
      value: "not-json-safe",
      enumerable: true
    });
    const sampleSymbol = { ...valid.sample };
    Object.defineProperty(sampleSymbol, Symbol("hidden"), {
      value: 1,
      enumerable: true
    });
    const comparisonSymbol = { status: "current" };
    Object.defineProperty(comparisonSymbol, Symbol("hidden"), {
      value: 1,
      enumerable: true
    });

    for (const candidate of [
      topSymbol,
      { ...valid, sample: hiddenSample },
      { ...valid, sample: sampleSymbol },
      { ...valid, comparison: accessorComparison },
      { ...valid, comparison: comparisonSymbol }
    ]) {
      expect(() => builders.parseReportChartBundle(candidate)).toThrow();
    }
  });

  it("agreement and drift frames use one model for graph and table", () => {
    const agreementBundle = buildAgreement();
    const driftBundle = buildDrift();
    const { rerender } = render(
      <ChartFrame
        model={agreementBundle.model}
        view="graph"
        currentHref="/reports?view=performance&chartView=graph"
        periodLabel="01.07.2026 - 24.07.2026"
        sample={agreementBundle.sample}
        graph={
          <div
            data-testid="agreement-graph"
            data-model-title={agreementBundle.model.title}
          />
        }
      />
    );

    expect(screen.getByTestId("agreement-graph")).toHaveAttribute(
      "data-model-title",
      "AI↔человек: согласие"
    );

    rerender(
      <ChartFrame
        model={driftBundle.model}
        view="table"
        currentHref="/reports?view=performance&chartView=table"
        periodLabel="01.07.2026 - 24.07.2026"
        sample={driftBundle.sample}
      />
    );
    expect(
      screen.getByRole("table", {
        name: `Табличные данные: ${driftBundle.model.title}`
      })
    ).toBeInTheDocument();
  });

  it("performance table mode renders no Task 6 client chart shell", () => {
    const bundle = buildAgreement();
    const { container } = render(
      <ChartFrame
        model={bundle.model}
        view="table"
        currentHref="/reports?period=custom&start=2026-07-01&end=2026-07-24&view=performance&trend=week&chartView=table&series=score"
        periodLabel="01.07.2026 - 24.07.2026"
        sample={bundle.sample}
        graph={<div data-slot="ranked-breakdown-chart" />}
      />
    );

    expect(container.querySelector('[data-slot="ranked-breakdown-chart"]')).toBeNull();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("performance frames preserve Graph/Table href state and safe drill-down", () => {
    const bundle = buildAgreement();
    render(
      <ChartFrame
        model={bundle.model}
        view="table"
        currentHref="/reports?period=custom&start=2026-07-01&end=2026-07-24&view=performance&trend=week&chartView=table&series=score"
        periodLabel="01.07.2026 - 24.07.2026"
        sample={bundle.sample}
      />
    );

    expect(screen.getByRole("link", { name: "График" })).toHaveAttribute(
      "href",
      "/reports?period=custom&start=2026-07-01&end=2026-07-24&view=performance&trend=week&chartView=graph&series=score"
    );
    expect(screen.getAllByRole("link", { name: "Одинаковый критерий" })[0]).toHaveAttribute(
      "href",
      "/reports?period=custom&start=2026-07-01&end=2026-07-24&view=details#details-blocks"
    );
  });

  it("performance empty, low-sample and local visual error states retain Table access", () => {
    const bundle = buildDrift();
    render(
      <ChartFrame
        model={bundle.model}
        view="graph"
        currentHref="/reports?view=performance&chartView=graph"
        periodLabel="01.07.2026 - 24.07.2026"
        sample={{ size: 1, minimum: 5 }}
        graph={
          <div role="alert">
            Не удалось загрузить график. Табличное представление остаётся
            доступным.
          </div>
        }
      />
    );

    expect(screen.getByText("Недостаточно выборки: 1 из 5")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Табличное представление остаётся доступным"
    );
    expect(screen.getByRole("link", { name: "Таблица" })).toBeInTheDocument();
  });

  it("each performance Task 6 chart exposes exactly one keyboard focus root", () => {
    keepRichVisualDeferred();
    const agreementBundle = buildAgreement();
    const driftBundle = buildDrift();
    const { container } = render(
      <>
        <RankedBreakdownChart model={agreementBundle.model} />
        <PairedAiDriftCharts model={driftBundle.model} />
      </>
    );

    expect(
      container.querySelectorAll(
        '[data-slot="ranked-breakdown-chart"][tabindex="0"]'
      )
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '[data-slot="paired-ai-drift-charts"][tabindex="0"]'
      )
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '[data-slot="paired-ai-drift-charts"] [tabindex="0"]'
      )
    ).toHaveLength(0);
  });

  it("keeps ranked fallback minimum aligned with the clamp and preserves paired drift", () => {
    keepRichVisualDeferred();
    const agreementBundle = buildAgreement();
    const driftBundle = buildDrift();
    const { container } = render(
      <>
        <RankedBreakdownChart model={agreementBundle.model} />
        <PairedAiDriftCharts model={driftBundle.model} />
      </>
    );

    expect(
      container.querySelector(
        '[data-slot="ranked-breakdown-chart"] [role="status"]'
      )
    ).toHaveClass("min-h-[220px]");
    expect(
      container.querySelector(
        '[data-slot="paired-ai-drift-charts"] [role="status"]'
      )
    ).toHaveClass("h-[340px]", "sm:h-[380px]");
  });

  it("paired AI drift exposes one shared active period for both panels", () => {
    keepRichVisualDeferred();
    const bundle = buildDrift();
    const { container } = render(<PairedAiDriftCharts model={bundle.model} />);
    const root = container.querySelector(
      '[data-slot="paired-ai-drift-charts"]'
    ) as HTMLElement;

    fireEvent.focus(root);
    fireEvent.keyDown(root, { key: "ArrowRight" });
    fireEvent.keyDown(root, { key: "ArrowRight" });

    expect(root).toHaveAttribute("data-active-point-id", "ai-drift-2026-07-13");
    expect(
      container.querySelector(
        '[data-slot="ai-drift-confidence-selected-marker"]'
      )
    ).toHaveAttribute("data-point-id", "ai-drift-2026-07-13");
    expect(
      container.querySelector(
        '[data-slot="ai-drift-reserve-selected-marker"]'
      )
    ).toHaveAttribute("data-point-id", "ai-drift-2026-07-13");
  });

  it("Arrow keys, Escape and Enter operate on the normalized performance model", () => {
    keepRichVisualDeferred();
    const bundle = buildAgreement();
    const { container } = render(
      <RankedBreakdownChart model={bundle.model} />
    );
    const root = container.querySelector(
      '[data-slot="ranked-breakdown-chart"]'
    ) as HTMLElement;

    fireEvent.focus(root);
    fireEvent.keyDown(root, { key: "ArrowDown" });
    expect(root).toHaveAttribute(
      "data-active-point-id",
      "agreement-criterion-b"
    );
    fireEvent.keyDown(root, { key: "Enter" });
    expect(navigation.push).toHaveBeenCalledWith(
      "/reports?period=custom&start=2026-07-01&end=2026-07-24&view=details#details-blocks",
      undefined
    );
    fireEvent.keyDown(root, { key: "Escape" });
    expect(root).not.toHaveAttribute("data-active-point-id");
  });

  it("preserves report scroll only for exact evidence opened from performance charts", () => {
    keepRichVisualDeferred();
    const agreementBundle = buildAgreement();
    const agreementView = render(
      <RankedBreakdownChart
        model={{
          ...agreementBundle.model,
          points: agreementBundle.model.points.map((point, index) =>
            index === 0 ? { ...point, href: evidenceHref } : point
          )
        }}
      />
    );
    const agreementRoot = agreementView.container.querySelector(
      '[data-slot="ranked-breakdown-chart"]'
    ) as HTMLElement;

    fireEvent.focus(agreementRoot);
    fireEvent.keyDown(agreementRoot, { key: "Enter" });
    // Exact evidence targets commit through the native History API; the
    // Evidence Sheet resolves the payload on demand, so no App Router
    // navigation is dispatched (its commit can be dropped on a fresh page
    // load on Next 16.2.x).
    expect(window.location.pathname + window.location.search).toBe(
      evidenceHref
    );
    expect(navigation.push).not.toHaveBeenCalled();
    agreementView.unmount();

    const driftBundle = buildDrift();
    const driftView = render(<PairedAiDriftCharts model={driftBundle.model} />);
    const driftRoot = driftView.container.querySelector(
      '[data-slot="paired-ai-drift-charts"]'
    ) as HTMLElement;

    fireEvent.focus(driftRoot);
    fireEvent.keyDown(driftRoot, { key: "Enter" });
    expect(navigation.push).toHaveBeenLastCalledWith(
      driftBundle.model.points[0].href,
      undefined
    );
    driftView.unmount();

    const evidenceDriftView = render(
      <PairedAiDriftCharts
        model={{
          ...driftBundle.model,
          points: driftBundle.model.points.map((point, index) =>
            index === 0 ? { ...point, href: evidenceHref } : point
          )
        }}
      />
    );
    const evidenceDriftRoot = evidenceDriftView.container.querySelector(
      '[data-slot="paired-ai-drift-charts"]'
    ) as HTMLElement;

    fireEvent.focus(evidenceDriftRoot);
    fireEvent.keyDown(evidenceDriftRoot, { key: "Enter" });
    expect(window.location.pathname + window.location.search).toBe(
      evidenceHref
    );
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it("pointer and touch select the same performance point and arm deferred loading", async () => {
    keepRichVisualDeferred();
    const bundle = buildDrift();
    const { container } = render(<PairedAiDriftCharts model={bundle.model} />);
    const root = container.querySelector(
      '[data-slot="paired-ai-drift-charts"]'
    ) as HTMLElement;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 400, top: 0, height: 380 })
    });

    fireEvent.pointerMove(root, { clientX: 400, pointerType: "mouse" });
    expect(root).toHaveAttribute("data-active-point-id", "ai-drift-2026-07-20");

    fireEvent.pointerDown(root, { clientX: 400, pointerType: "touch" });
    expect(root).toHaveAttribute("data-active-point-id", "ai-drift-2026-07-20");
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="deferred-chart-visual"]')
      ).not.toHaveAttribute("data-deferred-state", "waiting");
    });
  });

  it("performance server wrappers preserve cards, evidence and one heading owner", () => {
    keepRichVisualDeferred();
    expect(typeof panels.AiAgreementPanel).toBe("function");
    expect(typeof panels.AiDriftPanel).toBe("function");
    const AgreementPanel = panels.AiAgreementPanel;
    const DriftPanel = panels.AiDriftPanel;
    const agreementBundle = buildAgreement();
    const driftBundle = buildDrift();
    render(
      <>
        <AgreementPanel
          report={agreement}
          bundle={agreementBundle}
          view="graph"
          currentHref="/reports?view=performance&chartView=graph"
          periodLabel="01.07.2026 - 24.07.2026"
        />
        <DriftPanel
          report={drift}
          bundle={driftBundle}
          view="graph"
          currentHref="/reports?view=performance&chartView=graph"
          periodLabel="01.07.2026 - 24.07.2026"
        />
      </>
    );

    expect(
      screen.getAllByRole("heading", { name: "AI↔человек: согласие" })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", { name: "Дрейф AI-оценки" })
    ).toHaveLength(1);
    expect(screen.getByText("Согласие AI и людей")).toBeInTheDocument();
    expect(screen.getAllByText("Доля резервной оценки")).not.toHaveLength(0);
    expect(screen.getByText("Падение уверенности")).toBeInTheDocument();
  });

  it("performance server wrappers create no Task 6 client shell in table mode", () => {
    expect(typeof panels.AiAgreementPanel).toBe("function");
    expect(typeof panels.AiDriftPanel).toBe("function");
    const AgreementPanel = panels.AiAgreementPanel;
    const DriftPanel = panels.AiDriftPanel;
    const { container } = render(
      <>
        <AgreementPanel
          report={agreement}
          bundle={buildAgreement()}
          view="table"
          currentHref="/reports?view=performance&chartView=table"
          periodLabel="01.07.2026 - 24.07.2026"
        />
        <DriftPanel
          report={drift}
          bundle={buildDrift()}
          view="table"
          currentHref="/reports?view=performance&chartView=table"
          periodLabel="01.07.2026 - 24.07.2026"
        />
      </>
    );

    expect(
      container.querySelector('[data-slot="ranked-breakdown-chart"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="paired-ai-drift-charts"]')
    ).toBeNull();
    expect(screen.getAllByRole("table")).toHaveLength(2);
  });
});
