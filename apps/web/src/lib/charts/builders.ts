import {
  parseChartModel,
  type ChartModel,
  type ChartUnit
} from "@/lib/charts/contracts";

const chartNumberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2
});

const chartUnitLabels: Record<ChartUnit, string> = {
  "quality-score": "баллы качества",
  count: "количество",
  percent: "проценты"
};

export function chartUnitLabel(unit: ChartUnit): string {
  return chartUnitLabels[unit];
}

export function formatChartValue(value: number | null, _unit: ChartUnit): string {
  if (value === null) {
    return "Нет данных";
  }

  return chartNumberFormatter.format(value);
}

export function buildChartModel<TKey extends string>(
  input: ChartModel<TKey>
): ChartModel<TKey> {
  // Runtime validation proves the key/value relationship; the typed input
  // preserves the caller's narrower key union after that validation boundary.
  const parsed = parseChartModel(input) as ChartModel<TKey>;

  return {
    ...parsed,
    series: parsed.series.map((series) => ({ ...series })),
    points: parsed.points.map((point) => ({
      ...point,
      values: { ...point.values }
    }))
  };
}
