import type { ReportPeriod } from "@/lib/report-period";
import { russianPlural } from "@/lib/reports/report-format";

export const reportTrendGranularities = ["day", "week", "month"] as const;
export const MAX_REPORT_TREND_BUCKETS = 400;

export type ReportTrendGranularity = (typeof reportTrendGranularities)[number];

export type ReportTrendReview = {
  totalScore: number;
  finalizedAt: Date | null;
};

export type ReportTrendBucket = {
  label: string;
  value: number | null;
  detail: string;
  count: number;
  start: Date;
  end: Date;
  href?: string;
};

const oneDayMs = 24 * 60 * 60 * 1000;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function startOfUtcDay(value: Date) {
  const normalized = new Date(value.getTime());
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

function endOfUtcDay(value: Date) {
  const normalized = new Date(value.getTime());
  normalized.setUTCHours(23, 59, 59, 999);
  return normalized;
}

function addUtcDays(value: Date, days: number) {
  const start = startOfUtcDay(value);
  return new Date(start.getTime() + days * oneDayMs);
}

function minDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date) {
  return left.getTime() >= right.getTime() ? left : right;
}

function monthStart(value: Date) {
  const normalized = startOfUtcDay(value);
  normalized.setUTCDate(1);
  return normalized;
}

function monthEnd(value: Date) {
  const nextMonth = monthStart(value);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return new Date(nextMonth.getTime() - 1);
}

function shortDate(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");

  return `${day}.${month}`;
}

function rangeLabel(start: Date, end: Date) {
  const normalizedStart = startOfUtcDay(start);
  const normalizedEnd = startOfUtcDay(end);

  if (normalizedStart.getTime() === normalizedEnd.getTime()) {
    return shortDate(normalizedStart);
  }

  return `${shortDate(normalizedStart)}-${shortDate(normalizedEnd)}`;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatReviewCount(count: number) {
  return russianPlural(count, ["проверка", "проверки", "проверок"]);
}

function bucketRangeFor(date: Date, period: ReportPeriod, granularity: ReportTrendGranularity) {
  const normalizedDate = startOfUtcDay(date);
  const periodStart = startOfUtcDay(period.start);

  if (granularity === "day") {
    return {
      start: normalizedDate,
      end: endOfUtcDay(normalizedDate)
    };
  }

  if (granularity === "week") {
    const daysFromPeriodStart = Math.max(0, Math.floor((normalizedDate.getTime() - periodStart.getTime()) / oneDayMs));
    const bucketStart = addUtcDays(periodStart, Math.floor(daysFromPeriodStart / 7) * 7);

    return {
      start: bucketStart,
      end: minDate(endOfUtcDay(addUtcDays(bucketStart, 6)), period.end)
    };
  }

  return {
    start: maxDate(monthStart(normalizedDate), periodStart),
    end: minDate(monthEnd(normalizedDate), period.end)
  };
}

function bucketCountForPeriod(
  period: ReportPeriod,
  granularity: ReportTrendGranularity
) {
  const start = startOfUtcDay(period.start);
  const end = startOfUtcDay(period.end);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    throw new RangeError("Report trend period must be a valid ascending range.");
  }

  const days = Math.floor((end.getTime() - start.getTime()) / oneDayMs) + 1;

  if (granularity === "day") {
    return days;
  }

  if (granularity === "week") {
    return Math.ceil(days / 7);
  }

  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth() +
    1
  );
}

function assertSafeBucketCount(
  period: ReportPeriod,
  granularity: ReportTrendGranularity
) {
  if (bucketCountForPeriod(period, granularity) > MAX_REPORT_TREND_BUCKETS) {
    throw new RangeError(
      `Report trend ${granularity} range exceeds the ${MAX_REPORT_TREND_BUCKETS}-bucket safety limit.`
    );
  }
}

export function resolveReportTrendGranularity(params: Record<string, string | string[] | undefined>): ReportTrendGranularity {
  const requested = firstParam(params.trend);

  return reportTrendGranularities.includes(requested as ReportTrendGranularity)
    ? (requested as ReportTrendGranularity)
    : "day";
}

export function buildScoreTrendRows(
  reviews: ReportTrendReview[],
  period: ReportPeriod,
  granularity: ReportTrendGranularity,
  hrefForBucket?: (start: Date, end: Date) => string
): ReportTrendBucket[] {
  assertSafeBucketCount(period, granularity);

  const buckets = new Map<string, { start: Date; end: Date; scores: number[] }>();
  const periodEndDay = startOfUtcDay(period.end);

  for (
    let cursor = startOfUtcDay(period.start);
    cursor <= periodEndDay;
  ) {
    const range = bucketRangeFor(cursor, period, granularity);
    buckets.set(range.start.toISOString(), { ...range, scores: [] });
    cursor = addUtcDays(startOfUtcDay(range.end), 1);
  }

  for (const review of reviews) {
    if (!review.finalizedAt || review.finalizedAt < period.start || review.finalizedAt > period.end) {
      continue;
    }

    const range = bucketRangeFor(review.finalizedAt, period, granularity);
    const key = range.start.toISOString();
    const bucket = buckets.get(key);
    if (!bucket) {
      continue;
    }
    bucket.scores.push(review.totalScore);
  }

  return Array.from(buckets.values())
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .map((bucket) => {
      const count = bucket.scores.length;

      return {
        label: rangeLabel(bucket.start, bucket.end),
        value: count === 0 ? null : Math.round(average(bucket.scores)),
        detail: formatReviewCount(count),
        count,
        start: bucket.start,
        end: bucket.end,
        href: hrefForBucket?.(bucket.start, bucket.end)
      };
    });
}
