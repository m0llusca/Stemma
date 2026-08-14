import { describe, expect, it } from "vitest";
import { buildChartModel } from "@/lib/charts/builders";
import * as geometryModule from "@/lib/charts/plot-geometry";

const geometry = geometryModule;

const distributionModel = buildChartModel({
  id: "distribution-geometry",
  title: "Распределение оценок",
  description: "Проверки по диапазонам.",
  xLabel: "Диапазон",
  yLabel: "Проверки",
  series: [
    {
      key: "count" as const,
      label: "Проверки",
      unit: "count" as const,
      tone: "primary" as const
    }
  ],
  points: [0, 3, 0, 2].map((value, index) => ({
    id: `bucket-${index}`,
    label: ["0-50", "51-70", "71-85", "86-100"][index],
    sortKey: String(index),
    values: { count: value },
    sampleSize: value
  })),
  emptyTitle: "Нет данных"
});

const driftModel = buildChartModel({
  id: "drift-geometry",
  title: "Дрейф",
  description: "Две синхронные панели.",
  xLabel: "Неделя",
  yLabel: "Проценты",
  series: [
    {
      key: "confidence" as const,
      label: "Уверенность",
      unit: "percent" as const,
      tone: "primary" as const
    },
    {
      key: "reserve" as const,
      label: "Резерв",
      unit: "percent" as const,
      tone: "secondary" as const
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
});

const reasonModel = buildChartModel({
  id: "reason-geometry",
  title: "Причина",
  description: "Текущий и прошлый периоды.",
  xLabel: "День",
  yLabel: "Замечания",
  series: [
    {
      key: "current" as const,
      label: "Текущий",
      unit: "count" as const,
      tone: "primary" as const
    },
    {
      key: "previous" as const,
      label: "Прошлый",
      unit: "count" as const,
      tone: "secondary" as const
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
});

const agreementModel = buildChartModel({
  id: "agreement-geometry",
  title: "Согласие",
  description: "Ранжированное согласие.",
  xLabel: "Критерий",
  yLabel: "Проценты",
  series: [
    {
      key: "agreement" as const,
      label: "Согласие",
      unit: "percent" as const,
      tone: "primary" as const
    },
    {
      key: "reference" as const,
      label: "Ориентир",
      unit: "percent" as const,
      tone: "reference" as const
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
});

function expectedDistributionGeometry() {
  return geometry.buildScoreDistributionGeometry(distributionModel);
}

function expectedPairedGeometry() {
  return geometry.buildPairedAiDriftGeometry(driftModel);
}

function expectedReasonGeometry() {
  return geometry.buildReasonTrendGeometry(reasonModel);
}

function expectedAgreementGeometry() {
  return geometry.buildRankedBreakdownGeometry(agreementModel);
}

describe("Task 6 shared plot geometry", () => {
  it("all Task 6 hit-testing, selected markers, and SVG marks share one geometry output", () => {
    expect(typeof geometry.buildScoreDistributionGeometry).toBe("function");
    const result = expectedDistributionGeometry();
    const index = result.pointIndexFromClientX(250, {
      left: 50,
      width: 400
    });
    const selected = result.selectedMark(index ?? 0);
    const bar = result.bars[index ?? 0];

    expect(selected).toEqual({
      x: bar.x + bar.width / 2,
      y: bar.y
    });
  });

  it("distribution geometry preserves zero bars and clamps first and last hit targets", () => {
    const result = expectedDistributionGeometry();

    expect(result.bars.map((bar) => bar.value)).toEqual([0, 3, 0, 2]);
    expect(result.bars[0].height).toBe(0);
    expect(result.bars[2].height).toBe(0);
    expect(
      result.pointIndexFromClientX(-100, { left: 0, width: 400 })
    ).toBe(0);
    expect(
      result.pointIndexFromClientX(1000, { left: 0, width: 400 })
    ).toBe(3);
  });

  it("paired drift geometry returns aligned marks for one active period", () => {
    const result = expectedPairedGeometry();
    const selected = result.selectedMarks(2);

    expect(selected?.confidence?.x).toBe(selected?.reserve?.x);
    expect(selected?.confidence?.y).not.toBe(selected?.reserve?.y);
    expect(result.pointIndexFromClientX(999, { left: 0, width: 500 })).toBe(2);
  });

  it("selected markers stay absent for missing Task 6 series values", () => {
    const oneSeriesMissing = {
      ...driftModel,
      points: driftModel.points.map((point, index) =>
        index === 2
          ? {
              ...point,
              values: { confidence: null, reserve: 50 }
            }
          : point
      )
    };
    const paired = geometry.buildPairedAiDriftGeometry(oneSeriesMissing);
    const marks = paired.selectedMarks(2);
    const agreementMissing = {
      ...agreementModel,
      points: agreementModel.points.map((point, index) =>
        index === 0
          ? {
              ...point,
              values: { agreement: null, reference: null }
            }
          : point
      )
    };
    const ranked = geometry.buildRankedBreakdownGeometry(agreementMissing);

    expect(marks?.confidence).toBeNull();
    expect(marks?.reserve).toEqual({
      x: paired.xFor(2),
      y: paired.yForReserve(50)
    });
    expect(ranked.selectedMark(0)).toBeNull();
  });

  it("drift and reason geometry split contiguous segments at null", () => {
    const drift = expectedPairedGeometry();
    const reason = expectedReasonGeometry();

    expect(drift.lineSegments("confidence")).toHaveLength(2);
    expect(drift.lineSegments("reserve")).toHaveLength(2);
    expect(reason.lineSegments("current")).toHaveLength(2);
    expect(reason.lineSegments("previous")).toHaveLength(1);
  });

  it("agreement geometry shares the 80 percent reference coordinate", () => {
    const result = expectedAgreementGeometry();

    expect(result.referenceValue).toBe(80);
    expect(result.referenceX).toBe(result.xForValue(80));
    expect(result.selectedMark(0)).toEqual({
      x: result.bars[0].x + result.bars[0].width,
      y: result.bars[0].y + result.bars[0].height / 2
    });
  });

  it("uses the shared ranked clamp for short, medium, and long breakdowns", () => {
    const withRows = (rowCount: number) => ({
      ...agreementModel,
      points: Array.from({ length: rowCount }, (_, index) => ({
        ...agreementModel.points[index % agreementModel.points.length],
        id: `criterion-${index}`,
        sortKey: String(index)
      }))
    });

    expect(geometry.buildRankedBreakdownGeometry(withRows(1)).height).toBe(220);
    expect(geometry.buildRankedBreakdownGeometry(withRows(10)).height).toBe(360);
    expect(geometry.buildRankedBreakdownGeometry(withRows(20)).height).toBe(420);
  });

  it("existing Task 5 quality and ranked geometry exports remain unchanged", () => {
    const quality = geometryModule.buildQualityTrendGeometry(
      buildChartModel({
        id: "task5-quality",
        title: "Качество",
        description: "Тренд.",
        series: [
          {
            key: "score" as const,
            label: "Баллы",
            unit: "quality-score" as const,
            tone: "primary" as const
          },
          {
            key: "previous" as const,
            label: "База",
            unit: "quality-score" as const,
            tone: "secondary" as const
          },
          {
            key: "target" as const,
            label: "Цель",
            unit: "quality-score" as const,
            tone: "reference" as const
          },
          {
            key: "volume" as const,
            label: "Проверки",
            unit: "count" as const,
            tone: "secondary" as const
          }
        ],
        points: [
          {
            id: "one",
            label: "Один",
            sortKey: "1",
            values: { score: 50, previous: 40, target: 90, volume: 1 }
          }
        ],
        emptyTitle: "Нет данных"
      }),
      ["score"]
    );
    const ranked = geometryModule.buildRankedDriverGeometry(
      buildChartModel({
        id: "task5-ranked",
        title: "Факторы",
        description: "Изменения.",
        series: [
          {
            key: "down" as const,
            label: "Вниз",
            unit: "quality-score" as const,
            tone: "danger" as const
          },
          {
            key: "up" as const,
            label: "Вверх",
            unit: "quality-score" as const,
            tone: "success" as const
          }
        ],
        points: [
          {
            id: "one",
            label: "Один",
            sortKey: "1",
            values: { down: null, up: 4 }
          }
        ],
        emptyTitle: "Нет данных"
      }),
      220
    );

    expect(quality).toMatchObject({ width: 720, height: 320 });
    expect(ranked).toMatchObject({ width: 440, zeroX: 263 });
  });
});

describe("x-axis tick thinning", () => {
  it("thins a dense daily axis to a collision-free interval", () => {
    expect(geometry.planXAxisTickIndexes(31, 660)).toEqual([
      0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30
    ]);
  });

  it("keeps every label when the points fit within the minimum tick gap", () => {
    expect(geometry.planXAxisTickIndexes(2, 660)).toEqual([0, 1]);
    expect(geometry.planXAxisTickIndexes(14, 660)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
    ]);
  });

  it("handles empty, single-point, and zero-width axes", () => {
    expect(geometry.planXAxisTickIndexes(0, 660)).toEqual([]);
    expect(geometry.planXAxisTickIndexes(1, 660)).toEqual([0]);
    expect(geometry.planXAxisTickIndexes(31, 0)).toEqual([]);
  });

  it("keeps adjacent labeled centers at least the minimum gap apart", () => {
    const plotWidth = 660;
    const minTickGap = 48;

    for (const pointCount of [20, 31, 32, 60, 92]) {
      const indexes = geometry.planXAxisTickIndexes(
        pointCount,
        plotWidth,
        minTickGap
      );
      const step = plotWidth / (pointCount - 1);

      expect(indexes[0]).toBe(0);
      for (let position = 1; position < indexes.length; position += 1) {
        expect(
          (indexes[position] - indexes[position - 1]) * step
        ).toBeGreaterThanOrEqual(minTickGap);
      }
    }
  });
});
