import { describe, expect, it } from "vitest";
import { buildChartModel } from "@/lib/charts/builders";
import { parseChartModel, type ChartModel } from "@/lib/charts/contracts";

function validModel(): ChartModel<"score" | "volume"> {
  return {
    id: "quality-trend",
    title: "Динамика качества",
    description: "Средняя оценка и число завершённых проверок по дням.",
    xLabel: "Дата",
    yLabel: "Значение",
    series: [
      {
        key: "score",
        label: "Оценка",
        unit: "quality-score",
        tone: "primary"
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
        values: { score: 82.5, volume: 0 },
        sampleSize: 0
      },
      {
        id: "2026-07-02",
        label: "2 июля",
        sortKey: "2026-07-02",
        values: { score: null, volume: 12 },
        detail: "Нет оценки за день"
      }
    ],
    emptyTitle: "Нет завершённых проверок",
    emptyDescription: "Данные появятся после первой финализированной проверки."
  };
}

describe("chart model contract", () => {
  it("preserves zero buckets and explicit missing values", () => {
    const parsed = buildChartModel(validModel());

    expect(parsed.points[0].values.volume).toBe(0);
    expect(parsed.points[0].sampleSize).toBe(0);
    expect(parsed.points[1].values.score).toBeNull();
  });

  it("rejects duplicate series keys", () => {
    const model = validModel();

    expect(() =>
      parseChartModel({
        ...model,
        series: [model.series[0], { ...model.series[1], key: "score" }]
      })
    ).toThrow(/duplicate series key "score"/i);
  });

  it("rejects sparse series arrays", () => {
    const model = validModel();
    const sparseSeries = [...model.series];
    delete sparseSeries[0];

    expect(() =>
      parseChartModel({
        ...model,
        series: sparseSeries
      })
    ).toThrow(/chart\.series\[0\].*present/i);
  });

  it("rejects sparse point arrays", () => {
    const model = validModel();
    const sparsePoints = [...model.points];
    delete sparsePoints[0];

    expect(() =>
      parseChartModel({
        ...model,
        points: sparsePoints
      })
    ).toThrow(/chart\.points\[0\].*present/i);
  });

  it.each([
    ["an unknown model property", { ...validModel(), ownerEmail: "qa@example.test" }],
    [
      "an unknown series property",
      {
        ...validModel(),
        series: [{ ...validModel().series[0], color: "#f00" }, validModel().series[1]]
      }
    ],
    [
      "an unknown point value key",
      {
        ...validModel(),
        points: [
          {
            ...validModel().points[0],
            values: { ...validModel().points[0].values, secret: 1 }
          },
          validModel().points[1]
        ]
      }
    ]
  ])("rejects %s", (_label, model) => {
    expect(() => parseChartModel(model)).toThrow(/unknown key/i);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects the non-finite point value %s",
    (value) => {
      const model = validModel();

      expect(() =>
        parseChartModel({
          ...model,
          points: [
            {
              ...model.points[0],
              values: { ...model.points[0].values, score: value }
            },
            model.points[1]
          ]
        })
      ).toThrow(/finite number/i);
    }
  );

  it.each([
    ["Date", { ...validModel(), generatedAt: new Date("2026-07-01T00:00:00.000Z") }],
    ["undefined", { ...validModel(), description: undefined }]
  ])("rejects non-JSON-safe %s values", (_label, model) => {
    expect(() => parseChartModel(model)).toThrow(/JSON-safe/i);
  });

  it("requires an analytical description", () => {
    const { description: _description, ...modelWithoutDescription } = validModel();

    expect(() => parseChartModel(modelWithoutDescription)).toThrow(
      /chart\.description must be a non-empty string/i
    );
  });

  it("rejects points whose sort keys are not strictly increasing", () => {
    const model = validModel();

    expect(() =>
      parseChartModel({
        ...model,
        points: [model.points[1], model.points[0]]
      })
    ).toThrow(/strictly increasing sortKey/i);
  });

  it("rejects duplicate point ids", () => {
    const model = validModel();

    expect(() =>
      parseChartModel({
        ...model,
        points: [model.points[0], { ...model.points[1], id: model.points[0].id }]
      })
    ).toThrow(/duplicate point id "2026-07-01"/i);
  });

  it("rejects a cross-origin drilldown encoded with a backslash", () => {
    const model = validModel();

    expect(() =>
      parseChartModel({
        ...model,
        points: [
          {
            ...model.points[0],
            href: "/\\evil.example/path"
          },
          model.points[1]
        ]
      })
    ).toThrow(/application-relative href/i);
  });

  it.each([
    [
      "a quality score outside 0–100",
      {
        ...validModel(),
        points: [
          {
            ...validModel().points[0],
            values: { ...validModel().points[0].values, score: 101 }
          },
          validModel().points[1]
        ]
      }
    ],
    [
      "a fractional count",
      {
        ...validModel(),
        points: [
          {
            ...validModel().points[0],
            values: { ...validModel().points[0].values, volume: 1.5 }
          },
          validModel().points[1]
        ]
      }
    ],
    [
      "an unsupported unit",
      {
        ...validModel(),
        series: [{ ...validModel().series[0], unit: "seconds" }, validModel().series[1]]
      }
    ]
  ])("rejects %s", (_label, model) => {
    expect(() => parseChartModel(model)).toThrow();
  });
});
