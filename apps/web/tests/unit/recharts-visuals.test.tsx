import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  QualityTrendVisual,
  RankedDriverVisual
} from "@/components/charts/recharts-visuals.client";
import * as richVisuals from "@/components/charts/recharts-visuals.client";
import type { ChartModel } from "@/lib/charts/contracts";

const qualityModel: ChartModel<"score" | "previous" | "target" | "volume"> = {
  id: "quality-visual",
  title: "Динамика качества",
  description: "Средний балл, база, цель и выборка.",
  xLabel: "Дата",
  yLabel: "Баллы",
  series: [
    { key: "score", label: "Баллы", unit: "quality-score", tone: "primary" },
    { key: "previous", label: "База", unit: "quality-score", tone: "secondary" },
    { key: "target", label: "Цель", unit: "quality-score", tone: "reference" },
    { key: "volume", label: "Проверки", unit: "count", tone: "secondary" }
  ],
  points: [
    {
      id: "one",
      label: "1 июля",
      sortKey: "1",
      values: { score: 82, previous: 80, target: 90, volume: 7 }
    },
    {
      id: "two",
      label: "8 июля",
      sortKey: "2",
      values: { score: 87, previous: 83, target: 90, volume: 11 }
    }
  ],
  emptyTitle: "Нет данных",
  emptyDescription: "Данные появятся позже."
};

const driverModel: ChartModel<"down" | "up"> = {
  id: "driver-visual",
  title: "Факторы изменения",
  description: "Просадки и улучшения.",
  xLabel: "Фактор",
  yLabel: "Баллы",
  series: [
    { key: "down", label: "Просадка", unit: "quality-score", tone: "danger" },
    { key: "up", label: "Улучшение", unit: "quality-score", tone: "success" }
  ],
  points: [
    {
      id: "down",
      label: "Freshdesk",
      sortKey: "1",
      values: { down: 6, up: null }
    },
    {
      id: "up",
      label: "Retention",
      sortKey: "2",
      values: { down: null, up: 4 }
    }
  ],
  emptyTitle: "Нет данных",
  emptyDescription: "Данные появятся позже."
};

type Task6Visuals = {
  ScoreDistributionVisual: React.ComponentType<{
    model: ChartModel<"count">;
  }>;
  PairedAiDriftVisual: React.ComponentType<{
    model: ChartModel<"confidence" | "reserve">;
  }>;
  ReasonTrendVisual: React.ComponentType<{
    model: ChartModel<"current" | "previous">;
  }>;
  RankedBreakdownVisual: React.ComponentType<{
    model: ChartModel<"agreement" | "reference">;
  }>;
};

const task6Visuals = richVisuals as unknown as Task6Visuals;

const distributionModel: ChartModel<"count"> = {
  id: "distribution-visual",
  title: "Распределение",
  description: "Проверки по диапазонам.",
  series: [
    { key: "count", label: "Проверки", unit: "count", tone: "primary" }
  ],
  points: [0, 3, 0, 2].map((value, index) => ({
    id: `bucket-${index}`,
    label: ["0-50", "51-70", "71-85", "86-100"][index],
    sortKey: String(index),
    values: { count: value }
  })),
  emptyTitle: "Нет данных"
};

const driftModel: ChartModel<"confidence" | "reserve"> = {
  id: "drift-visual",
  title: "Дрейф",
  description: "Две синхронные панели.",
  series: [
    {
      key: "confidence",
      label: "Уверенность",
      unit: "percent",
      tone: "primary"
    },
    {
      key: "reserve",
      label: "Резерв",
      unit: "percent",
      tone: "secondary"
    }
  ],
  points: [
    {
      id: "week-1",
      label: "01–07",
      sortKey: "1",
      values: { confidence: 80, reserve: 20 }
    },
    {
      id: "week-2",
      label: "08–14",
      sortKey: "2",
      values: { confidence: null, reserve: null }
    },
    {
      id: "week-3",
      label: "15–21",
      sortKey: "3",
      values: { confidence: 60, reserve: 50 }
    }
  ],
  emptyTitle: "Нет данных"
};

const reasonModel: ChartModel<"current" | "previous"> = {
  id: "reason-visual",
  title: "Причина",
  description: "Текущий и прошлый периоды.",
  series: [
    {
      key: "current",
      label: "Текущий",
      unit: "count",
      tone: "primary"
    },
    {
      key: "previous",
      label: "Прошлый",
      unit: "count",
      tone: "secondary"
    }
  ],
  points: [
    {
      id: "day-1",
      label: "01.07",
      sortKey: "1",
      values: { current: 2, previous: 1 }
    },
    {
      id: "day-2",
      label: "02.07",
      sortKey: "2",
      values: { current: null, previous: 0 }
    },
    {
      id: "day-3",
      label: "03.07",
      sortKey: "3",
      values: { current: 3, previous: null }
    }
  ],
  emptyTitle: "Нет данных"
};

const agreementModel: ChartModel<"agreement" | "reference"> = {
  id: "agreement-visual",
  title: "Согласие",
  description: "Ранжированное согласие.",
  series: [
    {
      key: "agreement",
      label: "Согласие",
      unit: "percent",
      tone: "primary"
    },
    {
      key: "reference",
      label: "Ориентир",
      unit: "percent",
      tone: "reference"
    }
  ],
  points: [
    {
      id: "criterion-1",
      label: "Эмпатия",
      sortKey: "1",
      values: { agreement: 55, reference: 80 }
    },
    {
      id: "criterion-2",
      label: "Решение",
      sortKey: "2",
      values: { agreement: 90, reference: 80 }
    }
  ],
  emptyTitle: "Нет данных"
};

describe("lean Recharts visuals", () => {
  it("keeps rich primary and secondary plot roots on the responsive height contract", () => {
    const cases = [
      {
        component: (
          <QualityTrendVisual
            model={qualityModel}
            visibleSeries={["score", "previous", "target", "volume"]}
          />
        ),
        classes: [
          "h-[216px]",
          "min-[390px]:h-[232px]",
          "md:h-[280px]",
          "xl:h-[320px]"
        ]
      },
      {
        component: (
          <task6Visuals.ScoreDistributionVisual model={distributionModel} />
        ),
        classes: [
          "h-[200px]",
          "min-[390px]:h-[216px]",
          "md:h-[240px]",
          "xl:h-[260px]"
        ]
      },
      {
        component: <task6Visuals.ReasonTrendVisual model={reasonModel} />,
        classes: [
          "h-[200px]",
          "min-[390px]:h-[216px]",
          "md:h-[240px]",
          "xl:h-[260px]"
        ]
      }
    ] as const;

    for (const { component, classes } of cases) {
      const { container, unmount } = render(component);

      expect(container.querySelector('[data-slot="chart"]')).toHaveClass(
        ...classes
      );
      unmount();
    }
  });

  it("preserves paired AI drift and uses ranked geometry height in the rich roots", () => {
    const { container } = render(
      <>
        <task6Visuals.PairedAiDriftVisual model={driftModel} />
        <task6Visuals.RankedBreakdownVisual model={agreementModel} />
      </>
    );
    const charts = container.querySelectorAll<HTMLElement>(
      '[data-slot="chart"]'
    );

    expect(charts[0]).toHaveClass(
      "h-[340px]",
      "sm:h-[380px]"
    );
    expect(charts[1]).toHaveStyle({ height: "220px" });
  });

  it("renders every quality encoding with static public Recharts primitives", () => {
    const { container } = render(
      <QualityTrendVisual
        model={qualityModel}
        visibleSeries={["score", "previous", "target", "volume"]}
      />
    );

    expect(container.querySelector("svg.recharts-surface")).toHaveAttribute(
      "tabindex",
      "-1"
    );
    expect(container.querySelector('[data-series="score"] path')).toBeInTheDocument();
    expect(container.querySelector('[data-series="previous"]')).toHaveAttribute(
      "data-marker",
      "diamond"
    );
    expect(container.querySelector('[data-series="target"]')).toHaveAccessibleName(
      "Цель 90 баллов"
    );
    expect(container.querySelector('[data-series="volume"]')).toHaveAttribute(
      "data-tone",
      "neutral"
    );
    expect(container.querySelector("[data-animation-active=true]")).not.toBeInTheDocument();
  });

  it("thins dense daily x-axis labels to a non-colliding schedule", () => {
    const dailyModel: typeof qualityModel = {
      ...qualityModel,
      points: Array.from({ length: 31 }, (_, index) => ({
        id: `2026-07-${String(index + 1).padStart(2, "0")}`,
        label: `${String(index + 1).padStart(2, "0")}.07`,
        sortKey: String(index + 1).padStart(2, "0"),
        values: { score: 80 + (index % 5), previous: 78, target: 90, volume: 3 }
      }))
    };
    const { container } = render(
      <QualityTrendVisual model={dailyModel} visibleSeries={["score"]} />
    );

    const ticks = container.querySelectorAll('[data-slot="x-axis-tick"]');

    expect(ticks).toHaveLength(11);
    expect(ticks[0]).toHaveTextContent("01.07");
    expect(ticks[ticks.length - 1]).toHaveTextContent("31.07");
  });

  it("keeps every x-axis label when few points fit the plot", () => {
    const { container } = render(
      <QualityTrendVisual model={qualityModel} visibleSeries={["score"]} />
    );

    const ticks = container.querySelectorAll('[data-slot="x-axis-tick"]');

    expect(ticks).toHaveLength(2);
    expect(ticks[0]).toHaveTextContent("1 июля");
    expect(ticks[1]).toHaveTextContent("8 июля");
  });

  it("thins dense reason trend x-axis labels to a non-colliding schedule", () => {
    const denseReasonModel: typeof reasonModel = {
      ...reasonModel,
      points: Array.from({ length: 31 }, (_, index) => ({
        id: `2026-07-${String(index + 1).padStart(2, "0")}`,
        label: `${String(index + 1).padStart(2, "0")}.07`,
        sortKey: String(index + 1).padStart(2, "0"),
        values: { current: 2 + (index % 3), previous: 1 }
      }))
    };
    const { container } = render(
      <task6Visuals.ReasonTrendVisual model={denseReasonModel} />
    );

    const ticks = container.querySelectorAll('[data-slot="x-axis-tick"]');

    expect(ticks).toHaveLength(11);
    expect(ticks[0]).toHaveTextContent("01.07");
    expect(ticks[ticks.length - 1]).toHaveTextContent("31.07");
  });

  it("thins dense paired AI drift x-axis labels to a non-colliding schedule", () => {
    const denseDriftModel: typeof driftModel = {
      ...driftModel,
      points: Array.from({ length: 31 }, (_, index) => ({
        id: `2026-w${String(index + 1).padStart(2, "0")}`,
        label: `W${String(index + 1).padStart(2, "0")}`,
        sortKey: String(index + 1).padStart(2, "0"),
        values: { confidence: 70 + (index % 5), reserve: 20 }
      }))
    };
    const { container } = render(
      <task6Visuals.PairedAiDriftVisual model={denseDriftModel} />
    );

    const ticks = container.querySelectorAll('[data-slot="x-axis-tick"]');

    expect(ticks).toHaveLength(11);
    expect(ticks[0]).toHaveTextContent("W01");
    expect(ticks[ticks.length - 1]).toHaveTextContent("W31");
  });

  it("keeps every reason and drift x-axis label when few points fit the plot", () => {
    const { container } = render(
      <>
        <task6Visuals.PairedAiDriftVisual model={driftModel} />
        <task6Visuals.ReasonTrendVisual model={reasonModel} />
      </>
    );

    const ticks = container.querySelectorAll('[data-slot="x-axis-tick"]');

    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toHaveTextContent("01–07");
    expect(ticks[3]).toHaveTextContent("01.07");
  });

  it("keeps null quality values as visible line discontinuities", () => {
    const gapModel: typeof qualityModel = {
      ...qualityModel,
      points: [
        qualityModel.points[0],
        {
          id: "one-b",
          label: "2 июля",
          sortKey: "1b",
          values: { score: 84, previous: 81, target: 90, volume: 8 }
        },
        {
          id: "gap",
          label: "3 июля",
          sortKey: "1c",
          values: { score: null, previous: null, target: 90, volume: 0 }
        },
        qualityModel.points[1],
        {
          id: "two-b",
          label: "9 июля",
          sortKey: "2b",
          values: { score: 89, previous: 85, target: 90, volume: 13 }
        }
      ]
    };
    const { container } = render(
      <QualityTrendVisual
        model={gapModel}
        visibleSeries={["score", "previous"]}
      />
    );

    expect(container.querySelector('[data-series="score"]')).toHaveAttribute(
      "data-segment-count",
      "2"
    );
    expect(
      container.querySelectorAll('[data-series="score"] path')
    ).toHaveLength(2);
    expect(container.querySelector('[data-series="previous"]')).toHaveAttribute(
      "data-segment-count",
      "2"
    );
    expect(
      container.querySelectorAll('[data-series="previous"] path')
    ).toHaveLength(2);
  });

  it("renders two score segments around one missing day in a three-day seam", () => {
    const threeDayModel: typeof qualityModel = {
      ...qualityModel,
      points: [
        {
          id: "2026-07-01",
          label: "01.07",
          sortKey: "2026-07-01",
          values: { score: 72, previous: 78, target: 90, volume: 1 }
        },
        {
          id: "2026-07-02",
          label: "02.07",
          sortKey: "2026-07-02",
          values: { score: null, previous: 78, target: 90, volume: 0 }
        },
        {
          id: "2026-07-03",
          label: "03.07",
          sortKey: "2026-07-03",
          values: { score: 86, previous: 78, target: 90, volume: 1 }
        }
      ]
    };

    const { container } = render(
      <QualityTrendVisual model={threeDayModel} visibleSeries={["score"]} />
    );

    expect(container.querySelector('[data-series="score"]')).toHaveAttribute(
      "data-segment-count",
      "2"
    );
    expect(
      container.querySelectorAll('[data-series="score"] [data-point-id]')
    ).toHaveLength(2);
  });

  it("renders ranked negative and positive bars without animation", () => {
    const { container } = render(
      <RankedDriverVisual model={driverModel} height={220} />
    );

    expect(container.querySelector('[data-series="down"]')).toHaveAttribute(
      "data-direction",
      "negative"
    );
    expect(container.querySelector('[data-series="up"]')).toHaveAttribute(
      "data-direction",
      "positive"
    );
    expect(container.querySelector('[data-slot="ranked-zero-line"]')).toHaveAttribute(
      "x1",
      "263"
    );
    expect(container.querySelector('[data-slot="ranked-zero-line"]')).toHaveAttribute(
      "x2",
      "263"
    );
    expect(container.querySelectorAll(".recharts-rectangle")).toHaveLength(2);
    expect(container.querySelector("[data-animation-active=true]")).not.toBeInTheDocument();
  });

  it("never hard-clips ranked category labels: overlong labels ellipsis-truncate at a word boundary with the full label in a title", () => {
    const fullLabel = "ФГИС и государственные сервисы";
    const longLabelModel: typeof driverModel = {
      ...driverModel,
      points: [
        {
          id: "long",
          label: fullLabel,
          sortKey: "1",
          values: { down: 6, up: null }
        },
        driverModel.points[1]
      ]
    };
    render(<RankedDriverVisual model={longLabelModel} height={220} />);

    const text = screen
      .getAllByText(/…$/)
      .find((element) => element.tagName.toLowerCase() === "text");
    const title = text?.querySelector("title");

    expect(title).toHaveTextContent(fullLabel);
    const visible = text?.lastChild?.textContent ?? "";

    expect(visible.endsWith("…")).toBe(true);
    expect(visible.length).toBeLessThan(fullLabel.length);
    expect(fullLabel.startsWith(visible.slice(0, -1))).toBe(true);
    // Word-boundary cut: the first dropped character is a space, so no word
    // is severed mid-glyph the way the viewBox edge hard-clip did (D9).
    expect(fullLabel[visible.length - 1]).toBe(" ");

    // Labels that fit keep rendering in full, without a redundant title.
    const fitting = screen.getByText("Retention");
    expect(fitting.querySelector("title")).not.toBeInTheDocument();
    expect(fitting.textContent).toBe("Retention");
  });

  it("all Task 6 SVG roots are aria-hidden and unfocusable", () => {
    expect(typeof task6Visuals.ScoreDistributionVisual).toBe("function");
    expect(typeof task6Visuals.PairedAiDriftVisual).toBe("function");
    expect(typeof task6Visuals.ReasonTrendVisual).toBe("function");
    expect(typeof task6Visuals.RankedBreakdownVisual).toBe("function");
    const components = [
      <task6Visuals.ScoreDistributionVisual
        key="distribution"
        model={distributionModel}
      />,
      <task6Visuals.PairedAiDriftVisual key="drift" model={driftModel} />,
      <task6Visuals.ReasonTrendVisual key="reason" model={reasonModel} />,
      <task6Visuals.RankedBreakdownVisual
        key="agreement"
        model={agreementModel}
      />
    ];

    for (const component of components) {
      const { container, unmount } = render(component);
      for (const svg of container.querySelectorAll("svg")) {
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(svg).toHaveAttribute("tabindex", "-1");
      }
      unmount();
    }
  });

  it("all Task 6 visuals disable animation", () => {
    const { container } = render(
      <>
        <task6Visuals.ScoreDistributionVisual model={distributionModel} />
        <task6Visuals.PairedAiDriftVisual model={driftModel} />
        <task6Visuals.ReasonTrendVisual model={reasonModel} />
        <task6Visuals.RankedBreakdownVisual model={agreementModel} />
      </>
    );

    expect(container.querySelectorAll('[data-animation-active="false"]')).toHaveLength(
      4
    );
    expect(container.querySelector("[data-animation-active=true]")).toBeNull();
  });

  it("distribution preserves a zero bar without removing its label", () => {
    const { container } = render(
      <task6Visuals.ScoreDistributionVisual model={distributionModel} />
    );

    expect(container.querySelectorAll('[data-series="count"] rect')).toHaveLength(4);
    expect(
      container.querySelector('[data-point-id="bucket-0"]')
    ).toHaveAttribute("height", "0");
    expect(container).toHaveTextContent("0-50");
  });

  it("AI and reason lines break at null gaps", () => {
    const { container } = render(
      <>
        <task6Visuals.PairedAiDriftVisual model={driftModel} />
        <task6Visuals.ReasonTrendVisual model={reasonModel} />
      </>
    );

    expect(
      container.querySelector('[data-series="confidence"]')
    ).toHaveAttribute("data-segment-count", "2");
    expect(container.querySelector('[data-series="current"]')).toHaveAttribute(
      "data-segment-count",
      "2"
    );
  });

  it("agreement renders the 80 percent reference", () => {
    const { container } = render(
      <task6Visuals.RankedBreakdownVisual model={agreementModel} />
    );

    expect(
      container.querySelector('[data-slot="agreement-reference"]')
    ).toHaveAttribute("data-reference-value", "80");
  });

  it("rich renderer imports no full Recharts chart factory", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/components/charts/recharts-visuals.client.tsx"
      ),
      "utf8"
    );

    expect(source).not.toMatch(
      /import\s*\{[^}]*(?:BarChart|LineChart|AreaChart|ScatterChart|ComposedChart|CartesianGrid|XAxis|YAxis|Tooltip|Legend)[^}]*\}\s*from\s*["']recharts["']/s
    );
    expect(source).not.toMatch(/from\s*["']recharts\/(?:es6|lib)\//);
  });

  it("pins every stroke width against viewBox scaling via non-scaling-stroke", () => {
    const components = [
      <QualityTrendVisual
        key="quality"
        model={qualityModel}
        visibleSeries={["score", "previous", "target", "volume"]}
      />,
      <RankedDriverVisual key="driver" model={driverModel} height={220} />,
      <task6Visuals.ScoreDistributionVisual
        key="distribution"
        model={distributionModel}
      />,
      <task6Visuals.PairedAiDriftVisual key="drift" model={driftModel} />,
      <task6Visuals.ReasonTrendVisual key="reason" model={reasonModel} />,
      <task6Visuals.RankedBreakdownVisual
        key="agreement"
        model={agreementModel}
      />
    ];

    for (const component of components) {
      const { container, unmount } = render(component);
      const stroked = container.querySelectorAll(
        "[stroke]:not([stroke='none'])"
      );

      expect(stroked.length).toBeGreaterThan(0);
      stroked.forEach((element) => {
        expect(element).toHaveAttribute(
          "vector-effect",
          "non-scaling-stroke"
        );
      });
      unmount();
    }
  });

  it("places ranked breakdown value labels after the bar end with muted fill when they do not fit inside", () => {
    const fallbackModel: typeof agreementModel = {
      ...agreementModel,
      points: [
        {
          id: "low",
          label: "Низкое",
          sortKey: "1",
          values: { agreement: 5, reference: 80 }
        },
        {
          id: "empty",
          label: "Пусто",
          sortKey: "2",
          values: { agreement: null, reference: 80 }
        },
        {
          id: "high",
          label: "Высокое",
          sortKey: "3",
          values: { agreement: 90, reference: 80 }
        }
      ]
    };
    const { container } = render(
      <task6Visuals.RankedBreakdownVisual model={fallbackModel} />
    );

    const lowBar = container.querySelector('[data-point-id="low"]');
    const lowBarEnd =
      Number(lowBar?.getAttribute("x")) +
      Number(lowBar?.getAttribute("width"));
    const lowLabel = screen.getByText("5%");

    expect(lowLabel).toHaveAttribute("fill", "var(--muted-foreground)");
    expect(lowLabel).toHaveAttribute("text-anchor", "start");
    expect(Number(lowLabel.getAttribute("x"))).toBeGreaterThan(lowBarEnd);

    const emptyLabel = screen.getByText("—");
    expect(emptyLabel).toHaveAttribute("fill", "var(--muted-foreground)");
    expect(emptyLabel).toHaveAttribute("text-anchor", "start");

    const highLabel = screen.getByText("90%");
    expect(highLabel).toHaveAttribute("fill", "var(--primary-foreground)");
    expect(highLabel).toHaveAttribute("text-anchor", "end");
  });

  it("resolves volume bars to the theme-neutral chart-volume token", () => {
    const { container } = render(
      <QualityTrendVisual model={qualityModel} visibleSeries={["volume"]} />
    );

    expect(container.querySelector("style")?.textContent).toContain(
      "--color-volume: var(--chart-volume, var(--muted-foreground))"
    );
  });
});
