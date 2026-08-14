export const chartUnits = ["quality-score", "count", "percent"] as const;

export type ChartUnit = (typeof chartUnits)[number];

export const chartTones = [
  "primary",
  "secondary",
  "reference",
  "success",
  "warning",
  "danger",
  "risk-1",
  "risk-2",
  "risk-3",
  "risk-4"
] as const;

export type ChartTone = (typeof chartTones)[number];

export type ChartSeries<TKey extends string = string> = Readonly<{
  key: TKey;
  label: string;
  unit: ChartUnit;
  tone: ChartTone;
}>;

export type ChartPoint<TKey extends string = string> = Readonly<{
  id: string;
  label: string;
  sortKey: string;
  values: Readonly<Record<TKey, number | null>>;
  detail?: string;
  sampleSize?: number;
  href?: string;
}>;

export type ChartModel<TKey extends string = string> = Readonly<{
  id: string;
  title: string;
  description: string;
  xLabel?: string;
  yLabel?: string;
  series: readonly ChartSeries<TKey>[];
  points: readonly ChartPoint<TKey>[];
  emptyTitle: string;
  emptyDescription?: string;
}>;

export class ChartContractError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ChartContractError";
  }
}

const chartUnitSet = new Set<string>(chartUnits);
const chartToneSet = new Set<string>(chartTones);
const modelKeys = new Set([
  "id",
  "title",
  "description",
  "xLabel",
  "yLabel",
  "series",
  "points",
  "emptyTitle",
  "emptyDescription"
]);
const seriesKeys = new Set(["key", "label", "unit", "tone"]);
const pointKeys = new Set(["id", "label", "sortKey", "values", "detail", "sampleSize", "href"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonSafe(value: unknown, path = "chart"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ChartContractError(`${path} must contain only JSON-safe finite numbers`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`));
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      assertJsonSafe(nestedValue, `${path}.${key}`);
    }
    return;
  }

  throw new ChartContractError(
    `${path} must be JSON-safe; Date, undefined, bigint, functions, symbols, and class instances are not allowed`
  );
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ChartContractError(`${path} must be a plain object`);
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ChartContractError(`${path} must be an array`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new ChartContractError(`${path}[${index}] must be present`);
    }
  }

  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ChartContractError(`${path} must be a non-empty string`);
  }
  return value;
}

function assertKnownKeys(object: Record<string, unknown>, allowed: Set<string>, path: string): void {
  const unknownKey = Object.keys(object).find((key) => !allowed.has(key));
  if (unknownKey) {
    throw new ChartContractError(`${path} contains unknown key "${unknownKey}"`);
  }
}

function validateRelativeHref(value: unknown, path: string): void {
  const href = requireNonEmptyString(value, path);
  if (!href.startsWith("/") || href.startsWith("//")) {
    throw new ChartContractError(`${path} must be an application-relative href`);
  }

  const applicationOrigin = "https://chart-model.local";
  const resolvedHref = new URL(href, applicationOrigin);
  if (resolvedHref.origin !== applicationOrigin) {
    throw new ChartContractError(`${path} must be an application-relative href`);
  }
}

function assertValueWithinUnit(value: number, unit: ChartUnit, path: string): void {
  if (!Number.isFinite(value)) {
    throw new ChartContractError(`${path} must be a finite number`);
  }

  if (unit === "count" && (!Number.isInteger(value) || value < 0)) {
    throw new ChartContractError(`${path} must be a non-negative integer count`);
  }

  if ((unit === "quality-score" || unit === "percent") && (value < 0 || value > 100)) {
    throw new ChartContractError(`${path} must be between 0 and 100 for unit "${unit}"`);
  }
}

export function parseChartModel(input: unknown): ChartModel {
  assertJsonSafe(input);

  const model = requireObject(input, "chart");
  assertKnownKeys(model, modelKeys, "chart");

  const id = requireNonEmptyString(model.id, "chart.id");
  if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(id)) {
    throw new ChartContractError("chart.id must be a stable alphanumeric identifier");
  }

  requireNonEmptyString(model.title, "chart.title");
  requireNonEmptyString(model.description, "chart.description");
  requireNonEmptyString(model.emptyTitle, "chart.emptyTitle");
  if ("xLabel" in model) {
    requireNonEmptyString(model.xLabel, "chart.xLabel");
  }
  if ("yLabel" in model) {
    requireNonEmptyString(model.yLabel, "chart.yLabel");
  }
  if ("emptyDescription" in model) {
    requireNonEmptyString(model.emptyDescription, "chart.emptyDescription");
  }

  const rawSeries = requireArray(model.series, "chart.series");
  if (rawSeries.length === 0) {
    throw new ChartContractError("chart.series must contain at least one series");
  }

  const seenSeriesKeys = new Set<string>();
  const unitsBySeriesKey = new Map<string, ChartUnit>();

  rawSeries.forEach((rawEntry, index) => {
    const path = `chart.series[${index}]`;
    const entry = requireObject(rawEntry, path);
    assertKnownKeys(entry, seriesKeys, path);

    const key = requireNonEmptyString(entry.key, `${path}.key`);
    if (!/^[a-z][a-z0-9_-]*$/i.test(key)) {
      throw new ChartContractError(`${path}.key must be an allowlisted-style identifier`);
    }
    if (seenSeriesKeys.has(key)) {
      throw new ChartContractError(`duplicate series key "${key}"`);
    }

    requireNonEmptyString(entry.label, `${path}.label`);
    const unit = requireNonEmptyString(entry.unit, `${path}.unit`);
    if (!chartUnitSet.has(unit)) {
      throw new ChartContractError(`${path}.unit "${unit}" is unsupported`);
    }
    const tone = requireNonEmptyString(entry.tone, `${path}.tone`);
    if (!chartToneSet.has(tone)) {
      throw new ChartContractError(`${path}.tone "${tone}" is unsupported`);
    }

    seenSeriesKeys.add(key);
    unitsBySeriesKey.set(key, unit as ChartUnit);
  });

  const rawPoints = requireArray(model.points, "chart.points");
  const seenPointIds = new Set<string>();
  let previousSortKey: string | null = null;

  rawPoints.forEach((rawPoint, index) => {
    const path = `chart.points[${index}]`;
    const point = requireObject(rawPoint, path);
    assertKnownKeys(point, pointKeys, path);

    const pointId = requireNonEmptyString(point.id, `${path}.id`);
    if (seenPointIds.has(pointId)) {
      throw new ChartContractError(`duplicate point id "${pointId}"`);
    }
    seenPointIds.add(pointId);

    requireNonEmptyString(point.label, `${path}.label`);
    const sortKey = requireNonEmptyString(point.sortKey, `${path}.sortKey`);
    if (previousSortKey != null && previousSortKey >= sortKey) {
      throw new ChartContractError("chart.points must have strictly increasing sortKey values");
    }
    previousSortKey = sortKey;

    const values = requireObject(point.values, `${path}.values`);
    assertKnownKeys(values, seenSeriesKeys, `${path}.values`);

    for (const seriesKey of seenSeriesKeys) {
      if (!Object.prototype.hasOwnProperty.call(values, seriesKey)) {
        throw new ChartContractError(`${path}.values is missing series key "${seriesKey}"`);
      }

      const value = values[seriesKey];
      if (value === null) {
        continue;
      }
      if (typeof value !== "number") {
        throw new ChartContractError(`${path}.values.${seriesKey} must be a finite number or null`);
      }
      assertValueWithinUnit(value, unitsBySeriesKey.get(seriesKey)!, `${path}.values.${seriesKey}`);
    }

    if ("detail" in point) {
      requireNonEmptyString(point.detail, `${path}.detail`);
    }
    if ("sampleSize" in point) {
      if (
        typeof point.sampleSize !== "number" ||
        !Number.isInteger(point.sampleSize) ||
        point.sampleSize < 0
      ) {
        throw new ChartContractError(`${path}.sampleSize must be a non-negative integer`);
      }
    }
    if ("href" in point) {
      validateRelativeHref(point.href, `${path}.href`);
    }
  });

  return model as ChartModel;
}
