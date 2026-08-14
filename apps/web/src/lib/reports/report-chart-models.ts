import { buildChartModel } from "@/lib/charts/builders";
import {
  ChartContractError,
  parseChartModel,
  type ChartModel
} from "@/lib/charts/contracts";
import type { AiHumanAgreementReport } from "@/lib/ai-quality/agreement-report";
import type { AiScoreDrift } from "@/lib/ai-quality/drift";
import type { ReportPeriod } from "@/lib/report-period";
import type { ReportTrendBucket } from "@/lib/report-trends";
import {
  reportHref,
  reportReviewRangeHref
} from "@/lib/reports/report-format";

export type ChartDatum = {
  label: string;
  value: number;
  detail?: string;
  href?: string;
};

export type RankedDatum = ChartDatum & {
  meta?: string;
  delta?: number | null;
};

export type StackedSegment = {
  label: string;
  value: number;
  severity: "t1" | "t2" | "t3" | "t4";
  href?: string;
};

export type ReportQualityTrendSeries =
  | "score"
  | "previous"
  | "target"
  | "volume";

export type ReportChartBundle<TKey extends string> = Readonly<{
  model: ChartModel<TKey>;
  sample: Readonly<{
    size: number;
    denominator?: number;
    minimum?: number;
  }>;
  isEmpty: boolean;
  comparison: Readonly<
    | { status: "current" }
    | { status: "missing"; message: string }
    | { status: "stale"; asOf: string }
  >;
}>;

export type ScoreDistributionSeries = "count";
export type AiDriftSeries = "confidence" | "reserve";
export type AgreementSeries = "agreement" | "reference";
export type ReasonTimelineSeries = "current" | "previous";

export type ScoreDistributionChartInput = Readonly<{
  rows: readonly Readonly<{ label: string; value: number }>[];
  href: string;
}>;

export type AiDriftChartInput = Readonly<{
  drift: AiScoreDrift | null;
  period: ReportPeriod;
}>;

export type AgreementBreakdownChartInput = Readonly<{
  report: AiHumanAgreementReport | null;
  period: ReportPeriod;
}>;

export type ReasonTimelineReview = Readonly<{
  finalizedAt: Date | null;
}>;

export type ReasonTimelineFinding = Readonly<{
  category: string;
  review: Readonly<{
    finalizedAt: Date | null;
  }>;
}>;

export type ReasonTimelineChartInput = Readonly<{
  category: string;
  period: ReportPeriod;
  previousPeriod: ReportPeriod;
  currentReviews: readonly ReasonTimelineReview[];
  previousReviews: readonly ReasonTimelineReview[];
  currentFindings: readonly ReasonTimelineFinding[];
  previousFindings: readonly ReasonTimelineFinding[];
}>;

const reportBundleKeys = new Set([
  "model",
  "sample",
  "isEmpty",
  "comparison"
]);
const sampleKeys = new Set(["size", "denominator", "minimum"]);
const scoreDistributionOrder = ["0-50", "51-70", "71-85", "86-100"] as const;
const dayMilliseconds = 24 * 60 * 60 * 1000;
const weekMilliseconds = 7 * dayMilliseconds;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(
  value: unknown,
  path: string
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ChartContractError(`${path} must be a plain object`);
  }

  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  path: string
) {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      throw new ChartContractError(`${path} contains unknown key "${key}"`);
    }
  }
}

function requireOwnKey(
  value: Record<string, unknown>,
  key: string,
  path: string
) {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    throw new ChartContractError(`${path}.${key} is required`);
  }
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new ChartContractError(
      `${path} must be a finite non-negative integer`
    );
  }

  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ChartContractError(`${path} must be a non-empty string`);
  }

  return value;
}

function requireCanonicalUtcDate(value: unknown, path: string): string {
  const date = requireNonEmptyString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ChartContractError(`${path} must use YYYY-MM-DD`);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ChartContractError(`${path} must be a real UTC calendar date`);
  }

  return date;
}

function requireJsonSafeValue(
  value: unknown,
  path: string,
  seen = new WeakSet<object>()
) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ChartContractError(`${path} must contain finite numbers`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new ChartContractError(`${path} must be JSON-safe`);
  }
  if (seen.has(value)) {
    throw new ChartContractError(`${path} must not contain cycles`);
  }
  seen.add(value);

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new ChartContractError(`${path} must not contain symbol keys`);
  }

  if (Array.isArray(value)) {
    const names = Object.getOwnPropertyNames(value).filter(
      (name) => name !== "length"
    );
    if (
      names.length !== value.length ||
      names.some((name, index) => name !== String(index))
    ) {
      throw new ChartContractError(
        `${path} must be a dense array without custom properties`
      );
    }
    names.forEach((name, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")
      ) {
        throw new ChartContractError(
          `${path}[${index}] must be an enumerable data property`
        );
      }
      requireJsonSafeValue(descriptor.value, `${path}[${index}]`, seen);
    });
    return;
  }

  if (!isPlainObject(value)) {
    throw new ChartContractError(`${path} must contain only plain objects`);
  }
  for (const name of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new ChartContractError(
        `${path}.${name} must be an enumerable data property`
      );
    }
    requireJsonSafeValue(descriptor.value, `${path}.${name}`, seen);
  }
}

export function parseReportChartBundle<TKey extends string>(
  input: unknown
): ReportChartBundle<TKey> {
  requireJsonSafeValue(input, "reportChartBundle");
  const bundle = requirePlainObject(input, "reportChartBundle");
  requireExactKeys(bundle, reportBundleKeys, "reportChartBundle");
  for (const key of reportBundleKeys) {
    requireOwnKey(bundle, key, "reportChartBundle");
  }

  const model = parseChartModel(bundle.model) as ChartModel<TKey>;

  const sample = requirePlainObject(
    bundle.sample,
    "reportChartBundle.sample"
  );
  requireExactKeys(sample, sampleKeys, "reportChartBundle.sample");
  requireOwnKey(sample, "size", "reportChartBundle.sample");
  const normalizedSample: {
    size: number;
    denominator?: number;
    minimum?: number;
  } = {
    size: requireNonNegativeInteger(
      sample.size,
      "reportChartBundle.sample.size"
    )
  };
  if (Object.prototype.hasOwnProperty.call(sample, "denominator")) {
    normalizedSample.denominator = requireNonNegativeInteger(
      sample.denominator,
      "reportChartBundle.sample.denominator"
    );
  }
  if (Object.prototype.hasOwnProperty.call(sample, "minimum")) {
    normalizedSample.minimum = requireNonNegativeInteger(
      sample.minimum,
      "reportChartBundle.sample.minimum"
    );
  }

  if (typeof bundle.isEmpty !== "boolean") {
    throw new ChartContractError(
      "reportChartBundle.isEmpty must be a boolean"
    );
  }

  const comparison = requirePlainObject(
    bundle.comparison,
    "reportChartBundle.comparison"
  );
  requireOwnKey(comparison, "status", "reportChartBundle.comparison");
  const status = requireNonEmptyString(
    comparison.status,
    "reportChartBundle.comparison.status"
  );
  let normalizedComparison: ReportChartBundle<TKey>["comparison"];
  if (status === "current") {
    requireExactKeys(
      comparison,
      new Set(["status"]),
      "reportChartBundle.comparison"
    );
    normalizedComparison = { status: "current" };
  } else if (status === "missing") {
    requireExactKeys(
      comparison,
      new Set(["status", "message"]),
      "reportChartBundle.comparison"
    );
    requireOwnKey(comparison, "message", "reportChartBundle.comparison");
    normalizedComparison = {
      status: "missing",
      message: requireNonEmptyString(
        comparison.message,
        "reportChartBundle.comparison.message"
      )
    };
  } else if (status === "stale") {
    requireExactKeys(
      comparison,
      new Set(["status", "asOf"]),
      "reportChartBundle.comparison"
    );
    requireOwnKey(comparison, "asOf", "reportChartBundle.comparison");
    normalizedComparison = {
      status: "stale",
      asOf: requireCanonicalUtcDate(
        comparison.asOf,
        "reportChartBundle.comparison.asOf"
      )
    };
  } else {
    throw new ChartContractError(
      `reportChartBundle.comparison.status "${status}" is unsupported`
    );
  }

  return {
    model,
    sample: normalizedSample,
    isEmpty: bundle.isEmpty,
    comparison: normalizedComparison
  };
}

function utcDayStart(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    )
  );
}

function utcDayEnd(value: Date): Date {
  return new Date(utcDayStart(value).getTime() + dayMilliseconds - 1);
}

function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcMondayAtOrBefore(value: Date): Date {
  const day = utcDayStart(value);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * dayMilliseconds);
}

function compactDateLabel(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit"
  }).format(value);
}

function dateRangeLabel(start: Date, end: Date): string {
  return `${compactDateLabel(start)}–${compactDateLabel(end)}`;
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function buildScoreDistributionChart(
  input: ScoreDistributionChartInput
): ReportChartBundle<ScoreDistributionSeries> {
  const valuesByLabel = new Map(
    input.rows.map((row) => [row.label, row.value] as const)
  );
  const points = scoreDistributionOrder.map((label, index) => ({
    id: `score-distribution-${index + 1}`,
    label,
    sortKey: String(index + 1).padStart(2, "0"),
    values: {
      count: valuesByLabel.get(label) ?? 0
    },
    href: input.href
  }));
  const sampleSize = points.reduce(
    (sum, point) => sum + point.values.count,
    0
  );

  return parseReportChartBundle({
    model: buildChartModel({
      id: "score-distribution",
      title: "Распределение оценок",
      description: "Сколько проверок попало в каждый диапазон.",
      xLabel: "Диапазон баллов",
      yLabel: "Проверки",
      series: [
        {
          key: "count",
          label: "Проверки",
          unit: "count",
          tone: "primary"
        }
      ],
      points,
      emptyTitle: "Нет завершённых проверок",
      emptyDescription:
        "Распределение оценок появится после первых финализированных проверок."
    }),
    sample: { size: sampleSize, minimum: 5 },
    isEmpty: sampleSize === 0,
    comparison: { status: "current" }
  });
}

export function buildAiDriftChart(
  input: AiDriftChartInput
): ReportChartBundle<AiDriftSeries> {
  const buckets = input.drift?.buckets ?? [];
  const bucketByStart = new Map(
    buckets.map((bucket) => [bucket.periodStart, bucket] as const)
  );
  const firstMonday = utcMondayAtOrBefore(input.period.start);
  const lastMonday = utcMondayAtOrBefore(input.period.end);
  const points = [];

  for (
    let bucketStart = firstMonday;
    bucketStart.getTime() <= lastMonday.getTime();
    bucketStart = new Date(bucketStart.getTime() + weekMilliseconds)
  ) {
    const key = utcDateKey(bucketStart);
    const bucket = bucketByStart.get(key);
    const bucketEnd = new Date(
      bucketStart.getTime() + weekMilliseconds - 1
    );
    const rangeStart = new Date(
      Math.max(bucketStart.getTime(), input.period.start.getTime())
    );
    const rangeEnd = new Date(
      Math.min(bucketEnd.getTime(), input.period.end.getTime())
    );
    const confidence =
      bucket?.meanConfidence == null
        ? null
        : bucket.meanConfidence * 100;
    const reserve = bucket ? bucket.fallbackRate * 100 : null;

    points.push({
      id: `ai-drift-${key}`,
      label: dateRangeLabel(rangeStart, rangeEnd),
      sortKey: key,
      values: {
        confidence,
        reserve
      },
      detail: `Уверенность модели: ${
        confidence == null ? "нет данных" : `${confidence.toLocaleString("ru-RU")}%`
      } · Доля резервной оценки: ${
        reserve == null ? "нет данных" : `${reserve.toLocaleString("ru-RU")}%`
      }`,
      sampleSize: bucket?.count ?? 0,
      href: reportReviewRangeHref(rangeStart, rangeEnd)
    });
  }

  const sampleSize = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return parseReportChartBundle({
    model: buildChartModel({
      id: "ai-drift",
      title: "Дрейф AI-оценки",
      description:
        "Уверенность модели и доля резервной оценки по сопоставимым неделям.",
      xLabel: "Неделя",
      yLabel: "Проценты",
      series: [
        {
          key: "confidence",
          label: "Уверенность модели",
          unit: "percent",
          tone: "primary"
        },
        {
          key: "reserve",
          label: "Доля резервной оценки",
          unit: "percent",
          tone: "secondary"
        }
      ],
      points,
      emptyTitle: "Нет данных для анализа дрейфа",
      emptyDescription: "За выбранный период не создавалось AI-оценок."
    }),
    sample: { size: sampleSize, minimum: 5 },
    isEmpty: buckets.length === 0,
    comparison: { status: "current" }
  });
}

export function buildAgreementBreakdownChart(
  input: AgreementBreakdownChartInput
): ReportChartBundle<AgreementSeries> {
  const rows = [...(input.report?.criteria ?? [])].sort(
    (left, right) =>
      (left.agreementRate ?? 1) - (right.agreementRate ?? 1) ||
      right.comparedCount - left.comparedCount ||
      left.label.localeCompare(right.label, "ru") ||
      left.criterionId.localeCompare(right.criterionId)
  );
  const detailHref = `${reportHref(input.period, {
    view: "details"
  })}#details-blocks`;
  const points = rows.map((row, index) => ({
    id: `agreement-${row.criterionId}`,
    label: row.label,
    sortKey: String(index + 1).padStart(6, "0"),
    values: {
      agreement:
        row.agreementRate == null ? null : row.agreementRate * 100,
      reference: row.comparedCount > 0 ? 80 : null
    },
    detail: `${row.block || "Блок не указан"} · сравнений: ${
      row.comparedCount
    }${
      row.meanScaleDelta == null
        ? ""
        : ` · ср. расхождение ${row.meanScaleDelta.toFixed(2)}`
    }`,
    sampleSize: row.comparedCount,
    href: detailHref
  }));
  const sampleSize = input.report?.aiComparedConversations ?? 0;
  const denominator = input.report?.reviewsConsidered ?? 0;

  return parseReportChartBundle({
    model: buildChartModel({
      id: "ai-human-agreement",
      title: "AI↔человек: согласие",
      description:
        "Согласие реальной AI-оценки с решениями проверяющих по критериям.",
      xLabel: "Критерий",
      yLabel: "Согласие",
      series: [
        {
          key: "agreement",
          label: "Согласие",
          unit: "percent",
          tone: "primary"
        },
        {
          key: "reference",
          label: "Ориентир 80%",
          unit: "percent",
          tone: "reference"
        }
      ],
      points,
      emptyTitle: "Нет данных для сравнения",
      emptyDescription:
        "Нужны финализированные ревью проверяющих и реальная AI-оценка по тем же обращениям."
    }),
    sample: {
      size: sampleSize,
      denominator,
      minimum: 5
    },
    isEmpty: (input.report?.aggregate.comparedCount ?? 0) === 0,
    comparison: { status: "current" }
  });
}

export function buildReasonTimelineChart(
  input: ReasonTimelineChartInput
): ReportChartBundle<ReasonTimelineSeries> {
  const currentSamples = new Map<string, number>();
  const previousSamples = new Map<string, number>();
  const currentReasons = new Map<string, number>();
  const previousReasons = new Map<string, number>();

  for (const review of input.currentReviews) {
    if (review.finalizedAt) {
      incrementCount(currentSamples, utcDateKey(review.finalizedAt));
    }
  }
  for (const review of input.previousReviews) {
    if (review.finalizedAt) {
      incrementCount(previousSamples, utcDateKey(review.finalizedAt));
    }
  }
  for (const finding of input.currentFindings) {
    if (finding.category === input.category && finding.review.finalizedAt) {
      incrementCount(currentReasons, utcDateKey(finding.review.finalizedAt));
    }
  }
  for (const finding of input.previousFindings) {
    if (finding.category === input.category && finding.review.finalizedAt) {
      incrementCount(previousReasons, utcDateKey(finding.review.finalizedAt));
    }
  }

  const currentStart = utcDayStart(input.period.start);
  const currentEnd = utcDayStart(input.period.end);
  const previousStart = utcDayStart(input.previousPeriod.start);
  const points = [];
  let index = 0;

  for (
    let currentDay = currentStart;
    currentDay.getTime() <= currentEnd.getTime();
    currentDay = new Date(currentDay.getTime() + dayMilliseconds)
  ) {
    const previousDay = new Date(
      previousStart.getTime() + index * dayMilliseconds
    );
    const currentKey = utcDateKey(currentDay);
    const previousKey = utcDateKey(previousDay);
    const currentSample = currentSamples.get(currentKey) ?? 0;
    const previousSample = previousSamples.get(previousKey) ?? 0;

    points.push({
      id: `reason-${currentKey}`,
      label: compactDateLabel(currentDay),
      sortKey: currentKey,
      values: {
        current:
          currentSample > 0 ? currentReasons.get(currentKey) ?? 0 : null,
        previous:
          previousSample > 0 ? previousReasons.get(previousKey) ?? 0 : null
      },
      detail: `${input.category} · завершённых проверок: ${currentSample}`,
      sampleSize: currentSample,
      href: reportReviewRangeHref(currentDay, utcDayEnd(currentDay), {
        findingCategory: input.category
      })
    });
    index += 1;
  }

  const sampleSize = Array.from(currentSamples.values()).reduce(
    (sum, count) => sum + count,
    0
  );
  const hasPreviousSample = points.some(
    (point) => point.values.previous !== null
  );

  return parseReportChartBundle({
    model: buildChartModel({
      id: "reason-timeline",
      title: `Динамика причины: ${input.category}`,
      description:
        "Число замечаний по главной причине за каждый день текущего и сопоставимого прошлого периода.",
      xLabel: "Дата",
      yLabel: "Замечания",
      series: [
        {
          key: "current",
          label: "Текущий период",
          unit: "count",
          tone: "primary"
        },
        {
          key: "previous",
          label: "Прошлый период",
          unit: "count",
          tone: "secondary"
        }
      ],
      points,
      emptyTitle: "Нет замечаний",
      emptyDescription:
        "Причины и темы появятся после первых завершённых проверок с замечаниями."
    }),
    sample: { size: sampleSize, minimum: 5 },
    isEmpty: sampleSize === 0,
    comparison: hasPreviousSample
      ? { status: "current" }
      : {
          status: "missing",
          message:
            "Нет базы сравнения: в прошлом сопоставимом периоде нет завершённых проверок."
        }
  });
}

export function buildQualityTrendModel({
  rows,
  previousAverageScore
}: {
  rows: readonly ReportTrendBucket[];
  previousAverageScore: number | null;
}): ChartModel<ReportQualityTrendSeries> {
  return buildChartModel({
    id: "quality-overview",
    title: "Динамика качества",
    description:
      "Средний балл, сопоставимый прошлый период, цель и число завершённых проверок.",
    xLabel: "Дата",
    yLabel: "Баллы качества",
    series: [
      {
        key: "score",
        label: "Средний балл",
        unit: "quality-score",
        tone: "primary"
      },
      {
        key: "previous",
        label: "Прошлый период",
        unit: "quality-score",
        tone: "secondary"
      },
      {
        key: "target",
        label: "Цель 90 баллов",
        unit: "quality-score",
        tone: "reference"
      },
      {
        key: "volume",
        label: "Проверки",
        unit: "count",
        tone: "secondary"
      }
    ],
    points: rows.map((row, index) => ({
      id: `trend-${index + 1}`,
      label: row.label,
      sortKey: row.start.toISOString(),
      values: {
        score: row.value,
        previous: previousAverageScore,
        target: 90,
        volume: row.count
      },
      detail: row.detail,
      sampleSize: row.count,
      ...(row.href ? { href: row.href } : {})
    })),
    emptyTitle: "Нет завершённых проверок",
    emptyDescription:
      "Данные появятся после первой финализированной проверки."
  } satisfies ChartModel<ReportQualityTrendSeries>);
}
