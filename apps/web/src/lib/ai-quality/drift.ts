/**
 * AI score drift/quality engine. Groups AI quality drafts into time buckets
 * (day/week/month, UTC) and surfaces regressions between consecutive non-empty
 * buckets: a drop in mean model confidence, or a spike in reliance on the
 * deterministic fallback engine. Pure and dependency-free (apart from the shared
 * fallback detector) so it is trivially testable and reusable across the AI
 * quality dashboard and analytics.
 */
import { isDeterministicAiModel } from "@/lib/ai-quality/draft-origin";

export type DriftBucketUnit = "day" | "week" | "month";

export type AiScoreDraftSample = {
  modelVersion: string;
  confidence: number | null;
  createdAt: Date;
};

export type AiScoreDriftBucket = {
  /** ISO date (YYYY-MM-DD) at the start of the bucket, UTC. */
  periodStart: string;
  count: number;
  /** Mean of non-null confidence values; null when the bucket has none. */
  meanConfidence: number | null;
  /** Share of drafts produced by the deterministic fallback engine (0..1). */
  fallbackRate: number;
};

export type AiScoreDriftRegressionKind = "confidence_drop" | "fallback_spike";

export type AiScoreDriftRegression = {
  periodStart: string;
  kind: AiScoreDriftRegressionKind;
  detail: string;
};

export type AiScoreDrift = {
  buckets: AiScoreDriftBucket[];
  regressions: AiScoreDriftRegression[];
};

/** Absolute drop in mean confidence that counts as a regression. */
const CONFIDENCE_DROP_THRESHOLD = 0.15;
/** Absolute rise in fallback rate that counts as a regression. */
const FALLBACK_SPIKE_THRESHOLD = 0.25;

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Format a Date as an ISO calendar date (YYYY-MM-DD) using its UTC components. */
function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Compute the ISO date key at the start of the bucket that contains `createdAt`.
 * - day: UTC calendar day.
 * - week: ISO week, starting Monday UTC.
 * - month: first day of the UTC calendar month.
 */
function bucketStartKey(createdAt: Date, unit: DriftBucketUnit): string {
  if (unit === "month") {
    return `${createdAt.getUTCFullYear()}-${pad2(createdAt.getUTCMonth() + 1)}-01`;
  }

  const dayStart = Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate());

  if (unit === "day") {
    return toIsoDate(new Date(dayStart));
  }

  // week: back up to Monday. getUTCDay() is 0 (Sun)..6 (Sat); map to 0 (Mon)..6 (Sun).
  const isoWeekday = (new Date(dayStart).getUTCDay() + 6) % 7;
  return toIsoDate(new Date(dayStart - isoWeekday * DAY_MS));
}

type BucketAccumulator = {
  periodStart: string;
  count: number;
  confidenceSum: number;
  confidenceCount: number;
  fallbackCount: number;
};

export function computeAiScoreDrift(input: { drafts: AiScoreDraftSample[]; bucket: DriftBucketUnit }): AiScoreDrift {
  const byPeriod = new Map<string, BucketAccumulator>();

  for (const draft of input.drafts) {
    const periodStart = bucketStartKey(draft.createdAt, input.bucket);
    const accumulator =
      byPeriod.get(periodStart) ??
      ({ periodStart, count: 0, confidenceSum: 0, confidenceCount: 0, fallbackCount: 0 } satisfies BucketAccumulator);

    accumulator.count += 1;
    if (draft.confidence != null) {
      accumulator.confidenceSum += draft.confidence;
      accumulator.confidenceCount += 1;
    }
    if (isDeterministicAiModel(draft.modelVersion)) {
      accumulator.fallbackCount += 1;
    }

    byPeriod.set(periodStart, accumulator);
  }

  const buckets: AiScoreDriftBucket[] = Array.from(byPeriod.values())
    .sort((a, b) => (a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0))
    .map((accumulator) => ({
      periodStart: accumulator.periodStart,
      count: accumulator.count,
      meanConfidence: accumulator.confidenceCount > 0 ? accumulator.confidenceSum / accumulator.confidenceCount : null,
      fallbackRate: accumulator.count > 0 ? accumulator.fallbackCount / accumulator.count : 0
    }));

  const regressions: AiScoreDriftRegression[] = [];
  for (let index = 1; index < buckets.length; index += 1) {
    const previous = buckets[index - 1];
    const current = buckets[index];

    if (
      previous.meanConfidence != null &&
      current.meanConfidence != null &&
      previous.meanConfidence - current.meanConfidence >= CONFIDENCE_DROP_THRESHOLD
    ) {
      const before = previous.meanConfidence.toFixed(2);
      const after = current.meanConfidence.toFixed(2);
      regressions.push({
        periodStart: current.periodStart,
        kind: "confidence_drop",
        detail: `Средняя уверенность упала с ${before} до ${after}`
      });
    }

    if (current.fallbackRate - previous.fallbackRate >= FALLBACK_SPIKE_THRESHOLD) {
      const before = Math.round(previous.fallbackRate * 100);
      const after = Math.round(current.fallbackRate * 100);
      regressions.push({
        periodStart: current.periodStart,
        kind: "fallback_spike",
        detail: `Доля детерминированного фолбэка выросла с ${before}% до ${after}%`
      });
    }
  }

  return { buckets, regressions };
}
