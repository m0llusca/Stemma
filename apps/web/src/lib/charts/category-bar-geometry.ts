export const CATEGORY_BAR_VIEWBOX = Object.freeze({
  width: 520,
  height: 240
});

export const CATEGORY_BAR_MARGIN = Object.freeze({
  left: 8,
  right: 8,
  top: 28,
  bottom: 8
});

export const CATEGORY_BAR_MIN_HEIGHT = 4;

export type CategoryBarTone = "danger" | "warning" | "neutral";

export type CategoryBarDatum = {
  key: string;
  label: string;
  value: number;
  href: string;
  tone: CategoryBarTone;
};

export function categoryBarDrillLabel(label: string, value: number) {
  return `${label}: ${value}. Открыть очередь`;
}

export type CategoryBarPlotBar = CategoryBarDatum & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function buildCategoryBarPlot(bars: readonly CategoryBarDatum[]) {
  const { width, height } = CATEGORY_BAR_VIEWBOX;
  const plotWidth = width - CATEGORY_BAR_MARGIN.left - CATEGORY_BAR_MARGIN.right;
  const plotHeight = height - CATEGORY_BAR_MARGIN.top - CATEGORY_BAR_MARGIN.bottom;
  const maxValue = Math.max(1, ...bars.map((bar) => bar.value));
  const slot = plotWidth / Math.max(bars.length, 1);
  const barWidth = Math.min(72, slot * 0.55);
  const mid = Math.round(maxValue / 2);
  const ticks = mid === 0 || mid === maxValue ? [0, maxValue] : [0, mid, maxValue];

  return {
    height,
    maxValue,
    plotHeight,
    ticks,
    width,
    bars: bars.map((bar, index): CategoryBarPlotBar => {
      const rawHeight = (bar.value / maxValue) * plotHeight;
      const heightPx =
        bar.value > 0 ? Math.max(CATEGORY_BAR_MIN_HEIGHT, rawHeight) : 0;

      return {
        ...bar,
        x: CATEGORY_BAR_MARGIN.left + slot * index + (slot - barWidth) / 2,
        y: CATEGORY_BAR_MARGIN.top + plotHeight - heightPx,
        width: barWidth,
        height: heightPx
      };
    })
  };
}
