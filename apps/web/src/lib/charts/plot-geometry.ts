import type { ChartModel } from "@/lib/charts/contracts";

export type QualityTrendSeriesKey =
  | "score"
  | "previous"
  | "target"
  | "volume";

export type RankedDriverSeriesKey = "down" | "up";
export type ScoreDistributionSeriesKey = "count";
export type AiDriftSeriesKey = "confidence" | "reserve";
export type ReasonTrendSeriesKey = "current" | "previous";
export type AgreementSeriesKey = "agreement" | "reference";

export type PlotCoordinate = Readonly<{
  x: number;
  y: number;
}>;

export type QualitySelectedMark = PlotCoordinate &
  Readonly<{
    series: QualityTrendSeriesKey;
  }>;

export type RankedSelectedMark = PlotCoordinate &
  Readonly<{
    direction: "negative" | "positive" | "zero";
    value: number;
  }>;

export const QUALITY_TREND_VIEWBOX = Object.freeze({
  width: 720,
  height: 320,
  margin: Object.freeze({ top: 20, right: 18, bottom: 38, left: 42 })
});

export const RANKED_DRIVER_VIEWBOX = Object.freeze({
  width: 440,
  margin: Object.freeze({ top: 10, right: 18, bottom: 28, left: 104 })
});

export const SVG_CATEGORY_LABEL_FONT_SIZE = 11;

/**
 * Deterministic width estimate (viewBox units) for an SVG category label.
 * SVG text cannot be measured without a layout engine, so geometry uses a
 * conservative per-glyph average: overestimating only truncates a label
 * earlier, while underestimating would let the viewBox edge clip it.
 */
export function estimateSvgLabelWidth(
  label: string,
  fontSize = SVG_CATEGORY_LABEL_FONT_SIZE
) {
  return label.length * fontSize * 0.6;
}

export type FittedSvgLabel = Readonly<{
  text: string;
  truncated: boolean;
}>;

/**
 * Fits a right-aligned category label into `maxWidth` viewBox units. Labels
 * that fit come back unchanged; longer labels are cut at the last word
 * boundary inside the budget (a raw character cut only when the budget holds
 * no boundary) and suffixed with an ellipsis, so the viewBox edge never
 * hard-clips a glyph mid-word. Callers expose the full label separately
 * (SVG <title>) whenever `truncated` is true.
 */
export function fitSvgLabel(
  label: string,
  maxWidth: number,
  fontSize = SVG_CATEGORY_LABEL_FONT_SIZE
): FittedSvgLabel {
  if (estimateSvgLabelWidth(label, fontSize) <= maxWidth) {
    return { text: label, truncated: false };
  }

  const budget = Math.max(
    0,
    maxWidth - estimateSvgLabelWidth("…", fontSize)
  );
  let end = label.length;
  while (
    end > 0 &&
    estimateSvgLabelWidth(label.slice(0, end), fontSize) > budget
  ) {
    end -= 1;
  }

  let kept = label.slice(0, end);
  const boundary = kept.lastIndexOf(" ");
  if (boundary > 0) {
    kept = kept.slice(0, boundary);
  }

  return { text: `${kept.trimEnd()}…`, truncated: true };
}

export const SCORE_DISTRIBUTION_VIEWBOX = Object.freeze({
  width: 560,
  height: 260,
  margin: Object.freeze({ top: 18, right: 16, bottom: 44, left: 38 })
});

export const PAIRED_AI_DRIFT_VIEWBOX = Object.freeze({
  width: 720,
  height: 380,
  margin: Object.freeze({ top: 22, right: 18, bottom: 38, left: 42 }),
  panelGap: 44
});

export const REASON_TREND_VIEWBOX = Object.freeze({
  width: 720,
  height: 280,
  margin: Object.freeze({ top: 20, right: 18, bottom: 38, left: 42 })
});

export const RANKED_BREAKDOWN_VIEWBOX = Object.freeze({
  width: 560,
  margin: Object.freeze({ top: 16, right: 20, bottom: 30, left: 168 })
});

function nearestIndex(
  positions: readonly number[],
  coordinate: number
): number | null {
  if (positions.length === 0) {
    return null;
  }

  let nearest = 0;
  let nearestDistance = Math.abs(positions[0] - coordinate);

  for (let index = 1; index < positions.length; index += 1) {
    const distance = Math.abs(positions[index] - coordinate);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export const X_AXIS_MIN_TICK_GAP = 48;

/**
 * Category x-axis tick thinning: returns the point indexes whose labels may
 * render without colliding. Pure "every Nth" interval thinning in viewBox
 * units, so adjacent label centers always stay at least `minTickGap` apart;
 * the first label is always kept, the last only when it lands on the
 * interval (appending it unconditionally could re-introduce a collision).
 */
export function planXAxisTickIndexes(
  pointCount: number,
  plotWidth: number,
  minTickGap = X_AXIS_MIN_TICK_GAP
): number[] {
  if (pointCount <= 0 || plotWidth <= 0) {
    return [];
  }

  const step = plotWidth / Math.max(1, pointCount - 1);
  const interval = Math.max(1, Math.ceil(minTickGap / step));
  const indexes: number[] = [];

  for (let index = 0; index < pointCount; index += interval) {
    indexes.push(index);
  }

  return indexes;
}

export function viewBoxPercent(
  coordinate: PlotCoordinate,
  width: number,
  height: number
) {
  return {
    left: (coordinate.x / width) * 100,
    top: (coordinate.y / height) * 100
  };
}

export function buildQualityTrendGeometry(
  model: ChartModel<QualityTrendSeriesKey>,
  visibleSeries: readonly QualityTrendSeriesKey[]
) {
  const { width, height, margin } = QUALITY_TREND_VIEWBOX;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const visible = new Set(visibleSeries);
  const maxVolume = Math.max(
    1,
    ...model.points.map((point) => point.values.volume ?? 0)
  );
  const xFor = (index: number) =>
    margin.left +
    (model.points.length <= 1
      ? plotWidth / 2
      : (index / (model.points.length - 1)) * plotWidth);
  const yForScore = (value: number) =>
    margin.top +
    plotHeight -
    (Math.max(0, Math.min(100, value)) / 100) * plotHeight;
  const yForVolume = (value: number) =>
    margin.top +
    plotHeight -
    (Math.max(0, value) / maxVolume) * plotHeight;
  const targetValue =
    model.points.find((point) => point.values.target != null)?.values.target ??
    null;
  const xPositions = model.points.map((_, index) => xFor(index));

  function lineSegments(key: "score" | "previous") {
    const segments: PlotCoordinate[][] = [];
    let current: PlotCoordinate[] = [];

    model.points.forEach((point, index) => {
      const value = point.values[key];
      if (value == null) {
        if (current.length > 0) {
          segments.push(current);
          current = [];
        }
        return;
      }

      current.push({ x: xFor(index), y: yForScore(value) });
    });

    if (current.length > 0) {
      segments.push(current);
    }

    return segments;
  }

  function linePoints(key: "score" | "previous") {
    return model.points.flatMap((point, index) => {
      const value = point.values[key];
      return value == null
        ? []
        : [{ x: xFor(index), y: yForScore(value), pointId: point.id }];
    });
  }

  function selectedMark(index: number): QualitySelectedMark | null {
    const point = model.points[index];
    if (!point) {
      return null;
    }

    if (visible.has("score") && point.values.score != null) {
      return {
        x: xFor(index),
        y: yForScore(point.values.score),
        series: "score"
      };
    }

    if (visible.has("previous") && point.values.previous != null) {
      return {
        x: xFor(index),
        y: yForScore(point.values.previous),
        series: "previous"
      };
    }

    if (visible.has("target") && targetValue != null) {
      return {
        x: xFor(index),
        y: yForScore(targetValue),
        series: "target"
      };
    }

    if (visible.has("volume") && point.values.volume != null) {
      return {
        x: xFor(index),
        y: yForVolume(point.values.volume),
        series: "volume"
      };
    }

    return null;
  }

  function pointIndexFromClientX(
    clientX: number,
    bounds: Pick<DOMRect, "left" | "width">
  ) {
    if (bounds.width <= 0) {
      return model.points.length > 0 ? 0 : null;
    }

    const ratio = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / bounds.width)
    );
    return nearestIndex(xPositions, ratio * width);
  }

  const barStep = plotWidth / Math.max(1, model.points.length);

  return {
    width,
    height,
    margin,
    plotWidth,
    plotHeight,
    maxVolume,
    targetValue,
    barWidth: Math.max(5, Math.min(24, barStep * 0.42)),
    xFor,
    yForScore,
    yForVolume,
    linePoints,
    lineSegments,
    selectedMark,
    pointIndexFromClientX
  };
}

export function buildRankedDriverGeometry(
  model: ChartModel<RankedDriverSeriesKey>,
  height: number
) {
  const { width, margin } = RANKED_DRIVER_VIEWBOX;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const halfWidth = plotWidth / 2;
  const zeroX = margin.left + halfWidth;
  const rowHeight = plotHeight / Math.max(1, model.points.length);
  const barHeight = Math.max(8, Math.min(22, rowHeight * 0.55));
  const signedValues = model.points.map((point) =>
    point.values.up ??
    (point.values.down == null ? null : -Math.abs(point.values.down))
  );
  const maximumMagnitude = Math.max(
    1,
    ...signedValues.map((value) => Math.abs(value ?? 0))
  );
  const yFor = (index: number) =>
    margin.top + rowHeight * (index + 0.5);
  const xForValue = (value: number) =>
    zeroX + (value / maximumMagnitude) * halfWidth;
  const yPositions = model.points.map((_, index) => yFor(index));

  function bar(index: number) {
    const value = signedValues[index];
    if (value == null) {
      return null;
    }

    const endpoint = xForValue(value);
    return {
      x: Math.min(zeroX, endpoint),
      y: yFor(index) - barHeight / 2,
      width: Math.abs(endpoint - zeroX),
      height: barHeight,
      value
    };
  }

  function selectedMark(index: number): RankedSelectedMark | null {
    const value = signedValues[index];
    if (value == null) {
      return null;
    }

    return {
      x: xForValue(value),
      y: yFor(index),
      value,
      direction: value < 0 ? "negative" : value > 0 ? "positive" : "zero"
    };
  }

  function pointIndexFromClientY(
    clientY: number,
    bounds: Pick<DOMRect, "top" | "height">
  ) {
    if (bounds.height <= 0) {
      return model.points.length > 0 ? 0 : null;
    }

    const ratio = Math.max(
      0,
      Math.min(1, (clientY - bounds.top) / bounds.height)
    );
    return nearestIndex(yPositions, ratio * height);
  }

  return {
    width,
    height,
    margin,
    plotWidth,
    plotHeight,
    halfWidth,
    zeroX,
    rowHeight,
    barHeight,
    maximumMagnitude,
    signedValues,
    // Right-aligned category labels anchor at margin.left - 8 and extend
    // towards the viewBox edge (x = 0); 4 units of optical padding keep the
    // longest fitted glyph off the hard clip boundary.
    labelMaxWidth: margin.left - 8 - 4,
    yFor,
    xForValue,
    bar,
    selectedMark,
    pointIndexFromClientY
  };
}

function pointIndexFromClientXFactory(
  positions: readonly number[],
  modelPointCount: number,
  width: number
) {
  return (
    clientX: number,
    bounds: Pick<DOMRect, "left" | "width">
  ) => {
    if (bounds.width <= 0) {
      return modelPointCount > 0 ? 0 : null;
    }

    const ratio = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / bounds.width)
    );
    return nearestIndex(positions, ratio * width);
  };
}

function buildLineSegments<TKey extends string>(
  model: ChartModel<TKey>,
  key: TKey,
  xFor: (index: number) => number,
  yFor: (value: number) => number
) {
  const segments: Array<
    Array<PlotCoordinate & Readonly<{ pointId: string }>>
  > = [];
  let current: Array<PlotCoordinate & Readonly<{ pointId: string }>> = [];

  model.points.forEach((point, index) => {
    const value = point.values[key];
    if (value == null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      return;
    }

    current.push({
      x: xFor(index),
      y: yFor(value),
      pointId: point.id
    });
  });

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

export function buildScoreDistributionGeometry(
  model: ChartModel<ScoreDistributionSeriesKey>
) {
  const { width, height, margin } = SCORE_DISTRIBUTION_VIEWBOX;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(
    1,
    ...model.points.map((point) => point.values.count ?? 0)
  );
  const step = plotWidth / Math.max(1, model.points.length);
  const barWidth = Math.max(16, Math.min(72, step * 0.58));
  const xFor = (index: number) =>
    margin.left + step * (index + 0.5);
  const yFor = (value: number) =>
    margin.top +
    plotHeight -
    (Math.max(0, value) / maximum) * plotHeight;
  const xPositions = model.points.map((_, index) => xFor(index));
  const bars = model.points.map((point, index) => {
    const value = point.values.count ?? 0;
    const y = yFor(value);
    return {
      x: xFor(index) - barWidth / 2,
      y,
      width: barWidth,
      height: value === 0 ? 0 : margin.top + plotHeight - y,
      value,
      pointId: point.id
    };
  });

  return {
    width,
    height,
    margin,
    plotWidth,
    plotHeight,
    maximum,
    barWidth,
    xFor,
    yFor,
    bars,
    selectedMark(index: number): PlotCoordinate | null {
      const bar = bars[index];
      return bar
        ? { x: bar.x + bar.width / 2, y: bar.y }
        : null;
    },
    pointIndexFromClientX: pointIndexFromClientXFactory(
      xPositions,
      model.points.length,
      width
    )
  };
}

export function buildPairedAiDriftGeometry(
  model: ChartModel<AiDriftSeriesKey>
) {
  const { width, height, margin, panelGap } = PAIRED_AI_DRIFT_VIEWBOX;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom - panelGap;
  const panelHeight = plotHeight / 2;
  const confidenceTop = margin.top;
  const reserveTop = margin.top + panelHeight + panelGap;
  const xFor = (index: number) =>
    margin.left +
    (model.points.length <= 1
      ? plotWidth / 2
      : (index / (model.points.length - 1)) * plotWidth);
  const yInPanel = (value: number, top: number) =>
    top +
    panelHeight -
    (Math.max(0, Math.min(100, value)) / 100) * panelHeight;
  const yForConfidence = (value: number) =>
    yInPanel(value, confidenceTop);
  const yForReserve = (value: number) => yInPanel(value, reserveTop);
  const xPositions = model.points.map((_, index) => xFor(index));

  function lineSegments(key: AiDriftSeriesKey) {
    return buildLineSegments(
      model,
      key,
      xFor,
      key === "confidence" ? yForConfidence : yForReserve
    );
  }

  function selectedMarks(index: number) {
    const point = model.points[index];
    if (!point) {
      return null;
    }

    const confidence = point.values.confidence;
    const reserve = point.values.reserve;
    return {
      confidence:
        confidence == null
          ? null
          : {
              x: xFor(index),
              y: yForConfidence(confidence)
            },
      reserve:
        reserve == null
          ? null
          : {
              x: xFor(index),
              y: yForReserve(reserve)
            }
    };
  }

  return {
    width,
    height,
    margin,
    panelGap,
    plotWidth,
    plotHeight,
    panelHeight,
    confidenceTop,
    reserveTop,
    xFor,
    yForConfidence,
    yForReserve,
    lineSegments,
    selectedMarks,
    pointIndexFromClientX: pointIndexFromClientXFactory(
      xPositions,
      model.points.length,
      width
    )
  };
}

export function buildReasonTrendGeometry(
  model: ChartModel<ReasonTrendSeriesKey>
) {
  const { width, height, margin } = REASON_TREND_VIEWBOX;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(
    1,
    ...model.points.flatMap((point) =>
      Object.values(point.values).flatMap((value) =>
        value == null ? [] : [value]
      )
    )
  );
  const xFor = (index: number) =>
    margin.left +
    (model.points.length <= 1
      ? plotWidth / 2
      : (index / (model.points.length - 1)) * plotWidth);
  const yFor = (value: number) =>
    margin.top +
    plotHeight -
    (Math.max(0, value) / maximum) * plotHeight;
  const xPositions = model.points.map((_, index) => xFor(index));

  function lineSegments(key: ReasonTrendSeriesKey) {
    return buildLineSegments(model, key, xFor, yFor);
  }

  function selectedMark(index: number): PlotCoordinate | null {
    const point = model.points[index];
    if (!point) {
      return null;
    }
    const value = point.values.current ?? point.values.previous;
    return value == null ? null : { x: xFor(index), y: yFor(value) };
  }

  return {
    width,
    height,
    margin,
    plotWidth,
    plotHeight,
    maximum,
    xFor,
    yFor,
    lineSegments,
    selectedMark,
    pointIndexFromClientX: pointIndexFromClientXFactory(
      xPositions,
      model.points.length,
      width
    )
  };
}

export function buildRankedBreakdownGeometry(
  model: ChartModel<AgreementSeriesKey>
) {
  const { width, margin } = RANKED_BREAKDOWN_VIEWBOX;
  const height = Math.min(
    420,
    Math.max(220, model.points.length * 36)
  );
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rowHeight = plotHeight / Math.max(1, model.points.length);
  const barHeight = Math.max(10, Math.min(24, rowHeight * 0.58));
  const xForValue = (value: number) =>
    margin.left + (Math.max(0, Math.min(100, value)) / 100) * plotWidth;
  const yFor = (index: number) =>
    margin.top + rowHeight * (index + 0.5);
  const referenceValue =
    model.points.find((point) => point.values.reference != null)?.values
      .reference ?? 80;
  const referenceX = xForValue(referenceValue);
  const yPositions = model.points.map((_, index) => yFor(index));
  const bars = model.points.map((point, index) => {
    const value = point.values.agreement ?? 0;
    return {
      x: margin.left,
      y: yFor(index) - barHeight / 2,
      width: point.values.agreement == null ? 0 : xForValue(value) - margin.left,
      height: barHeight,
      value: point.values.agreement,
      pointId: point.id
    };
  });

  function pointIndexFromClientY(
    clientY: number,
    bounds: Pick<DOMRect, "top" | "height">
  ) {
    if (bounds.height <= 0) {
      return model.points.length > 0 ? 0 : null;
    }
    const ratio = Math.max(
      0,
      Math.min(1, (clientY - bounds.top) / bounds.height)
    );
    return nearestIndex(yPositions, ratio * height);
  }

  return {
    width,
    height,
    margin,
    plotWidth,
    plotHeight,
    rowHeight,
    barHeight,
    referenceValue,
    referenceX,
    xForValue,
    yFor,
    bars,
    selectedMark(index: number): PlotCoordinate | null {
      const bar = bars[index];
      return bar && bar.value != null
        ? {
            x: bar.x + bar.width,
            y: bar.y + bar.height / 2
          }
        : null;
    },
    pointIndexFromClientY
  };
}
