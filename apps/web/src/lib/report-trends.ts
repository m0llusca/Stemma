import type { ReportPeriod } from "@/lib/report-period";

export const reportTrendGranularities = ["day", "week", "month"] as const;

export type ReportTrendGranularity = (typeof reportTrendGranularities)[number];

export type ReportTrendReview = {
  totalScore: number;
  finalizedAt: Date | null;
};

export type ReportTrendBucket = {
  label: string;
  value: number;
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
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999));
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
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function monthEnd(value: Date) {
  return endOfUtcDay(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)));
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
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} проверок`;
  }

  if (last === 1) {
    return `${count} проверка`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} проверки`;
  }

  return `${count} проверок`;
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
  const buckets = new Map<string, { start: Date; end: Date; scores: number[] }>();

  for (const review of reviews) {
    if (!review.finalizedAt || review.finalizedAt < period.start || review.finalizedAt > period.end) {
      continue;
    }

    const range = bucketRangeFor(review.finalizedAt, period, granularity);
    const key = range.start.toISOString();
    const bucket = buckets.get(key) ?? { ...range, scores: [] };
    bucket.scores.push(review.totalScore);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .map((bucket) => {
      const count = bucket.scores.length;

      return {
        label: rangeLabel(bucket.start, bucket.end),
        value: Math.round(average(bucket.scores)),
        detail: formatReviewCount(count),
        count,
        start: bucket.start,
        end: bucket.end,
        href: hrefForBucket?.(bucket.start, bucket.end)
      };
    });
}
